import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const createOrUpdateFile = vi.fn();

vi.mock('./client', () => ({
  createOrUpdateFile,
}));

const { seedUserTemplate } = await import('./seed-template');

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.USER_TEMPLATE_DIR;
});

describe('seedUserTemplate', () => {
  it('writes each template file via Contents API', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seed-gitea-'));
    await mkdir(join(root, 'app'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{"name":"x"}\n');
    await writeFile(join(root, 'README.md'), '# Tpl\n');
    await writeFile(join(root, 'app', 'page.tsx'), 'export default function P() { return null }\n');
    process.env.USER_TEMPLATE_DIR = root;
    createOrUpdateFile.mockResolvedValue({ commitSha: 'c1' });

    const count = await seedUserTemplate({
      owner: 'aistudio',
      repo: 'demo',
      projectName: 'Shop',
      branch: 'main',
    });

    expect(count).toBe(3);
    expect(createOrUpdateFile).toHaveBeenCalledTimes(3);
    expect(createOrUpdateFile).toHaveBeenCalledWith(
      'aistudio',
      'demo',
      'README.md',
      expect.objectContaining({ content: expect.stringContaining('# Shop') }),
    );
  });
});
