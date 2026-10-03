/**
 * Lace (or any wallet implementing the Midnight DApp Connector API 4.x).
 *
 * Wallets inject an `InitialAPI` under `window.midnight[<key>]`; Lace uses
 * `mnLace`. `connect(networkId)` asks the user to approve this site and
 * returns a `ConnectedAPI` from which we read the wallet's keys, addresses
 * and service configuration (indexer, prover, node, network id).
 *
 * This module stays light: the midnight-js provider stack, which pulls in the
 * ledger wasm, lives in `providers.ts` and is loaded only after the user
 * connects, so the console's first paint does not pay for it.
 *
 * API: @midnight-ntwrk/dapp-connector-api@4.0.1 (`InitialAPI`, `ConnectedAPI`,
 * `Configuration`, `APIError`, `ErrorCodes`).
 */

import type {
  APIError,
  Configuration,
  ConnectedAPI,
  InitialAPI,
} from '@midnight-ntwrk/dapp-connector-api';
import { NETWORKS, type NetworkKey } from './deployments';
import { midnightKeyToHex } from './address';
import type { KymiderBrowserProviders } from './providers';

export type LiveWalletErrorCode =
  | 'not-installed'
  | 'unsupported-version'
  | 'rejected'
  | 'wrong-network'
  | 'disconnected'
  | 'failed';

export class LiveWalletError extends Error {
  readonly code: LiveWalletErrorCode;
  constructor(code: LiveWalletErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LiveWalletError';
    this.code = code;
  }
}

export type WalletIdentity = {
  /** Display name the wallet reports (sanitize before rendering as HTML; React text is safe). */
  name: string;
  rdns: string;
  apiVersion: string;
};

export type LiveSession = {
  wallet: WalletIdentity;
  network: NetworkKey;
  networkId: string;
  config: Configuration;
  addresses: {
    unshielded: string;
    shielded: string;
    /** Hex, as midnight-js's WalletProvider returns it. */
    coinPublicKey: string;
    encryptionPublicKey: string;
  };
  api: ConnectedAPI;
  /**
   * The midnight-js provider sets for all four contracts, built on this
   * wallet: wallet + midnight provider from the connector, fetch ZK-config,
   * a proof provider (the wallet's own, or its proof server), the indexer
   * public-data provider and an IndexedDB private-state provider.
   */
  providers: KymiderBrowserProviders;
};

const SUPPORTED_MAJOR = 4;

const isApiError = (e: unknown): e is APIError =>
  typeof e === 'object' && e !== null && (e as { type?: unknown }).type === 'DAppConnectorAPIError';

/** Every injected wallet whose API major version we speak. Lace first. */
export function detectWallets(
  win: { midnight?: Record<string, InitialAPI> } | undefined = typeof window === 'undefined'
    ? undefined
    : window,
): {
  key: string;
  api: InitialAPI;
}[] {
  const injected = win?.midnight;
  if (!injected || typeof injected !== 'object') return [];
  return Object.entries(injected)
    .filter(([, api]) => api && typeof api.connect === 'function')
    .sort(([a], [b]) => (a === 'mnLace' ? -1 : b === 'mnLace' ? 1 : a.localeCompare(b)))
    .map(([key, api]) => ({ key, api }));
}

export function isLaceInstalled(): boolean {
  return detectWallets().length > 0;
}

/** Map a connector failure onto the three messages a user can act on. */
export function explainWalletError(e: unknown, expectedNetworkId?: string): LiveWalletError {
  if (e instanceof LiveWalletError) return e;
  if (isApiError(e)) {
    switch (e.code) {
      case 'Rejected':
      case 'PermissionRejected':
        return new LiveWalletError('rejected', 'You declined the connection in Lace.', { cause: e });
      case 'Disconnected':
        return new LiveWalletError('disconnected', 'Lace disconnected. Reconnect to continue.', {
          cause: e,
        });
      case 'InvalidRequest':
        // Lace answers a connect() for a network it is not set to with an
        // invalid-request error rather than a dedicated code.
        return new LiveWalletError(
          'wrong-network',
          `Lace is not on ${expectedNetworkId ?? 'the selected network'}. Switch networks in Lace and retry.`,
          { cause: e },
        );
      default:
        return new LiveWalletError('failed', e.reason || e.message || 'Lace returned an error.', {
          cause: e,
        });
    }
  }
  return new LiveWalletError('failed', e instanceof Error ? e.message : String(e), { cause: e });
}

/**
 * Connect to Lace for `network`, read its keys and services, and build the
 * provider stack. Errors are always `LiveWalletError` with one of:
 * "not-installed", "unsupported-version", "rejected", "wrong-network".
 */
export async function connectLace(
  network: NetworkKey,
  options: { zkBaseUrl?: string } = {},
): Promise<LiveSession> {
  const expected = NETWORKS[network].networkId;
  const wallets = detectWallets();
  const entry = wallets[0];
  if (!entry) {
    throw new LiveWalletError(
      'not-installed',
      'Lace not installed. Install the Lace wallet extension with Midnight enabled, then reload.',
    );
  }
  const initial = entry.api;
  const major = Number.parseInt(String(initial.apiVersion ?? '').split('.')[0] ?? '', 10);
  if (major !== SUPPORTED_MAJOR) {
    throw new LiveWalletError(
      'unsupported-version',
      `${initial.name || 'This wallet'} speaks DApp Connector API ${initial.apiVersion}; this console needs ${SUPPORTED_MAJOR}.x. Update Lace.`,
    );
  }

  let api: ConnectedAPI;
  try {
    api = await initial.connect(expected);
  } catch (e) {
    throw explainWalletError(e, expected);
  }

  try {
    const [config, status] = await Promise.all([api.getConfiguration(), api.getConnectionStatus()]);
    const actual = status.status === 'connected' ? status.networkId : config.networkId;
    if (actual !== expected) {
      throw new LiveWalletError(
        'wrong-network',
        `Lace is on "${actual}", not "${expected}". Switch networks in Lace and connect again.`,
      );
    }

    // Tell the wallet up front what this session will ask for, so it can
    // request permissions once instead of mid-flow.
    await api
      .hintUsage([
        'getConfiguration',
        'getShieldedAddresses',
        'getUnshieldedAddress',
        'balanceUnsealedTransaction',
        'submitTransaction',
        'getProvingProvider',
      ])
      .catch(() => undefined);

    const [shielded, unshielded] = await Promise.all([
      api.getShieldedAddresses(),
      api.getUnshieldedAddress(),
    ]);
    const coinPublicKey = midnightKeyToHex(shielded.shieldedCoinPublicKey, 'shield-cpk').hex;
    const encryptionPublicKey = midnightKeyToHex(
      shielded.shieldedEncryptionPublicKey,
      'shield-epk',
    ).hex;

    // Heavy: midnight-js + the ledger wasm. Loaded only now.
    const { buildBrowserProviders } = await import('./providers');
    const providers = await buildBrowserProviders({
      api,
      config,
      coinPublicKey,
      encryptionPublicKey,
      zkBaseUrl: options.zkBaseUrl ?? `${import.meta.env.BASE_URL}zk/`,
    });

    return {
      wallet: { name: initial.name, rdns: initial.rdns, apiVersion: initial.apiVersion },
      network,
      networkId: actual,
      config,
      addresses: {
        unshielded: unshielded.unshieldedAddress,
        shielded: shielded.shieldedAddress,
        coinPublicKey,
        encryptionPublicKey,
      },
      api,
      providers,
    };
  } catch (e) {
    throw explainWalletError(e, expected);
  }
}
