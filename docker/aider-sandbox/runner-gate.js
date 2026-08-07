'use strict';

const { execSync } = require('child_process');
const fs = require('fs');

const API_KEY_PATH = '/run/secrets/api_key';

/**
 * Read API key from the Docker secret file. Never uses process.env.API_KEY.
 * @param {string} [path]
 * @returns {string}
 */
function readApiKey(path = API_KEY_PATH) {
  if (!fs.existsSync(path)) {
    throw new Error(`API key secret missing at ${path}`);
  }
  const key = fs.readFileSync(path, 'utf8').trim();
  if (!key) {
    throw new Error(`API key secret empty at ${path}`);
  }
  return key;
}

/**
 * Commit only when every gate check passed.
 * @param {{ ts: boolean, lint: boolean, prettier: boolean, prisma: boolean }} gates
 * @returns {boolean}
 */
function shouldCommit(gates) {
  return gates.ts && gates.lint && gates.prettier && gates.prisma;
}

/**
 * Stage all changes and commit with the task title as the message.
 * @param {string} workspace
 * @param {string} title
 */
function commitWorkspace(workspace, title) {
  execSync('git add -A', { cwd: workspace, stdio: 'pipe' });
  execSync('git commit -m ' + JSON.stringify(title), {
    cwd: workspace,
    stdio: 'pipe',
  });
}

module.exports = {
  API_KEY_PATH,
  readApiKey,
  shouldCommit,
  commitWorkspace,
};
