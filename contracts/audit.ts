// Kymider — payment-history disclosure for an auditor (Wave 3 preview).
//
// Each repayment folds (amount, on-time flag, nonce) into a Loan's public
// `historyCommitment` chain. The nonces are derived from the borrower's
// private history seed (see `loanPaymentNonce` in witnesses.ts), so the
// borrower can later open the whole chain to an auditor: every amount and
// on-time flag, with the nonces that bind them. The auditor recomputes the
// chain and checks it lands exactly on the on-chain head, so the history
// cannot be edited, reordered, padded or truncated.
//
// Browser-safe: shared verbatim with the console, like witnesses.ts.
//
// SIGNATURES ONLY — implemented by the Wave 3 work package.

export type DisclosedPayment = { amount: bigint; onTime: boolean };

export type Disclosure = {
  version: 1;
  /** Loan contract address, hex without 0x. */
  loan: string;
  /** Amounts as decimal strings, nonces as hex, so it serializes as JSON. */
  payments: { amount: string; onTime: boolean; nonce: string }[];
};

export type OnChainHistory = {
  historyCommitment: Uint8Array;
  paymentsMade: bigint;
  latePayments: bigint;
};

export type DisclosureCheck =
  | { ok: true; payments: number; late: number; total: bigint }
  | { ok: false; reason: string };

/** The chain head before any payment, as the Loan constructor sets it. */
export declare function historyGenesis(): Uint8Array;

/** Fold one payment onto a chain head, exactly as Loan.repay does. */
export declare function foldPayment(head: Uint8Array, payment: DisclosedPayment, nonce: Uint8Array): Uint8Array;

/** Borrower side: open the history from the private seed and payment log. */
export declare function buildDisclosure(
  loan: string,
  historySeed: Uint8Array,
  payments: DisclosedPayment[],
): Disclosure;

/** Auditor side: does this disclosure open the on-chain history exactly? */
export declare function verifyDisclosure(disclosure: Disclosure, onChain: OnChainHistory): DisclosureCheck;
