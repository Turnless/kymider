/**
 * A LoanDesk backed by the real compiled Compact contracts.
 *
 * Every loan here is an actual `Loan` contract instance and the index is one
 * actual `LoanDirectory` instance, both executed in the browser through
 * compact-runtime, like `SimulatedKymiderClient` does for Wave 1. Tier
 * verdicts, collateral checks, lateness, the default grace period and the
 * Merkle history proof are the contract's, not this file's: a refusal reaches
 * the screen as the contract's own assert text.
 *
 * The desk owns the block clock. It starts at the wall clock when the desk is
 * built, moves only through `advanceTime`, and is written into the block
 * context before every circuit call, so a demo can step past a due date or a
 * grace period on purpose.
 *
 * Identities are the Wave 1 ones: the borrower is the wallet that owns this
 * browser's SolvencyProof instance, and lenders are the same personas with the
 * same keys. Each Loan's `factsCommitment` is copied from its borrower's
 * SolvencyProof instance at deploy, which is what `factsBound` checks.
 *
 * What it does NOT do: generate ZK proofs, submit transactions, or move funds.
 */

import {
  createCircuitContext,
  createConstructorContext,
  encodeContractAddress,
  sampleContractAddress,
  type CircuitContext,
  type MerkleTreePath,
} from '@midnight-ntwrk/compact-runtime';
import * as audit from '../../../contracts/audit.js';
import {
  ListingStatus,
  LoanContract,
  LoanDirectoryContract,
  Tier,
  amountDue,
  collateralFor,
  createLoanDirectoryPrivateState,
  createLoanPrivateState,
  defaultableFrom,
  installmentFor,
  loanDirectoryLedger,
  loanDirectoryPureCircuits,
  loanDirectoryWitnesses,
  loanLedger,
  loanPureCircuits,
  loanWitnesses,
  owedFor,
  tierIsLive,
  type Listing,
  type LoanDirectoryLedger,
  type LoanDirectoryPrivateState,
  type LoanLedger,
  type FactsOpening,
  type LoanPrivateState,
} from './contracts';
import type { Lender } from './client';
import type {
  AuditDisclosure,
  AuditVerdict,
  ListingStatusName,
  LoanDesk,
  LoanStatusName,
  LoanTerms,
  LoanView,
  Payment,
  QuoteRequest,
  RepaidRecord,
  TierName,
} from './loans';
import type { SimulatedKymiderClient } from './simulatedClient';

const COIN_PUBLIC_KEY = '0'.repeat(64);
const DAY = 86_400n;
const HOUR = 3_600n;

// Compact declaration order: OFFERED was appended after DECLINED.
const STATUS_NAMES: readonly LoanStatusName[] = ['APPLIED', 'ACTIVE', 'REPAID', 'DEFAULTED', 'DECLINED', 'OFFERED'];
const TIER_NAMES: readonly TierName[] = ['NONE', 'VERIFIED', 'STANDARD'];
const LISTING_NAMES: readonly ListingStatusName[] = ['OPEN', 'ACTIVE', 'REPAID', 'DEFAULTED', 'CLOSED'];
/** The contract's own cap on quotes per loan (an exported pure circuit). */
const QUOTE_LIMIT = Number(loanPureCircuits.quoteLimit());

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const hex0x = (b: Uint8Array): string => '0x' + hex(b);
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => hex(a) === hex(b);

const randomSeed = (): Uint8Array => crypto.getRandomValues(new Uint8Array(32));

/**
 * A contract refusal, as a screen should show it: the assert text alone, with
 * the runtime's error (full text, "failed assert: ..." prefix included) kept
 * as the cause.
 */
const refusal = (e: unknown): Error => {
  const full = e instanceof Error ? e.message : String(e);
  const m = /failed assert:\s*([\s\S]*)$/.exec(full);
  return new Error(m ? m[1] : full, { cause: e });
};

/**
 * A ledger view that reads each field at most once.
 *
 * The generated `ledger()` getters each run a VM query against the state
 * (about a millisecond apiece), and a screen reads a dozen fields per loan per
 * render. A state never changes once read, so caching per field is safe.
 */
