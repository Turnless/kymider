// Kymider — the on-chain proof run: its figures and its steps.
//
// One place for the numbers `prove:onchain` submits and the words PROOF.md
// uses for each transaction, so the record, the run and the checks in
// `verify:onchain` cannot drift apart.

import type { LoanTerms } from '../../contracts/index.js';

// --- the figures ---------------------------------------------------------------

/** The borrower's self-reported facts. Private: only their hash goes on-chain. */
export const FACTS = { balance: 1_000_000n, debts: 300_000n, income: 1_000_000n };

/** The lender's bar: net worth >= 500,000 and debt-to-income <= 40%. */
export const CLAIM = { thresholdNetWorth: 500_000n, maxDti: 40n };

/**
 * The same bar quoted on each loan. Two hours, so a slow public network still
 * underwrites well inside it (the tier proof and underwriting land in minutes).
 */
export const QUOTE = { ...CLAIM, ttlSeconds: 7_200n };

/** Loan A: proves the tier, so 110% collateral. 1,100 owed in two installments. */
export const TERMS_A: LoanTerms = { principal: 1_000n, interestBps: 1_000n, installments: 2n, periodSeconds: 86_400n };
/** Loan B: no tier proof, so 150% collateral. 2,100 owed in one installment. */
export const TERMS_B: LoanTerms = { principal: 2_000n, interestBps: 500n, installments: 1n, periodSeconds: 86_400n };
/** Loan C: a new application that carries the two-repaid-loans proof. */
export const TERMS_C: LoanTerms = { principal: 5_000n, interestBps: 800n, installments: 4n, periodSeconds: 86_400n };

/** `contracts.loans` in the deployments file, in this order. */
export const LOAN_ROLES = [
  'Loan A: VERIFIED tier, 110% collateral',
  'Loan B: STANDARD tier, 150% collateral',
  'Loan C: new application with a two-loan history proof',
] as const;

export const LOAN_SHORT_NAMES = ['Loan A', 'Loan B', 'Loan C'] as const;

// --- the steps -----------------------------------------------------------------

export type StepInfo = {
  /** The label every receipt of this step carries. */
  label: string;
  /** What the transaction establishes on the public ledger. */
  proves: string;
  /** What the transaction does not reveal. */
  private: string;
};

const step = (label: string, proves: string, privacy: string): StepInfo => ({
  label,
  proves,
  private: privacy,
});

