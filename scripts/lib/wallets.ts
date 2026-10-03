// Kymider — which wallets `prove:onchain` runs with.
//
// local:   the devnet's pre-funded genesis seeds, one wallet per role (the
//          same seeds as the simulations), overridable with
//          KYMIDER_BORROWER_SEED / KYMIDER_LENDER_SEED.
// remote:  <NETWORK>_WALLET_SEED (the GitHub secret PREPROD_WALLET_SEED on
//          preprod), or MIDNIGHT_<NETWORK>_BORROWER_{SEED,MNEMONIC} as the
//          simulations name it. A lender wallet is optional:
//          MIDNIGHT_<NETWORK>_LENDER_{SEED,MNEMONIC}. Without one, the single
//          funded wallet pays for both roles, and the roles stay distinct
//          where it matters: each has its own dapp secret key, which is the
//          identity every Kymider circuit checks.
//
// A secret's value is never logged or echoed in an error.

import * as Rx from 'rxjs';
import type { Logger } from 'pino';
import type { WalletSecret } from '../../client/wallet.js';
import type { MidnightWalletProvider } from '../../client/wallet.js';

export const LOCAL_BORROWER_SEED = '0000000000000000000000000000000000000000000000000000000000000001';
export const LOCAL_LENDER_SEED = '0000000000000000000000000000000000000000000000000000000000000002';

export type ProveWallets = {
  borrower: WalletSecret;
  /** null: the borrower's wallet also pays for the lender's transactions. */
  lender: WalletSecret | null;
  /** Where the secrets came from (names of variables, never values). */
  source: string;
};

export const walletSecretVar = (network: string): string => `${network.toUpperCase()}_WALLET_SEED`;

export function missingSecretMessage(network: string): string {
  const v = walletSecretVar(network);
  return (
    `No wallet for '${network}'. Add the ${v} secret: Settings → Secrets → Actions ` +
    `(locally: export ${v}, or MIDNIGHT_${network.toUpperCase()}_BORROWER_SEED / _MNEMONIC).`
  );
}

/**
 * A mnemonic (words separated by spaces) or a hex seed (optionally 0x-prefixed).
 * `name` is the variable's name, used in errors instead of the value.
 */
export function parseWalletSecret(raw: string, name: string): WalletSecret {
  const value = raw.trim();
  if (value === '') throw new Error(`${name} is empty`);
  if (/\s/.test(value)) {
    return { kind: 'mnemonic', value: value.split(/\s+/).join(' ') };
  }
  const hex = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error(`${name} is neither a hex seed nor a space-separated mnemonic`);
  }
  return { kind: 'seed', value: hex.toLowerCase() };
}

type Env = Readonly<Record<string, string | undefined>>;

function fromPair(env: Env, prefix: string): { secret: WalletSecret; name: string } | null {
  const mnemonicVar = `${prefix}_MNEMONIC`;
  const seedVar = `${prefix}_SEED`;
  const mnemonic = env[mnemonicVar]?.trim();
  const seed = env[seedVar]?.trim();
  if (mnemonic && seed) throw new Error(`Set only one of ${mnemonicVar} or ${seedVar}.`);
  if (mnemonic) return { secret: parseWalletSecret(mnemonic, mnemonicVar), name: mnemonicVar };
  if (seed) return { secret: parseWalletSecret(seed, seedVar), name: seedVar };
  return null;
}

export function resolveProveWallets(network: string, env: Env = process.env): ProveWallets {
  if (network === 'local') {
    return {
      borrower: { kind: 'seed', value: env['KYMIDER_BORROWER_SEED']?.trim() || LOCAL_BORROWER_SEED },
      lender: { kind: 'seed', value: env['KYMIDER_LENDER_SEED']?.trim() || LOCAL_LENDER_SEED },
      source: 'devnet genesis seeds',
    };
  }

  const upper = network.toUpperCase();
  const mainVar = walletSecretVar(network);
  const main = env[mainVar]?.trim();
  const borrower = main
    ? { secret: parseWalletSecret(main, mainVar), name: mainVar }
    : fromPair(env, `MIDNIGHT_${upper}_BORROWER`);
  if (!borrower) throw new Error(missingSecretMessage(network));

  const lender = fromPair(env, `MIDNIGHT_${upper}_LENDER`);
  return {
    borrower: borrower.secret,
    lender: lender?.secret ?? null,
    source: lender
      ? `${borrower.name} (borrower), ${lender.name} (lender)`
      : `${borrower.name} (one wallet, both roles)`,
  };
}

/**
 * Wait until the wallet holds at least `minDust` DUST. Registration (done by
 * testkit's waitForFunds) only starts accrual; the balance can still be zero
 * when it returns, which is the failure scripts/wait-for-dust.ts documents.
 */
export async function waitForDust(
  logger: Logger,
  wallet: MidnightWalletProvider,
  minDust: bigint,
  timeoutMs: number,
  pollMs = 2_000,
): Promise<bigint> {
  let latest = await Rx.firstValueFrom(wallet.wallet.state());
  const subscription = wallet.wallet.state().subscribe((state) => {
    latest = state;
  });
  try {
    const deadline = Date.now() + timeoutMs;
    let dust = latest.dust.balance(new Date());
    while (dust < minDust) {
      if (Date.now() > deadline) {
        throw new Error(
          `DUST balance still ${dust} after ${timeoutMs} ms (need >= ${minDust}). ` +
            'Is the wallet funded with NIGHT, and is the chain producing blocks?',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      dust = latest.dust.balance(new Date());
    }
    logger.info(`DUST balance: ${dust}`);
    return dust;
  } finally {
    subscription.unsubscribe();
  }
}