const memo = <T extends object>(ledger: T): T => {
  const cache = new Map<PropertyKey, unknown>();
  return new Proxy(ledger, {
    get(target, key) {
      if (!cache.has(key)) cache.set(key, Reflect.get(target, key));
      return cache.get(key);
    },
  });
};

/** Run a contract call, turning any refusal into a clean Error. */
const attempt = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    throw refusal(e);
  }
};

/** One deployed Loan instance and what its parties' machines hold for it. */
type DeskLoan = {
  /** Contract address, hex without 0x. */
  address: string;
  /** The 32 bytes the directory keys the listing on. */
  bytes: Uint8Array;
  contract: LoanContract<LoanPrivateState>;
  ctx: CircuitContext<LoanPrivateState>;
  borrowerSk: Uint8Array;
  /** The borrower's SolvencyProof instance the facts commitment came from. */
  solvencyInstance: string;
  /**
   * The borrower's private facts and salt, read at proof time. The loan's own
   * private state keeps the salt its commitment was bound with at deploy; if
   * the borrower has re-committed since, the two differ and the contract
   * refuses the proof, as it would on-chain.
   */
  opening: () => FactsOpening;
  /** The borrower's private payment log. */
  payments: Payment[];
  /** Block time the loan was applied for; orders the lists. */
  openedAt: bigint;
  seq: number;
  /** The ledger as last read, and the context it was read from. */
  cache?: { ctx: CircuitContext<LoanPrivateState>; ledger: LoanLedger };
};

/** What screens need from the directory, read once per directory state. */
type DirectorySnapshot = {
  listings: Map<string, Listing>;
  recorded: Set<string>;
  proofs: Map<string, bigint>;
};

/** The shared LoanDirectory instance. */
class Directory {
  private readonly contract: LoanDirectoryContract<LoanDirectoryPrivateState>;
  private ctx: CircuitContext<LoanDirectoryPrivateState>;
  private cache?: { ctx: CircuitContext<LoanDirectoryPrivateState>; snapshot: DirectorySnapshot };

  constructor() {
    this.contract = new LoanDirectoryContract<LoanDirectoryPrivateState>(loanDirectoryWitnesses);
    const { currentContractState, currentPrivateState } = this.contract.initialState(
      createConstructorContext(createLoanDirectoryPrivateState(new Uint8Array(32)), COIN_PUBLIC_KEY),
    );
    this.ctx = createCircuitContext(
      sampleContractAddress(),
      COIN_PUBLIC_KEY,
      currentContractState,
      currentPrivateState,
    );
  }

  ledger(): LoanDirectoryLedger {
    return loanDirectoryLedger(this.ctx.currentQueryContext.state);
  }

  /** Listings, recorded loans and history proofs, keyed by address hex. */
  snapshot(): DirectorySnapshot {
    if (this.cache?.ctx === this.ctx) return this.cache.snapshot;
    const led = this.ledger();
    const snapshot: DirectorySnapshot = {
      listings: new Map([...led.listings].map(([k, v]) => [hex(k), v])),
      recorded: new Set([...led.recordedLoans].map(hex)),
      proofs: new Map([...led.historyProofs].map(([k, v]) => [hex(k), v])),
    };
    this.cache = { ctx: this.ctx, snapshot };
    return snapshot;
  }

  /** Make one call as the wallet holding `sk` at block time `now`. */
  call(
    sk: Uint8Array,
    now: bigint,
    fn: (
      circuits: LoanDirectoryContract<LoanDirectoryPrivateState>['impureCircuits'],
      ctx: CircuitContext<LoanDirectoryPrivateState>,
    ) => { context: CircuitContext<LoanDirectoryPrivateState> },
  ): void {
    const ctx = { ...this.ctx, currentPrivateState: { ...this.ctx.currentPrivateState, sk } };
    const q = ctx.currentQueryContext;
    q.block = { ...q.block, secondsSinceEpoch: now };
    this.ctx = attempt(() => fn(this.contract.impureCircuits, ctx)).context;
  }
}

export class SimulatedLoanDesk implements LoanDesk {
  private readonly client: SimulatedKymiderClient;
  private readonly directory = new Directory();
  private readonly loans = new Map<string, DeskLoan>();
  private readonly listeners = new Set<() => void>();
  private clock: bigint;
  private seq = 0;

