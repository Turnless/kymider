// Kymider — wait for a wallet to accumulate DUST (proof-generation fuel).
//
// The local devnet pre-mints NIGHT to the genesis seeds, but transactions are
// paid for in DUST, which accrues over time from registered NIGHT. CI calls
// this before running the simulation so the first deploy is not racing the
// chain for fuel.
//
// The subtlety that cost us a red run: testkit's `waitForFunds` does not wait
// for DUST despite the name. It waits for NIGHT, submits a registration
// transaction if the dust balance is zero, syncs once, and returns the NIGHT
// balance. Registration only *starts* accrual — the balance can still be zero
// when it returns, which is why a green "Wait for NIGHT + DUST" step could be
// followed immediately by `Wallet.InsufficientFunds: could not balance dust`
// on the very first deploy. So we wait for the balance ourselves.
//
// And we read it on the chain's clock. The SDK balances a fee at the time of
// the indexer's latest block; reading the balance at this machine's time let
// this step pass (full balance at wall-clock time) while the indexed tip was
// still at or next to the block that created the DUST, where it is worth
// nothing — and the first deploy failed exactly as above. scripts/lib/wallets.ts
// has the shared wait; every transaction also waits for its own fee to be
// payable (client/wallet.ts), since this step runs in a separate process.

import '../client/env.js';

import pino from 'pino';
import { waitForFunds } from '@midnight-ntwrk/testkit-js';
import { connectWallet } from '../client/context.js';
import { waitForDust } from './lib/wallets.js';

const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  transport: { target: 'pino-pretty' },
});

const seed =
  process.env['KYMIDER_BORROWER_SEED'] ??
  '0000000000000000000000000000000000000000000000000000000000000001';

// Dust accrues continuously, so this is normally seconds. The ceiling only
// exists so a devnet that never generates dust fails loudly instead of hanging
// until the job timeout.
const dustTimeoutMs = Number(process.env['KYMIDER_DUST_TIMEOUT_MS'] ?? 180_000);
const pollMs = 2_000;
// Any dust at the chain tip shows accrual has reached the chain. Whether it
// covers a particular fee is checked per transaction, against that fee, in
// MidnightWalletProvider.balanceTx; raise this only for an earlier failure.
const minDust = BigInt(process.env['KYMIDER_MIN_DUST'] ?? '1');

const { env, wallet } = await connectWallet(logger, { kind: 'seed', value: seed });

logger.info('Waiting for NIGHT...');
const nightBalance = await waitForFunds(wallet.wallet, env, true, wallet.unshieldedKeystore);
logger.info(`NIGHT balance: ${nightBalance}`);

logger.info(`Waiting for DUST at the chain tip (need >= ${minDust})...`);
try {
  await waitForDust(logger, wallet, minDust, dustTimeoutMs, pollMs);
} catch (err) {
  logger.error(err instanceof Error ? err.message : String(err));
  await wallet.stop();
  process.exit(1);
}
logger.info('The wallet can pay for transactions.');

await wallet.stop();
process.exit(0);
