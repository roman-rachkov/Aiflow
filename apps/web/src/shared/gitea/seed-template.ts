/**
 * Push the user-nextjs scaffold into a Gitea repo (one Contents commit per file).
 * First file creates `main` when the repo was created with auto_init=false.
 */

import { createOrUpdateFile } from './client';
import { readUserTemplateFiles, type TemplateFile } from './template-files';
import type { GitIdentity } from './types';

const PLATFORM_GIT: GitIdentity = { name: 'AI Studio', email: 'noreply@aistudio.local' };

export type SeedUserTemplateInput = {
  owner: string;
  repo: string;
  projectName: string;
  branch?: string;
};

/** Write every template file; throws if the tree is empty or missing package.json. */
export async function seedUserTemplate(input: SeedUserTemplateInput): Promise<number> {
  const files = await readUserTemplateFiles(input.projectName);
  if (files.length === 0 || !files.some((f) => f.path === 'package.json')) {
    throw new Error('User template is empty or missing package.json');
  }
  const branch = input.branch ?? 'main';
  for (const file of files) {
    await writeOne(input.owner, input.repo, branch, file);
  }
  return files.length;
}

async function writeOne(
  owner: string,
  repo: string,
  branch: string,
  file: TemplateFile,
): Promise<void> {
  await createOrUpdateFile(owner, repo, file.path, {
    content: file.content,
    message: `chore: bootstrap ${file.path}`,
    branch,
    author: PLATFORM_GIT,
    committer: PLATFORM_GIT,
  });
}
