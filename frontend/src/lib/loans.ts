/**
 * The loan desk the Wave 2 screens talk to.
 *
 * Like `KymiderClient`, screens depend on this interface and nothing below
 * it. `SimulatedLoanDesk` satisfies it by driving the REAL compiled `Loan` and
 * `LoanDirectory` contracts in the browser, so every refusal a screen shows is
 * the contract's own assert message, word for word.
 *
 * Amounts are whole currency units (bigint), as the Wave 1 screens show them.
 * Times are block time in seconds since the
 * Unix epoch; the simulated desk owns its block clock (`now`, `advanceTime`)
 * so a demo can step past a due date or a grace period on purpose.
 */

import type { Lender } from './client';

/**
 * OFFERED: the lender has offered the tier's collateral; nothing binds until
 * the borrower accepts (ACTIVE) or declines (back to APPLIED).
 */
export type LoanStatusName = 'APPLIED' | 'OFFERED' | 'ACTIVE' | 'REPAID' | 'DEFAULTED' | 'DECLINED';
export type TierName = 'NONE' | 'VERIFIED' | 'STANDARD';
export type ListingStatusName = 'OPEN' | 'ACTIVE' | 'REPAID' | 'DEFAULTED' | 'CLOSED';

export type LoanTerms = {
  principal: bigint;
  /** Flat interest over the whole loan, basis points (1000 = 10%). */
  interestBps: bigint;
  installments: bigint;
  periodSeconds: bigint;
};

export type LoanQuote = {
  thresholdNetWorth: bigint;
  /** Percent, as in SolvencyProof. */
  maxDti: bigint;
  expiresAt: bigint;
};

/** A lender's quote before it is stamped with an expiry. */
export type QuoteRequest = {
  thresholdNetWorth: bigint;
  maxDti: bigint;
  ttlSeconds: bigint;
};

/**
 * One repayment, as the BORROWER's machine remembers it. Private: the ledger
 * holds only the running `historyCommitment`, counts and the balance.
 */
export type Payment = {
  index: number;
  amount: bigint;
  onTime: boolean;
  at: bigint;
};

/** Everything a screen needs about one Loan instance. */
export type LoanView = {
  /** Contract address, hex without 0x. */
  address: string;
  /** Hex of the borrower's dapp public key. */
  borrower: string;
  lender: Lender;
  terms: LoanTerms;
  status: LoanStatusName;
  /** Null until the lender quotes. */
  quote: LoanQuote | null;
  /**
   * Quotes made on this loan so far, and the most the contract allows. Each
   * quote buys the lender one yes/no answer about the private facts, so the
   * contract caps them ("quote limit reached").
   */
  quotesIssued: number;
  quoteLimit: number;
  /**
   * A tier was proven against the current quote. One proof per quote: another
   * answer needs a new quote ("already proven against this quote").
   */
  tierProven: boolean;
  tier: TierName;
  tierExpiresAt: bigint;
  /** True while a VERIFIED tier is live at `now`. */
  tierLive: boolean;
  /** Binding collateral: zero until the borrower accepts an offer. */
  collateralRequired: bigint;
  /**
   * The lender's standing offer while status is OFFERED: the collateral and the
   * tier it was priced at. Zero and NONE otherwise (a declined offer is cleared).
   */
  offeredCollateral: bigint;
  offeredTier: TierName;
  /** The pitch, for this principal: what each tier would cost the borrower. */
  collateralIfVerified: bigint;
  collateralIfStandard: bigint;
  disbursed: boolean;
  balanceOwed: bigint;
  installmentAmount: bigint;
  /** What the next repayment must be (installment, or the remainder). */
  amountDue: bigint;
  nextDueAt: bigint;
  paymentsMade: bigint;
  latePayments: bigint;
  /** Hex of the on-chain payment-history chain head. */
  historyCommitment: string;
  /** The facts commitment matches the borrower's SolvencyProof instance. */
  factsBound: boolean;
  /** Prior repaid loans proven for this application in the directory (0 or 2). */
  historyProofCount: number;
  /** The directory's listing status, or null if not listed. */
  listing: ListingStatusName | null;
  /** Repayment recorded in the directory (lender-only action, once). */
  recorded: boolean;
  /** First second a default may be called, or null when not disbursed/active. */
  defaultableFrom: bigint | null;
};

