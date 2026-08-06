import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@aiflow/ui', '@aiflow/db', '@aiflow/queue', '@aiflow/crypto'],
  // Keep native/Node packages out of the server bundle. `prisma` is spawned by
  // `@aiflow/db` at project-create time; bundling it breaks CLI resolution.
  // `pdf-parse`/`pdfjs-dist` crash under webpack RSC with
  // `Object.defineProperty called on non-object` — leave them as Node requires.
  serverExternalPackages: ['prisma', '@prisma/client', 'pg', 'pdf-parse', 'pdfjs-dist'],
};

export default nextConfig;
