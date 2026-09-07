// Kymider — shared wallet/client wiring for scripts and demo.
//
// Reduces the boilerplate shared by deploy.ts, demo.ts, check-balance.ts and
// scripts/wait-for-dust.ts.

import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import type { EnvironmentConfiguration } from '@midnight-ntwrk/testkit-js';
import type { Logger } from 'pino';
import { getConfig, type NetworkConfig } from './config.js';
import {
  MidnightWalletProvider,
  syncWallet,
  type WalletSecret,
} from './wallet.js';

export function environmentFor(config: NetworkConfig): EnvironmentConfiguration {
  return {
    walletNetworkId: config.networkId,
    networkId: config.networkId,
    indexer: config.indexer,
    indexerWS: config.indexerWS,
    node: config.node,
    nodeWS: config.nodeWS,
    faucet: config.faucet,
    proofServer: config.proofServer,
  };
}

export async function connectWallet(
  logger: Logger,
  secret: WalletSecret,
  syncTimeoutMs = Number(process.env['MIDNIGHT_SYNC_TIMEOUT_MS'] ?? 10 * 60_000),
): Promise<{ config: NetworkConfig; env: EnvironmentConfiguration; wallet: MidnightWalletProvider }> {
  const config = getConfig();
  setNetworkId(config.networkId);
  const env = environmentFor(config);
  const wallet = await MidnightWalletProvider.build(logger, env, secret);
  await wallet.start();
  await syncWallet(logger, wallet.wallet, syncTimeoutMs);
  return { config, env, wallet };
}