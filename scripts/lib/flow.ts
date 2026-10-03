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
 * offers and accepts well inside it (the tier proof and the offer land in
 * minutes). The contract refuses a quote that holds less than 30 minutes.
 */
export const QUOTE = { ...CLAIM, ttlSeconds: 7_200n };

/** Loan A: proves the tier, so 110% collateral. 1,100 owed in two installments. */
export const TERMS_A: LoanTerms = { principal: 1_000n, interestBps: 1_000n, installments: 2n, periodSeconds: 86_400n };
/** Loan B: the borrower waives the tier proof, so 150% collateral. 2,100 owed in one installment. */
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
    'Lender offers loan A at 110% collateral (1,100)',
    'The circuit takes only the exact 110% figure while the VERIFIED tier is live; 150% would be 1,500, and the tier cannot be re-quoted away (both attempts were refused before submission, below).',
    'Why the borrower qualified.',
  ),
  acceptA: step(
    'Borrower accepts the offer on loan A',
    'Only the borrower can make the offer binding: loan A is ACTIVE at 110% collateral.',
    'The borrower\'s secret key.',
  ),
  activateA: step(
    'Lender marks loan A ACTIVE in the LoanDirectory',
    'Only the listing\'s lender may move it from OPEN to ACTIVE; a repayment can be recorded only from ACTIVE.',
    'The lender\'s secret key.',
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
  waiveB: step(
    'Borrower waives the tier proof on loan B',
    'The borrower answered the quote without a proof, so the 150% offer is open now rather than when the quote lapses. Until a quote is answered or lapses the circuit refuses a 150% offer.',
    'Everything about the facts: a waiver answers no question about them.',
  ),
  underwriteB: step(
    'Lender offers loan B at 150% collateral (3,000): proof waived',
    'Without a live VERIFIED tier, and with the quote answered, the circuit takes only the 150% figure.',
    'Nothing: the borrower chose not to prove.',
  ),
  acceptB: step(
    'Borrower accepts the offer on loan B',
    'The borrower named the 150% figure and accepted it; the loan is ACTIVE only because the borrower accepted.',
    'The borrower\'s secret key.',
  ),
  activateB: step(
    'Lender marks loan B ACTIVE in the LoanDirectory',
    'Only the listing\'s lender may move it from OPEN to ACTIVE.',
    'The lender\'s secret key.',
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

// --- the refusals ----------------------------------------------------------------

/**
 * Calls the run makes on purpose and expects the circuit to refuse. Each runs
 * the circuit locally, as every call does before a proof is generated; an
 * assert that fails there stops the call, so nothing is proved or submitted.
 * The run records the contract's message, and fails if any call goes through
 * or is refused for another reason.
 */
export type RefusalInfo = {
  label: string;
  /** The contract's assert message the run must see. */
  expected: string;
  /** What the refusal shows. */
  shows: string;
};

export const REFUSALS = {
  overaskA: {
    label: 'Lender tries to offer loan A at 150% (1,500) while its VERIFIED tier is live',
    expected: 'collateral does not match the tier',
    shows: 'A verified borrower can only be offered 110%: the lender cannot even put 150% on the table.',
  },
  requoteA: {
    label: 'Lender tries to re-quote loan A while its VERIFIED tier is live',
    expected: 'a verified tier is live until it lapses',
    shows: 'The lender cannot reset the tier by quoting again; loan A keeps quotesIssued = 1.',
  },
} satisfies Record<string, RefusalInfo>;

/** Every step, in run order, for the explanation section of PROOF.md. */
export const STEP_LIST: readonly StepInfo[] = Object.values(STEPS);

export function stepByLabel(label: string): StepInfo | undefined {
  return STEP_LIST.find((s) => s.label === label);
}
