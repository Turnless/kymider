// Kymider — Midnight wallet provider.
//
// Wraps the wallet SDK behind the MidnightProvider/WalletProvider interfaces
// that midnight-js providers consume. Includes wallet build from a seed or
// mnemonic and a wallet-sync helper with an RxJS progress stream.
//
// Adapted from midnightntwrk/example-battleship (Apache-2.0).

import {
  type CoinPublicKey,
  DustSecretKey,
  type EncPublicKey,
  type FinalizedTransaction,
  LedgerParameters,
  ZswapSecretKeys,
} from '@midnight-ntwrk/midnight-js-protocol/ledger';
import type {
  MidnightProvider,
  UnboundTransaction,
  WalletProvider,
} from '@midnight-ntwrk/midnight-js-types';
import { ttlOneHour } from '@midnight-ntwrk/midnight-js-utils';
import type {
  WalletFacade,
  FacadeState,
  UnshieldedKeystore,
} from '@midnight-ntwrk/wallet-sdk';
import {
  type DustWalletOptions,
  type EnvironmentConfiguration,
  FluentWalletBuilder,
} from '@midnight-ntwrk/testkit-js';
import * as Rx from 'rxjs';
import type { Logger } from 'pino';

export type WalletSecret =
  | { kind: 'seed'; value: string }
  | { kind: 'mnemonic'; value: string };

// ---------------------------------------------------------------------------
// DUST is measured on the chain's clock, not this machine's.
//
// DUST accrues continuously from registered NIGHT, so a balance is only
// defined at a point in time. The wallet SDK balances every transaction at
// the timestamp of the indexer's latest block (blockData().timestamp in
// wallet-sdk-dust-wallet), but `state.dust.balance(new Date())` answers for the
// local wall clock, which runs ahead of the indexed tip by at least the
// block time plus finality and indexing lag. The two disagree most right after
// a chain starts (or a wallet registers NIGHT): the coin was created at or
// near the tip's time, so it holds ~nothing at the tip even though the
// wall-clock balance looks healthy. Submitting then fails with
// `Wallet.InsufficientFunds: Insufficient Funds: could not balance dust`.
// Waiting for the tip to move on is the only thing that helps, and it is
// what the helpers below do, each with a time limit.
// ---------------------------------------------------------------------------

export type ChainTip = { height: number; time: Date };

