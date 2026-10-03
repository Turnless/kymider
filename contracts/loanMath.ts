// Kymider — Loan arithmetic, computed off-chain.
//
// Compact has no division, so the Loan circuit never divides: the caller
// passes each quotient in and the circuit checks it is exactly the floor (or
// ceiling) of the true value. These are the figures it will accept. Anything
// else is refused on-chain ("collateral does not match the tier", "owed does
// not match the terms", "installment does not match the terms").
//
// Browser-safe: imports only compact-runtime and the compiled Loan module, so
// the Node client (client/proof/loanMath.ts re-exports this) and the console
// share one copy of the arithmetic.

import {
  CompactTypeBytes,
  CompactTypeUnsignedInteger,
  CompactTypeVector,
  persistentHash,
} from '@midnight-ntwrk/compact-runtime';
import { Tier, type Ledger as LoanLedger, type LoanTerms } from '../compiled/loan/contract/index.js';

/** The facts a SolvencyProof instance commits to (same shape as the client's). */
export type CommittedFacts = { balance: bigint; debts: bigint; income: bigint };

export const VERIFIED_RATIO_BPS = 11_000n; // 110%
export const STANDARD_RATIO_BPS = 15_000n; // 150%
export const GRACE_SECONDS = 259_200n; // 3 days
export const MAX_PRINCIPAL = 1n << 40n;
/** The shortest life a quote may have (Loan.minQuoteSeconds): 30 minutes. */
export const MIN_QUOTE_SECONDS = 1_800n;

// floor(principal * ratioBps / 10000), the circuit's isFloorOfBps.
const floorOfBps = (principal: bigint, ratioBps: bigint): bigint => (principal * ratioBps) / 10_000n;

/** The collateral the circuit accepts for a tier: 110% if VERIFIED, else 150%. */
export const collateralFor = (principal: bigint, tier: Tier): bigint =>
  floorOfBps(principal, tier === Tier.VERIFIED ? VERIFIED_RATIO_BPS : STANDARD_RATIO_BPS);

/** Principal plus flat interest, floored. */
export const owedFor = (terms: LoanTerms): bigint =>
  floorOfBps(terms.principal, 10_000n + terms.interestBps);

/** Equal installments, rounded up; the last one takes the remainder. */
export const installmentFor = (owed: bigint, installments: bigint): bigint =>
  (owed + installments - 1n) / installments;

/** What the next repayment must be: the installment, or the remainder if smaller. */
export const amountDue = (state: Pick<LoanLedger, 'balanceOwed' | 'installmentAmount'>): bigint =>
  state.balanceOwed < state.installmentAmount ? state.balanceOwed : state.installmentAmount;

/** Whether the tier proven on a loan still holds at `now` (seconds). */
export const tierIsLive = (state: Pick<LoanLedger, 'tier' | 'tierExpiresAt'>, now: bigint): boolean =>
  state.tier === Tier.VERIFIED && now < state.tierExpiresAt;

/**
 * Whether the borrower's proof window is open at `now`: a quote is live and
 * the borrower has not answered it (no tier proof, no waiver). While it is,
 * the contract refuses both a 150% offer and a new quote.
 */
export const proofWindowOpen = (
  state: Pick<LoanLedger, 'quoted' | 'tierProven' | 'quote'>,
  now: bigint,
): boolean => state.quoted && !state.tierProven && now < state.quote.expiresAt;

/** The borrower answered the current quote by waiving the proof (Loan.waiveProof). */
export const proofWaived = (state: Pick<LoanLedger, 'quoted' | 'tierProven' | 'tier'>): boolean =>
  state.quoted && state.tierProven && state.tier === Tier.NONE;

/** The contract's words when the lender acts inside the borrower's proof window. */
export const PROOF_WINDOW_REFUSAL = 'the borrower can prove until the quote lapses';
/** The contract's words for an offer before any quote. */
export const QUOTE_FIRST_REFUSAL = 'quote first';

/**
 * Why a lender may not quote this loan now, in the contract's own words, or
 * null if quoteTerms would go through on these grounds (the cap is checked
 * separately). `expiresAt` is the quote's proposed expiry.
 */
export const quoteRefusal = (
  state: Pick<LoanLedger, 'tier' | 'tierExpiresAt' | 'quoted' | 'tierProven' | 'quote'>,
  expiresAt: bigint,
  now: bigint,
): string | null => {
  if (tierIsLive(state, now)) return 'a verified tier is live until it lapses';
  if (proofWindowOpen(state, now)) return PROOF_WINDOW_REFUSAL;
  if (expiresAt < now + MIN_QUOTE_SECONDS) return 'quote must hold at least 30 minutes';
  return null;
};

/**
 * Why a lender may not offer this loan now, in the contract's own words, or
 * null if underwrite at the tier's figure would go through (status and caller
 * are checked separately).
 */
export const underwriteRefusal = (
  state: Pick<LoanLedger, 'tier' | 'tierExpiresAt' | 'quoted' | 'tierProven' | 'quote'>,
  now: bigint,
): string | null => {
  if (!state.quoted) return QUOTE_FIRST_REFUSAL;
  if (!tierIsLive(state, now) && proofWindowOpen(state, now)) return PROOF_WINDOW_REFUSAL;
  return null;
};

/** The first second at which the lender may call a default. */
export const defaultableFrom = (state: Pick<LoanLedger, 'nextDueAt'>): bigint =>
  state.nextDueAt + GRACE_SECONDS + 1n;

const u64x3 = new CompactTypeVector(3, new CompactTypeUnsignedInteger((1n << 64n) - 1n, 8));
const bytes32x3 = new CompactTypeVector(3, new CompactTypeBytes(32));

// Compact's pad(32, s): the UTF-8 bytes of s, zero-filled to 32.
const pad32 = (s: string): Uint8Array => {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(s));
  return out;
};

/** Domain tag of the salted facts commitment (v1 was the bare, unsalted hash). */
export const FACTS_COMMITMENT_TAG = pad32('kymider:facts:v2');

/** The unsalted hash of the figures: the inner layer of the commitment, never published alone. */
export const hashFacts = (facts: CommittedFacts): Uint8Array =>
  persistentHash(u64x3, [facts.balance, facts.debts, facts.income]);

/**
 * SolvencyProof.commitFacts (and Loan.commitFacts), computed off-chain:
 * H(tag, H(balance, debts, income), salt). A Loan instance is deployed with the
 * commitment its borrower's SolvencyProof instance publishes; this gives the
 * same bytes from the facts and the 32-byte salt that blinds them.
 */
export const commitFacts = (facts: CommittedFacts, salt: Uint8Array): Uint8Array => {
  if (salt.length !== 32) throw new Error(`facts salt must be 32 bytes, got ${salt.length}`);
  return persistentHash(bytes32x3, [FACTS_COMMITMENT_TAG, hashFacts(facts), salt]);
};

/** The wall clock in seconds, as block time is measured. */
export const nowSeconds = (): bigint => BigInt(Math.floor(Date.now() / 1000));
