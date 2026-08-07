'use strict';

const { execSync } = require('child_process');

const WORKSPACE = '/workspace';

/**
 * @returns {{ passed: boolean, output: string }}
 */
function fromExec(command) {
  try {
    execSync(command, { cwd: WORKSPACE, stdio: 'pipe' });
    return { passed: true, output: '' };
  } catch (e) {
    const out = `${String(e.stdout ?? '')}\n${String(e.stderr ?? '')}`;
    return { passed: false, output: out };
  }
}

function checkTypeScript() {
  return fromExec('npx tsc --noEmit');
}

function checkLint() {
  return fromExec('npx eslint . --ext .ts,.tsx --max-warnings 0');
}

function checkPrettier() {
  return fromExec('npx prettier --check .');
}

function checkPrismaValidate() {
  return fromExec('npx prisma validate');
}

function getGitDiff() {
  try {
    return execSync('git diff', { cwd: WORKSPACE, encoding: 'utf8' });
  } catch {
    return '';
  }
}

module.exports = {
  checkTypeScript,
  checkLint,
  checkPrettier,
  checkPrismaValidate,
  getGitDiff,
  WORKSPACE,
};