  constructor(client: SimulatedKymiderClient) {
    this.client = client;
    const start = BigInt(Math.floor(Date.now() / 1000));
    this.clock = start;
    this.seed(start);
    // Seeding ran each loan's history at its own past block times; the demo
    // opens at the wall clock.
    this.clock = start;
    // The lender console acts as `client.me()`; when the lender rail picks
    // another persona, every lender list and action follows, so re-render.
    client.subscribe(() => this.changed());
  }

  // --- clock --------------------------------------------------------------

  now(): bigint {
    return this.clock;
  }

  advanceTime(seconds: bigint): void {
    if (seconds < 0n) throw new Error('block time only moves forward');
    this.clock += seconds;
    this.changed();
  }

  // --- change notification ------------------------------------------------

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  // --- identity -----------------------------------------------------------

  private myPk(): Uint8Array {
    return loanPureCircuits.getDappPubKey(this.client.borrowerSecretKey());
  }

  /** The lender persona the lender console acts as. */
  private meLender(): { lender: Lender; sk: Uint8Array; pk: Uint8Array } {
    return this.lenderById(this.client.me().id);
  }

  private lenderById(id: string): { lender: Lender; sk: Uint8Array; pk: Uint8Array } {
    const lender = this.client.lenders().find((l) => l.id === id);
    const sk = this.client.lenderSecretKey(id);
    const pk = this.client.lenderPublicKey(id);
    if (!lender || !sk || !pk) throw new Error(`no such lender: ${id}`);
    return { lender, sk, pk };
  }

  private lenderByPk(pk: Uint8Array): Lender {
    const want = hex0x(pk);
    return (
      this.client.lenders().find((l) => l.pubKey === want) ?? {
        id: 'unknown',
        name: 'Unknown lender',
        initials: '??',
        kind: 'On-chain protocol',
        pubKey: want,
      }
    );
  }

  // --- low-level contract driving ------------------------------------------

  private get(address: string): DeskLoan {
    const loan = this.loans.get(address);
    if (!loan) throw new Error(`no such loan: ${address}`);
    return loan;
  }

  private ledgerOf(loan: DeskLoan): LoanLedger {
    if (loan.cache?.ctx !== loan.ctx) {
      loan.cache = { ctx: loan.ctx, ledger: memo(loanLedger(loan.ctx.currentQueryContext.state)) };
    }
    return loan.cache.ledger;
  }

  /** One Loan circuit call, as the wallet holding `sk`, at the desk's block time. */
  private run(
    loan: DeskLoan,
    sk: Uint8Array,
    fn: (
      circuits: LoanContract<LoanPrivateState>['impureCircuits'],
      ctx: CircuitContext<LoanPrivateState>,
    ) => { context: CircuitContext<LoanPrivateState> },
  ): void {
    const ctx = { ...loan.ctx, currentPrivateState: { ...loan.ctx.currentPrivateState, sk } };
    // Only the block time is written in place; it is rewritten before every
    // call, so a refused call leaves nothing behind.
    const q = ctx.currentQueryContext;
    q.block = { ...q.block, secondsSinceEpoch: this.clock };
    // The context is replaced only when the call succeeds: a refusal throws
    // before the assignment and the loan's state is exactly as it was.
    loan.ctx = attempt(() => fn(loan.contract.impureCircuits, ctx)).context;
  }

  private deploy(
    borrowerSk: Uint8Array,
    solvencyInstance: string,
    opening: () => FactsOpening,
    lenderPk: Uint8Array,
    terms: LoanTerms,
  ): DeskLoan {
    const commitment = this.client.instanceCommitment(solvencyInstance);
    if (!commitment) throw new Error(`no such SolvencyProof instance: ${solvencyInstance}`);
    const contract = new LoanContract<LoanPrivateState>(loanWitnesses);
    const { currentContractState, currentPrivateState } = attempt(() =>
      contract.initialState(
        createConstructorContext(
          createLoanPrivateState(borrowerSk, randomSeed(), opening().salt),
          COIN_PUBLIC_KEY,
        ),
        lenderPk,
        { ...terms },
        commitment,
      ),
    );
    const address = sampleContractAddress();
    const bytes = encodeContractAddress(address);
    // Listed by the borrower, as the console would right after the deploy lands.
    this.directory.call(borrowerSk, this.clock, (c, ctx) => c.list(ctx, bytes, lenderPk, terms.principal));
    const loan: DeskLoan = {
      address,
      bytes,
      contract,
      ctx: createCircuitContext(address, COIN_PUBLIC_KEY, currentContractState, currentPrivateState),
      borrowerSk,
      solvencyInstance,
      opening,
      payments: [],
      openedAt: this.clock,
      seq: this.seq++,
    };
    this.loans.set(address, loan);
    return loan;
  }