/** A repaid loan recorded in the directory under this borrower. */
export type RepaidRecord = {
  loan: string;
  lender: Lender;
  principal: bigint;
};

/**
 * What a borrower hands an auditor: the openings of one loan's payment
 * history. See contracts/audit.ts for how it is built and verified.
 */
export type AuditDisclosure = {
  version: 1;
  loan: string;
  payments: { amount: string; onTime: boolean; nonce: string }[];
};

export type AuditVerdict =
  | { ok: true; payments: number; late: number; total: bigint }
  | { ok: false; reason: string };

export interface LoanDesk {
  /** The simulated chain clock, seconds. */
  now(): bigint;
  /** Demo control: move block time forward. */
  advanceTime(seconds: bigint): void;

  // --- borrower -----------------------------------------------------------
  /** Loans this browser's borrower has opened, newest first. */
  myLoans(): LoanView[];
  /** Deploy a Loan bound to the borrower's SolvencyProof facts, and list it. */
  apply(lenderId: string, terms: LoanTerms): Promise<string>;
  /** Prove the committed facts against the quote; returns the recorded tier. */
  proveTier(address: string): Promise<TierName>;
  /** Make the lender's offer binding (OFFERED -> ACTIVE); returns what was accepted. */
  accept(address: string): Promise<{ tier: TierName; collateral: bigint }>;
  /** Turn the offer down (OFFERED -> APPLIED); the lender may offer again. */
  declineOffer(address: string): Promise<void>;
  /** Pay the amount due; returns what was paid. */
  repay(address: string): Promise<bigint>;
  /** This borrower's private record of payments on one loan. */
  paymentLog(address: string): Payment[];
  /** Repaid loans recorded in the directory under this borrower. */
  repaidRecords(): RepaidRecord[];
  /** Prove two repaid loans for an open application, without naming them. */
  proveHistory(forLoan: string, a: string, b: string): Promise<void>;
  /** Open one loan's payment history for an auditor (Wave 3 preview). */
  disclose(address: string): AuditDisclosure;

  // --- lender -------------------------------------------------------------
  /**
   * Loans naming the lender persona the console acts as (`KymiderClient.me()`,
   * Harbor Bank unless the lender rail picks another), newest first.
   */
  applications(): LoanView[];
  /** Any loan by address, whoever its parties are. */
  loan(address: string): LoanView | null;
  /**
   * Quote a bar. Refused by the contract while a VERIFIED tier is live ("a
   * verified tier is live until it lapses") and for a quote that holds less
   * than 30 minutes ("quote must hold at least 30 minutes").
   */
  quote(address: string, quote: QuoteRequest): Promise<void>;
  /**
   * Offer the loan at the tier's collateral (status OFFERED). Returns the
   * offer; it binds only once the borrower accepts.
   */
  underwrite(address: string): Promise<{ tier: TierName; collateral: bigint }>;
  /**
   * Offer at a collateral figure the lender chose. The adversarial demo:
   * the contract takes only the exact collateral for the borrower's tier,
   * so asking a VERIFIED borrower for 150% throws "collateral does not match
   * the tier".
   */
  underwriteAt(address: string, collateral: bigint): Promise<void>;
  decline(address: string): Promise<void>;
  disburse(address: string): Promise<void>;
  markDefault(address: string): Promise<void>;
  recordRepaid(address: string): Promise<void>;

  // --- auditor (Wave 3 preview) -------------------------------------------
  /** Check a disclosure against the loan's on-chain history commitment. */
  verifyDisclosure(disclosure: AuditDisclosure): AuditVerdict;

  /** Fires whenever ledger, private state or the clock changed. */
  subscribe(fn: () => void): () => void;
}

// --- formatting -----------------------------------------------------------

export const DAY = 86_400n;

export const percentOfBps = (bps: bigint): string =>
  `${(Number(bps) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

/** A block time as a UTC date and time. */
export const blockDate = (seconds: bigint): string =>
  new Date(Number(seconds) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

/** A duration in whole days, or hours under a day. */
export const duration = (seconds: bigint): string => {
  const s = seconds < 0n ? -seconds : seconds;
  return s >= DAY ? `${s / DAY} d` : `${s / 3_600n} h`;
};
