#!/usr/bin/env node
'use strict';

/**
 * Sandbox runner: run Aider headless, enforce verification gate, commit on success.
 * Lint/TS/Prettier/prisma validate failures → status failure, exit 1, no commit.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const {
  checkTypeScript,
  checkLint,
  checkPrettier,
  checkPrismaValidate,
  getGitDiff,
  WORKSPACE,
} = require('./runner-checks');
const { readApiKey, shouldCommit, commitWorkspace } = require('./runner-gate');

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

function buildPrompt(task) {
  return `
You are the AI Coder. Your task: implement the following change in the project code.

**Task:** ${task.title}
**Description:** ${task.description}
**Acceptance criteria:** ${task.acceptance}

You are in the root directory of a Next.js Git repository (App Router, TypeScript, Tailwind, Prisma).
Implement the task strictly as described, adding nothing extra.
After making changes, verify the code compiles without TypeScript errors and passes ESLint.
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
  writeAiderConfig(apiKey);

  let status = 'success';
  const reportParts = [];

  try {
    console.log(`=== Starting task: ${title} ===`);
    const aiderResult = await runAider(buildPrompt({ title, description, acceptance }));
    console.log('=== Aider finished ===');

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
