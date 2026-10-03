// Kymider — auditor disclosure of a loan's payment history (Wave 3 preview).
//
// Every case drives the COMPILED Loan contract through real repayments, on
// time and late by block time, then has the borrower open the history from
// the seed and payment log alone, and the auditor check it against the
// simulator's ledger. Then the borrower turns hostile: each way of editing the
// history must fail, with the reason that names what was changed.

import { describe, it, expect, beforeAll } from 'vitest';
import { Tier } from '../../contracts/index.js';
import {
  DisclosureFailure,
  auditDisclosure,
  buildDisclosure,
  bytesToHex,
  foldPayment,
  historyGenesis,
  openHistory,
  parseDisclosure,
  verifyDisclosure,
  type Disclosure,
  type DisclosureCheck,
  type DisclosureFailureKind,
  type OnChainHistory,
} from '../../contracts/audit.js';
import { loanPaymentNonce } from '../../contracts/witnesses.js';
import { collateralFor, installmentFor, owedFor } from '../../client/proof/loanMath.js';
import { LoanSimulator, T0, TEST_SALT, commitFacts, pubKeyOf, skFrom } from './support/simulators.js';

const BORROWER_SK = skFrom(1);
const LENDER_SK = skFrom(2);
const LENDER_PK = pubKeyOf(LENDER_SK);

const SEED_A = new Uint8Array(32).fill(9);
const SEED_B = new Uint8Array(32).fill(10);

const FACTS = { balance: 1_000_000n, debts: 300_000n, income: 1_000_000n };
const DAY = 86_400n;

type Terms = { principal: bigint; interestBps: bigint; installments: bigint; periodSeconds: bigint };

// 1,000 principal, 10% flat: 1,100 owed as 367, 367, 366, a day apart.
const TERMS: Terms = { principal: 1_000n, interestBps: 1_000n, installments: 3n, periodSeconds: DAY };

/** A disbursed loan at T0, with a verified tier. */
const disbursedLoan = (seed: Uint8Array, terms: Terms = TERMS): LoanSimulator => {
  const owed = owedFor(terms);
  return new LoanSimulator(BORROWER_SK, LENDER_PK, terms, commitFacts(FACTS, TEST_SALT), seed)
    .as(LENDER_SK)
    .quoteTerms(500_000n, 40n, T0 + 7n * DAY)
    .as(BORROWER_SK)
    .proveTier(FACTS)
    .as(LENDER_SK)
    .underwrite(collateralFor(terms.principal, Tier.VERIFIED))
    .as(BORROWER_SK)
    .accept()
    .as(LENDER_SK)
    .disburse(T0, owed, installmentFor(owed, terms.installments))
    .as(BORROWER_SK);
};

/**
 * Make payment `k` (1-based) on time or late, by block time. Installment k
 * falls due at T0 + k * period, whatever happened before.
 */
const pay = (sim: LoanSimulator, onTime: boolean, terms: Terms = TERMS): LoanSimulator => {
  const k = sim.ledger().paymentsMade + 1n;
  const due = T0 + k * terms.periodSeconds;
  const state = sim.ledger();
  const amount = state.balanceOwed < state.installmentAmount ? state.balanceOwed : state.installmentAmount;
  return sim.at(onTime ? due - 1n : due + 1n).repay(amount);
};

/** What the auditor reads off the chain for one loan. */
const onChain = (sim: LoanSimulator): OnChainHistory => {
  const l = sim.ledger();
  return { historyCommitment: l.historyCommitment, paymentsMade: l.paymentsMade, latePayments: l.latePayments };
};

const disclose = (sim: LoanSimulator): Disclosure =>
  buildDisclosure(sim.address, sim.historySeed(), sim.paymentLog());

const copy = (d: Disclosure): Disclosure => JSON.parse(JSON.stringify(d)) as Disclosure;

const expectFailure = (check: { ok: boolean; reason?: string }, kind: DisclosureFailureKind): void => {
  expect(check.ok).toBe(false);
  if (!check.ok) expect(check.reason?.startsWith(DisclosureFailure[kind] + ': ')).toBe(true);
};

