// Kymider — wait for a wallet to accumulate DUST (proof-generation fuel).
//
// The local devnet pre-mints NIGHT to the genesis seed, but proof generation
// also needs DUST, which accrues from staking NIGHT. `validate`/`setup` call
// this before running simulations so proving does not stall.

import '../client/env.js';

import pino from 'pino';
import { waitForFunds } from '@midnight-ntwrk/testkit-js';
import { connectWallet } from '../client/context.js';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const seed =
  process.env['KYMIDER_BORROWER_SEED'] ??
  '0000000000000000000000000000000000000000000000000000000000000001';

const { env, wallet } = await connectWallet(logger, { kind: 'seed', value: seed });

logger.info('Waiting for NIGHT (and DUST) to accumulate...');
const nightBalance = await waitForFunds(wallet.wallet, env, true, wallet.unshieldedKeystore);
logger.info(`NIGHT balance: ${nightBalance}`);

await wallet.stop();
process.exit(0);
