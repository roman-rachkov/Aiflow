# AI Studio — Codegen Sandbox (Aider Sandbox)

```dockerfile
# =============================================================================
# AI Studio — Codegen sandbox image (Aider Sandbox)
# =============================================================================
# Base image: Node.js 20 + Python 3.11 (Aider requires Python)
FROM node:22-bookworm-slim

# Install system dependencies and Python
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3-pip \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/python3.11 /usr/bin/python

# Install a pinned Aider version (via pip)
ARG AIDER_VERSION=0.60.0
RUN pip3 install --no-cache-dir aider-chat==${AIDER_VERSION}

# Create an unprivileged user to execute code
RUN useradd --create-home --shell /bin/bash sandbox \
    && mkdir -p /workspace /tmp/sandbox \
    && chown sandbox:sandbox /workspace /tmp/sandbox

# Copy the runner script
COPY runner.js /usr/local/bin/runner.js
RUN chmod +x /usr/local/bin/runner.js

# The working directory is mounted from outside (volume with project source)
WORKDIR /workspace

USER sandbox

# Environment variables passed at container start:
#   TASK_JSON      - JSON string with the task (title, description, acceptance)
#   MODEL_PROVIDER - provider (openai, routerai, anthropic)
#   MODEL_NAME     - model name (gpt-4o, claude-3-opus, etc.)
#   API_KEY        - API key (decrypted, single-use)
#   API_BASE_URL   - API base URL (optional)

ENTRYPOINT ["node", "/usr/local/bin/runner.js"]
```

```javascript
// =============================================================================
// runner.js — runner script inside the sandbox
// =============================================================================
// Accepts a task, runs Aider in headless mode, executes checks
// (lint, compilation), and returns the result.
// =============================================================================

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const WORKSPACE = '/workspace';
const AIDER_CONFIG = '/home/sandbox/.aider.conf.yml';

// Read the task from the environment
const taskJson = process.env.TASK_JSON;
if (!taskJson) {
  console.error('TASK_JSON is not set');
  process.exit(1);
}

let task;
try {
  task = JSON.parse(taskJson);
} catch (e) {
  console.error('Malformed JSON in TASK_JSON');
  process.exit(1);
}

const { title, description, acceptance } = task;
const modelProvider = process.env.MODEL_PROVIDER || 'openai';
const modelName = process.env.MODEL_NAME || 'gpt-4o';
const apiKey = process.env.API_KEY || '';
const apiBaseUrl = process.env.API_BASE_URL || '';

// Build the Aider configuration file
const aiderConfig = `
model: ${modelProvider}/${modelName}
api-key: ${apiKey}
${apiBaseUrl ? `openai-api-base: ${apiBaseUrl}` : ''}
dark-mode: false
# Aider must not create commits. The runner commits to the task branch after
# the verification gate passes, so a commit implies "verified" — an Aider
# auto-commit would break that invariant by recording code that never passed
# tsc, ESLint, Prettier or prisma validate.
no-auto-commits: true
`;
fs.writeFileSync(AIDER_CONFIG, aiderConfig);

// Build the prompt for Aider
const prompt = `
You are the AI Coder. Your task: implement the following change in the project code.

**Task:** ${title}
**Description:** ${description}
**Acceptance criteria:** ${acceptance}

You are in the root directory of a Next.js Git repository (App Router, TypeScript, Tailwind, Prisma).
Implement the task strictly as described, adding nothing extra.
After making changes, verify the code compiles without TypeScript errors and passes ESLint.
`;

// Run Aider
function runAider() {
  return new Promise((resolve, reject) => {
    const args = [
      '--message',
      prompt,
      '--yes', // auto-confirm
      // NOT --no-git. The repository is a real clone on a task branch
      // (docs/15-engineering-conventions.md § 1.1), and Aider needs Git to see
      // the diff it produced. Commits are suppressed via no-auto-commits in
      // the config above, not by blinding it to the repository.
    ];

    const aider = spawn('aider', args, {
      cwd: WORKSPACE,
      env: { ...process.env, HOME: '/home/sandbox' },
    });

    let stdout = '';
    let stderr = '';

    aider.stdout.on('data', (data) => {
      stdout += data.toString();
      // Forward progress to the parent process (if needed)
      process.stdout.write(data);
    });

    aider.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    aider.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Aider exited with code ${code}\n${stderr}`));
      }
    });

    aider.on('error', (err) => {
      reject(err);
    });
  });
}

// TypeScript check
function checkTypeScript() {
  try {
    execSync('npx tsc --noEmit', { cwd: WORKSPACE, stdio: 'pipe' });
    return { passed: true, output: '' };
  } catch (e) {
    return { passed: false, output: e.stdout?.toString() + '\n' + e.stderr?.toString() };
  }
}

// ESLint check (if configured)
function checkLint() {
  try {
    execSync('npx eslint . --ext .ts,.tsx --max-warnings 0', { cwd: WORKSPACE, stdio: 'pipe' });
    return { passed: true, output: '' };
  } catch (e) {
    return { passed: false, output: e.stdout?.toString() + '\n' + e.stderr?.toString() };
  }
}

