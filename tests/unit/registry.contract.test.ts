// Kymider — Registry contract tests, executed offline.
//
// The Registry is public-only: it indexes borrower instances so lenders can
// discover them. These tests cover the record lifecycle and the caller checks,
// plus the ownership limitation the Wave-1 design documents.

import { describe, it, expect, beforeEach } from 'vitest';
import { encodeContractAddress } from '@midnight-ntwrk/midnight-js-protocol/compact-runtime';
import { BorrowStatus } from '../../contracts/index.js';
import { RegistrySimulator, SolvencySimulator, pubKeyOf, skFrom } from './support/simulators.js';

const BORROWER_SK = skFrom(1);
const STRANGER_SK = skFrom(9);

const BORROWER_PK = pubKeyOf(BORROWER_SK);
const STRANGER_PK = pubKeyOf(STRANGER_SK);

const FACTS = { balance: 1_000_000n, debts: 300_000n, income: 1_000_000n };

describe('Registry', () => {
  let registry: RegistrySimulator;
  let instance: SolvencySimulator;
  let instanceAddr: Uint8Array;
  let commitment: Uint8Array;

  beforeEach(() => {
    registry = new RegistrySimulator(BORROWER_SK);
    instance = new SolvencySimulator(FACTS, BORROWER_SK);
    instanceAddr = encodeContractAddress(instance.address);
    commitment = instance.ledger().commitment;
  });

  it('indexes a borrower instance and counts it', () => {
    registry.as(BORROWER_SK).register(instanceAddr, BORROWER_PK, commitment);

    const state = registry.ledger();
    expect(state.borrowers.member(instanceAddr)).toBe(true);
    expect(state.borrowerCount).toBe(1n);

    const record = state.borrowers.lookup(instanceAddr);
    expect(Array.from(record.owner)).toEqual(Array.from(BORROWER_PK));
    expect(Array.from(record.commitment)).toEqual(Array.from(commitment));
    expect(record.status).toEqual(BorrowStatus.ACTIVE);
  });

  it('refuses a registration whose owner is not the caller', () => {
    expect(() => registry.as(STRANGER_SK).register(instanceAddr, BORROWER_PK, commitment)).toThrow(
      /only the borrower may register their own instance/,
    );
  });

  it('refuses to register the same instance twice', () => {
    registry.as(BORROWER_SK).register(instanceAddr, BORROWER_PK, commitment);
    expect(() => registry.register(instanceAddr, BORROWER_PK, commitment)).toThrow(
      /instance already registered/,
    );
  });

  it('lets the owner re-point the record at a new commitment', () => {
    registry.as(BORROWER_SK).register(instanceAddr, BORROWER_PK, commitment);

    instance.as(BORROWER_SK).updateFacts({ balance: 2_000_000n, debts: 100_000n, income: 900_000n });
    const updated = instance.ledger().commitment;
    registry.updateCommitment(instanceAddr, updated);

    expect(Array.from(registry.ledger().borrowers.lookup(instanceAddr).commitment)).toEqual(
      Array.from(updated),
    );
  });

  it('refuses a commitment update from anyone but the owner', () => {
    registry.as(BORROWER_SK).register(instanceAddr, BORROWER_PK, commitment);
    expect(() => registry.as(STRANGER_SK).updateCommitment(instanceAddr, commitment)).toThrow(
      /only the owner may update commitment/,
    );
  });

  it('refuses to update an instance that was never registered', () => {
    expect(() => registry.as(BORROWER_SK).updateCommitment(instanceAddr, commitment)).toThrow(
      /instance not registered/,
    );
  });

  it('lets the owner suspend their record', () => {
    registry.as(BORROWER_SK).register(instanceAddr, BORROWER_PK, commitment);
    registry.suspend(instanceAddr);
    expect(registry.ledger().borrowers.lookup(instanceAddr).status).toEqual(BorrowStatus.SUSPENDED);
  });

  it('refuses a suspend from anyone but the owner', () => {
    registry.as(BORROWER_SK).register(instanceAddr, BORROWER_PK, commitment);
    expect(() => registry.as(STRANGER_SK).suspend(instanceAddr)).toThrow(
      /only the owner may suspend/,
    );
  });

  // Documented Wave-1 limitation, pinned so the exposure is visible. The
  // Registry cannot verify who deployed the instance at `instanceAddr` (no
  // cross-contract reads on Midnight), and it rejects re-registration — so a
  // stranger who registers someone else's address FIRST, under their own
  // pubkey, permanently locks the real owner out of the index.
  it('lets a stranger squat an instance address and lock the real owner out', () => {
    const bogusCommitment = new Uint8Array(32).fill(0xff);
    registry.as(STRANGER_SK).register(instanceAddr, STRANGER_PK, bogusCommitment);

    expect(() => registry.as(BORROWER_SK).register(instanceAddr, BORROWER_PK, commitment)).toThrow(
      /instance already registered/,
    );
    expect(() => registry.as(BORROWER_SK).updateCommitment(instanceAddr, commitment)).toThrow(
      /only the owner may update commitment/,
    );

    // The squatted record is detectable: its commitment does not match the
    // instance's real on-chain commitment.
    const record = registry.ledger().borrowers.lookup(instanceAddr);
    expect(Array.from(record.commitment)).not.toEqual(Array.from(commitment));
  });
});
