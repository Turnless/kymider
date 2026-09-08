/**
 * Browser-safe access to the compiled Compact contracts.
 *
 * The root `contracts/index.ts` barrel cannot be used here: it resolves ZK
 * artifact directories with `node:path` / `node:url`, which have no meaning in
 * a browser. The contract modules themselves are plain ESM whose only import is
 * `@midnight-ntwrk/compact-runtime`, so they are re-exported directly and the
 * witnesses are shared verbatim with the Node client and the unit tests.
 */

export {
  Contract as SolvencyProofContract,
  ledger as solvencyLedger,
  pureCircuits as solvencyPureCircuits,
  ClaimStatus,
  AttestationStatus,
} from '@compiled/solvency-proof/contract/index.js';
export type {
  Ledger as SolvencyLedger,
} from '@compiled/solvency-proof/contract/index.js';

export {
  Contract as RegistryContract,
  ledger as registryLedger,
  BorrowStatus,
} from '@compiled/registry/contract/index.js';
export type {
  Ledger as RegistryLedger,
} from '@compiled/registry/contract/index.js';

export {
  createRegistryPrivateState,
  createSolvencyPrivateState,
  registryWitnesses,
  solvencyWitnesses,
} from '@contracts/witnesses.js';
export type {
  RegistryPrivateState,
  SolvencyPrivateState,
} from '@contracts/witnesses.js';
