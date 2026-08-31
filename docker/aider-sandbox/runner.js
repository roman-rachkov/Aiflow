#!/usr/bin/env node
'use strict';

/**
 * Sandbox runner: run Aider headless, enforce verification gate, commit on success.
 * Lint/TS/Prettier/prisma validate failures → status failure, exit 1, no commit.
 * DOGFOOD_FIXTURE: api key "dogfood-fixture" copies prebuilt files instead of Aider.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const {
  checkTypeScript,
  checkLint,
  checkPrettier,
  checkPrismaValidate,
  getGitDiff,
  WORKSPACE,
} = require('./runner-checks');
const { readApiKey, shouldCommit, commitWorkspace } = require('./runner-gate');

const FIXTURE_API_KEY = 'dogfood-fixture';
const AIDER_CONFIG = '/home/sandbox/.aider.conf.yml';

function loadTask() {
  const taskJson = process.env.TASK_JSON;
  if (!taskJson) {
    console.error('TASK_JSON is not set');
    process.exit(1);
  }
  try {
    return JSON.parse(taskJson);
  } catch {
    console.error('Malformed JSON in TASK_JSON');
    process.exit(1);
  }
}

function isFixtureKey(apiKey) {
  return apiKey === FIXTURE_API_KEY;
}

function writeAiderConfig(apiKey) {
  const modelProvider = process.env.MODEL_PROVIDER || 'openai';
  const modelName = process.env.MODEL_NAME || 'gpt-4o';
  const apiBaseUrl = process.env.API_BASE_URL || '';
  const lines = [
    `model: ${modelProvider}/${modelName}`,
    `api-key: ${apiKey}`,
    apiBaseUrl ? `openai-api-base: ${apiBaseUrl}` : '',
    'dark-mode: false',
    'no-auto-commits: true',
  ].filter(Boolean);
  fs.writeFileSync(AIDER_CONFIG, `${lines.join('\n')}\n`);
}

function copyFixtureTree(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Fixture directory missing: ${srcDir}`);
  }
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      copyFixtureTree(src, dest);
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

function applyFixtureCodegen() {
  const slug = process.env.FIXTURE_TASK_SLUG;
  const root = process.env.FIXTURE_ROOT || '/fixtures';
  if (!slug) throw new Error('FIXTURE_TASK_SLUG is not set');
  const srcDir = path.join(root, slug);
  console.log(`=== DOGFOOD_FIXTURE: applying ${srcDir} ===`);
  copyFixtureTree(srcDir, WORKSPACE);
  if (process.env.FIXTURE_YARN_INSTALL === '1') {
    console.log('=== yarn install (fixture) ===');
    execSync('yarn install', { cwd: WORKSPACE, stdio: 'inherit' });
  }
  const schemaPath = path.join(WORKSPACE, 'prisma/schema.prisma');
  if (fs.existsSync(schemaPath)) {
    console.log('=== prisma generate (fixture) ===');
    execSync('npx prisma generate', { cwd: WORKSPACE, stdio: 'pipe' });
  }
  return { stdout: 'fixture-codegen', stderr: '' };
}

/** Shared core aligned with docs/07-prompt-coder.md (Aider message wrapper). */
const CODER_CORE_PROMPT = `You are the AI Coder in AI Studio. Work in the project Git root (Next.js App Router, TypeScript, Tailwind, Prisma, PostgreSQL) on the task branch already checked out.

Rules:
- Implement the task exactly; no scope creep.
- English only for code, comments, and the final report.
- Never commit, never change git config, never run yarn dev.
- Size limits: file ≤ 200 lines, function ≤ 50 (lint failures).
- Install deps only when needed (yarn add). Network: npm registry via proxy only.
- After edits, verify TypeScript and ESLint. The runner also runs Prettier and prisma validate before it commits.

Report format:
Task result: [title]
Status: [success/failure]
Changed files:
- [path] ([created/modified/deleted])
Commands run:
- [command] ([result])
Checks:
- TypeScript: [passed/errors]
- ESLint: [passed/errors]
- Tests (if any): [result]
Notes/assumptions:
- [if any]`;

function buildPrompt(task) {
  return `${CODER_CORE_PROMPT}

**Task:** ${task.title}
**Description:** ${task.description}
**Acceptance criteria:** ${task.acceptance}

Implement only this task. End with the report format above. Do not commit.
`;
}

function runAider(prompt) {
  return new Promise((resolve, reject) => {
    const aider = spawn('aider', ['--message', prompt, '--yes'], {
      cwd: WORKSPACE,
      env: { ...process.env, HOME: '/home/sandbox' },
    });
    let stdout = '';
    let stderr = '';
    aider.stdout.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });
    aider.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });
    aider.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Aider exited with code ${code}\n${stderr}`));
    });
    aider.on('error', reject);
  });
}

function applyCheck(name, result, report) {
  if (!result.passed) {
    report.push(`[ERROR] ${name}:\n${result.output}`);
    console.error(result.output);
    return false;
  }
  console.log(`${name}: OK`);
  return true;
}

function printResult(payload) {
  console.log('=== RESULT ===');
  console.log(JSON.stringify(payload));
}

async function main() {
  const task = loadTask();
  const { title, description, acceptance } = task;
  const apiKey = readApiKey();
  const fixtureMode = isFixtureKey(apiKey);
  if (!fixtureMode) writeAiderConfig(apiKey);

  let status = 'success';
  const reportParts = [];

  try {
    console.log(`=== Starting task: ${title} ===`);
    const aiderResult = fixtureMode
      ? applyFixtureCodegen()
      : await runAider(buildPrompt({ title, description, acceptance }));
    console.log(fixtureMode ? '=== Fixture codegen finished ===' : '=== Aider finished ===');

    console.log('=== TypeScript check ===');
    const tsCheck = checkTypeScript();
    const tsOk = applyCheck('TypeScript', tsCheck, reportParts);

    console.log('=== ESLint check ===');
    const lintCheck = checkLint();
    const lintOk = applyCheck('ESLint', lintCheck, reportParts);

    console.log('=== Prettier check ===');
    const fmtCheck = checkPrettier();
    const fmtOk = applyCheck('Prettier', fmtCheck, reportParts);

    console.log('=== Prisma validate ===');
    const prismaCheck = checkPrismaValidate();
    const prismaOk = applyCheck('Prisma validate', prismaCheck, reportParts);

    if (!shouldCommit({ ts: tsOk, lint: lintOk, prettier: fmtOk, prisma: prismaOk })) {
      status = 'failure';
    } else {
      console.log('=== Committing verified changes ===');
      commitWorkspace(WORKSPACE, title);
    }

    printResult({
      status,
      task: title,
      diff: getGitDiff(),
      report: reportParts.join('\n') || 'OK',
      aider_output: aiderResult.stdout,
      ts_passed: tsOk,
      lint_passed: lintOk,
      prettier_passed: fmtOk,
      prisma_passed: prismaOk,
    });
    process.exit(status === 'success' ? 0 : 1);
  } catch (err) {
    console.error('Fatal error:', err.message);
    printResult({
      status: 'failure',
      task: title,
      diff: '',
      report: `Fatal error: ${err.message}`,
      aider_output: '',
      ts_passed: false,
      lint_passed: false,
      prettier_passed: false,
      prisma_passed: false,
    });
    process.exit(1);
  }
}

void main();