  private doQuote(loan: DeskLoan, lenderSk: Uint8Array, q: QuoteRequest): void {
    const expiresAt = this.clock + q.ttlSeconds;
    this.run(loan, lenderSk, (c, ctx) => c.quoteTerms(ctx, q.thresholdNetWorth, q.maxDti, expiresAt));
  }

  private doProveTier(loan: DeskLoan): TierName {
    // The facts go in as arguments; the salt is read by the `factsSalt`
    // witness from the loan's private state.
    const f = loan.opening();
    this.run(loan, loan.borrowerSk, (c, ctx) => c.proveTier(ctx, f.balance, f.debts, f.income));
    return TIER_NAMES[this.ledgerOf(loan).tier];
  }

  private doUnderwrite(loan: DeskLoan, lenderSk: Uint8Array): { tier: TierName; collateral: bigint } {
    const led = this.ledgerOf(loan);
    // The circuit's own test: a VERIFIED tier counts only while block time is
    // before its expiry. Anything else is offered at 150%.
    const verified = tierIsLive(led, this.clock);
    const collateral = collateralFor(led.terms.principal, verified ? Tier.VERIFIED : Tier.STANDARD);
    return { tier: this.doUnderwriteAt(loan, lenderSk, collateral), collateral };
  }

  /**
   * Offer at a figure the caller chose; the circuit decides if it is the right
   * one. The loan is OFFERED: the listing stays OPEN until the lender disburses.
   */
  private doUnderwriteAt(loan: DeskLoan, lenderSk: Uint8Array, collateral: bigint): TierName {
    this.run(loan, lenderSk, (c, ctx) => c.underwrite(ctx, collateral));
    return TIER_NAMES[this.ledgerOf(loan).offeredTier];
  }

  /** The loan's borrower makes the offer binding. */
  private doAccept(loan: DeskLoan): { tier: TierName; collateral: bigint } {
    this.run(loan, loan.borrowerSk, (c, ctx) => c.accept(ctx));
    const led = this.ledgerOf(loan);
    return { tier: TIER_NAMES[led.tier], collateral: led.collateralRequired };
  }

  private doDeclineOffer(loan: DeskLoan): void {
    this.run(loan, loan.borrowerSk, (c, ctx) => c.declineOffer(ctx));
  }

  /**
   * Start the clock, and mark the listing ACTIVE: the directory lets only the
   * listing's lender make that move, and only from OPEN. A repayment can be
   * recorded later only from ACTIVE.
   */
  private doDisburse(loan: DeskLoan, lenderSk: Uint8Array): void {
    const terms = this.ledgerOf(loan).terms;
    const owed = owedFor(terms);
    const installment = installmentFor(owed, terms.installments);
    const start = this.clock;
    this.run(loan, lenderSk, (c, ctx) => c.disburse(ctx, start, owed, installment));
    this.directory.call(lenderSk, this.clock, (c, ctx) => c.updateStatus(ctx, loan.bytes, ListingStatus.ACTIVE));
  }

  private doRepay(loan: DeskLoan): bigint {
    const before = this.ledgerOf(loan);
    const amount = amountDue(before);
    const lateBefore = before.latePayments;
    this.run(loan, loan.borrowerSk, (c, ctx) => c.repay(ctx, amount));
    // Lateness is the circuit's verdict (block time against the due date);
    // read it back rather than recompute it.
    loan.payments.push({
      index: loan.payments.length + 1,
      amount,
      onTime: this.ledgerOf(loan).latePayments === lateBefore,
      at: this.clock,
    });
    return amount;
  }

  private doMarkDefault(loan: DeskLoan, lenderSk: Uint8Array): void {
    this.run(loan, lenderSk, (c, ctx) => c.markDefault(ctx));
    this.directory.call(lenderSk, this.clock, (c, ctx) =>
      c.updateStatus(ctx, loan.bytes, ListingStatus.DEFAULTED),
    );
  }

