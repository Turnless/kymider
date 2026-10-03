/**
 * Read deployed Kymider contracts straight from a Midnight indexer.
 *
 * One GraphQL POST per contract, the same `contractAction(address) { state }`
 * query `@midnight-ntwrk/midnight-js-indexer-public-data-provider` sends
 * (CONTRACT_STATE_QUERY), decoded the same way (`ContractState.deserialize`
 * then the contract's `ledger()`). Plain `fetch` rather than the provider:
 * a read-only view needs neither Apollo nor a WebSocket, and keeping the
 * reader runtime-agnostic lets a Node test drive it against CI's devnet
 * indexer with the root package's runtime (see `codecs.ts` for the browser's).
 *
 * Nothing here signs, proves or submits; it needs no wallet.
 */

import {
  DecodeError,
  decodeContractState,
  normalizeAddress,
  type ContractKind,
  type ContractView,
  type StateCodec,
} from './decode';

export type IndexerEndpoint = { indexer: string; indexerWS?: string };

export class IndexerError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'IndexerError';
  }
}

/** Where the state was read from: the latest transaction that touched the contract. */
export type ChainAnchor = {
  txHash: string | null;
  blockHeight: number | null;
  /** Block time as the indexer reports it (ms since epoch), when present. */
  blockTimestamp: number | null;
  /** ContractDeploy, ContractCall or ContractUpdate. */
  action: string | null;
};

export type ContractRead =
  | { status: 'ok'; kind: ContractKind; address: string; view: ContractView; anchor: ChainAnchor }
  | { status: 'not-found'; kind: ContractKind; address: string }
  | { status: 'error'; kind: ContractKind; address: string; error: string };

export type TxLookup =
  | { status: 'found'; hash: string; blockHeight: number | null; blockTimestamp: number | null }
  | { status: 'not-found' }
  | { status: 'error'; error: string };

export const CONTRACT_STATE_QUERY = /* GraphQL */ `
  query KYMIDER_CONTRACT_STATE($address: HexEncoded!) {
    contractAction(address: $address) {
      __typename
      state
      transaction {
        hash
        block {
          height
          timestamp
        }
      }
    }
  }
`;

export const TX_QUERY = /* GraphQL */ `
  query KYMIDER_TX($offset: TransactionOffset!) {
    transactions(offset: $offset) {
      hash
      block {
        height
        timestamp
      }
    }
  }
`;

type GraphQLResponse<T> = { data?: T | null; errors?: { message: string }[] };

type ContractActionData = {
  contractAction: {
    __typename?: string;
    state: string;
    transaction?: { hash?: string; block?: { height?: number; timestamp?: number } } | null;
  } | null;
};

type TxData = {
  transactions: { hash: string; block?: { height?: number; timestamp?: number } | null }[] | null;
};

export type ChainReaderOptions<S> = {
  endpoint: IndexerEndpoint;
  codec: StateCodec<S>;
  fetchImpl?: typeof fetch;
  /** Per-request timeout. Default 15 s. */
  timeoutMs?: number;
};

export type ChainReader = {
  readonly endpoint: IndexerEndpoint;
  /** Raw state hex as the indexer serves it, or null when the address is unknown. */
  fetchStateHex(address: string): Promise<{ stateHex: string; anchor: ChainAnchor } | null>;
  readContract(kind: ContractKind, address: string): Promise<ContractRead>;
  readAll(contracts: { kind: ContractKind; address: string }[]): Promise<ContractRead[]>;
  lookupTx(ref: { txHash?: string; txId?: string }): Promise<TxLookup>;
};

export function createChainReader<S>(options: ChainReaderOptions<S>): ChainReader {
  const { endpoint, codec } = options;
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function post<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(endpoint.indexer, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
    } catch (cause) {
      throw new IndexerError(
        controller.signal.aborted
          ? `indexer did not answer within ${timeoutMs / 1000}s`
          : `indexer unreachable at ${endpoint.indexer}`,
        { cause },
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new IndexerError(`indexer answered HTTP ${res.status}`);
    let body: GraphQLResponse<T>;
    try {
      body = (await res.json()) as GraphQLResponse<T>;
    } catch (cause) {
      throw new IndexerError('indexer answered with something other than JSON', { cause });
    }
    if (body.errors && body.errors.length > 0) {
      throw new IndexerError(body.errors.map((e) => e.message).join('; '));
    }
    return body.data ?? null;
  }

  async function fetchStateHex(address: string) {
    const data = await post<ContractActionData>(CONTRACT_STATE_QUERY, {
      address: normalizeAddress(address),
    });
    const action = data?.contractAction;
    if (!action || typeof action.state !== 'string' || action.state.length === 0) return null;
    const block = action.transaction?.block;
    return {
      stateHex: action.state,
      anchor: {
        txHash: action.transaction?.hash ?? null,
        blockHeight: typeof block?.height === 'number' ? block.height : null,
        blockTimestamp: typeof block?.timestamp === 'number' ? block.timestamp : null,
        action: action.__typename ?? null,
      },
    };
  }

  async function readContract(kind: ContractKind, address: string): Promise<ContractRead> {
    try {
      const found = await fetchStateHex(address);
      if (!found) return { status: 'not-found', kind, address };
      const view = decodeContractState(codec, kind, found.stateHex);
      return { status: 'ok', kind, address, view, anchor: found.anchor };
    } catch (e) {
      const error =
        e instanceof IndexerError || e instanceof DecodeError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      return { status: 'error', kind, address, error };
    }
  }

  async function lookupTx(ref: { txHash?: string; txId?: string }): Promise<TxLookup> {
    const offset = ref.txHash
      ? { hash: ref.txHash.replace(/^0x/i, '') }
      : ref.txId
        ? { identifier: ref.txId.replace(/^0x/i, '') }
        : null;
    if (!offset) return { status: 'error', error: 'no tx hash or id to look up' };
    try {
      const data = await post<TxData>(TX_QUERY, { offset });
      const tx = data?.transactions?.[0];
      if (!tx) return { status: 'not-found' };
      return {
        status: 'found',
        hash: tx.hash,
        blockHeight: typeof tx.block?.height === 'number' ? tx.block.height : null,
        blockTimestamp: typeof tx.block?.timestamp === 'number' ? tx.block.timestamp : null,
      };
    } catch (e) {
      return { status: 'error', error: e instanceof Error ? e.message : String(e) };
    }
  }

  return {
    endpoint,
    fetchStateHex,
    readContract,
    readAll: (contracts) => Promise.all(contracts.map((c) => readContract(c.kind, c.address))),
    lookupTx,
  };
}
