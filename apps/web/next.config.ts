import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@aiflow/ui', '@aiflow/db', '@aiflow/queue', '@aiflow/crypto'],
};

export default nextConfig;
