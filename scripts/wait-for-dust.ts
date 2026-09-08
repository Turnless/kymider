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

import '../client/env.js';

import * as Rx from 'rxjs';
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

// Dust accrues continuously, so this is normally seconds. The ceiling only
// exists so a devnet that never generates dust fails loudly instead of hanging
// until the job timeout.
const dustTimeoutMs = Number(process.env['KYMIDER_DUST_TIMEOUT_MS'] ?? 180_000);
const pollMs = 2_000;
// Any dust at all clears the failure we actually hit (a balance of exactly
// zero). Raise it without a code change if a deploy ever fails to balance on a
// non-zero balance — the amount is logged below to inform that choice.
const minDust = BigInt(process.env['KYMIDER_MIN_DUST'] ?? '1');

const { env, wallet } = await connectWallet(logger, { kind: 'seed', value: seed });

logger.info('Waiting for NIGHT...');
const nightBalance = await waitForFunds(wallet.wallet, env, true, wallet.unshieldedKeystore);
logger.info(`NIGHT balance: ${nightBalance}`);

// Track the newest state rather than re-querying: the balance is a function of
// both the synced state and the current time, and a live subscription cannot
// stall the way a fresh `firstValueFrom` on a quiet stream could.
let latest = await Rx.firstValueFrom(wallet.wallet.state());
const subscription = wallet.wallet.state().subscribe((state) => {
  latest = state;
});

logger.info(`Waiting for DUST to accrue (need >= ${minDust})...`);
const deadline = Date.now() + dustTimeoutMs;
let dust = latest.dust.balance(new Date());

while (dust < minDust) {
  if (Date.now() > deadline) {
    subscription.unsubscribe();
    await wallet.stop();
    logger.error(
      `DUST balance was still ${dust} after ${dustTimeoutMs}ms. ` +
        'NIGHT is present but not generating dust — check that the node is producing blocks.',
    );
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, pollMs));
  dust = latest.dust.balance(new Date());
}

logger.info(`DUST balance: ${dust} — the wallet can pay for transactions.`);

subscription.unsubscribe();
await wallet.stop();
process.exit(0);