  private doDecline(loan: DeskLoan, lenderSk: Uint8Array): void {
    this.run(loan, lenderSk, (c, ctx) => c.decline(ctx));
    this.directory.call(lenderSk, this.clock, (c, ctx) => c.updateStatus(ctx, loan.bytes, ListingStatus.CLOSED));
  }

  private doRecordRepaid(loan: DeskLoan, lenderSk: Uint8Array): void {
    this.directory.call(lenderSk, this.clock, (c, ctx) => c.recordRepaid(ctx, loan.bytes));
  }

  // --- the demo world -------------------------------------------------------

  /**
   * Run the seeded loans through the real circuits at past block times, so the
   * screens open on a world with history: the borrower has two loans repaid to
   * two lenders (one paid late once), and the lender persona has applications
   * and a portfolio in every state.
   */
  private seed(end: bigint): void {
    const at = (offset: bigint): void => {
      this.clock = end + offset;
    };
    const me = this.meLender();
    const myAddress = this.client.myAddress();
    const myFacts = () => this.client.factsOpening();
    const borrowerSk = this.client.borrowerSecretKey();

    // --- the borrower's history: two loans, two lenders, both repaid -------
    const harbor = this.lenderById('harbor');
    const atlas = this.lenderById('atlas');

    at(-120n * DAY);
    const a = this.deploy(borrowerSk, myAddress, myFacts, harbor.pk, {
      principal: 250_000n,
      interestBps: 800n,
      installments: 3n,
      periodSeconds: 30n * DAY,
    });
    at(-119n * DAY);
    this.doQuote(a, harbor.sk, { thresholdNetWorth: 500_000n, maxDti: 40n, ttlSeconds: 7n * DAY });
    this.doProveTier(a);
    at(-118n * DAY);
    this.doUnderwrite(a, harbor.sk);
    this.doAccept(a);
    this.doDisburse(a, harbor.sk); // due -88, -58, -28 days
    for (const d of [-90n, -59n, -30n]) {
      at(d * DAY);
      this.doRepay(a);
    }
    at(-29n * DAY);
    this.doRecordRepaid(a, harbor.sk);

    at(-80n * DAY);
    const b = this.deploy(borrowerSk, myAddress, myFacts, atlas.pk, {
      principal: 400_000n,
      interestBps: 1_200n,
      installments: 4n,
      periodSeconds: 14n * DAY,
    });
    at(-79n * DAY);
    this.doQuote(b, atlas.sk, { thresholdNetWorth: 600_000n, maxDti: 35n, ttlSeconds: 5n * DAY });
    this.doProveTier(b);
    at(-78n * DAY);
    this.doUnderwrite(b, atlas.sk);
    this.doAccept(b);
    this.doDisburse(b, atlas.sk); // due -64, -50, -36, -22 days
    // The second payment lands two days after its due date: late, on the record.
    for (const d of [-65n, -48n, -37n, -23n]) {
      at(d * DAY);
      this.doRepay(b);
    }
    at(-21n * DAY);
    this.doRecordRepaid(b, atlas.sk);

    // --- other borrowers' loans to the lender persona ----------------------
    const others = this.client.otherBorrowers();
    const other = (i: number) => {
      const o = others[i % others.length];
      return { sk: o.sk, address: o.address, facts: () => o.opening };
    };

    // REPAID at 150%: never proved a tier. Not yet recorded in the directory,
    // so the lender console has that action waiting.
    {
      const o = other(3);
      at(-75n * DAY);
      const l = this.deploy(o.sk, o.address, o.facts, me.pk, {
        principal: 300_000n,
        interestBps: 600n,
        installments: 2n,
        periodSeconds: 30n * DAY,
      });
      at(-74n * DAY);
      this.doQuote(l, me.sk, { thresholdNetWorth: 400_000n, maxDti: 40n, ttlSeconds: 7n * DAY });
      at(-73n * DAY);
      this.doUnderwrite(l, me.sk);
      this.doAccept(l); // chose 150% over proving
      this.doDisburse(l, me.sk); // due -43, -13 days
      for (const d of [-44n, -14n]) {
        at(d * DAY);
        this.doRepay(l);
      }
    }

    // DEFAULTED: proved, but the facts fall short (STANDARD, 150%); one
    // installment paid, the next missed, called after the 3-day grace.
    {
      const o = other(2);
      at(-60n * DAY);
      const l = this.deploy(o.sk, o.address, o.facts, me.pk, {
        principal: 80_000n,
        interestBps: 1_500n,
        installments: 4n,
        periodSeconds: 14n * DAY,
      });
      at(-59n * DAY);
      this.doQuote(l, me.sk, { thresholdNetWorth: 250_000n, maxDti: 45n, ttlSeconds: 7n * DAY });
      this.doProveTier(l);
      at(-58n * DAY);
      this.doUnderwrite(l, me.sk);
      this.doAccept(l);
      this.doDisburse(l, me.sk); // due -44, -30 days
      at(-45n * DAY);
      this.doRepay(l);
      at(-25n * DAY);
      this.doMarkDefault(l, me.sk);
    }

    // ACTIVE at 110%, two of six installments paid, the next due in 4 days.
    {
      const o = other(1);
      at(-40n * DAY);
      const l = this.deploy(o.sk, o.address, o.facts, me.pk, {
        principal: 1_200_000n,
        interestBps: 900n,
        installments: 6n,
        periodSeconds: 14n * DAY,
      });
      at(-39n * DAY);
      this.doQuote(l, me.sk, { thresholdNetWorth: 1_000_000n, maxDti: 50n, ttlSeconds: 7n * DAY });
      this.doProveTier(l);
      at(-38n * DAY);
      this.doUnderwrite(l, me.sk);
      this.doAccept(l);
      this.doDisburse(l, me.sk); // due -24, -10, +4 days
      for (const d of [-25n, -11n]) {
        at(d * DAY);
        this.doRepay(l);
      }
    }

    // OFFERED at 110% yesterday: proven VERIFIED, the lender made the offer,
    // and it waits on the borrower's acceptance before anything binds.
    {
      const o = other(1);
      at(-6n * DAY);
      const l = this.deploy(o.sk, o.address, o.facts, me.pk, {
        principal: 750_000n,
        interestBps: 700n,
        installments: 4n,
        periodSeconds: 30n * DAY,
      });
      at(-5n * DAY);
      this.doQuote(l, me.sk, { thresholdNetWorth: 500_000n, maxDti: 50n, ttlSeconds: 14n * DAY });
      this.doProveTier(l);
      at(-1n * DAY);
      this.doUnderwrite(l, me.sk);
    }

    // APPLIED, quoted and proven VERIFIED: ready to offer at 110%.
    {
      const o = other(4);
      at(-3n * DAY);
      const l = this.deploy(o.sk, o.address, o.facts, me.pk, {
        principal: 500_000n,
        interestBps: 1_000n,
        installments: 5n,
        periodSeconds: 30n * DAY,
      });
      at(-2n * DAY);
      this.doQuote(l, me.sk, { thresholdNetWorth: 250_000n, maxDti: 45n, ttlSeconds: 7n * DAY });
      at(-1n * DAY);
      this.doProveTier(l);
    }

    // APPLIED two hours ago, awaiting a quote.
    {
      const o = other(0);
      at(-2n * HOUR);
      this.deploy(o.sk, o.address, o.facts, me.pk, {
        principal: 150_000n,
        interestBps: 1_100n,
        installments: 3n,
        periodSeconds: 30n * DAY,
      });
    }
  }

