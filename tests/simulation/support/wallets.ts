// Kymider — wallet setup for the devnet / testnet simulations.
//
// Same rules as the Wave 1 simulation: genesis seeds on the local devnet,
// MIDNIGHT_<NETWORK>_<ROLE>_{MNEMONIC,SEED} elsewhere. Simulation files run
// one at a time (see the test:simulation script), since they share these
// wallets and two files spending from one wallet at once would collide.

import pino from 'pino';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { waitForFunds } from '@midnight-ntwrk/testkit-js';
import { environmentFor } from '../../../client/context.js';
import { getConfig, type NetworkConfig } from '../../../client/config.js';
import { MidnightWalletProvider, syncWallet, type WalletSecret } from '../../../client/wallet.js';

export type Role = 'BORROWER' | 'LENDER';

// Genesis seeds for the local dev node — pre-funded, used only on `local`.
const LOCAL_SEEDS: Record<Role, string> = {
  BORROWER: '0000000000000000000000000000000000000000000000000000000000000001',
  LENDER: '0000000000000000000000000000000000000000000000000000000000000002',
};

export const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';
export const isRemote = network !== 'local';

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const syncTimeoutMs = Number(
  process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ?? (isRemote ? 3 * 60 * 60_000 : 10 * 60_000),
);

export function resolveSecret(net: string, role: Role): WalletSecret {
  if (net === 'local') {
    return { kind: 'seed', value: LOCAL_SEEDS[role] };
  }
  const upper = net.toUpperCase();
  const mnemonicEnv = `MIDNIGHT_${upper}_${role}_MNEMONIC`;
  const seedEnv = `MIDNIGHT_${upper}_${role}_SEED`;
  const mnemonic = process.env[mnemonicEnv]?.trim().replace(/\s+/g, ' ');
  const seedHex = process.env[seedEnv]?.trim();
  if (mnemonic && seedHex) {
    throw new Error(`Set only one of ${mnemonicEnv} or ${seedEnv} (both are defined).`);
  }
  if (mnemonic) return { kind: 'mnemonic', value: mnemonic };
  if (seedHex) return { kind: 'seed', value: seedHex };
  throw new Error(`Either ${mnemonicEnv} or ${seedEnv} is required for network '${net}'.`);
}

/** Build, start and sync one wallet per role; on a testnet, wait for funds. */
export async function connectRoles(): Promise<{
  config: NetworkConfig;
  wallets: Record<Role, MidnightWalletProvider>;
}> {
  const config = getConfig();
  setNetworkId(config.networkId);
  const env = environmentFor(config);
  const wallets = {} as Record<Role, MidnightWalletProvider>;
  for (const role of ['BORROWER', 'LENDER'] as const) {
    const w = await MidnightWalletProvider.build(logger, env, resolveSecret(network, role));
    await w.start();
    await syncWallet(logger, w.wallet, syncTimeoutMs);
    if (isRemote) {
      const balance = await waitForFunds(w.wallet, env, false, w.unshieldedKeystore);
      logger.info(`${role} NIGHT balance on '${network}': ${balance}`);
    }
    wallets[role] = w;
  }
  return { config, wallets };
}
