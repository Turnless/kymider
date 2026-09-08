// Kymider — Registry contract tests, executed offline.
//
// The Registry is public-only: it indexes borrower instances so lenders can
// discover them. Rows are keyed on the CALLER's dapp pubkey, so a caller can
// only ever write to their own row — which is the whole authorization model,
// and the reason squatting no longer works.

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

  it('indexes a borrower instance under the caller and counts it', () => {
    registry.as(BORROWER_SK).register(instanceAddr, commitment);

    const state = registry.ledger();
    expect(state.borrowers.member(BORROWER_PK)).toBe(true);
    expect(state.borrowerCount).toBe(1n);

    const record = state.borrowers.lookup(BORROWER_PK);
    expect(Array.from(record.instanceAddr)).toEqual(Array.from(instanceAddr));
    expect(Array.from(record.commitment)).toEqual(Array.from(commitment));
    expect(record.status).toEqual(BorrowStatus.ACTIVE);
  });

  it('refuses a second registration from the same identity', () => {
    registry.as(BORROWER_SK).register(instanceAddr, commitment);
    expect(() => registry.register(instanceAddr, commitment)).toThrow(
      /this identity already has a registered instance/,
    );
  });

  it('lets the owner re-point their record at a new commitment', () => {
    registry.as(BORROWER_SK).register(instanceAddr, commitment);

    instance.as(BORROWER_SK).updateFacts({ balance: 2_000_000n, debts: 100_000n, income: 900_000n });
    const updated = instance.ledger().commitment;
    registry.updateCommitment(updated);

    expect(Array.from(registry.ledger().borrowers.lookup(BORROWER_PK).commitment)).toEqual(
      Array.from(updated),
    );
  });

  it('refuses a commitment update from an identity with no record', () => {
    registry.as(BORROWER_SK).register(instanceAddr, commitment);
    expect(() => registry.as(STRANGER_SK).updateCommitment(commitment)).toThrow(
      /no instance registered for this identity/,
    );
  });

  it('refuses to update before registering', () => {
    expect(() => registry.as(BORROWER_SK).updateCommitment(commitment)).toThrow(
      /no instance registered for this identity/,
    );
  });

  it('lets the owner suspend their record', () => {
    registry.as(BORROWER_SK).register(instanceAddr, commitment);
    registry.suspend();
    expect(registry.ledger().borrowers.lookup(BORROWER_PK).status).toEqual(BorrowStatus.SUSPENDED);
  });

  it('refuses a suspend from an identity with no record', () => {
    registry.as(BORROWER_SK).register(instanceAddr, commitment);
    expect(() => registry.as(STRANGER_SK).suspend()).toThrow(
      /no instance registered for this identity/,
    );
  });

  // This is the test that used to pin the squatting bug. It now pins the fix:
  // a stranger can still POINT their own row at someone else's instance — the
  // Registry cannot verify who deployed a contract, because Midnight has no
  // cross-contract reads — but that claim lives under the stranger's own key
  // and cannot displace or block the real owner.
  it('a stranger claiming your instance cannot lock you out of the index', () => {
    const bogusCommitment = new Uint8Array(32).fill(0xff);
    registry.as(STRANGER_SK).register(instanceAddr, bogusCommitment);

    // The real owner registers the same instance regardless.
    registry.as(BORROWER_SK).register(instanceAddr, commitment);

    const state = registry.ledger();
    expect(state.borrowerCount).toBe(2n);
    expect(state.borrowers.member(BORROWER_PK)).toBe(true);
    expect(state.borrowers.member(STRANGER_PK)).toBe(true);

    // ...and keeps full control of their own row.
    registry.as(BORROWER_SK).suspend();
    expect(state.borrowers.lookup(STRANGER_PK).status).toEqual(BorrowStatus.ACTIVE);
    expect(registry.ledger().borrowers.lookup(BORROWER_PK).status).toEqual(BorrowStatus.SUSPENDED);
  });

  it('tells a real record from a claimed one by the key, not the contents', () => {
    const bogusCommitment = new Uint8Array(32).fill(0xff);
    registry.as(STRANGER_SK).register(instanceAddr, bogusCommitment);
    registry.as(BORROWER_SK).register(instanceAddr, commitment);

    // The check a lender makes: the row's key must be the instance's own owner.
    const owner = instance.ledger().owner;
    expect(Array.from(owner)).toEqual(Array.from(BORROWER_PK));

    const genuine = registry.ledger().borrowers.lookup(owner);
    expect(Array.from(genuine.commitment)).toEqual(Array.from(commitment));

    const claimed = registry.ledger().borrowers.lookup(STRANGER_PK);
    expect(Array.from(claimed.instanceAddr)).toEqual(Array.from(instanceAddr));
    expect(Array.from(claimed.commitment)).not.toEqual(Array.from(commitment));
  });
});