  // --- projections ----------------------------------------------------------

  private view(loan: DeskLoan): LoanView {
    const led = this.ledgerOf(loan);
    const dir = this.directory.snapshot();
    const key = hex(loan.bytes);
    const listing = dir.listings.get(key);
    const now = this.clock;
    const status = STATUS_NAMES[led.status];
    const open = status === 'ACTIVE' && led.disbursed;
    const commitment = this.client.instanceCommitment(loan.solvencyInstance);
    const terms: LoanTerms = {
      principal: led.terms.principal,
      interestBps: led.terms.interestBps,
      installments: led.terms.installments,
      periodSeconds: led.terms.periodSeconds,
    };
    return {
      address: loan.address,
      borrower: hex0x(led.borrower),
      lender: this.lenderByPk(led.lender),
      terms,
      status,
      quote: led.quoted
        ? { thresholdNetWorth: led.quote.thresholdNetWorth, maxDti: led.quote.maxDti, expiresAt: led.quote.expiresAt }
        : null,
      quotesIssued: Number(led.quotesIssued),
      quoteLimit: QUOTE_LIMIT,
      tierProven: led.tierProven,
      tier: TIER_NAMES[led.tier],
      tierExpiresAt: led.tierExpiresAt,
      tierLive: tierIsLive(led, now),
      collateralRequired: led.collateralRequired,
      offeredCollateral: led.offeredCollateral,
      offeredTier: TIER_NAMES[led.offeredTier],
      collateralIfVerified: collateralFor(terms.principal, Tier.VERIFIED),
      collateralIfStandard: collateralFor(terms.principal, Tier.STANDARD),
      disbursed: led.disbursed,
      balanceOwed: led.balanceOwed,
      installmentAmount: led.installmentAmount,
      amountDue: open ? amountDue(led) : 0n,
      nextDueAt: led.nextDueAt,
      paymentsMade: led.paymentsMade,
      latePayments: led.latePayments,
      historyCommitment: hex0x(led.historyCommitment),
      factsBound: commitment !== null && sameBytes(commitment, led.factsCommitment),
      historyProofCount: Number(dir.proofs.get(key) ?? 0n),
      listing: listing ? LISTING_NAMES[listing.status] : null,
      recorded: dir.recorded.has(key),
      defaultableFrom: open ? defaultableFrom(led) : null,
    };
  }

