// Kymider — print a wallet's token balances.

import './env.js';

import pino from 'pino';
import { firstValueFrom } from 'rxjs';
import { connectWallet } from './context.js';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const seed =
  process.env['KYMIDER_BORROWER_SEED'] ??
  process.env['KYMIDER_LENDER_SEED'] ??
  '0000000000000000000000000000000000000000000000000000000000000001';

const { wallet } = await connectWallet(logger, { kind: 'seed', value: seed });

try {
  const state = await firstValueFrom(wallet.wallet.unshielded.state);
  const balances = state.balances;
  logger.info(`Balances: ${JSON.stringify(balances, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`);
} catch (err) {
  logger.error(`Could not read balances: ${err}`);
}

await wallet.stop();
process.exit(0);
