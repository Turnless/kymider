// Kymider — off-chain witness implementations and private-state factories.
//
// Private state lives ONLY in the client (level private-state store). The
// SolvencyProof contract's `localSk` witness reads the caller's secret key from
// here; the borrower's financial facts are held here too and passed into
// circuits as private witness inputs (they never leave the machine).
//
// The facts commitment is salted (contracts/loanMath.ts#commitFacts). The salt
// is 32 random bytes kept beside the facts it blinds, and it reaches circuits
// only through the `factsSalt` witness. Facts and salt are one opening: they
// are written together and never one without the other.
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

// --- facts salt -----------------------------------------------------------

/** A fresh 32-byte blinding salt. Web Crypto, so the console can use it too. */
export const freshFactsSalt = (): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(32));

/**
 * The salt of a party that never commits facts (a lender acting on someone
 * else's SolvencyProof or Loan). The contracts refuse it as a commitment salt
 * ("facts salt must be set"), so it cannot blind a borrower's facts by mistake.
 */
export const NO_FACTS_SALT: Uint8Array = new Uint8Array(32);

// --- SolvencyProof --------------------------------------------------------
//
// `salt` blinds the CURRENT commitment. Re-committing (updateFacts) uses a new
// salt, and the client stages the new facts and salt here BEFORE it submits,
// because `factsSalt` is read while the circuit runs. `previous` holds the
// opening being replaced until the new commitment is confirmed on-chain, so a
// transaction that fails, or a process that dies mid-update, can be put right
// by comparing both openings with the ledger (KymiderClient.updateFacts).

export type FactsOpening = {
  balance: bigint;
  debts: bigint;
  income: bigint;
  salt: Uint8Array;
};

export type SolvencyPrivateState = FactsOpening & {
  sk: Uint8Array;
  previous?: FactsOpening;
};

export const createSolvencyPrivateState = (
  balance: bigint,
  debts: bigint,
  income: bigint,
  sk: Uint8Array,
  salt: Uint8Array,
): SolvencyPrivateState => ({ balance, debts, income, sk, salt });

export const solvencyWitnesses = {
  localSk: ({ privateState }: WitnessContext<SolvencyLedger, SolvencyPrivateState>): [
    SolvencyPrivateState,
    Uint8Array,
  ] => [privateState, privateState.sk],
  factsSalt: ({ privateState }: WitnessContext<SolvencyLedger, SolvencyPrivateState>): [
    SolvencyPrivateState,
    Uint8Array,
  ] => [privateState, privateState.salt],
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
//
// `factsSalt` is the salt of the opening this loan's `factsCommitment` was
// built from (the borrower's SolvencyProof salt at the time the loan was
// opened). A lender's is NO_FACTS_SALT and never read.

export type LoanPrivateState = {
  sk: Uint8Array;
  historySeed: Uint8Array;
  factsSalt: Uint8Array;
};

export const createLoanPrivateState = (
  sk: Uint8Array,
  historySeed: Uint8Array,
  factsSalt: Uint8Array,
): LoanPrivateState => ({
  sk,
  historySeed,
  factsSalt,
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
  factsSalt: ({ privateState }: WitnessContext<LoanLedger, LoanPrivateState>): [
    LoanPrivateState,
    Uint8Array,
  ] => [privateState, privateState.factsSalt],
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
