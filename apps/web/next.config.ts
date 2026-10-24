import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@editor-video/core', '@editor-video/db', '@editor-video/video'],
  // Pacotes nativos/CJS que não devem ser empacotados pelo bundler do servidor.
  serverExternalPackages: [
    '@prisma/client',
    'bullmq',
    'ioredis',
    // V3: pacotes Node-only (subprocessos, createRequire, crypto) carregados em runtime.
    '@editor-video/domain',
    '@editor-video/timeline',
    '@editor-video/integrations',
    '@editor-video/templates',
  ],
};

export default nextConfig;
