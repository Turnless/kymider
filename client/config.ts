// Kymider — network configuration.
//
// Holds endpoint configs for the local devnet and the public testnets, and a
// `getConfig()` selector driven by MIDNIGHT_NETWORK. Adapted from
// midnightntwrk/example-battleship (Apache-2.0).

export type NetworkConfig = {
  networkId: string;
  indexer: string;
  indexerWS: string;
  node: string;
  nodeWS: string;
  proofServer: string;
  // Human-facing faucet page for topping up test wallets. Not a programmatic
  // drip endpoint — the demo/tests assume pre-funded seeds.
  faucet: string;
};

// Depends on the services defined in docker-compose.yml.
export const LOCAL_CONFIG: NetworkConfig = {
  networkId: 'undeployed',
  indexer: 'http://127.0.0.1:8088/api/v4/graphql',
  indexerWS: 'ws://127.0.0.1:8088/api/v4/graphql/ws',
  node: 'http://127.0.0.1:9944',
  nodeWS: 'ws://127.0.0.1:9944',
  proofServer: 'http://127.0.0.1:6300',
  faucet: '',
};

export const PREVIEW_CONFIG: NetworkConfig = {
  networkId: 'preview',
  indexer: 'https://indexer.preview.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preview.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preview.midnight.network',
  nodeWS: 'wss://rpc.preview.midnight.network',
  proofServer: process.env['MIDNIGHT_PROOF_SERVER'] ?? 'http://127.0.0.1:6300',
  faucet: 'https://midnight-tmnight-preview.nethermind.dev/',
};

// Midnight's own Preprod endpoints (indexer.preprod.midnight.network,
// rpc.preprod.midnight.network) were shut down on 2026-10-09; Blockfrost now
// serves Preprod's indexer (GraphQL /api/v0) and node RPC. Every request needs
// a Blockfrost project token for Preprod (it starts with `nightpreprod`),
// passed as a `project_id` query parameter because the SDK's indexer client and
// the wallet's relay take plain URLs. The token is a secret: it is read from
// the environment, never committed, and stripped from every record a run
// writes (see withoutProjectId).
export const BLOCKFROST_TOKEN_VAR = 'BLOCKFROST_PROJECT_ID';

const BLOCKFROST_PREPROD = {
  indexer: 'https://midnight-preprod.blockfrost.io/api/v0',
  indexerWS: 'wss://midnight-preprod.blockfrost.io/api/v0/ws',
  node: 'https://rpc.midnight-preprod.blockfrost.io',
  nodeWS: 'wss://rpc.midnight-preprod.blockfrost.io',
};

const isBlockfrost = (url: string): boolean => {
  try {
    return new URL(url).hostname.endsWith('.blockfrost.io');
  } catch {
    return false;
  }
};

/** `url` with `?project_id=<token>` set (for Blockfrost hosts only). */
export function withProjectId(url: string, token: string): string {
  if (!isBlockfrost(url)) return url;
  const u = new URL(url);
  u.searchParams.set('project_id', token);
  return u.toString();
}

/** `url` with any `project_id` removed: the form that may be written down or shown. */
export function withoutProjectId(url: string): string {
  if (!isBlockfrost(url)) return url;
  const u = new URL(url);
  u.searchParams.delete('project_id');
  return u.toString().replace(/\?$/, '');
}

/**
 * A public endpoint from a record, with the token from the environment added
 * back if it is a Blockfrost URL. Throws if a Blockfrost URL needs a token and
 * none is set.
 */
export function withTokenFromEnv(url: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!isBlockfrost(url)) return url;
  const token = env[BLOCKFROST_TOKEN_VAR]?.trim();
  if (!token) throw new Error(missingTokenMessage());
  return withProjectId(url, token);
}

const missingTokenMessage = (): string =>
  `${BLOCKFROST_TOKEN_VAR} is not set. Midnight Preprod is served by Blockfrost since 2026-10-09; ` +
  'create a free Preprod project at https://blockfrost.io and set its project ID ' +
  `(it starts with "nightpreprod") as ${BLOCKFROST_TOKEN_VAR} (the GitHub secret, in CI).`;

export function preprodConfig(env: NodeJS.ProcessEnv = process.env): NetworkConfig {
  const token = env[BLOCKFROST_TOKEN_VAR]?.trim();
  if (!token) throw new Error(missingTokenMessage());
  return {
    networkId: 'preprod',
    indexer: withProjectId(BLOCKFROST_PREPROD.indexer, token),
    indexerWS: withProjectId(BLOCKFROST_PREPROD.indexerWS, token),
    node: withProjectId(BLOCKFROST_PREPROD.node, token),
    nodeWS: withProjectId(BLOCKFROST_PREPROD.nodeWS, token),
    proofServer: env['MIDNIGHT_PROOF_SERVER'] ?? 'http://127.0.0.1:6300',
    faucet: 'https://midnight-tmnight-preprod.nethermind.dev/',
  };
}

export function getConfig(): NetworkConfig {
  const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';
  switch (network) {
    case 'local':
      return LOCAL_CONFIG;
    case 'preview':
      return PREVIEW_CONFIG;
    case 'preprod':
      return preprodConfig();
    default:
      throw new Error(
        `Unknown network: ${network}. Supported: 'local', 'preview', 'preprod'.`,
      );
  }
}