import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@aiflow/ui',
    '@aiflow/db',
    '@aiflow/queue',
    '@aiflow/crypto',
    '@openuidev/react-ui',
    '@openuidev/react-lang',
    '@openuidev/react-headless',
  ],
  // Keep native/Node packages out of the server bundle. `prisma` is spawned by
  // `@aiflow/db` at project-create time; bundling it breaks CLI resolution.
  // Query engines for the custom `generated/{public,project}` clients are not
  // copied into `.next` — compose sets `PRISMA_QUERY_ENGINE_LIBRARY` so Prisma
  // skips the broken webpack search path (see docker-compose app/worker env).
  // `pdf-parse`/`pdfjs-dist` crash under webpack RSC with
  // `Object.defineProperty called on non-object` — leave them as Node requires.
  serverExternalPackages: ['prisma', '@prisma/client', 'pg', 'pdf-parse', 'pdfjs-dist'],
};

export default nextConfig;
