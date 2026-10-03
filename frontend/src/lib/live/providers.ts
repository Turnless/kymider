/**
 * The midnight-js provider stack, built on a connected Lace wallet.
 *
 * Same shape as the Node client's `client/providers.ts` (one provider set per
 * contract program, a shared wallet), with each Node-only piece swapped for
 * its browser counterpart:
 *
 *   Node client                          Browser (here)
 *   ───────────────────────────────────  ──────────────────────────────────────
 *   wallet-sdk wallet (seed in process)  DApp connector: balanceUnsealedTransaction
 *                                        + submitTransaction (keys stay in Lace)
 *   NodeZkConfigProvider (filesystem)    FetchZkConfigProvider (<base>/zk/<contract>/)
 *   httpClientProofProvider(local)       the wallet's ProvingProvider, or its proof
 *                                        server URI when it still reports one
 *   levelPrivateStateProvider (LevelDB)  the same provider; `level` resolves to
 *                                        browser-level (IndexedDB) in a browser,
 *                                        with an in-memory fallback when IndexedDB
 *                                        is unavailable (e.g. private windows)
 *   indexerPublicDataProvider            the same, at the wallet's indexer URIs
 *
 * Loaded lazily from `wallet.ts`; importing it pulls in the ledger wasm.
 *
 * APIs: @midnight-ntwrk/midnight-js-types@4.1.1, -indexer-public-data-provider@4.1.1,
 * -http-client-proof-provider@4.1.1, -fetch-zk-config-provider@4.1.1,
 * -level-private-state-provider@4.1.1, -network-id@4.1.1, -utils@4.1.1,
 * -protocol@4.1.1 (ledger-v8), dapp-connector-api@4.0.1.
 */

import type { Configuration, ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  createProofProvider,
  type MidnightProvider,
  type MidnightProviders,
  type PrivateStateProvider,
  type ProofProvider,
  type UnboundTransaction,
  type WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { Transaction, type FinalizedTransaction } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { FetchZkConfigProvider } from '@midnight-ntwrk/midnight-js-fetch-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { validatePassword } from '@midnight-ntwrk/midnight-js-utils';
import { createInMemoryPrivateStateProvider } from './memoryPrivateState';

// Circuit names per program, as in client/providers.ts.
export type SolvencyCircuits =
  | 'addLender'
  | 'updateFacts'
  | 'requestClaim'
  | 'proveSolvency'
  | 'approve'
  | 'reject';
export type RegistryCircuits = 'register' | 'updateCommitment' | 'suspend';
export type LoanCircuits =
  | 'quoteTerms'
  | 'underwrite'
  | 'accept'
  | 'declineOffer'
  | 'decline'
  | 'disburse'
  | 'markDefault'
  | 'proveTier'
  | 'waiveProof'
  | 'repay';
export type LoanDirectoryCircuits = 'list' | 'updateStatus' | 'recordRepaid' | 'proveTwoRepaid';

export type KymiderBrowserProviders = {
  solvency: MidnightProviders<SolvencyCircuits>;
  registry: MidnightProviders<RegistryCircuits>;
  loan: MidnightProviders<LoanCircuits>;
  loanDirectory: MidnightProviders<LoanDirectoryCircuits>;
  /** Where private state lives for this session. */
  privateStorage: 'indexeddb' | 'memory';
  /** How transactions get proved. */
  proving: 'wallet' | 'proof-server';
};

const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string): Uint8Array => {
  const clean = h.replace(/^0x/, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/**
 * Wallet + midnight providers over the connector. Proved transactions go to
 * Lace unsealed; Lace adds fees and inputs, signs, binds, and submits. No key
 * material ever enters this page.
 */
function connectorWallet(
  api: ConnectedAPI,
  coinPublicKey: string,
  encryptionPublicKey: string,
): WalletProvider & MidnightProvider {
  return {
    getCoinPublicKey: () => coinPublicKey,
    getEncryptionPublicKey: () => encryptionPublicKey,
    async balanceTx(tx: UnboundTransaction): Promise<FinalizedTransaction> {
      const { tx: balanced } = await api.balanceUnsealedTransaction(toHex(tx.serialize()));
      return Transaction.deserialize('signature', 'proof', 'binding', fromHex(balanced));
    },
    async submitTx(tx: FinalizedTransaction) {
      await api.submitTransaction(toHex(tx.serialize()));
      const id = tx.identifiers()[0];
      if (!id) throw new Error('submitted transaction has no identifier');
      return id;
    },
  };
}

const PASSWORD_KEY = 'kymider:live:store-key';
const PASSWORD_ALPHABET =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#%*+-=?@_';

const randomPassword = (): string => {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(28));
    const candidate = Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
    try {
      validatePassword(candidate);
      return candidate;
    } catch {
      // A random draw can trip the "no 1234 / no aaaa" rules; draw again.
    }
  }
};