export const STEPS = {
  // Wave 1: proof of solvency
  deployRegistry: step(
    'Borrower deploys the shared Registry',
    'A public index of SolvencyProof instances exists at this address.',
    'Nothing to hide: the Registry is public-only by design.',
  ),
  deploySolvency: step(
    'Borrower deploys their SolvencyProof instance',
    'A commitment to the borrower\'s facts is on-chain, owned by the borrower\'s dapp key.',
    'Balance, debts and income: only their hash is published. The borrower\'s secret key.',
  ),
  register: step(
    'Borrower indexes the instance in the Registry',
    'The Registry row under the borrower\'s key points at this instance and carries its commitment.',
    'The facts behind the commitment.',
  ),
  addLender: step(
    'Borrower authorizes the lender',
    'Only the instance owner could add this lender (checked in the circuit against a witness key).',
    'The borrower\'s secret key; the lender appears only as a public key.',
  ),
  requestClaim: step(
    'Lender requests a solvency claim (net worth >= 500,000, DTI <= 40%)',
    'An authorized lender asked this exact question; the bar is public.',
    'The lender\'s secret key.',
  ),
  proveSolvency: step(
    'Borrower proves solvency in zero knowledge',
    'The committed facts clear the lender\'s bar: attestation PASS, verified by the network.',
    'Balance, debts, income, net worth and the DTI ratio. The lender learns PASS, nothing else.',
  ),
  approve: step(
    'Lender approves the claim',
    'The lender accepted the attestation; the claim is APPROVED on-chain.',
    'The facts, which the lender never saw.',
  ),

  // Wave 2: the loan lifecycle
  deployDirectory: step(
    'Borrower deploys the shared LoanDirectory',
    'A public index of loans and a Merkle tree of repayment records exist at this address.',
    'Nothing yet.',
  ),
  deployLoanA: step(
    'Borrower opens loan A (principal 1,000), bound to the committed facts',
    'The loan names one lender and binds the same facts commitment as the SolvencyProof instance.',
    'The facts, and the per-loan history seed that blinds the payment record.',
  ),
  listA: step(
    'Borrower lists loan A in the LoanDirectory',
    'The listing names the borrower and lender keys and the principal.',
    'The borrower\'s secret key.',
  ),
  quoteA: step(
    'Lender quotes the bar for the 110% tier on loan A',
    'Only the named lender could quote; the bar and its expiry are public.',
    'The lender\'s secret key.',
  ),
  proveTierA: step(
    'Borrower proves the tier on loan A in zero knowledge: VERIFIED',
    'The committed facts clear the quoted bar, so the loan holds the VERIFIED tier until the quote expires.',
    'Balance, debts and income. Only the tier reaches the ledger.',
  ),
  underwriteA: step(
    'Lender underwrites loan A at 110% collateral (1,100)',
    'The circuit accepts only the exact 110% figure for a live VERIFIED tier; 150% would be 1,500.',
    'Why the borrower qualified.',
  ),
  disburseA: step(
    'Lender disburses loan A',
    'Owed (1,100) and the installment (550) are exactly what the terms give; the start time is held to block time.',
    'Nothing beyond the public terms.',
  ),
  repayA: step(
    'Borrower repays an installment of loan A',
    'The exact installment was paid by the borrower, on time by block time; the payment history commitment advances.',
    'The history seed and nonces, so the payment record cannot be linked across loans without the borrower\'s consent.',
  ),
  recordA: step(
    'Lender records loan A as repaid',
    'Only the loan\'s lender could add the repayment leaf; the listing reads REPAID.',
    'The leaf is a hash: later proofs over it do not say which loan or lender it is.',
  ),
  deployLoanB: step(
    'Borrower opens loan B (principal 2,000), bound to the committed facts',
    'A second loan, with a second lender, under the same commitment.',
    'The facts and the loan\'s history seed.',
  ),
  listB: step(
    'Borrower lists loan B in the LoanDirectory',
    'The listing names the borrower and lender keys and the principal.',
    'The borrower\'s secret key.',
  ),
  quoteB: step(
    'Lender quotes the bar on loan B',
    'Only the named lender could quote.',
    'The lender\'s secret key.',
  ),
  underwriteB: step(
    'Lender underwrites loan B at 150% collateral (3,000): no tier proof',
    'Without a live VERIFIED tier the circuit accepts only the 150% figure.',
    'Nothing: the borrower chose not to prove.',
  ),
  disburseB: step(
    'Lender disburses loan B',
    'Owed (2,100) and the single installment match the terms.',
    'Nothing beyond the public terms.',
  ),
  repayB: step(
    'Borrower repays loan B',
    'The exact amount due was paid by the borrower; the loan is REPAID.',
    'The history seed and nonce.',
  ),
  recordB: step(
    'Lender records loan B as repaid',
    'A second repayment leaf, added by loan B\'s own lender.',
    'Which leaf is which, in any later proof.',
  ),
  deployLoanC: step(
    'Borrower opens loan C (principal 5,000), a new application',
    'A third loan under the same commitment.',
    'The facts and the loan\'s history seed.',
  ),
  listC: step(
    'Borrower lists loan C in the LoanDirectory',
    'The application is listed for its lender.',
    'The borrower\'s secret key.',
  ),
  proveHistoryC: step(
    'Borrower proves two repaid Kymider loans for application C',
    'The applicant holds two distinct repayment leaves under their own key: the directory records "2" for loan C.',
    'Which two loans, which lenders, the amounts and dates. The new lender learns the count only.',
  ),
} satisfies Record<string, StepInfo>;

export type StepKey = keyof typeof STEPS;

/** Every step, in run order, for the explanation section of PROOF.md. */
export const STEP_LIST: readonly StepInfo[] = Object.values(STEPS);

export function stepByLabel(label: string): StepInfo | undefined {
  return STEP_LIST.find((s) => s.label === label);
}
