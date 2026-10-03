// Kymider — deploy the shared LoanDirectory.
//
// Loans themselves are per application and deployed by the borrower (see
// loan-demo.ts); the directory is the one shared instance lenders browse.
// Writes `.midnight-loans.json` for the loan demo. Requires the local devnet
// (`npm run env:up`) or MIDNIGHT_NETWORK set to a funded testnet.

import './env.js';

import pino from 'pino';
import { connectWallet } from './context.js';
import { buildProviders } from './providers.js';
import { LoanClient } from './loans.js';
import { loadOrCreateDappSk } from './identity.js';
import { writeLoanState } from './state.js';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const borrowerSeed =
  process.env['KYMIDER_BORROWER_SEED'] ??
  '0000000000000000000000000000000000000000000000000000000000000001';

const { config, wallet } = await connectWallet(logger, { kind: 'seed', value: borrowerSeed });
const client = new LoanClient(logger, buildProviders(wallet, config));

const { sk, source } = loadOrCreateDappSk();
logger.info(`Dapp identity loaded (${source})`);

const directoryAddress = await client.deployLoanDirectory(sk);
await writeLoanState({ network: config.networkId, directoryAddress, repaid: [] });

logger.info('Loan deployment state written to .midnight-loans.json');
logger.info(`  LoanDirectory: ${directoryAddress}`);

await wallet.stop();
process.exit(0);
