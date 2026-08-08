import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pacotes nativos/CJS que não devem ser empacotados pelo bundler do servidor.
  serverExternalPackages: ['@prisma/client', 'bullmq', 'ioredis'],
};

export default nextConfig;
