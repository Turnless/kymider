// Kymider — SolvencyProof contract tests, executed offline.
//
// These drive the COMPILED Compact program (not the TypeScript reference math
// in solvencyProof.unit.test.ts): constructor guards, commitment binding,
// verdict derivation and every caller-authorization assert. No Docker, no
// proof server, no network — the devnet simulation still covers real ZK proof
// generation and network verification.

import { describe, it, expect, beforeEach } from 'vitest';
import { AttestationStatus, ClaimStatus } from '../../contracts/index.js';
import { SolvencySimulator, pubKeyOf, skFrom } from './support/simulators.js';

const BORROWER_SK = skFrom(1);
const LENDER_SK = skFrom(2);
const OTHER_LENDER_SK = skFrom(3);

const BORROWER_PK = pubKeyOf(BORROWER_SK);
const LENDER_PK = pubKeyOf(LENDER_SK);
const OTHER_LENDER_PK = pubKeyOf(OTHER_LENDER_SK);

const FACTS = { balance: 1_000_000n, debts: 300_000n, income: 1_000_000n };
const CLAIM = { thresholdNetWorth: 500_000n, maxDti: 40n };

// 2^50 — the range guard the contract applies to every fact.
const MAX_FACT = 1_125_899_906_842_624n;

describe('SolvencyProof — deployment', () => {
  it('records the deployer as owner and commits to the initial facts', () => {
    const sim = new SolvencySimulator(FACTS, BORROWER_SK);
    const state = sim.ledger();

    expect(Array.from(state.owner)).toEqual(Array.from(BORROWER_PK));
    expect(state.commitment).toHaveLength(32);
    expect(state.verifierKey).toHaveLength(32);
    expect(state.authorizedLenders.isEmpty()).toBe(true);
    expect(state.claims.isEmpty()).toBe(true);
  });

  it('rejects zero income (the DTI denominator)', () => {
    expect(() => new SolvencySimulator({ ...FACTS, income: 0n }, BORROWER_SK)).toThrow(
      /income must be non-zero/,
    );
  });

  it('rejects facts beyond the supported range', () => {
    expect(() => new SolvencySimulator({ ...FACTS, balance: MAX_FACT + 1n }, BORROWER_SK)).toThrow(
      /balance exceeds supported range/,
    );
    expect(() => new SolvencySimulator({ ...FACTS, debts: MAX_FACT + 1n }, BORROWER_SK)).toThrow(
      /debts exceed supported range/,
    );
  });

  it('accepts facts exactly at the range bound', () => {
    expect(
      () => new SolvencySimulator({ balance: MAX_FACT, debts: 0n, income: MAX_FACT }, BORROWER_SK),
    ).not.toThrow();
  });
});

describe('SolvencyProof — authorization', () => {
  let sim: SolvencySimulator;

  beforeEach(() => {
    sim = new SolvencySimulator(FACTS, BORROWER_SK);
  });

  it('lets the borrower authorize a lender', () => {
    sim.as(BORROWER_SK).addLender(LENDER_PK);
    expect(sim.ledger().authorizedLenders.member(LENDER_PK)).toBe(true);
  });

  it('refuses addLender from anyone but the borrower', () => {
    expect(() => sim.as(LENDER_SK).addLender(LENDER_PK)).toThrow(
      /only the borrower may authorize a lender/,
    );
  });

  it('refuses updateFacts from anyone but the borrower', () => {
    expect(() => sim.as(LENDER_SK).updateFacts({ ...FACTS, balance: 1n })).toThrow(
      /only the borrower may update facts/,
    );
  });

  it('refuses a claim from a lender the borrower never authorized', () => {
    expect(() => sim.as(LENDER_SK).requestClaim(LENDER_PK, CLAIM)).toThrow(
      /lender is not authorized by the borrower/,
    );
  });

  it('refuses a claim requested on another lender behalf', () => {
    sim.as(BORROWER_SK).addLender(OTHER_LENDER_PK);
    expect(() => sim.as(LENDER_SK).requestClaim(OTHER_LENDER_PK, CLAIM)).toThrow(
      /only the lender may request their own claim/,
    );
  });

  it('caps the requested max DTI', () => {
    sim.as(BORROWER_SK).addLender(LENDER_PK);
    expect(() =>
      sim.as(LENDER_SK).requestClaim(LENDER_PK, { thresholdNetWorth: 0n, maxDti: 10_001n }),
    ).toThrow(/max DTI limit too high/);
  });

  it('refuses a second claim from the same lender', () => {
    sim.as(BORROWER_SK).addLender(LENDER_PK);
    sim.as(LENDER_SK).requestClaim(LENDER_PK, CLAIM);
    expect(() => sim.as(LENDER_SK).requestClaim(LENDER_PK, CLAIM)).toThrow(
      /a claim already exists for this lender/,
    );
  });
});