describe('audit — the chain, rebuilt off-chain', () => {
  it('the genesis head is what the Loan constructor writes', () => {
    const sim = new LoanSimulator(BORROWER_SK, LENDER_PK, TERMS, commitFacts(FACTS, TEST_SALT), SEED_A);
    expect(bytesToHex(historyGenesis())).toBe(bytesToHex(sim.ledger().historyCommitment));
  });

  it('folding each logged payment with its derived nonce lands on the on-chain head', () => {
    const sim = pay(pay(pay(disbursedLoan(SEED_A), true), false), true);
    const head = sim
      .paymentLog()
      .reduce((h, p) => foldPayment(h, p, loanPaymentNonce(SEED_A, h)), historyGenesis());
    expect(bytesToHex(head)).toBe(bytesToHex(sim.ledger().historyCommitment));
  });

  it("the simulator's payment log is the contract's own verdicts", () => {
    const sim = pay(pay(pay(disbursedLoan(SEED_A), true), false), true);
    expect(sim.paymentLog()).toEqual([
      { amount: 367n, onTime: true },
      { amount: 367n, onTime: false },
      { amount: 366n, onTime: true },
    ]);
    expect(sim.ledger().latePayments).toBe(1n);
  });

  it('refuses to fold an amount outside Uint<64> or a short nonce', () => {
    const g = historyGenesis();
    expect(() => foldPayment(g, { amount: -1n, onTime: true }, new Uint8Array(32))).toThrow(RangeError);
    expect(() => foldPayment(g, { amount: 1n << 64n, onTime: true }, new Uint8Array(32))).toThrow(RangeError);
    expect(() => foldPayment(g, { amount: 1n, onTime: true }, new Uint8Array(31))).toThrow(RangeError);
  });

  it('refuses to build a disclosure from a malformed address or seed', () => {
    expect(() => buildDisclosure('abc', SEED_A, [])).toThrow(RangeError);
    expect(() => buildDisclosure('ab'.repeat(32), new Uint8Array(16), [])).toThrow(RangeError);
    // An address typed with 0x or in capitals is written in the canonical form.
    expect(buildDisclosure('0x' + 'AB'.repeat(32), SEED_A, []).loan).toBe('ab'.repeat(32));
  });
});

describe('audit — an honest disclosure verifies', () => {
  let sim: LoanSimulator;
  let d: Disclosure;

  beforeAll(() => {
    sim = pay(pay(pay(disbursedLoan(SEED_A), true), false), true);
    d = disclose(sim);
  });

  it('opens a repaid loan with one late payment', () => {
    expect(verifyDisclosure(d, onChain(sim))).toEqual({ ok: true, payments: 3, late: 1, total: 1_100n });
  });

  it('verifies through the lookup entry point, which asks for the loan the disclosure names', () => {
    const asked: string[] = [];
    const check = auditDisclosure(d, (loan) => {
      asked.push(loan);
      return loan === sim.address ? onChain(sim) : null;
    });
    expect(check.ok).toBe(true);
    expect(asked).toEqual([sim.address]);
  });

  it('verifies when the state is passed with its own address', () => {
    expect(verifyDisclosure(d, { ...onChain(sim), loan: '0x' + sim.address.toUpperCase() }).ok).toBe(true);
  });

  it('survives a JSON round trip (what the borrower actually sends)', () => {
    const parsed = parseDisclosure(JSON.stringify(d));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(verifyDisclosure(parsed.disclosure, onChain(sim)).ok).toBe(true);
  });

  it('opens a loan with no payments yet, and one part-way through', () => {
    const fresh = disbursedLoan(SEED_A);
    expect(verifyDisclosure(disclose(fresh), onChain(fresh))).toEqual({ ok: true, payments: 0, late: 0, total: 0n });
    const partial = pay(disbursedLoan(SEED_A), false);
    expect(verifyDisclosure(disclose(partial), onChain(partial))).toEqual({
      ok: true,
      payments: 1,
      late: 1,
      total: 367n,
    });
  });

  it('replays the running chain head for display, ending on the on-chain head', () => {
    const rows = openHistory(d)!;
    expect(rows.map((r) => [r.index, r.amount, r.onTime])).toEqual([
      [1, 367n, true],
      [2, 367n, false],
      [3, 366n, true],
    ]);
    expect(rows[2]!.head).toBe(bytesToHex(sim.ledger().historyCommitment));
    expect(openHistory({ ...d, version: 2 } as unknown as Disclosure)).toBeNull();
  });
});

