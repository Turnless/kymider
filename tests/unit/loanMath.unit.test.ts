// Kymider — the client's loan arithmetic, checked against the compiled Loan.
//
// The circuit cannot divide, so it accepts a collateral, owed or installment
// figure only if it is exactly the floor or ceiling the client computed. Any
// drift between client/proof/loanMath.ts and the circuit would surface on
// chain as a refused transaction; this sweeps terms through both.

import { describe, it, expect } from 'vitest';
import { LoanStatus, Tier } from '../../contracts/index.js';
import {
  amountDue,
  collateralFor,
  defaultableFrom,
  installmentFor,
  MIN_QUOTE_SECONDS,
  owedFor,
  proofWaived,
  proofWindowOpen,
  quoteRefusal,
  tierIsLive,
  underwriteRefusal,
} from '../../client/proof/loanMath.js';
import { LoanSimulator, T0, TEST_SALT, commitFacts, pubKeyOf, skFrom } from './support/simulators.js';

const BORROWER_SK = skFrom(1);
const LENDER_SK = skFrom(2);
const FACTS = { balance: 1_000_000n, debts: 300_000n, income: 1_000_000n };

const open = (terms: { principal: bigint; interestBps: bigint; installments: bigint; periodSeconds: bigint }) =>
  new LoanSimulator(BORROWER_SK, pubKeyOf(LENDER_SK), terms, commitFacts(FACTS, TEST_SALT), new Uint8Array(32))
    .as(LENDER_SK)
    .quoteTerms(500_000n, 40n, T0 + 86_400n);

// The borrower waives the proof, so the 150% offer is open at once.
const waived = (terms: Parameters<typeof open>[0]) => open(terms).as(BORROWER_SK).waiveProof().as(LENDER_SK);

const SWEEP = [
  { principal: 1n, interestBps: 0n, installments: 1n },
  { principal: 7n, interestBps: 1n, installments: 3n },
  { principal: 1_000n, interestBps: 1_000n, installments: 3n },
  { principal: 1_001n, interestBps: 999n, installments: 7n },
  { principal: 99_999n, interestBps: 10_000n, installments: 12n },
  { principal: 123_456_789n, interestBps: 375n, installments: 255n },
  { principal: 1n << 40n, interestBps: 10_000n, installments: 13n },
].map((t) => ({ ...t, periodSeconds: 86_400n }));

describe('loanMath — figures the circuit accepts', () => {
  it.each(SWEEP)('collateral, owed and installment for $principal at $interestBps bps over $installments', (terms) => {
    // VERIFIED: 110%.
    const verified = open(terms).as(BORROWER_SK).proveTier(FACTS);
    expect(verified.ledger().tier).toBe(Tier.VERIFIED);
    verified.as(LENDER_SK).underwrite(collateralFor(terms.principal, Tier.VERIFIED));
    verified.as(BORROWER_SK).accept().as(LENDER_SK);

    // Proof waived: 150%.
    waived(terms).underwrite(collateralFor(terms.principal, Tier.STANDARD));

    // Owed and installment, then repay with amountDue until REPAID, in no
    // more than `installments` payments.
    const owed = owedFor(terms);
    verified.disburse(T0, owed, installmentFor(owed, terms.installments)).as(BORROWER_SK);
    let payments = 0n;
    while (verified.ledger().status === LoanStatus.ACTIVE) {
      verified.repay(amountDue(verified.ledger()));
      payments += 1n;
    }
    expect(verified.ledger().status).toBe(LoanStatus.REPAID);
    expect(payments).toBeLessThanOrEqual(terms.installments);
  });

  it('rounding the installment up can finish a small loan early', () => {
    // 5 owed over 4 installments: ceil(5 / 4) = 2, so 2, 2, 1 — three payments.
    const terms = { principal: 5n, interestBps: 0n, installments: 4n, periodSeconds: 86_400n };
    const owed = owedFor(terms);
    const sim = waived(terms)
      .underwrite(collateralFor(terms.principal, Tier.STANDARD))
      .as(BORROWER_SK)
      .accept()
      .as(LENDER_SK)
      .disburse(T0, owed, installmentFor(owed, terms.installments))
      .as(BORROWER_SK);
    sim.repay(2n).repay(2n).repay(1n);
    expect(sim.ledger().status).toBe(LoanStatus.REPAID);
    expect(sim.ledger().paymentsMade).toBe(3n);
  });

  it('collateral one unit off is refused, either way', () => {
    const terms = SWEEP[3]!;
    const c = collateralFor(terms.principal, Tier.STANDARD);
    expect(() => waived(terms).underwrite(c + 1n)).toThrow(/collateral does not match the tier/);
    expect(() => waived(terms).underwrite(c - 1n)).toThrow(/collateral does not match the tier/);
  });
});

