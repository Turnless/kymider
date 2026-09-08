// Kymider — off-chain witness implementations and private-state factories.
//
// Private state lives ONLY in the client (level private-state store). The
// SolvencyProof contract's `localSk` witness reads the caller's secret key from
// here; the borrower's financial facts are held here too and passed into
// circuits as private witness inputs (they never leave the machine).
//
// Pattern adapted from midnightntwrk/example-battleship (Apache-2.0).

import type { WitnessContext } from '@midnight-ntwrk/compact-runtime';
import type { Ledger as SolvencyLedger } from '../compiled/solvency-proof/contract/index.js';
import type { Ledger as RegistryLedger } from '../compiled/registry/contract/index.js';

// --- SolvencyProof --------------------------------------------------------

export type SolvencyPrivateState = {
  balance: bigint;
  debts: bigint;
  income: bigint;
  sk: Uint8Array;
};

export const createSolvencyPrivateState = (
  balance: bigint,
  debts: bigint,
  income: bigint,
  sk: Uint8Array,
): SolvencyPrivateState => ({ balance, debts, income, sk });

export const solvencyWitnesses = {
  localSk: ({ privateState }: WitnessContext<SolvencyLedger, SolvencyPrivateState>): [
    SolvencyPrivateState,
    Uint8Array,
  ] => [privateState, privateState.sk],
};

// --- Registry -------------------------------------------------------------

export type RegistryPrivateState = {
  sk: Uint8Array;
};

export const createRegistryPrivateState = (sk: Uint8Array): RegistryPrivateState => ({ sk });

export const registryWitnesses = {
  localSk: ({ privateState }: WitnessContext<RegistryLedger, RegistryPrivateState>): [
    RegistryPrivateState,
    Uint8Array,
  ] => [privateState, privateState.sk],
};