describe('audit — a hostile borrower', () => {
  let sim: LoanSimulator;
  let d: Disclosure;

  beforeAll(() => {
    // on time, LATE, on time: the late one is what a borrower would hide.
    sim = pay(pay(pay(disbursedLoan(SEED_A), true), false), true);
    d = disclose(sim);
  });

  const check = (t: Disclosure): DisclosureCheck => verifyDisclosure(t, onChain(sim));

  it('changes an amount', () => {
    const t = copy(d);
    t.payments[1]!.amount = '366';
    expectFailure(check(t), 'head');
  });

  it('swaps two amounts, keeping the total', () => {
    const t = copy(d);
    t.payments[1]!.amount = '366';
    t.payments[2]!.amount = '367';
    expectFailure(check(t), 'head');
  });

  it('flips the late payment to on time', () => {
    const t = copy(d);
    t.payments[1]!.onTime = true;
    expectFailure(check(t), 'late');
  });

  it('moves the late flag to another payment, keeping the late count', () => {
    const t = copy(d);
    t.payments[1]!.onTime = true;
    t.payments[2]!.onTime = false;
    expectFailure(check(t), 'head');
  });

  it('drops the late payment', () => {
    const t = copy(d);
    t.payments.splice(1, 1);
    expectFailure(check(t), 'count');
  });

  it('truncates the history', () => {
    const t = copy(d);
    t.payments.pop();
    expectFailure(check(t), 'count');
  });

  it('reorders the payments', () => {
    const t = copy(d);
    t.payments.reverse();
    expectFailure(check(t), 'head');
  });

  it('reorders the payments and re-derives every nonce from the real seed', () => {
    // Even the seed holder cannot make a different order open the same head.
    const log = sim.paymentLog();
    const t = buildDisclosure(sim.address, SEED_A, [log[1]!, log[0]!, log[2]!]);
    expectFailure(check(t), 'head');
  });

  it('appends an extra on-time payment', () => {
    const t = copy(d);
    t.payments.push({ amount: '1', onTime: true, nonce: 'aa'.repeat(32) });
    expectFailure(check(t), 'count');
  });

  it('pads the front of the history', () => {
    const t = copy(d);
    t.payments.unshift({ ...t.payments[0]! });
    expectFailure(check(t), 'count');
  });

  it('alters a nonce', () => {
    const t = copy(d);
    const n = t.payments[0]!.nonce;
    t.payments[0]!.nonce = (n[0] === '0' ? '1' : '0') + n.slice(1);
    expectFailure(check(t), 'head');
  });

  it('swaps two nonces', () => {
    const t = copy(d);
    [t.payments[0]!.nonce, t.payments[2]!.nonce] = [t.payments[2]!.nonce, t.payments[0]!.nonce];
    expectFailure(check(t), 'head');
  });

  it('builds the openings from a different seed', () => {
    expectFailure(check(buildDisclosure(sim.address, SEED_B, sim.paymentLog())), 'head');
  });

  it('hands over an old disclosure after another payment was made', () => {
    const live = pay(pay(disbursedLoan(SEED_A), true), false);
    const stale = disclose(live);
    pay(live, true);
    expectFailure(verifyDisclosure(stale, onChain(live)), 'count');
  });

  it('claims a different on-chain count of late payments than the chain has', () => {
    expectFailure(verifyDisclosure(d, { ...onChain(sim), latePayments: 0n }), 'late');
  });
});

