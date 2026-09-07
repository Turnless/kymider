// Kymider — .env loader for the CLI entry points.
//
// `.env.example` tells you to `cp .env.example .env`, but nothing was reading it:
// the npm scripts run vite-node directly (no `--env-file`) and vitest only calls
// `loadEnv` for remote networks. This module fills that gap with no dependency.
//
// Import it as the FIRST import of an entry script, before config.js is
// evaluated — ESM evaluates dependencies in import-declaration order, and
// config.ts reads MIDNIGHT_PROOF_SERVER at module load time.
//
// Real environment variables always win over the file.

import fs from 'node:fs';
import path from 'node:path';

export function loadDotEnv(file = path.resolve(process.cwd(), '.env')): void {
  if (!fs.existsSync(file)) {
    return;
  }
  for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();