  /** Newest first: by application time, then by deploy order. */
  private sorted(filter: (led: LoanLedger) => boolean): LoanView[] {
    return [...this.loans.values()]
      .filter((l) => filter(this.ledgerOf(l)))
      .sort((x, y) => (x.openedAt === y.openedAt ? y.seq - x.seq : x.openedAt < y.openedAt ? 1 : -1))
      .map((l) => this.view(l));
  }

  private isMine(loan: DeskLoan): boolean {
    return sameBytes(this.ledgerOf(loan).borrower, this.myPk());
  }

  // --- borrower ---------------------------------------------------------------

  myLoans(): LoanView[] {
    const me = this.myPk();
    return this.sorted((led) => sameBytes(led.borrower, me));
  }

  async apply(lenderId: string, terms: LoanTerms): Promise<string> {
    const { pk } = this.lenderById(lenderId);
    const loan = this.deploy(
      this.client.borrowerSecretKey(),
      this.client.myAddress(),
      () => this.client.factsOpening(),
      pk,
      terms,
    );
    this.changed();
    return loan.address;
  }

  async proveTier(address: string): Promise<TierName> {
    const loan = this.get(address);
    // Acting as this browser's borrower: on someone else's loan the contract
    // refuses ("only the borrower may prove a tier").
    const tier = this.asMyBorrower(loan, () => this.doProveTier(loan));
    this.changed();
    return tier;
  }

  async accept(address: string): Promise<{ tier: TierName; collateral: bigint }> {
    const loan = this.get(address);
    // Under this browser's key: on someone else's loan the contract refuses
    // ("only the borrower may accept an offer").
    const result = this.asMyBorrower(loan, () => this.doAccept(loan));
    this.changed();
    return result;
  }

  async declineOffer(address: string): Promise<void> {
    const loan = this.get(address);
    this.asMyBorrower(loan, () => this.doDeclineOffer(loan));
    this.changed();
  }

  async repay(address: string): Promise<bigint> {
    const loan = this.get(address);
    const paid = this.asMyBorrower(loan, () => this.doRepay(loan));
    this.changed();
    return paid;
  }

  /**
   * Borrower calls go out under this browser's key. For the desk's own
   * borrower that is the loan's borrower key; for anyone else's loan, the
   * contract sees a stranger and refuses.
   */
  private asMyBorrower<T>(loan: DeskLoan, fn: () => T): T {
    if (this.isMine(loan)) return fn();
    const real = loan.borrowerSk;
    loan.borrowerSk = this.client.borrowerSecretKey();
    try {
      return fn();
    } finally {
      loan.borrowerSk = real;
    }
  }

