/**
 * Browser-safe access to the compiled Compact contracts.
 *
 * The root `contracts/index.ts` barrel cannot be used here: it resolves ZK
 * artifact directories with `node:path` / `node:url`, which have no meaning in
 * a browser. The contract modules themselves are plain ESM whose only import is
 * `@midnight-ntwrk/compact-runtime`, so they are re-exported directly and the
 * witnesses are shared verbatim with the Node client and the unit tests.
 *
 * Paths are relative rather than through the `@compiled` / `@contracts`
 * aliases so this module (and the simulated client and loan desk built on it)
 * also resolves from the repository root, where the unit tests import it.
 * Vite and the console's tsconfig still pin `@midnight-ntwrk/compact-runtime`
 * to this package's copy whichever path the import comes from.
 */

export {
  Contract as SolvencyProofContract,
  ledger as solvencyLedger,
  pureCircuits as solvencyPureCircuits,
  ClaimStatus,
  AttestationStatus,
} from '../../../compiled/solvency-proof/contract/index.js';
export type {
  Ledger as SolvencyLedger,
} from '../../../compiled/solvency-proof/contract/index.js';

export {
  Contract as RegistryContract,
  ledger as registryLedger,
  BorrowStatus,
} from '../../../compiled/registry/contract/index.js';
export type {
  Ledger as RegistryLedger,
} from '../../../compiled/registry/contract/index.js';

// --- Wave 2 ---------------------------------------------------------------

export {
  Contract as LoanContract,
  ledger as loanLedger,
  pureCircuits as loanPureCircuits,
  LoanStatus,
  Tier,
} from '../../../compiled/loan/contract/index.js';
export type {
  Ledger as LoanLedger,
  LoanTerms as LoanLedgerTerms,
  Quote as LoanLedgerQuote,
} from '../../../compiled/loan/contract/index.js';

export {
  Contract as LoanDirectoryContract,
  ledger as loanDirectoryLedger,
  pureCircuits as loanDirectoryPureCircuits,
  ListingStatus,
} from '../../../compiled/loan-directory/contract/index.js';
export type {
  Ledger as LoanDirectoryLedger,
  Listing,
} from '../../../compiled/loan-directory/contract/index.js';

export {
  createLoanDirectoryPrivateState,
  createLoanPrivateState,
  createRegistryPrivateState,
  createSolvencyPrivateState,
  freshFactsSalt,
  NO_FACTS_SALT,
  loanDirectoryWitnesses,
  loanPaymentNonce,
  loanWitnesses,
  registryWitnesses,
  solvencyWitnesses,
} from '../../../contracts/witnesses.js';
export type {
  FactsOpening,
  LoanDirectoryPrivateState,
  LoanPrivateState,
  RegistryPrivateState,
  SolvencyPrivateState,
} from '../../../contracts/witnesses.js';

export {
  GRACE_SECONDS,
  STANDARD_RATIO_BPS,
  VERIFIED_RATIO_BPS,
  amountDue,
  collateralFor,
  commitFacts,
  defaultableFrom,
  installmentFor,
  owedFor,
  proofWaived,
  proofWindowOpen,
  tierIsLive,
  underwriteRefusal,
  PROOF_WINDOW_REFUSAL,
} from '../../../contracts/loanMath.js';
