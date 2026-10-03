// Kymider — the console's simulated loan desk, driven from Node.
//
// SimulatedLoanDesk runs the REAL compiled Loan and LoanDirectory in the
// browser. These tests drive the same file from the repository root: the
// seeded demo world, the borrower and lender flows at both collateral tiers,
// refusals surfacing as the contract's own text, lateness and default by the
// desk's block clock, and the two-repaid-loans history proof.

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SimulatedKymiderClient } from '../../frontend/src/lib/simulatedClient.js';
import { SimulatedLoanDesk } from '../../frontend/src/lib/simulatedLoanDesk.js';
import { DAY, type LoanTerms, type LoanView } from '../../frontend/src/lib/loans.js';
import * as audit from '../../contracts/audit.js';

const TERMS: LoanTerms = {
  principal: 100_000n,
  interestBps: 1_000n,
  installments: 3n,
  periodSeconds: 30n * DAY,
};
// The browser's borrower: 1,000,000 balance, 300,000 debts, 1,000,000 income.
const PASSING = { thresholdNetWorth: 500_000n, maxDti: 40n, ttlSeconds: 7n * DAY };
const FAILING = { thresholdNetWorth: 900_000n, maxDti: 40n, ttlSeconds: 7n * DAY };

let client: SimulatedKymiderClient;
let desk: SimulatedLoanDesk;

/** The lender id the console acts as; `apply` must name it for the lender flow. */
const meId = () => client.me().id;

/** The borrower accepts the figure the screen shows: the offer on the ledger. */
const acceptShown = (address: string) => desk.accept(address, desk.loan(address)!.offeredCollateral);

const fresh = () => {
  client = new SimulatedKymiderClient();
  desk = new SimulatedLoanDesk(client);
};

describe('SimulatedLoanDesk — the seeded world', () => {
  // Read-only checks share one desk; building it runs ~70 circuit calls.
  beforeAll(fresh);

  it('opens at the wall clock', () => {
    const wall = BigInt(Math.floor(Date.now() / 1000));
    expect(desk.now() <= wall && desk.now() >= wall - 5n).toBe(true);
  });

  it('gives the borrower two repaid loans from two lenders, recorded in the directory', () => {
    const mine = desk.myLoans();
    expect(mine).toHaveLength(2);
    expect(mine.every((l) => l.status === 'REPAID' && l.recorded && l.listing === 'REPAID')).toBe(true);
    expect(mine.every((l) => l.factsBound && l.tier === 'VERIFIED')).toBe(true);
    expect(mine.every((l) => l.collateralRequired === l.collateralIfVerified)).toBe(true);
    expect(new Set(mine.map((l) => l.lender.id))).toEqual(new Set(['harbor', 'atlas']));
    // One late payment, on the Atlas loan.
    expect(mine.map((l) => l.latePayments).reduce((a, b) => a + b)).toBe(1n);
    const atlas = mine.find((l) => l.lender.id === 'atlas')!;
    expect(atlas.latePayments).toBe(1n);
    expect(desk.paymentLog(atlas.address).map((p) => p.onTime)).toEqual([true, false, true, true]);
    expect(desk.paymentLog(atlas.address).every((p) => p.at < desk.now())).toBe(true);

    const records = desk.repaidRecords();
    expect(records).toHaveLength(2);
    expect(new Set(records.map((r) => r.loan))).toEqual(new Set(mine.map((l) => l.address)));
  });

  it("gives the lender persona other borrowers' loans in every state", () => {
    const apps = desk.applications();
    const others = apps.filter((l) => !desk.myLoans().some((m) => m.address === l.address));
    const states = others.map((l) => l.status).sort();
    expect(states).toEqual(['ACTIVE', 'APPLIED', 'APPLIED', 'DEFAULTED', 'OFFERED', 'REPAID']);
    expect(others.every((l) => l.lender.id === meId() && l.factsBound)).toBe(true);

    const awaitingQuote = others.find((l) => l.status === 'APPLIED' && l.quote === null);
    expect(awaitingQuote).toBeDefined();
    // Someone else listed the same address under their own key: the console
    // counts it and ignores it; the loan's own listing names its own parties.
    expect(awaitingQuote!.strayListings).toBe(1);
    expect(awaitingQuote!.listingMatchesLoan).toBe(true);
    expect(awaitingQuote!.listing).toBe('OPEN');
    expect(others.filter((l) => l !== awaitingQuote).every((l) => l.strayListings === 0)).toBe(true);
    const ready = others.find((l) => l.status === 'APPLIED' && l.quote !== null)!;
    expect(ready.tier).toBe('VERIFIED');
    expect(ready.tierLive).toBe(true);

    // Offered at 110%, waiting on the borrower: nothing binding yet.
    const offered = others.find((l) => l.status === 'OFFERED')!;
    expect(offered.offeredTier).toBe('VERIFIED');
    expect(offered.offeredCollateral).toBe(offered.collateralIfVerified);
    expect(offered.collateralRequired).toBe(0n);
    expect(offered.listing).toBe('OPEN');

    const active = others.find((l) => l.status === 'ACTIVE')!;
    expect(active.tier).toBe('VERIFIED');
    expect(active.listing).toBe('ACTIVE');
    expect(active.paymentsMade).toBe(2n);
    expect(active.nextDueAt > desk.now()).toBe(true);
    expect(active.amountDue).toBe(active.installmentAmount);
    expect(active.defaultableFrom).toBe(active.nextDueAt + 3n * DAY + 1n);

    // Repaid at 150%: the borrower waived the proof, then accepted the offer.
    const repaid = others.find((l) => l.status === 'REPAID')!;
    expect(repaid.tier).toBe('STANDARD');
    expect(repaid.tierProven).toBe(true);
    expect(repaid.collateralRequired).toBe(repaid.collateralIfStandard);
    expect(repaid.recorded).toBe(false);

    // The default is the Loan's: the directory never records one, so the
    // console reads it from the Loan.
    const defaulted = others.find((l) => l.status === 'DEFAULTED')!;
    expect(defaulted.tier).toBe('STANDARD');
    expect(defaulted.listing).toBe('DEFAULTED');
    expect(defaulted.listingFromLoan).toBe(true);
    expect(defaulted.paymentsMade).toBe(1n);

    // A lender sees nobody's private payment log.
    expect(desk.paymentLog(active.address)).toEqual([]);
  });

  it('lists newest first', () => {
    const opened = desk.applications().map((l) => l.address);
    expect(opened[0]).toBe(desk.applications().find((l) => l.status === 'APPLIED' && l.quote === null)!.address);
  });

  // Measured at about 1 s for the desk (0.35 s more for the Wave 1 client) on
  // a cloud VM. The bound is loose so a loaded CI runner does not flake; it is
  // here to catch a seeding change that multiplies the cost.
  it('builds the seeded world quickly', () => {
    const c = new SimulatedKymiderClient();
    const t = performance.now();
    new SimulatedLoanDesk(c);
    expect(performance.now() - t).toBeLessThan(4_000);
  });
});