describe('audit — binding to one loan', () => {
  // Loan A: on time, LATE, on time. Loan B, the same borrower and terms with
  // a different seed: all on time. A borrower might try to pass B's clean
  // record off as A's, or check A's openings against B's state.
  let a: LoanSimulator;
  let b: LoanSimulator;

  beforeAll(() => {
    a = pay(pay(pay(disbursedLoan(SEED_A), true), false), true);
    b = pay(pay(pay(disbursedLoan(SEED_B), true), true), true);
  });

  it("refuses A's disclosure checked against B's state named as B", () => {
    expectFailure(verifyDisclosure(disclose(a), { ...onChain(b), loan: b.address }), 'wrongLoan');
  });

  it("refuses A's disclosure checked against B's bare state", () => {
    expectFailure(verifyDisclosure(disclose(a), onChain(b)), 'late');
  });

  it("refuses B's clean history relabelled as loan A, via the lookup", () => {
    const relabelled = { ...disclose(b), loan: a.address };
    const lookup = (loan: string): OnChainHistory | null =>
      loan === a.address ? onChain(a) : loan === b.address ? onChain(b) : null;
    expectFailure(auditDisclosure(relabelled, lookup), 'late');
    expect(auditDisclosure(disclose(a), lookup).ok).toBe(true);
    expect(auditDisclosure(disclose(b), lookup).ok).toBe(true);
  });

  it('refuses a relabelled history with matching counts on the head', () => {
    // C: same counts as A (one late), but the late payment is the first.
    const c = pay(pay(pay(disbursedLoan(SEED_B), false), true), true);
    const relabelled = { ...disclose(c), loan: a.address };
    expectFailure(auditDisclosure(relabelled, (l) => (l === a.address ? onChain(a) : null)), 'head');
  });

  it('reports a loan the auditor cannot find', () => {
    expectFailure(auditDisclosure(disclose(a), () => null), 'unknownLoan');
  });

  it('a relabelled disclosure can only ever open an identical history', () => {
    // The loan address is not in the chain, so with the SAME seed and the SAME
    // payments two loans share a head and either disclosure opens both. That
    // is not a false statement: the openings are exactly that loan's history.
    const twin = pay(pay(pay(disbursedLoan(SEED_A), true), false), true);
    expect(bytesToHex(twin.ledger().historyCommitment)).toBe(bytesToHex(a.ledger().historyCommitment));
    const relabelled = { ...disclose(a), loan: twin.address };
    expect(auditDisclosure(relabelled, () => onChain(twin))).toEqual(verifyDisclosure(disclose(twin), onChain(twin)));
  });
});

describe('audit — malformed disclosures', () => {
  let sim: LoanSimulator;
  let d: Disclosure;

  beforeAll(() => {
    sim = pay(pay(disbursedLoan(SEED_A), true), false);
    d = disclose(sim);
  });

  const withRaw = (mutate: (raw: Record<string, unknown>) => void): DisclosureCheck => {
    const raw = JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
    mutate(raw);
    return verifyDisclosure(raw as unknown as Disclosure, onChain(sim));
  };
  const withPayment = (field: string, value: unknown): DisclosureCheck =>
    withRaw((raw) => {
      (raw['payments'] as Record<string, unknown>[])[0]![field] = value;
    });

  it('an unknown or missing version', () => {
    expectFailure(withRaw((r) => (r['version'] = 2)), 'version');
    expectFailure(withRaw((r) => (r['version'] = '1')), 'version');
    expectFailure(withRaw((r) => delete r['version']), 'version');
  });

  it('a loan address that is not 64 lowercase hex', () => {
    expectFailure(withRaw((r) => (r['loan'] = '0x' + sim.address)), 'malformed');
    expectFailure(withRaw((r) => (r['loan'] = sim.address.toUpperCase())), 'malformed');
    expectFailure(withRaw((r) => (r['loan'] = sim.address.slice(2))), 'malformed');
    expectFailure(withRaw((r) => (r['loan'] = 42)), 'malformed');
  });

  it('payments that are not a list of objects', () => {
    expectFailure(withRaw((r) => (r['payments'] = {})), 'malformed');
    expectFailure(withRaw((r) => delete r['payments']), 'malformed');
    expectFailure(withRaw((r) => ((r['payments'] as unknown[])[0] = null)), 'malformed');
  });

  it('amounts that are not canonical non-negative integers within Uint<64>', () => {
    for (const bad of ['-367', '367.0', '3.67e2', '0367', ' 367', '', '0x16f', '18446744073709551616']) {
      expectFailure(withPayment('amount', bad), 'malformed');
    }
    expectFailure(withPayment('amount', 367), 'malformed');
    // The largest Uint<64> is well-formed; it just is not what was paid.
    expectFailure(withPayment('amount', '18446744073709551615'), 'head');
  });

  it('an on-time flag that is not a boolean', () => {
    expectFailure(withPayment('onTime', 'true'), 'malformed');
    expectFailure(withPayment('onTime', 1), 'malformed');
    expectFailure(withPayment('onTime', null), 'malformed');
  });

  it('a nonce that is not 32 bytes of lowercase hex', () => {
    const n = d.payments[0]!.nonce;
    expectFailure(withPayment('nonce', n.slice(2)), 'malformed');
    expectFailure(withPayment('nonce', n + '00'), 'malformed');
    expectFailure(withPayment('nonce', n.toUpperCase()), 'malformed');
    expectFailure(withPayment('nonce', 'zz' + n.slice(2)), 'malformed');
  });

  it('fields the format does not have', () => {
    expectFailure(withRaw((r) => (r['note'] = 'all on time')), 'malformed');
    expectFailure(withPayment('late', false), 'malformed');
  });

  it('text that is not JSON, or JSON that is not a disclosure', () => {
    expectFailure(parseDisclosure('{"version":1,'), 'malformed');
    expectFailure(parseDisclosure('[]'), 'malformed');
    expectFailure(parseDisclosure('null'), 'malformed');
    expectFailure(parseDisclosure(JSON.stringify({ ...d, version: 3 })), 'version');
  });

  it('on-chain state that is not a 32-byte head', () => {
    expectFailure(verifyDisclosure(d, { ...onChain(sim), historyCommitment: new Uint8Array(31) }), 'onChain');
  });
});