describe('SolvencyProof — proving solvency', () => {
  let sim: SolvencySimulator;

  beforeEach(() => {
    sim = new SolvencySimulator(FACTS, BORROWER_SK);
    sim.as(BORROWER_SK).addLender(LENDER_PK);
    sim.as(LENDER_SK).requestClaim(LENDER_PK, CLAIM);
    sim.as(BORROWER_SK);
  });

  it('attests PASS when both criteria are met', () => {
    sim.proveSolvency(LENDER_PK);
    expect(sim.ledger().attestations.lookup(LENDER_PK)).toEqual(AttestationStatus.PASS);
  });

  it('attests FAIL when the facts no longer qualify', () => {
    sim.updateFacts({ balance: 100_000n, debts: 95_000n, income: 10_000n });
    sim.proveSolvency(LENDER_PK);
    expect(sim.ledger().attestations.lookup(LENDER_PK)).toEqual(AttestationStatus.FAIL);
  });

  it('refuses a proof from anyone but the borrower', () => {
    expect(() => sim.as(LENDER_SK).proveSolvency(LENDER_PK)).toThrow(
      /only the borrower may prove solvency/,
    );
  });

  it('refuses a proof for a lender with no claim', () => {
    expect(() => sim.proveSolvency(OTHER_LENDER_PK)).toThrow(/no claim requested by this lender/);
  });

  // The privacy-critical one: the circuit recomputes the commitment from the
  // facts it was given, so fabricated facts cannot produce an attestation.
  it('refuses facts that do not match the on-chain commitment', () => {
    expect(() =>
      sim.proveSolvency(LENDER_PK, { balance: 999_999_999n, debts: 1n, income: 1n }),
    ).toThrow(/facts do not match committed facts/);
  });

  it('refuses to re-prove a claim that was already decided', () => {
    sim.proveSolvency(LENDER_PK);
    sim.as(LENDER_SK).approve(LENDER_PK);
    expect(() => sim.as(BORROWER_SK).proveSolvency(LENDER_PK)).toThrow(/claim already decided/);
  });

  // Regression test for the stale-private-state bug: updateFacts re-commits
  // on-chain, so the next proof MUST be built from the new facts. A client that
  // forgets to write the new facts back fails the commitment check here.
  it('can still prove after updateFacts re-commits (facts stay in step)', () => {
    const before = sim.ledger().commitment;
    sim.updateFacts({ balance: 2_000_000n, debts: 100_000n, income: 1_000_000n });
    const after = sim.ledger().commitment;

    expect(Array.from(after)).not.toEqual(Array.from(before));
    expect(() => sim.proveSolvency(LENDER_PK)).not.toThrow();
    expect(sim.ledger().attestations.lookup(LENDER_PK)).toEqual(AttestationStatus.PASS);
  });
});

describe('SolvencyProof — deciding a claim', () => {
  let sim: SolvencySimulator;

  beforeEach(() => {
    sim = new SolvencySimulator(FACTS, BORROWER_SK);
    sim.as(BORROWER_SK).addLender(LENDER_PK);
    sim.as(LENDER_SK).requestClaim(LENDER_PK, CLAIM);
    sim.as(BORROWER_SK).proveSolvency(LENDER_PK);
  });

  it('lets the lender approve their own claim', () => {
    sim.as(LENDER_SK).approve(LENDER_PK);
    expect(sim.ledger().claims.lookup(LENDER_PK).status).toEqual(ClaimStatus.APPROVED);
  });

  it('lets the lender reject their own claim', () => {
    sim.as(LENDER_SK).reject(LENDER_PK);
    expect(sim.ledger().claims.lookup(LENDER_PK).status).toEqual(ClaimStatus.REJECTED);
  });

  it('refuses a decision from the borrower', () => {
    expect(() => sim.as(BORROWER_SK).approve(LENDER_PK)).toThrow(
      /only the lender may decide their own claim/,
    );
  });

  it('refuses a second decision on the same claim', () => {
    sim.as(LENDER_SK).approve(LENDER_PK);
    expect(() => sim.as(LENDER_SK).reject(LENDER_PK)).toThrow(/claim already decided/);
  });

  it('preserves the claim terms through the decision', () => {
    sim.as(LENDER_SK).approve(LENDER_PK);
    const claim = sim.ledger().claims.lookup(LENDER_PK);
    expect(claim.thresholdNetWorth).toBe(CLAIM.thresholdNetWorth);
    expect(claim.maxDti).toBe(CLAIM.maxDti);
  });
});

describe('SolvencyProof — known Wave-1 limitations', () => {
  // Documented, not desired. `requestClaim` asserts the lender has no claim at
  // all, so once a claim is decided that lender can never be underwritten
  // again — no re-request, no proof refresh after updateFacts. Fixing this is
  // a contract change (it needs a recompile); this test pins the current
  // behaviour so the fix is visible when it lands.
  it('locks a lender out after their claim is decided', () => {
    const sim = new SolvencySimulator(FACTS, BORROWER_SK);
    sim.as(BORROWER_SK).addLender(LENDER_PK);
    sim.as(LENDER_SK).requestClaim(LENDER_PK, CLAIM);
    sim.as(BORROWER_SK).proveSolvency(LENDER_PK);
    sim.as(LENDER_SK).approve(LENDER_PK);

    expect(() => sim.as(LENDER_SK).requestClaim(LENDER_PK, CLAIM)).toThrow(
      /a claim already exists for this lender/,
    );
  });

  // An insolvent borrower (debts > balance) has net worth floored to 0, so a
  // claim with a zero threshold still passes on the net-worth leg.
  it('passes a zero net-worth threshold even when debts exceed balance', () => {
    const insolvent = { balance: 10_000n, debts: 90_000n, income: 1_000_000n };
    const sim = new SolvencySimulator(insolvent, BORROWER_SK);
    sim.as(BORROWER_SK).addLender(LENDER_PK);
    sim.as(LENDER_SK).requestClaim(LENDER_PK, { thresholdNetWorth: 0n, maxDti: 40n });
    sim.as(BORROWER_SK).proveSolvency(LENDER_PK);

    expect(sim.ledger().attestations.lookup(LENDER_PK)).toEqual(AttestationStatus.PASS);
  });
});