/** The indexer's latest block: the height and the time the SDK balances at. */
export async function fetchChainTip(indexerUrl: string): Promise<ChainTip> {
  const res = await fetch(indexerUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'query { block { height timestamp } }' }),
  });
  if (!res.ok) {
    throw new Error(`indexer block query failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    data?: { block?: { height: number; timestamp: number | string } | null };
  };
  const block = body.data?.block;
  if (!block) {
    throw new Error('indexer block query returned no block');
  }
  return { height: Number(block.height), time: parseBlockTime(block.timestamp) };
}

/** Block timestamps come back as epoch milliseconds (a number, or its string). */
export function parseBlockTime(timestamp: number | string): Date {
  const ms = typeof timestamp === 'number' || /^\d+$/.test(timestamp) ? Number(timestamp) : Date.parse(timestamp);
  const time = new Date(ms);
  if (Number.isNaN(time.getTime())) {
    throw new Error(`unreadable block timestamp: ${String(timestamp)}`);
  }
  return time;
}

/**
 * True for the wallet SDK's "not enough DUST to pay the fee" failure. It
 * reaches us as an Effect FiberFailure whose name carries the error's tag.
 */
export function isDustShortfall(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const text = `${err.name}: ${err.message}`;
  return text.includes('InsufficientFunds') && /\bdust\b/i.test(text);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// How long one transaction may wait for its fee to become payable at the
// chain's time. Generous by default: it is a ceiling, not a delay, and on a
// public network the tip can trail by several blocks.
const DEFAULT_FEE_WAIT_MS = Number(process.env['KYMIDER_FEE_WAIT_MS'] ?? 10 * 60_000);
const FEE_POLL_MS = 2_000;

export class MidnightWalletProvider implements MidnightProvider, WalletProvider {
  readonly wallet: WalletFacade;
  readonly unshieldedKeystore: UnshieldedKeystore;
  private latestState: FacadeState | undefined;
  private stateSubscription: Rx.Subscription | undefined;

  private constructor(
    private readonly logger: Logger,
    wallet: WalletFacade,
    private readonly zswapSecretKeys: ZswapSecretKeys,
    private readonly dustSecretKey: DustSecretKey,
    unshieldedKeystore: UnshieldedKeystore,
    private readonly indexerUrl: string,
    private readonly feeWaitMs: number = DEFAULT_FEE_WAIT_MS,
  ) {
    this.wallet = wallet;
    this.unshieldedKeystore = unshieldedKeystore;
  }

  /** The DUST this wallet holds at the indexer tip's time: what a fee can draw on. */
  async dustAtChainTip(): Promise<{ tip: ChainTip; dust: bigint }> {
    const tip = await fetchChainTip(this.indexerUrl);
    const state =
      this.latestState ??
      (await Rx.firstValueFrom(this.wallet.state().pipe(Rx.timeout({ first: 60_000 }))));
    return { tip, dust: state.dust.balance(tip.time) };
  }

  /**
   * Wait until the SDK itself can pay this transaction's fee. It estimates
   * with exactly the computation balancing uses (same coins, same tip time),
   * without touching wallet state, so a pass here means balancing will not
   * fail for want of DUST. Any other estimate error is left for balancing to
   * report.
   */
  private async waitUntilFeePayable(tx: UnboundTransaction, ttl: Date): Promise<void> {
    const deadline = Date.now() + this.feeWaitMs;
    for (let attempt = 1; ; attempt++) {
      try {
        await this.wallet.estimateTransactionFee(tx, this.dustSecretKey, { ttl });
        if (attempt > 1) this.logger.info(`DUST covers the fee now (after ${attempt - 1} wait(s)).`);
        return;
      } catch (err) {
        if (!isDustShortfall(err)) return;
        const seen = await this.dustAtChainTip().then(
          ({ tip, dust }) => `${dust} DUST at block #${tip.height} (${tip.time.toISOString()})`,
          () => 'the chain tip is unreadable',
        );
        if (Date.now() >= deadline) {
          throw new Error(
            `DUST still cannot pay the fee after ${this.feeWaitMs} ms: ${seen}. ` +
              'Is the wallet funded with NIGHT registered for DUST, and is the chain producing blocks?',
            { cause: err },
          );
        }
        if (attempt === 1 || attempt % 15 === 0) {
          this.logger.info(`Fee not yet payable at the chain tip (${seen}); waiting for new blocks...`);
        }
        await sleep(FEE_POLL_MS);
      }
    }
  }

  getCoinPublicKey(): CoinPublicKey {
    return this.zswapSecretKeys.coinPublicKey;
  }

  getEncryptionPublicKey(): EncPublicKey {
    return this.zswapSecretKeys.encryptionPublicKey;
  }

  async balanceTx(
    tx: UnboundTransaction,
    ttl: Date = ttlOneHour(),
  ): Promise<FinalizedTransaction> {
    await this.waitUntilFeePayable(tx, ttl);
    const recipe = await this.wallet.balanceUnboundTransaction(
      tx,
      {
        shieldedSecretKeys: this.zswapSecretKeys,
        dustSecretKey: this.dustSecretKey,
      },
      { ttl },
    );
    return await this.wallet.finalizeRecipe(recipe);
  }

  submitTx(tx: FinalizedTransaction): Promise<string> {
    return this.wallet.submitTransaction(tx);
  }

  async start(): Promise<void> {
    this.logger.info('Starting wallet...');
    await this.wallet.start(this.zswapSecretKeys, this.dustSecretKey);
    // Track the newest state for dustAtChainTip, rather than re-subscribing on
    // every poll and risking a wait on a quiet stream.
    this.stateSubscription ??= this.wallet.state().subscribe((state) => {
      this.latestState = state;
    });
  }

  async stop(): Promise<void> {
    this.stateSubscription?.unsubscribe();
    this.stateSubscription = undefined;
    return this.wallet.stop();
  }

  static async build(
    logger: Logger,
    env: EnvironmentConfiguration,
    secret: WalletSecret,
  ): Promise<MidnightWalletProvider> {
    const dustOptions: DustWalletOptions = {
      ledgerParams: LedgerParameters.initialParameters(),
      additionalFeeOverhead: 1_000n,
      feeBlocksMargin: 5,
    };

    const base = FluentWalletBuilder.forEnvironment(env).withDustOptions(dustOptions);
    const builder =
      secret.kind === 'mnemonic'
        ? base.withMnemonic(secret.value)
        : base.withSeed(secret.value);

    const buildResult = await builder.buildWithoutStarting();
    const { wallet, seeds, keystore } = buildResult as {
      wallet: WalletFacade;
      seeds: {
        masterSeed: string;
        shielded: Uint8Array;
        dust: Uint8Array;
      };
      keystore: UnshieldedKeystore;
    };

    logger.info(
      // Never log any part of the seed: Actions logs on a public repo are public.
      `Wallet built from ${secret.kind}`,
    );

    return new MidnightWalletProvider(
      logger,
      wallet,
      ZswapSecretKeys.fromSeed(seeds.shielded),
      DustSecretKey.fromSeed(seeds.dust),
      keystore,
      env.indexer,
    );
  }
}

function isProgressStrictlyComplete(progress: unknown): boolean {
  if (!progress || typeof progress !== 'object') {
    return false;
  }
  const candidate = progress as { isStrictlyComplete?: unknown };
  if (typeof candidate.isStrictlyComplete !== 'function') {
    return false;
  }
  return (candidate.isStrictlyComplete as () => boolean)();
}

export async function syncWallet(
  logger: Logger,
  wallet: WalletFacade,
  timeout = 300_000,
): Promise<FacadeState> {
  logger.info('Syncing wallet...');
  let emissionCount = 0;
  return Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.tap((state: FacadeState) => {
        emissionCount++;
        const shielded = isProgressStrictlyComplete(state.shielded.state.progress);
        const unshielded = isProgressStrictlyComplete(state.unshielded.progress);
        const dust = isProgressStrictlyComplete(state.dust.state.progress);
        logger.info(
          `Wallet sync [${emissionCount}]: shielded=${shielded}, unshielded=${unshielded}, dust=${dust}`,
        );
      }),
      Rx.filter(
        (state: FacadeState) =>
          isProgressStrictlyComplete(state.shielded.state.progress) &&
          isProgressStrictlyComplete(state.dust.state.progress) &&
          isProgressStrictlyComplete(state.unshielded.progress),
      ),
      Rx.tap(() => logger.info(`Wallet sync complete after ${emissionCount} emissions`)),
      Rx.timeout({
        each: timeout,
        with: () =>
          Rx.throwError(
            () => new Error(`Wallet sync timeout after ${timeout}ms (${emissionCount} emissions received)`),
          ),
      }),
      Rx.catchError((err) => {
        logger.error(`Wallet sync error: ${err}`);
        return Rx.throwError(() => err);
      }),
    ),
  );
}