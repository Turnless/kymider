/**
 * The browser's state codec: this package's wasm runtime plus the compiled
 * contracts' `ledger()` functions. Kept apart from `decode.ts` so the decode
 * layer stays runtime-free and the root unit tests can supply their own copy.
 */

import { ContractState, type ChargedState } from '@midnight-ntwrk/compact-runtime';
import { ledger as solvencyProof } from '@compiled/solvency-proof/contract/index.js';
import { ledger as registry } from '@compiled/registry/contract/index.js';
import { ledger as loan } from '@compiled/loan/contract/index.js';
import { ledger as loanDirectory } from '@compiled/loan-directory/contract/index.js';
import type { StateCodec } from './decode';

export const browserCodec: StateCodec<ChargedState> = {
  deserialize: (bytes) => ContractState.deserialize(bytes),
  ledgers: { solvencyProof, registry, loan, loanDirectory },
};