describe('loanMath — reading the ledger', () => {
  it('amountDue is the installment, or the remainder when smaller', () => {
    expect(amountDue({ balanceOwed: 1_100n, installmentAmount: 367n })).toBe(367n);
    expect(amountDue({ balanceOwed: 366n, installmentAmount: 367n })).toBe(366n);
  });

  const QUOTE = { thresholdNetWorth: 1n, maxDti: 40n, expiresAt: T0 + 10n };
  const unquoted = { tier: Tier.NONE, tierExpiresAt: 0n, quoted: false, tierProven: false, quote: QUOTE };
  const open_ = { ...unquoted, quoted: true };
  const live = { tier: Tier.VERIFIED, tierExpiresAt: T0 + 10n, quoted: true, tierProven: true, quote: QUOTE };
  const waivedState = { ...open_, tierProven: true };

  it("quoteRefusal gives the contract's words: a live VERIFIED tier, an open proof window, or under 30 minutes", () => {
    expect(quoteRefusal(unquoted, T0 + MIN_QUOTE_SECONDS, T0)).toBeNull();
    expect(quoteRefusal(unquoted, T0 + MIN_QUOTE_SECONDS - 1n, T0)).toBe('quote must hold at least 30 minutes');
    expect(quoteRefusal(live, T0 + 86_400n, T0)).toBe('a verified tier is live until it lapses');
    expect(quoteRefusal(live, T0 + 86_400n, T0 + 10n)).toBeNull();
    expect(quoteRefusal(open_, T0 + 86_400n, T0 + 9n)).toBe('the borrower can prove until the quote lapses');
    expect(quoteRefusal(open_, T0 + 86_400n, T0 + 10n)).toBeNull();
    expect(quoteRefusal(waivedState, T0 + 86_400n, T0)).toBeNull();
  });

  it("underwriteRefusal gives the contract's words: no quote, or an open proof window", () => {
    expect(underwriteRefusal(unquoted, T0)).toBe('quote first');
    expect(underwriteRefusal(open_, T0 + 9n)).toBe('the borrower can prove until the quote lapses');
    expect(underwriteRefusal(open_, T0 + 10n)).toBeNull();
    expect(underwriteRefusal(live, T0)).toBeNull();
    expect(underwriteRefusal(waivedState, T0)).toBeNull();
    expect(proofWindowOpen(open_, T0)).toBe(true);
    expect(proofWaived(waivedState)).toBe(true);
    expect(proofWaived(live)).toBe(false);
  });

  it('underwriteRefusal agrees with the circuit before a quote, inside the window, at its edge, and after an answer', () => {
    const terms = SWEEP[2]!;
    const fresh = () =>
      new LoanSimulator(BORROWER_SK, pubKeyOf(LENDER_SK), terms, commitFacts(FACTS, TEST_SALT), new Uint8Array(32));
    const cases = [
      () => fresh().as(LENDER_SK),
      () => open(terms),
      () => open(terms).at(T0 + 86_400n - 1n),
      () => open(terms).at(T0 + 86_400n),
      () => waived(terms),
    ];
    for (const make of cases) {
      const sim = make();
      const refusal = underwriteRefusal(sim.ledger(), sim.now);
      const c = collateralFor(terms.principal, Tier.STANDARD);
      if (refusal) expect(() => sim.underwrite(c)).toThrow(refusal);
      else expect(sim.underwrite(c).ledger().status).toBe(LoanStatus.OFFERED);
    }
  });

  it('quoteRefusal agrees with the circuit at the 30-minute boundary', () => {
    const terms = SWEEP[2]!;
    const fresh = () =>
      new LoanSimulator(BORROWER_SK, pubKeyOf(LENDER_SK), terms, commitFacts(FACTS, TEST_SALT), new Uint8Array(32)).as(
        LENDER_SK,
      );
    const state = fresh().ledger();
    for (const ttl of [0n, 1n, MIN_QUOTE_SECONDS - 1n, MIN_QUOTE_SECONDS, MIN_QUOTE_SECONDS + 1n]) {
      const refusal = quoteRefusal(state, T0 + ttl, T0);
      if (refusal) expect(() => fresh().quoteTerms(1n, 40n, T0 + ttl)).toThrow(refusal);
      else expect(fresh().quoteTerms(1n, 40n, T0 + ttl).ledger().quoted).toBe(true);
    }
  });

  it('a tier is live strictly before its expiry, and only if VERIFIED', () => {
    expect(tierIsLive({ tier: Tier.VERIFIED, tierExpiresAt: 100n }, 99n)).toBe(true);
    expect(tierIsLive({ tier: Tier.VERIFIED, tierExpiresAt: 100n }, 100n)).toBe(false);
    expect(tierIsLive({ tier: Tier.STANDARD, tierExpiresAt: 100n }, 0n)).toBe(false);
  });

  it('defaultableFrom matches the circuit: due + grace, plus one second', () => {
    const terms = SWEEP[2]!;
    const owed = owedFor(terms);
    const sim = waived(terms)
      .underwrite(collateralFor(terms.principal, Tier.STANDARD))
      .as(BORROWER_SK)
      .accept()
      .as(LENDER_SK)
      .disburse(T0, owed, installmentFor(owed, terms.installments));
    const from = defaultableFrom(sim.ledger());
    expect(() => sim.at(from - 1n).markDefault()).toThrow(/not past its grace period/);
    expect(sim.at(from).markDefault().ledger().status).toBe(LoanStatus.DEFAULTED);
  });
});
