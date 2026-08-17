/**
 * Read `templates/user-nextjs/` (or USER_TEMPLATE_DIR) as path/content pairs.
 * Used when seeding a project Gitea repo so the Coder starts from a Next.js
 * scaffold, not an empty README (OQ #1).
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

export type TemplateFile = { path: string; content: string };

const SKIP_DIR = new Set(['node_modules', '.git', '.next']);

/** Template root: env override, else the monorepo path inside compose. */
export function userTemplateDir(): string {
  const fromEnv = process.env.USER_TEMPLATE_DIR?.trim();
  if (fromEnv) return fromEnv;
  return '/workspace/templates/user-nextjs';
}

/** Walk the template tree; rewrite README.md title to the project name. */
export async function readUserTemplateFiles(projectName: string): Promise<TemplateFile[]> {
  const root = userTemplateDir();
  const files: TemplateFile[] = [];
  await walk(root, root, files);
  return files.map((file) => customize(file, projectName));
}

async function walk(root: string, dir: string, out: TemplateFile[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIR.has(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, abs, out);
      continue;
    }
    if (!entry.isFile()) continue;
    const content = await readFile(abs, 'utf8');
    out.push({ path: relative(root, abs).replaceAll('\\', '/'), content });
  }
}

function customize(file: TemplateFile, projectName: string): TemplateFile {
  if (file.path !== 'README.md') return file;
  const body = file.content.replace(/^# .+$/m, `# ${projectName}`);
  return { path: file.path, content: body };
}

/** True when the listing looks like a seeded user app (has package.json). */
export function templateHasPackageJson(files: TemplateFile[]): boolean {
  return files.some((f) => f.path === 'package.json');
}
