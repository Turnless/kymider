// Kymider — read-only indexer access for the proof scripts.
//
// No wallet, no proof server: contract state comes from the indexer's public
// GraphQL API (through midnight-js' indexer provider, which decodes it), and
// each transaction hash is looked up with a plain GraphQL query a judge can
// repeat with curl (see PROOF.md).

import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import {
  loanDirectoryLedger,
  loanLedger,
  registryLedger,
  solvencyLedger,
} from '../../contracts/index.js';
import type { Deployments } from './deployments.js';
import {
  checkClaims,
  checkContractsCoverTxs,
  checkTransactions,
  type ClaimResult,
  type OnchainStates,
  type TxLookup,
} from './claims.js';
import { TX_BY_HASH_QUERY } from './onchain-query.js';

export { TX_BY_HASH_QUERY };

type TxByHashResponse = {
  data?: {
    transactions?: {
      hash: string;
      block: { height: number; hash: string };
      transactionResult?: { status: string } | null;
    }[];
  };
  errors?: { message: string }[];
};

export async function lookupTxByHash(indexer: string, txHash: string): Promise<TxLookup> {
  const response = await fetch(indexer, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query: TX_BY_HASH_QUERY, variables: { offset: { hash: txHash } } }),
  });
  if (!response.ok) {
    throw new Error(`indexer answered ${response.status} ${response.statusText} for tx ${txHash}`);
  }
  const body = (await response.json()) as TxByHashResponse;
  if (body.errors?.length) {
    throw new Error(`indexer error for tx ${txHash}: ${body.errors.map((e) => e.message).join('; ')}`);
  }
  const txs = body.data?.transactions ?? [];
  return {
    blockHeights: txs.map((t) => t.block.height),
    statuses: txs.flatMap((t) => (t.transactionResult?.status ? [t.transactionResult.status] : [])),
  };
}

export async function lookupTxs(
  indexer: string,
  hashes: readonly string[],
): Promise<Map<string, TxLookup | null>> {
  const out = new Map<string, TxLookup | null>();
  for (const hash of new Set(hashes)) {
    out.set(hash, await lookupTxByHash(indexer, hash));
  }
  return out;
}

/** Decoded public state of every contract the deployments file names. */
export async function readStates(d: Deployments): Promise<OnchainStates> {
  const provider = indexerPublicDataProvider(d.indexer, d.indexerWS);
  const read = async <T>(address: string, decode: (data: never) => T): Promise<T | null> => {
    const state = await provider.queryContractState(address);
    return state ? decode(state.data as never) : null;
  };
  const loans: OnchainStates['loans'] = [];
  for (const address of d.contracts.loans) {
    loans.push(await read(address, loanLedger));
  }
  return {
    solvencyProof: await read(d.contracts.solvencyProof, solvencyLedger),
    registry: await read(d.contracts.registry, registryLedger),
    loanDirectory: await read(d.contracts.loanDirectory, loanDirectoryLedger),
    loans,
  };
}

export type Verification = {
  claims: ClaimResult[];
  transactions: ClaimResult[];
};

/** Everything `verify:onchain` checks, read fresh from the indexer. */
export async function verifyDeployments(d: Deployments): Promise<Verification> {
  const states = await readStates(d);
  const lookups = await lookupTxs(
    d.indexer,
    d.txs.map((t) => t.txHash),
  );
  return {
    claims: [checkContractsCoverTxs(d), ...checkClaims(d, states)],
    transactions: checkTransactions(d.txs, lookups),
  };
}