describe('audit — random payment schedules', () => {
  // A small deterministic PRNG, so a failure reproduces.
  let state = 0x2545f491;
  const rand = (n: number): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % n;
  };

  type Tamper = { name: string; kind: DisclosureFailureKind; apply: (d: Disclosure) => boolean };
  const tampers: Tamper[] = [
    {
      name: 'amount',
      kind: 'head',
      apply: (d) => {
        const p = d.payments[rand(d.payments.length)]!;
        p.amount = (BigInt(p.amount) + 1n).toString();
        return true;
      },
    },
    {
      name: 'flip',
      kind: 'late',
      apply: (d) => {
        const p = d.payments[rand(d.payments.length)]!;
        p.onTime = !p.onTime;
        return true;
      },
    },
    {
      name: 'drop',
      kind: 'count',
      apply: (d) => {
        d.payments.splice(rand(d.payments.length), 1);
        return true;
      },
    },
    {
      name: 'append',
      kind: 'count',
      apply: (d) => {
        d.payments.push({ ...d.payments[rand(d.payments.length)]! });
        return true;
      },
    },
    {
      name: 'nonce',
      kind: 'head',
      apply: (d) => {
        const p = d.payments[rand(d.payments.length)]!;
        p.nonce = (p.nonce[63] === 'f' ? p.nonce.slice(0, 63) + '0' : p.nonce.slice(0, 63) + 'f');
        return true;
      },
    },
    {
      name: 'swap',
      kind: 'head',
      apply: (d) => {
        // Swap two payments that differ, or there is nothing to reorder.
        for (let i = 0; i + 1 < d.payments.length; i++) {
          const [x, y] = [d.payments[i]!, d.payments[i + 1]!];
          if (x.amount !== y.amount || x.onTime !== y.onTime || x.nonce !== y.nonce) {
            [d.payments[i], d.payments[i + 1]] = [y, x];
            return true;
          }
        }
        return false;
      },
    },
  ];

  it('every schedule verifies, and every single tamper is caught for the right reason', () => {
    let tampered = 0;
    for (let round = 0; round < 24; round++) {
      const terms: Terms = {
        principal: BigInt(100 + rand(100_000)),
        interestBps: BigInt(rand(2_000)),
        installments: BigInt(1 + rand(8)),
        periodSeconds: 3_600n + BigInt(rand(30)) * DAY,
      };
      const seed = new Uint8Array(32).map(() => rand(256));
      const sim = disbursedLoan(seed, terms);
      // Pay all of it, or stop part-way.
      const stopAfter = rand(2) === 0 ? Number(terms.installments) : rand(Number(terms.installments) + 1);
      for (let k = 0; k < stopAfter && sim.ledger().balanceOwed > 0n; k++) pay(sim, rand(3) !== 0, terms);

      const d = disclose(sim);
      const ok = verifyDisclosure(d, onChain(sim));
      const log = sim.paymentLog();
      expect(ok).toEqual({
        ok: true,
        payments: log.length,
        late: log.filter((p) => !p.onTime).length,
        total: log.reduce((s, p) => s + p.amount, 0n),
      });

      if (d.payments.length === 0) continue;
      for (const t of tampers) {
        const bad = copy(d);
        if (!t.apply(bad)) continue;
        expectFailure(verifyDisclosure(bad, onChain(sim)), t.kind);
        tampered++;
      }
    }
    expect(tampered).toBeGreaterThan(80);
  });
});