  paymentLog(address: string): Payment[] {
    const loan = this.loans.get(address);
    // Private to the borrower's machine: nobody else's log is on this one.
    if (!loan || !this.isMine(loan)) return [];
    return loan.payments.map((p) => ({ ...p }));
  }

  repaidRecords(): RepaidRecord[] {
    const dir = this.directory.snapshot();
    const me = this.myPk();
    const records: RepaidRecord[] = [];
    for (const loan of [...this.loans.values()].sort((x, y) => y.seq - x.seq)) {
      const key = hex(loan.bytes);
      const listing = dir.listings.get(key);
      if (!listing || !dir.recorded.has(key) || !sameBytes(listing.borrower, me)) continue;
      records.push({ loan: loan.address, lender: this.lenderByPk(listing.lender), principal: listing.principal });
    }
    return records;
  }

  async proveHistory(forLoan: string, a: string, b: string): Promise<void> {
    const target = this.get(forLoan);
    const me = this.myPk();
    const record = (address: string): { loan: Uint8Array; lender: Uint8Array; path: MerkleTreePath<Uint8Array> } => {
      const loan = this.get(address);
      const lender = this.ledgerOf(loan).lender;
      const leaf = loanDirectoryPureCircuits.repaidLeaf(me, loan.bytes, lender);
      const tree = this.directory.ledger().repaid;
      // A loan never recorded has no path. Hand the contract a well-formed one
      // anyway, so the refusal is its own ("... is not in the directory").
      const path = tree.findPathForLeaf(leaf) ?? tree.pathForLeaf(0n, leaf);
      return { loan: loan.bytes, lender, path };
    };
    const ra = record(a);
    const rb = record(b);
    this.directory.call(this.client.borrowerSecretKey(), this.clock, (c, ctx) =>
      c.proveTwoRepaid(ctx, target.bytes, ra.loan, ra.lender, ra.path, rb.loan, rb.lender, rb.path),
    );
    this.changed();
  }

  disclose(address: string): AuditDisclosure {
    const loan = this.get(address);
    if (!this.isMine(loan)) throw new Error("only the borrower can open a loan's payment history");
    const seed = loan.ctx.currentPrivateState.historySeed;
    const d = audit.buildDisclosure(
      loan.address,
      seed,
      loan.payments.map((p) => ({ amount: p.amount, onTime: p.onTime })),
    );
    return { version: 1, loan: d.loan, payments: d.payments.map((p) => ({ ...p })) };
  }

  // --- lender -----------------------------------------------------------------

  applications(): LoanView[] {
    const { pk } = this.meLender();
    return this.sorted((led) => sameBytes(led.lender, pk));
  }

  loan(address: string): LoanView | null {
    const loan = this.loans.get(address);
    return loan ? this.view(loan) : null;
  }

  async quote(address: string, quote: QuoteRequest): Promise<void> {
    this.doQuote(this.get(address), this.meLender().sk, quote);
    this.changed();
  }

  async underwrite(address: string): Promise<{ tier: TierName; collateral: bigint }> {
    const result = this.doUnderwrite(this.get(address), this.meLender().sk);
    this.changed();
    return result;
  }

  async underwriteAt(address: string, collateral: bigint): Promise<void> {
    this.doUnderwriteAt(this.get(address), this.meLender().sk, collateral);
    this.changed();
  }

  async decline(address: string): Promise<void> {
    this.doDecline(this.get(address), this.meLender().sk);
    this.changed();
  }

  async disburse(address: string): Promise<void> {
    this.doDisburse(this.get(address), this.meLender().sk);
    this.changed();
  }

  async markDefault(address: string): Promise<void> {
    this.doMarkDefault(this.get(address), this.meLender().sk);
    this.changed();
  }

  async recordRepaid(address: string): Promise<void> {
    this.doRecordRepaid(this.get(address), this.meLender().sk);
    this.changed();
  }

  // --- auditor ----------------------------------------------------------------

  verifyDisclosure(disclosure: AuditDisclosure): AuditVerdict {
    const loan = this.loans.get(disclosure.loan);
    if (!loan) return { ok: false, reason: 'no such loan on this network' };
    const led = this.ledgerOf(loan);
    return audit.verifyDisclosure(disclosure, {
      historyCommitment: led.historyCommitment,
      paymentsMade: led.paymentsMade,
      latePayments: led.latePayments,
    });
  }
}
