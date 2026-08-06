/** Map a file path extension to a Monaco language id. */
const EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
  css: 'css',
  scss: 'scss',
  html: 'html',
  htm: 'html',
  py: 'python',
  rs: 'rust',
  go: 'go',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  sh: 'shell',
  bash: 'shell',
  sql: 'sql',
  prisma: 'plaintext',
  env: 'plaintext',
  txt: 'plaintext',
};

export function languageFromPath(path: string): string {
  const base = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1) : '';
  return EXT[base.toLowerCase()] ?? 'plaintext';
}
