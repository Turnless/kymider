// Kymider — demo deployment.
//
// Deploys a per-borrower SolvencyProof instance and the shared Registry, then
// registers the instance. Writes `.midnight-state.json` (addresses + demo
// facts) for the demo CLI and lenders, and persists the borrower's dapp secret
// key to `.wallet-seed` so a LATER process can still act as the owner of the
// instance it just deployed. Requires the local devnet (`npm run env:up`).

import './env.js';

import pino from 'pino';
import { connectWallet } from './context.js';
import { buildProviders } from './providers.js';
import { KymiderClient } from './index.js';
import { loadOrCreateDappSk } from './identity.js';
import { factsToState, writeDeploymentState } from './state.js';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const borrowerSeed =
  process.env['KYMIDER_BORROWER_SEED'] ??
  '0000000000000000000000000000000000000000000000000000000000000001';

// Demo (self-reported) financials — labelled demo data in the UI.
const FACTS = { balance: 1_000_000n, debts: 300_000n, income: 1_000_000n };

const { config, wallet } = await connectWallet(logger, { kind: 'seed', value: borrowerSeed });
const client = new KymiderClient(logger, buildProviders(wallet, config));

const { sk, source } = loadOrCreateDappSk();
logger.info(`Borrower dapp identity loaded (${source})`);

const solvencyAddress = await client.deploySolvencyProof(FACTS, sk);
const registryAddress = await client.deployRegistry(sk);
await client.registerWithRegistry(registryAddress, solvencyAddress);

await writeDeploymentState({
  network: config.networkId,
  solvencyAddress,
  registryAddress,
  facts: factsToState(FACTS),
});

logger.info('Deployment state written to .midnight-state.json');
logger.info(`  SolvencyProof: ${solvencyAddress}`);
logger.info(`  Registry:      ${registryAddress}`);
logger.info('  Owner key:     .wallet-seed (gitignored — required to prove later)');

await wallet.stop();
process.exit(0);
