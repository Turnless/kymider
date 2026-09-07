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

export const PREPROD_CONFIG: NetworkConfig = {
  networkId: 'preprod',
  indexer: 'https://indexer.preprod.midnight.network/api/v4/graphql',
  indexerWS: 'wss://indexer.preprod.midnight.network/api/v4/graphql/ws',
  node: 'https://rpc.preprod.midnight.network',
  nodeWS: 'wss://rpc.preprod.midnight.network',
  proofServer: process.env['MIDNIGHT_PROOF_SERVER'] ?? 'http://127.0.0.1:6300',
  faucet: 'https://midnight-tmnight-preprod.nethermind.dev/',
};

export function getConfig(): NetworkConfig {
  const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';
  switch (network) {
    case 'local':
      return LOCAL_CONFIG;
    case 'preview':
      return PREVIEW_CONFIG;
    case 'preprod':
      return PREPROD_CONFIG;
    default:
      throw new Error(
        `Unknown network: ${network}. Supported: 'local', 'preview', 'preprod'.`,
      );
  }
}