/**
 * The private-state encryption password for this browser.
 *
 * HONEST NOTE: it is generated once and kept in this origin's localStorage,
 * beside the IndexedDB it protects, so it guards against casual inspection of
 * the store, not against code running on this origin. A production build
 * would derive it from something the user supplies. The private state here
 * (dapp secret keys, a loan's history seed) is testnet-only.
 */
function storePassword(): string {
  try {
    const existing = localStorage.getItem(PASSWORD_KEY);
    if (existing) {
      validatePassword(existing);
      return existing;
    }
  } catch {
    // Unreadable or invalid: fall through and mint a new one.
  }
  const fresh = randomPassword();
  try {
    localStorage.setItem(PASSWORD_KEY, fresh);
  } catch {
    // Storage blocked: the password lives for this tab only.
  }
  return fresh;
}

async function indexedDbAvailable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('kymider-probe');
      req.onsuccess = () => {
        req.result.close();
        resolve(true);
      };
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function buildBrowserProviders(args: {
  api: ConnectedAPI;
  config: Configuration;
  coinPublicKey: string;
  encryptionPublicKey: string;
  /** Served ZK artifacts root; each program lives under `<zkBaseUrl><contract>/`. */
  zkBaseUrl: string;
}): Promise<KymiderBrowserProviders> {
  const { api, config, coinPublicKey, encryptionPublicKey } = args;
  setNetworkId(config.networkId);

  const wallet = connectorWallet(api, coinPublicKey, encryptionPublicKey);
  const absolute = new URL(args.zkBaseUrl, window.location.href).toString();
  const zk = <K extends string>(dir: string) =>
    new FetchZkConfigProvider<K>(`${absolute}${dir}`, (input, init) => fetch(input, init));

  const zkSolvency = zk<SolvencyCircuits>('solvency-proof');
  const zkRegistry = zk<RegistryCircuits>('registry');
  const zkLoan = zk<LoanCircuits>('loan');
  const zkDirectory = zk<LoanDirectoryCircuits>('loan-directory');

  // Prefer the wallet's own prover (connector 4.x); fall back to the proof
  // server URI older Lace builds still report.
  const proving: KymiderBrowserProviders['proving'] = config.proverServerUri ? 'proof-server' : 'wallet';
  const proofFor = async <K extends string>(zkConfig: FetchZkConfigProvider<K>): Promise<ProofProvider> =>
    config.proverServerUri
      ? httpClientProofProvider(config.proverServerUri, zkConfig)
      : createProofProvider(await api.getProvingProvider(zkConfig.asKeyMaterialProvider()));

  const useIdb = await indexedDbAvailable();
  const password = useIdb ? storePassword() : '';
  const privateState = (store: string): PrivateStateProvider =>
    useIdb
      ? levelPrivateStateProvider({
          midnightDbName: 'kymider-live',
          privateStateStoreName: `kymider-${store}-${config.networkId}`,
          signingKeyStoreName: `kymider-${store}-signing-${config.networkId}`,
          privateStoragePasswordProvider: () => password,
          accountId: coinPublicKey,
        })
      : createInMemoryPrivateStateProvider();

  // The provider's default WebSocket is `isomorphic-ws`'s named export, which
  // the browser build lacks; vite.config.ts aliases it to the browser's own.
  const publicData = () => indexerPublicDataProvider(config.indexerUri, config.indexerWsUri);

  return {
    solvency: {
      privateStateProvider: privateState('solvency'),
      publicDataProvider: publicData(),
      zkConfigProvider: zkSolvency,
      proofProvider: await proofFor(zkSolvency),
      walletProvider: wallet,
      midnightProvider: wallet,
    },
    registry: {
      privateStateProvider: privateState('registry'),
      publicDataProvider: publicData(),
      zkConfigProvider: zkRegistry,
      proofProvider: await proofFor(zkRegistry),
      walletProvider: wallet,
      midnightProvider: wallet,
    },
    loan: {
      privateStateProvider: privateState('loan'),
      publicDataProvider: publicData(),
      zkConfigProvider: zkLoan,
      proofProvider: await proofFor(zkLoan),
      walletProvider: wallet,
      midnightProvider: wallet,
    },
    loanDirectory: {
      privateStateProvider: privateState('loan-directory'),
      publicDataProvider: publicData(),
      zkConfigProvider: zkDirectory,
      proofProvider: await proofFor(zkDirectory),
      walletProvider: wallet,
      midnightProvider: wallet,
    },
    privateStorage: useIdb ? 'indexeddb' : 'memory',
    proving,
  };
}
