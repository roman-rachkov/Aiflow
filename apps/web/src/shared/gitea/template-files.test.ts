import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readUserTemplateFiles, templateHasPackageJson } from './template-files';

describe('readUserTemplateFiles', () => {
  const prev = process.env.USER_TEMPLATE_DIR;

  afterEach(() => {
    if (prev === undefined) delete process.env.USER_TEMPLATE_DIR;
    else process.env.USER_TEMPLATE_DIR = prev;
  });

  it('walks files and rewrites README title', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tpl-'));
    await mkdir(join(root, 'app'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{"name":"x"}\n');
    await writeFile(join(root, 'README.md'), '# User project template\n\nHello\n');
    await writeFile(
      join(root, 'app', 'page.tsx'),
      'export default function Page() { return null; }\n',
    );
    process.env.USER_TEMPLATE_DIR = root;

    const files = await readUserTemplateFiles('Shop');
    expect(templateHasPackageJson(files)).toBe(true);
    const readme = files.find((f) => f.path === 'README.md');
    expect(readme?.content.startsWith('# Shop\n')).toBe(true);
    expect(files.some((f) => f.path === 'app/page.tsx')).toBe(true);
  });
});
