// Kymider — midnight-js providers for the Wave 1 and Wave 2 programs.
//
// Each contract program needs its own zkConfigProvider/proofProvider (they have
// distinct circuit sets), while the wallet is shared. One private-state store
// per program keeps the borrower's SolvencyProof facts separate from the
// Registry caller identity, and each Loan's history seed separate from both.
//
// Adapted from midnightntwrk/example-battleship (Apache-2.0).

import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import {
  loanDirectoryZkConfigPath,
  loanZkConfigPath,
  registryZkConfigPath,
  solvencyZkConfigPath,
} from '../contracts/index.js';
import type { MidnightWalletProvider } from './wallet.js';
import type { NetworkConfig } from './config.js';

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
  | 'repay';

export type LoanDirectoryCircuits = 'list' | 'updateStatus' | 'recordRepaid' | 'proveTwoRepaid';

export type SolvencyProviders = MidnightProviders<SolvencyCircuits>;
export type RegistryProviders = MidnightProviders<RegistryCircuits>;
export type LoanProviders = MidnightProviders<LoanCircuits>;
export type LoanDirectoryProviders = MidnightProviders<LoanDirectoryCircuits>;

export type KymiderProviders = {
  solvency: SolvencyProviders;
  registry: RegistryProviders;
  loan: LoanProviders;
  loanDirectory: LoanDirectoryProviders;
};

// The store password requirement is: at least 3 characters that are not
// lowercase (capitals and/or specials). Overridable so nothing security-shaped
// is pinned in source (NFR-3); the default is a local-dev value only.
const DEV_STORE_PASSWORD = 'Kymider-Dev-Store-1';

function storePassword(): string {
  return process.env['KYMIDER_PRIVATE_STORE_PASSWORD'] ?? DEV_STORE_PASSWORD;
}

// A stable, filesystem-safe discriminator for this wallet. The store name must
// NOT change between runs (a timestamp would orphan the borrower's facts and
// secret key on every process start), but it must still differ per wallet so a
// borrower and a lender in the same process never share a store.
function walletTag(wallet: MidnightWalletProvider): string {
  const key = String(wallet.getCoinPublicKey()).replace(/[^a-zA-Z0-9]/g, '');
  return key.slice(-16) || 'default';
}

// One KymiderProviders per wallet.
export function buildProviders(
  wallet: MidnightWalletProvider,
  config: NetworkConfig,
): KymiderProviders {
  const tag = `${config.networkId}-${walletTag(wallet)}`;
  const password = storePassword();
  const solvencyZkConfigProvider = new NodeZkConfigProvider<SolvencyCircuits>(solvencyZkConfigPath);
  const registryZkConfigProvider = new NodeZkConfigProvider<RegistryCircuits>(registryZkConfigPath);
  const loanZkConfigProvider = new NodeZkConfigProvider<LoanCircuits>(loanZkConfigPath);
  const loanDirectoryZkConfigProvider = new NodeZkConfigProvider<LoanDirectoryCircuits>(
    loanDirectoryZkConfigPath,
  );

  return {
    solvency: {
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: `kymider-solvency-${tag}`,
        privateStoragePasswordProvider: () => password,
        accountId: wallet.getCoinPublicKey(),
      }),
      publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
      zkConfigProvider: solvencyZkConfigProvider,
      proofProvider: httpClientProofProvider(config.proofServer, solvencyZkConfigProvider),
      walletProvider: wallet,
      midnightProvider: wallet,
    },
    registry: {
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: `kymider-registry-${tag}`,
        privateStoragePasswordProvider: () => password,
        accountId: wallet.getCoinPublicKey(),
      }),
      publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
      zkConfigProvider: registryZkConfigProvider,
      proofProvider: httpClientProofProvider(config.proofServer, registryZkConfigProvider),
      walletProvider: wallet,
      midnightProvider: wallet,
    },
    loan: {
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: `kymider-loan-${tag}`,
        privateStoragePasswordProvider: () => password,
        accountId: wallet.getCoinPublicKey(),
      }),
      publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
      zkConfigProvider: loanZkConfigProvider,
      proofProvider: httpClientProofProvider(config.proofServer, loanZkConfigProvider),
      walletProvider: wallet,
      midnightProvider: wallet,
    },
    loanDirectory: {
      privateStateProvider: levelPrivateStateProvider({
        privateStateStoreName: `kymider-loan-directory-${tag}`,
        privateStoragePasswordProvider: () => password,
        accountId: wallet.getCoinPublicKey(),
      }),
      publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
      zkConfigProvider: loanDirectoryZkConfigProvider,
      proofProvider: httpClientProofProvider(config.proofServer, loanDirectoryZkConfigProvider),
      walletProvider: wallet,
      midnightProvider: wallet,
    },
  };
}
