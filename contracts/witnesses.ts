// Kymider — off-chain witness implementations and private-state factories.
//
// Private state lives ONLY in the client (level private-state store). The
// SolvencyProof contract's `localSk` witness reads the caller's secret key from
// here; the borrower's financial facts are held here too and passed into
// circuits as private witness inputs (they never leave the machine).
//
// Pattern adapted from midnightntwrk/example-battleship (Apache-2.0).

import {
  CompactTypeBytes,
  CompactTypeVector,
  persistentHash,
  type WitnessContext,
} from '@midnight-ntwrk/compact-runtime';
import type { Ledger as SolvencyLedger } from '../compiled/solvency-proof/contract/index.js';
import type { Ledger as RegistryLedger } from '../compiled/registry/contract/index.js';
import type { Ledger as LoanLedger } from '../compiled/loan/contract/index.js';
import type { Ledger as LoanDirectoryLedger } from '../compiled/loan-directory/contract/index.js';

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

// --- Loan -----------------------------------------------------------------
//
// One private state per party per loan instance. The borrower's also holds
// `historySeed`: each repayment folds a nonce into the public
// `historyCommitment` chain, and that nonce is derived from the seed and the
// chain head it extends rather than drawn at random. Nothing has to be stored
// per payment, a failed transaction cannot leave private state out of step
// with the chain, and the borrower can rebuild every opening of their history
// from the seed and the public payment records. The lender never repays, so
// its seed is never used.
//
// Keyed to the chain head, not to `paymentsMade`: repay increments the counter
// before it asks for the nonce, so a counter-keyed nonce would depend on the
// statement order inside the circuit. The head is written only after the nonce
// is folded in, so every view of the ledger agrees on it.

export type LoanPrivateState = {
  sk: Uint8Array;
  historySeed: Uint8Array;
};

export const createLoanPrivateState = (sk: Uint8Array, historySeed: Uint8Array): LoanPrivateState => ({
  sk,
  historySeed,
});

// Compact's pad(32, s): the UTF-8 bytes of s, zero-filled to 32.
const pad32 = (s: string): Uint8Array => {
  const out = new Uint8Array(32);
  out.set(new TextEncoder().encode(s));
  return out;
};

const nonceDomain = pad32('kymider:loan:nonce:');
const bytes32x3 = new CompactTypeVector(3, new CompactTypeBytes(32));

// The nonce folded into the history chain by the payment that extends
// `previousHead` (the `historyCommitment` before that payment).
export const loanPaymentNonce = (historySeed: Uint8Array, previousHead: Uint8Array): Uint8Array =>
  persistentHash(bytes32x3, [nonceDomain, historySeed, previousHead]);

export const loanWitnesses = {
  localSk: ({ privateState }: WitnessContext<LoanLedger, LoanPrivateState>): [
    LoanPrivateState,
    Uint8Array,
  ] => [privateState, privateState.sk],
  paymentNonce: ({ privateState, ledger }: WitnessContext<LoanLedger, LoanPrivateState>): [
    LoanPrivateState,
    Uint8Array,
  ] => [privateState, loanPaymentNonce(privateState.historySeed, ledger.historyCommitment)],
};

// --- LoanDirectory --------------------------------------------------------

export type LoanDirectoryPrivateState = {
  sk: Uint8Array;
};

export const createLoanDirectoryPrivateState = (sk: Uint8Array): LoanDirectoryPrivateState => ({ sk });

export const loanDirectoryWitnesses = {
  localSk: ({ privateState }: WitnessContext<LoanDirectoryLedger, LoanDirectoryPrivateState>): [
    LoanDirectoryPrivateState,
    Uint8Array,
  ] => [privateState, privateState.sk],
};
