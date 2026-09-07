import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

// Network-selective test config. Local runs target the Docker devnet
// (docker-compose.yml); remote runs (preview/preprod) read wallet secrets
// from .env.<network> so they never need to be passed on the CLI.
const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';
const isRemote = network !== 'local';
const envFromFile = isRemote ? loadEnv(network, process.cwd(), '') : {};

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 10 * 60_000,
    hookTimeout: isRemote ? 6 * 60 * 60_000 : 15 * 60_000,
    env: envFromFile,
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
    sequence: { concurrent: false },
    disableConsoleIntercept: true,
  },
});