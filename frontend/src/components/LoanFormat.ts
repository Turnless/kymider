/**
 * Loan figures and wording shared by the borrower and lender loan screens.
 *
 * Pure helpers only (no components), so the file stays friendly to fast
 * refresh. Every figure here mirrors the arithmetic the Loan circuit accepts:
 * Compact cannot divide, so the circuit checks a floored quotient by
 * cross-multiplying, and these give that same floor.
 */

import { money, termsLabel } from '../lib/client';
import { DAY, duration, percentOfBps, type LoanQuote, type LoanTerms } from '../lib/loans';

export const VERIFIED_RATIO_BPS = 11_000n;
export const STANDARD_RATIO_BPS = 15_000n;
/** A missed installment may be called a default this long after it fell due. */
export const GRACE_SECONDS = 3n * DAY;

/** floor(principal * ratioBps / 10000), the circuit's `isFloorOfBps`. */
export const collateralAt = (principal: bigint, ratioBps: bigint): bigint =>
  (principal * ratioBps) / 10_000n;

/** The pitch for one principal: what each tier costs, and what proving keeps free. */
export const collateralSplit = (principal: bigint) => {
  const verified = collateralAt(principal, VERIFIED_RATIO_BPS);
  const standard = collateralAt(principal, STANDARD_RATIO_BPS);
  return { verified, standard, kept: standard - verified };
};

/** Principal plus flat interest, floored, as `disburse` checks it. */
export const owedOf = (terms: LoanTerms): bigint =>
  collateralAt(terms.principal, 10_000n + terms.interestBps);

/** "$10,000 · 8% · 3 × 30 d" */
export const loanTermsLabel = (t: LoanTerms): string =>
  `${money(t.principal)} · ${percentOfBps(t.interestBps)} · ${t.installments} × ${duration(t.periodSeconds)}`;

/** The lender's bar for the verified tier, in the same words as Wave 1 claims. */
export const quoteLabel = (q: LoanQuote): string =>
  termsLabel({ thresholdNetWorth: q.thresholdNetWorth, maxDti: q.maxDti });

/** "in 6 d" / "3 d ago", against block time. */
export const relative = (at: bigint, now: bigint): string =>
  at >= now ? `in ${duration(at - now)}` : `${duration(now - at)} ago`;

/** Whole-number input that regroups digits as you type (as on Private facts). */
export const groupDigits = (raw: string): string => {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits === '' ? '' : BigInt(digits).toLocaleString('en-US');
};

export const digitsToBigInt = (s: string): bigint => {
  const digits = s.replace(/[^0-9]/g, '');
  return digits === '' ? 0n : BigInt(digits);
};

/** "8.5" -> 850n basis points. Two decimals at most, as basis points allow. */
export const percentToBps = (s: string): bigint => {
  const m = s.trim().match(/^(\d*)(?:\.(\d{0,2})\d*)?$/);
  if (!m) return 0n;
  const whole = m[1] === '' ? 0n : BigInt(m[1]);
  const frac = BigInt((m[2] ?? '').padEnd(2, '0') || '0');
  return whole * 100n + frac;
};

/**
 * The contract's own words from a thrown error. The simulated desk surfaces
 * the Compact assert message; the runtime may prefix it, so strip the prefix
 * and keep the sentence the contract wrote.
 */
export const refusalOf = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : String(err);
  const text = raw
    .replace(/^(Error:\s*)+/i, '')
    .replace(/^failed assert:\s*/i, '')
    .trim();
  return text === '' ? 'no reason given' : text;
};

/**
 * Why a refusal is the contract doing its job, for the asserts a demo is most
 * likely to hit. Keyed by the assert message, word for word.
 */
const HINTS: Record<string, string> = {
  'collateral does not match the tier':
    'The circuit takes only the exact ratio for the tier on record (110% verified, 150% otherwise): the lender can only offer the tier\'s figure, and only the borrower can accept it.',
  'a verified tier is live until it lapses':
    'A proven VERIFIED tier stands until its quote expires. Quoting again would wipe it, so the contract refuses.',
  'quote must hold at least 30 minutes':
    'A quote that lapses in seconds would leave the borrower no time to prove or to use the tier.',
  'there is no offer to accept': 'The lender has not made an offer, or it was already answered.',
  'there is no offer to decline': 'The lender has not made an offer, or it was already answered.',
  'loan is not awaiting underwriting':
    'An offer is already standing, or the loan is past that stage. The borrower answers an offer before another can be made.',
  'quote has expired':
    'A tier proof only counts against a live quote. The lender has to quote again before you can prove.',
  'the lender has not quoted yet': 'There is no bar to prove against until the lender names one.',
  'facts do not match committed facts':
    'A proof must use the statement your solvency instance committed when you applied. Different figures cannot produce a tier.',
  'loan is no longer open to proofs':
    'The tier is fixed while an offer stands and once the loan is accepted or declined. Decline the offer to prove again.',
  'repay exactly the installment due':
    'Each repayment is the installment, or the remainder if smaller. Nothing else is accepted.',
  'loan is not active': 'This loan is not in a state that takes this action.',
  'nothing was disbursed': 'Repayments and defaults only start once the lender disburses.',
  'installment is not past its grace period':
    'A default can only be called once a missed installment is more than 3 days overdue.',
  'principal must be non-zero': 'Enter a principal above zero.',
  'principal exceeds supported range': 'The largest supported principal is 1,099,511,627,776.',
  'at least one installment': 'A loan needs at least one installment.',
  'period must be non-zero': 'The period between installments must be at least a day.',
  'interest above 100% is not supported': 'Flat interest over the loan is capped at 100%.',
  'borrower and lender must differ': 'You cannot lend to yourself.',
  'the two loans must differ': 'Pick two different repaid loans.',
  'a loan cannot vouch for itself': 'The application cannot count as its own repaid record.',
  'first record is not yours': 'Only records written under your key can be proven by you.',
  'second record is not yours': 'Only records written under your key can be proven by you.',
  'first record is not in the directory': 'That record is not in the directory the contract holds.',
  'second record is not in the directory': 'That record is not in the directory the contract holds.',
  'only the applicant may attach a history proof':
    'Only the borrower who applied can attach a repayment history.',
};

export const refusalHint = (message: string): string | null => {
  if (HINTS[message]) return HINTS[message];
  if (message.startsWith('only the borrower')) {
    return 'Only the key that opened this loan acts for the borrower.';
  }
  if (message.startsWith('only the lender')) {
    return 'Only the lender this loan names can take that step.';
  }
  return null;
};
