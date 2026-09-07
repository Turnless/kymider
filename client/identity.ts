// Kymider — persistent dapp identity for the CLI flows.
//
// The `sk` behind getDappPubKey(sk) IS the owner of a SolvencyProof instance.
// deploy.ts used to generate it with randomBytes(32) and never store it, so the
// moment the process exited nobody could authorize a lender or prove against
// the instance it had just deployed. Persist it instead.
//
// Demo-grade only: a real deployment derives this from the wallet's key
// material or a hardware-backed store, never a plaintext file.

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hexToBytes, bytesToHex } from './utils.js';

export const DEFAULT_SK_FILE = '.wallet-seed';

export type DappIdentity = {
  sk: Uint8Array;
  source: 'env' | 'file' | 'generated';
};

// Precedence: KYMIDER_DAPP_SK (hex) > the on-disk file > a freshly generated
// key, which is then written to the file for the next run.
export function loadOrCreateDappSk(file: string = DEFAULT_SK_FILE): DappIdentity {
  const fromEnv = process.env['KYMIDER_DAPP_SK']?.trim();
  if (fromEnv) {
    return { sk: requireSk(hexToBytes(fromEnv), 'KYMIDER_DAPP_SK'), source: 'env' };
  }

  const resolved = path.resolve(process.cwd(), file);
  if (fs.existsSync(resolved)) {
    const stored = fs.readFileSync(resolved, 'utf8').trim();
    return { sk: requireSk(hexToBytes(stored), resolved), source: 'file' };
  }

  const sk = new Uint8Array(randomBytes(32));
  fs.writeFileSync(resolved, bytesToHex(sk), { encoding: 'utf8', mode: 0o600 });
  return { sk, source: 'generated' };
}

function requireSk(sk: Uint8Array, origin: string): Uint8Array {
  if (sk.length !== 32) {
    throw new Error(`${origin}: expected a 32-byte secret key, got ${sk.length} bytes`);
  }
  return sk;
}
