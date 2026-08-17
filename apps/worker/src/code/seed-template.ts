/**
 * Seed templates/user-nextjs into a cloned workdir when the repo is still empty
 * (README-only projects created before OQ #1 landed).
 */

import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SKIP_DIR = new Set(['node_modules', '.git', '.next']);

export function userTemplateDir(): string {
  const fromEnv = process.env.USER_TEMPLATE_DIR?.trim();
  if (fromEnv) return fromEnv;
  return '/workspace/templates/user-nextjs';
}

/** Copy scaffold when package.json is missing. Returns true if files were added. */
export async function ensureUserTemplate(workDir: string, projectName: string): Promise<boolean> {
  if (await hasPackageJson(workDir)) return false;
  const root = userTemplateDir();
  await copyTree(root, workDir);
  await rewriteReadme(workDir, projectName);
  await commitIfDirty(workDir);
  return true;
}

async function hasPackageJson(workDir: string): Promise<boolean> {
  try {
    const info = await stat(join(workDir, 'package.json'));
    return info.isFile();
  } catch {
    return false;
  }
}

async function copyTree(src: string, dest: string): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIR.has(entry.name)) continue;
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      await mkdir(to, { recursive: true });
      await copyTree(from, to);
      continue;
    }
    if (!entry.isFile()) continue;
    await mkdir(dirname(to), { recursive: true });
    await writeFile(to, await readFile(from));
  }
}

async function rewriteReadme(workDir: string, projectName: string): Promise<void> {
  const path = join(workDir, 'README.md');
  try {
    const current = await readFile(path, 'utf8');
    await writeFile(path, current.replace(/^# .+$/m, `# ${projectName}`));
  } catch {
    await writeFile(path, `# ${projectName}\n`);
  }
}

async function commitIfDirty(workDir: string): Promise<void> {
  await execFileAsync('git', ['add', '-A'], { cwd: workDir, timeout: 30_000 });
  const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
    cwd: workDir,
    timeout: 15_000,
  });
  if (stdout.trim() === '') return;
  await execFileAsync(
    'git',
    [
      '-c',
      'user.email=coder@aistudio.local',
      '-c',
      'user.name=AI Studio Coder',
      'commit',
      '-m',
      'chore: bootstrap user-nextjs template',
    ],
    { cwd: workDir, timeout: 30_000 },
  );
}