describe('SimulatedLoanDesk — borrower and lender flows', () => {
  beforeEach(fresh);

  const runToRepaid = async (address: string): Promise<LoanView> => {
    let v = desk.loan(address)!;
    while (v.status === 'ACTIVE') {
      await desk.repay(address);
      v = desk.loan(address)!;
    }
    return v;
  };

  it('a proven borrower posts 110% and repays on time', async () => {
    const address = await desk.apply(meId(), TERMS);
    let v = desk.loan(address)!;
    expect(v.status).toBe('APPLIED');
    expect(v.listing).toBe('OPEN');
    expect(v.factsBound).toBe(true);
    expect(desk.myLoans()[0].address).toBe(address);
    expect(desk.applications()[0].address).toBe(address);

    await desk.quote(address, PASSING);
    expect(desk.loan(address)!.quote!.expiresAt).toBe(desk.now() + 7n * DAY);
    expect(await desk.proveTier(address)).toBe('VERIFIED');
    expect(await desk.underwrite(address)).toEqual({ tier: 'VERIFIED', collateral: 110_000n });
    v = desk.loan(address)!;
    expect(v.status).toBe('OFFERED');
    expect(v.offeredCollateral).toBe(110_000n);
    expect(v.collateralRequired).toBe(0n);
    // Nothing binds until the borrower accepts: the lender cannot disburse.
    await expect(desk.disburse(address)).rejects.toThrow(/^loan is not active$/);

    // The borrower names the figure: a stale or edited one is refused.
    await expect(desk.accept(address, 150_000n)).rejects.toThrow(/^offer changed$/);
    expect(desk.loan(address)!.status).toBe('OFFERED');
    expect(await desk.accept(address, 110_000n)).toEqual({ tier: 'VERIFIED', collateral: 110_000n });
    v = desk.loan(address)!;
    expect(v.status).toBe('ACTIVE');
    expect(v.collateralRequired).toBe(110_000n);
    expect(v.listing).toBe('OPEN');

    await desk.disburse(address);
    v = desk.loan(address)!;
    expect(v.listing).toBe('ACTIVE');
    expect(v.balanceOwed).toBe(110_000n);
    expect(v.amountDue).toBe(36_667n);
    expect(v.nextDueAt).toBe(desk.now() + 30n * DAY);

    expect(await desk.repay(address)).toBe(36_667n);
    desk.advanceTime(30n * DAY);
    await desk.repay(address);
    desk.advanceTime(30n * DAY);
    expect(await desk.repay(address)).toBe(36_666n);
    v = desk.loan(address)!;
    expect(v.status).toBe('REPAID');
    expect(v.latePayments).toBe(0n);
    expect(desk.paymentLog(address).map((p) => [p.index, p.amount, p.onTime])).toEqual([
      [1, 36_667n, true],
      [2, 36_667n, true],
      [3, 36_666n, true],
    ]);

    await desk.recordRepaid(address);
    expect(desk.loan(address)!.recorded).toBe(true);
    expect(desk.repaidRecords()).toHaveLength(3);
  });

  it('a borrower whose facts fall short is underwritten STANDARD at 150%', async () => {
    const address = await desk.apply(meId(), TERMS);
    await desk.quote(address, FAILING);
    expect(await desk.proveTier(address)).toBe('STANDARD');
    expect(await desk.underwrite(address)).toEqual({ tier: 'STANDARD', collateral: 150_000n });
    await acceptShown(address);
    await desk.disburse(address);
    expect((await runToRepaid(address)).status).toBe('REPAID');
  });

  it('a VERIFIED tier that lapsed before underwriting falls back to 150%', async () => {
    const address = await desk.apply(meId(), TERMS);
    await desk.quote(address, { ...PASSING, ttlSeconds: DAY });
    await desk.proveTier(address);
    desk.advanceTime(DAY);
    expect(desk.loan(address)!.tierLive).toBe(false);
    expect(await desk.underwrite(address)).toEqual({ tier: 'STANDARD', collateral: 150_000n });
  });

  it("surfaces a refusal as the contract's own words", async () => {
    const address = await desk.apply(meId(), TERMS);
    const err = (await desk.proveTier(address).then(
      () => null,
      (e: unknown) => e,
    )) as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('the lender has not quoted yet');
    expect((err.cause as Error).message).toBe('failed assert: the lender has not quoted yet');

    await expect(desk.apply(meId(), { ...TERMS, principal: 0n })).rejects.toThrow(
      /^principal must be non-zero$/,
    );
    // A lender acts only on loans naming it.
    const other = desk.myLoans().find((l) => l.lender.id !== meId())!;
    await expect(desk.recordRepaid(other.address)).rejects.toThrow(
      /^only the loan's lender may record a repayment$/,
    );
    // The borrower cannot repay someone else's loan.
    const theirs = desk.applications().find((l) => l.status === 'ACTIVE' && !desk.myLoans().some((m) => m.address === l.address))!;
    await expect(desk.repay(theirs.address)).rejects.toThrow(/^only the borrower may repay$/);
  });

  it('refuses 150% from a VERIFIED borrower and leaves the loan untouched', async () => {
    const address = await desk.apply(meId(), TERMS);
    await desk.quote(address, PASSING);
    await desk.proveTier(address);
    const before = desk.loan(address)!;
    await expect(desk.underwriteAt(address, 150_000n)).rejects.toThrow(
      /^collateral does not match the tier$/,
    );
    const after = desk.loan(address)!;
    expect(after.status).toBe('APPLIED');
    expect(after.listing).toBe('OPEN');
    expect(after).toEqual(before);
    // The exact figure for the tier is taken, as an offer the borrower accepts.
    await desk.underwriteAt(address, 110_000n);
    expect(desk.loan(address)!.status).toBe('OFFERED');
    await acceptShown(address);
    expect(desk.loan(address)!.status).toBe('ACTIVE');
    expect(desk.loan(address)!.collateralRequired).toBe(110_000n);
  });

  it('refuses a re-quote that would wipe a live VERIFIED tier, and a quote under 30 minutes', async () => {
    const address = await desk.apply(meId(), TERMS);
    await expect(desk.quote(address, { ...PASSING, ttlSeconds: 1_799n })).rejects.toThrow(
      /^quote must hold at least 30 minutes$/,
    );
    await desk.quote(address, PASSING);
    await desk.proveTier(address);
    const before = desk.loan(address)!;
    await expect(desk.quote(address, PASSING)).rejects.toThrow(/^a verified tier is live until it lapses$/);
    expect(desk.loan(address)).toEqual(before);
    await expect(desk.underwriteAt(address, 150_000n)).rejects.toThrow(/^collateral does not match the tier$/);
  });

  it('no 150% offer while the borrower can prove; the borrower can decline an offer; the lender may offer again', async () => {
    const address = await desk.apply(meId(), TERMS);
    // No offer before a quote.
    await expect(desk.underwrite(address)).rejects.toThrow(/^quote first$/);
    await desk.quote(address, PASSING);
    expect(desk.loan(address)!.proofWindowOpen).toBe(true);
    // The lender tries to get in ahead of the proof: refused, nothing written.
    const before = desk.loan(address)!;
    await expect(desk.underwrite(address)).rejects.toThrow(/^the borrower can prove until the quote lapses$/);
    await expect(desk.underwriteAt(address, 150_000n)).rejects.toThrow(
      /^the borrower can prove until the quote lapses$/,
    );
    await expect(desk.quote(address, FAILING)).rejects.toThrow(/^the borrower can prove until the quote lapses$/);
    expect(desk.loan(address)).toEqual(before);
    expect(await desk.proveTier(address)).toBe('VERIFIED');
    expect(desk.loan(address)!.proofWindowOpen).toBe(false);
    expect(await desk.underwrite(address)).toEqual({ tier: 'VERIFIED', collateral: 110_000n });
    await desk.declineOffer(address);
    let v = desk.loan(address)!;
    expect(v.status).toBe('APPLIED');
    expect(v.offeredCollateral).toBe(0n);
    expect(await desk.underwrite(address)).toEqual({ tier: 'VERIFIED', collateral: 110_000n });
    await acceptShown(address);
    v = desk.loan(address)!;
    expect(v.status).toBe('ACTIVE');
    expect(v.collateralRequired).toBe(110_000n);
  });

  it("refuses this browser's acceptance on another borrower's offer", async () => {
    const offered = desk.applications().find((l) => l.status === 'OFFERED')!;
    await expect(acceptShown(offered.address)).rejects.toThrow(/^only the borrower may accept an offer$/);
    await expect(desk.declineOffer(offered.address)).rejects.toThrow(/^only the borrower may decline an offer$/);
    expect(desk.loan(offered.address)!.status).toBe('OFFERED');
  });

  it('the lender console follows the persona the lender rail picks', async () => {
    const address = await desk.apply('atlas', TERMS);
    expect(desk.applications().some((l) => l.address === address)).toBe(false);
    await expect(desk.quote(address, PASSING)).rejects.toThrow(/^only the lender may quote$/);

    let ticks = 0;
    const off = desk.subscribe(() => ticks++);
    client.setMe('atlas');
    off();
    expect(ticks).toBe(1);
    expect(client.me().id).toBe('atlas');
    expect(desk.applications().some((l) => l.address === address)).toBe(true);
    await desk.quote(address, PASSING);
    await desk.proveTier(address);
    await desk.underwrite(address);
    await acceptShown(address);
    await desk.disburse(address);
    expect(desk.loan(address)!.status).toBe('ACTIVE');
    // Harbor's seeded book is not Atlas's.
    expect(desk.applications().every((l) => l.lender.id === 'atlas')).toBe(true);

    client.setMe('harbor');
    expect(desk.applications().some((l) => l.address === address)).toBe(false);
    expect(() => client.setMe('nobody')).toThrow(/no such lender/);
  });

  it('a refused repayment leaves the ledger and the payment log unchanged', async () => {
    const address = await desk.apply(meId(), TERMS);
    const before = desk.loan(address)!;
    await expect(desk.repay(address)).rejects.toThrow(/^loan is not active$/);
    expect(desk.loan(address)).toEqual(before);
    expect(desk.paymentLog(address)).toEqual([]);
  });

  it('a payment after the due date is late, by the desk clock', async () => {
    const address = await desk.apply(meId(), TERMS);
    await desk.quote(address, PASSING);
    await desk.proveTier(address);
    await desk.underwrite(address);
    await acceptShown(address);
    await desk.disburse(address);
    const due = desk.loan(address)!.nextDueAt;
    desk.advanceTime(due - desk.now()); // exactly on the due date: on time
    await desk.repay(address);
    desk.advanceTime(30n * DAY + 1n); // one second past the second due date
    await desk.repay(address);
    const v = desk.loan(address)!;
    expect(v.paymentsMade).toBe(2n);
    expect(v.latePayments).toBe(1n);
    expect(desk.paymentLog(address).map((p) => p.onTime)).toEqual([true, false]);
  });

  it('a borrower who waives the proof is offered 150% at once, revealing nothing', async () => {
    const address = await desk.apply(meId(), TERMS);
    await desk.quote(address, PASSING);
    await desk.waiveProof(address);
    let v = desk.loan(address)!;
    expect(v).toMatchObject({ tier: 'NONE', tierProven: true, proofWaived: true, proofWindowOpen: false });
    await expect(desk.proveTier(address)).rejects.toThrow(/^already proven against this quote$/);
    await expect(desk.waiveProof(address)).rejects.toThrow(/^already proven against this quote$/);
    expect(await desk.underwrite(address)).toEqual({ tier: 'STANDARD', collateral: 150_000n });
    expect(await acceptShown(address)).toEqual({ tier: 'STANDARD', collateral: 150_000n });
    v = desk.loan(address)!;
    expect(v.status).toBe('ACTIVE');
  });

  it("refuses this browser's waiver on another borrower's loan", async () => {
    const ready = desk.applications().find((l) => l.status === 'APPLIED' && l.quote === null)!;
    await desk.quote(ready.address, PASSING);
    await expect(desk.waiveProof(ready.address)).rejects.toThrow(/^only the borrower may waive a proof$/);
  });

  it('a default can be called only after the 3-day grace period, and is read from the Loan', async () => {
    const address = await desk.apply(meId(), TERMS);
    await desk.quote(address, PASSING);
    await desk.waiveProof(address);
    await desk.underwrite(address);
    await acceptShown(address);
    await desk.disburse(address);
    const from = desk.loan(address)!.defaultableFrom!;
    desk.advanceTime(from - 1n - desk.now());
    await expect(desk.markDefault(address)).rejects.toThrow(/^installment is not past its grace period$/);
    desk.advanceTime(1n);
    await desk.markDefault(address);
    const v = desk.loan(address)!;
    expect(v.status).toBe('DEFAULTED');
    // The directory still says ACTIVE (it refuses DEFAULTED); the console shows the Loan's default.
    expect(v.listing).toBe('DEFAULTED');
    expect(v.listingFromLoan).toBe(true);
    expect(v.defaultableFrom).toBeNull();
  });

  it('declining closes the listing', async () => {
    const address = await desk.apply(meId(), TERMS);
    await desk.decline(address);
    expect(desk.loan(address)!.status).toBe('DECLINED');
    expect(desk.loan(address)!.listing).toBe('CLOSED');
  });

  it('the lender may withdraw an offer the borrower has not accepted', async () => {
    const address = await desk.apply(meId(), TERMS);
    await desk.quote(address, PASSING);
    await desk.waiveProof(address);
    await desk.underwrite(address);
    await desk.decline(address);
    expect(desk.loan(address)!.status).toBe('DECLINED');
    expect(desk.loan(address)!.listing).toBe('CLOSED');
    await expect(desk.accept(address, 150_000n)).rejects.toThrow(/^there is no offer to accept$/);
  });

  it('proves two repaid loans for a new application', async () => {
    const address = await desk.apply(meId(), TERMS);
    expect(desk.loan(address)!.historyProofCount).toBe(0);
    const [a, b] = desk.repaidRecords();
    await desk.proveHistory(address, a.loan, b.loan);
    expect(desk.loan(address)!.historyProofCount).toBe(2);
  });

  it('refuses a history proof naming a loan that was never recorded', async () => {
    const address = await desk.apply(meId(), TERMS);
    const unrecorded = await desk.apply(meId(), TERMS);
    const [a] = desk.repaidRecords();
    await expect(desk.proveHistory(address, a.loan, unrecorded)).rejects.toThrow(
      /^second record is not in the directory$/,
    );
  });

  it('notifies subscribers on actions and clock moves', async () => {
    let ticks = 0;
    const off = desk.subscribe(() => ticks++);
    await desk.apply(meId(), TERMS);
    desk.advanceTime(1n);
    off();
    desk.advanceTime(1n);
    expect(ticks).toBe(2);
  });
});

// contracts/audit.ts is implemented in a parallel work package; these run
// once it lands.
describe.skipIf(typeof audit.buildDisclosure !== 'function')('SimulatedLoanDesk — auditor', () => {
  beforeAll(fresh);

  it("opens a repaid loan's history and the auditor verifies it", () => {
    const atlas = desk.myLoans().find((l) => l.lender.id === 'atlas')!;
    const d = desk.disclose(atlas.address);
    expect(d.payments).toHaveLength(4);
    expect(desk.verifyDisclosure(d)).toEqual({ ok: true, payments: 4, late: 1, total: atlas.terms.principal + 48_000n });
  });

  it('rejects an edited disclosure', () => {
    const atlas = desk.myLoans().find((l) => l.lender.id === 'atlas')!;
    const d = desk.disclose(atlas.address);
    d.payments[1] = { ...d.payments[1], onTime: true };
    expect(desk.verifyDisclosure(d).ok).toBe(false);
  });
});