// Capture git diff
function getGitDiff() {
  try {
    return execSync('git diff', { cwd: WORKSPACE, encoding: 'utf8' });
  } catch (e) {
    return '';
  }
}

// Main flow
(async () => {
  let status = 'success';
  let report = '';

  try {
    console.log(`=== Starting task: ${title} ===`);

    // Run Aider
    const aiderResult = await runAider();
    console.log('=== Aider finished ===');

    // TypeScript check
    console.log('=== TypeScript check ===');
    const tsCheck = checkTypeScript();
    if (!tsCheck.passed) {
      status = 'failure';
      report += `[ERROR] TypeScript does not compile:\n${tsCheck.output}\n`;
      console.error(tsCheck.output);
    } else {
      console.log('TypeScript: OK');
    }

    // ESLint check
    console.log('=== ESLint check ===');
    const lintCheck = checkLint();
    if (!lintCheck.passed) {
      status = 'failure';
      report += `[ERROR] ESLint found problems:\n${lintCheck.output}\n`;
      console.error(lintCheck.output);
    } else {
      console.log('ESLint: OK');
    }

    // Prettier check
    console.log('=== Prettier check ===');
    const fmtCheck = checkPrettier();
    if (!fmtCheck.passed) {
      status = 'failure';
      report += `[ERROR] Prettier found formatting issues:\n${fmtCheck.output}\n`;
      console.error(fmtCheck.output);
    } else {
      console.log('Prettier: OK');
    }

    // Prisma validate
    console.log('=== Prisma validate ===');
    const prismaCheck = checkPrismaValidate();
    if (!prismaCheck.passed) {
      status = 'failure';
      report += `[ERROR] Prisma validation failed:\n${prismaCheck.output}\n`;
      console.error(prismaCheck.output);
    } else {
      console.log('Prisma validate: OK');
    }

    // Capture diff
    const diff = getGitDiff();

    // Final report as JSON (printed to stdout as the last line)
    const result = {
      status,
      task: title,
      diff,
      report: report || 'OK',
      aider_output: aiderResult.stdout,
      ts_passed: tsCheck.passed,
      lint_passed: lintCheck.passed,
    };

    console.log('=== RESULT ===');
    console.log(JSON.stringify(result));

    process.exit(status === 'success' ? 0 : 1);
  } catch (err) {
    console.error('Fatal error:', err.message);
    const result = {
      status: 'failure',
      task: title,
      diff: '',
      report: `Fatal error: ${err.message}`,
      aider_output: '',
      ts_passed: false,
      lint_passed: false,
    };
    console.log('=== RESULT ===');
    console.log(JSON.stringify(result));
    process.exit(1);
  }
})();
```

## Integration with the main application (dockerode)

```javascript
// Example usage in the code:execute worker
const Docker = require('dockerode');
const docker = new Docker();

async function executeTask(projectId, task) {
  // 1. Prepare the volume with project code (or bind mount)
  const volumeName = `project-${projectId}-code`;

  // 2. Start the container
  const container = await docker.createContainer({
    Image: 'ai-studio/aider-sandbox:latest',
    Env: [
      `TASK_JSON=${JSON.stringify({
        title: task.title,
        description: task.description,
        acceptance: task.acceptance,
      })}`,
      `MODEL_PROVIDER=${task.modelConfig.provider}`,
      `MODEL_NAME=${task.modelConfig.model}`,
      `API_KEY=${task.modelConfig.apiKey}`, // already decrypted
      `API_BASE_URL=${task.modelConfig.baseUrl || ''}`,
    ],
    HostConfig: {
      Binds: [`${volumeName}:/workspace`, '/tmp/sandbox:/tmp/sandbox'],
      ReadonlyRootfs: true,
      Tmpfs: {
        '/tmp': 'rw,noexec,nosuid,size=512M',
        '/home/sandbox/.cache': 'rw,noexec,nosuid,size=256M',
      },
      Memory: 512 * 1024 * 1024, // 512 MB
      NanoCpus: 1_000_000_000, // 1 CPU
      SecurityOpt: ['no-new-privileges'],
      CapDrop: ['ALL'],
      NetworkMode: 'sandbox-net', // isolated network
    },
  });

  // 3. Start and wait for completion
  await container.start();

  const stream = await container.logs({
    follow: true,
    stdout: true,
    stderr: true,
  });

  // Stream logs to the user...

  const { StatusCode } = await container.wait();

  // 4. Extract the result (last log line is JSON)
  // ...

  await container.remove();

  return result;
}
```

## Security

- The container runs with `ReadonlyRootfs: true`; all writable directories are mounted as tmpfs with restrictions (`noexec`, `nosuid`).
- Network access is limited to the package registry proxy, via the isolated `sandbox-net` network.
- All privileges are dropped (`CapDrop: ALL`) and new privileges are forbidden.
- The API key is passed only through an environment variable and exists only for the container's lifetime.
- User code runs as the unprivileged `sandbox` user (UID 1000).
