import { money } from '../lib/client';
import { blockDate, type LoanView } from '../lib/loans';

/**
 * The loan's lifecycle as a timeline, read entirely off the public ledger:
 *
 *   Applied → Quoted → Tier proven → Offered → Accepted → Disbursed → Repaying → Repaid
 *
 * Horizontal from `lg`, vertical below it. A declined loan skips what it never
 * reached; a default ends the line in red. Neither side's private data is
 * needed to draw it, so the lender screens can use it as is.
 */

export type LoanStepState = 'done' | 'current' | 'upcoming' | 'skipped' | 'failed';
export type LoanStep = { key: string; label: string; caption: string; state: LoanStepState };

function loanSteps(loan: LoanView, now: bigint): LoanStep[] {
  const { status, quote, tier, tierLive, disbursed } = loan;
  // Accepted by the borrower: the offer is binding from here on.
  const underwritten = status === 'ACTIVE' || status === 'REPAID' || status === 'DEFAULTED';
  const offered = status === 'OFFERED' || underwritten;
  const declined = status === 'DECLINED';
  const paid = Number(loan.paymentsMade);
  const late = Number(loan.latePayments);

  const tierCaption =
    tier === 'VERIFIED'
      ? tierLive || underwritten
        ? 'Verified · 110%'
        : 'Verified, lapsed'
      : tier === 'STANDARD'
        ? 'Standard · 150%'
        : loan.proofWaived
          ? 'Waived · 150%'
          : declined
            ? 'Not proven'
            : 'Optional · 110% if it passes';

  const steps: (Omit<LoanStep, 'state'> & { done: boolean; skip: boolean })[] = [];
  const add = (s: Omit<LoanStep, 'state'>, done: boolean, skip = false) =>
    steps.push({ ...s, done, skip });

  add({ key: 'applied', label: 'Applied', caption: money(loan.terms.principal) }, true);
  add(
    {
      key: 'quoted',
      label: 'Quoted',
      caption: quote
        ? quote.expiresAt > now || underwritten
          ? `Bar set · until ${blockDate(quote.expiresAt).slice(5, 10)}`
          : 'Quote expired'
        : declined
          ? 'Never quoted'
          : 'Lender names a bar',
    },
    quote !== null,
    declined && quote === null,
  );
  add(
    { key: 'tier', label: 'Tier proven', caption: tierCaption },
    tier !== 'NONE' && (tierLive || tier === 'STANDARD' || underwritten),
    (declined && tier === 'NONE') || (loan.proofWaived && tier === 'NONE'),
  );
  add(
    {
      key: 'offered',
      label: 'Offered',
      caption:
        status === 'OFFERED'
          ? `${money(loan.offeredCollateral)} · ${loan.offeredTier === 'VERIFIED' ? '110%' : '150%'}`
          : underwritten
            ? `${money(loan.collateralRequired)} · ${tier === 'VERIFIED' ? '110%' : '150%'}`
            : declined
              ? 'Declined'
              : "Lender offers the tier's figure",
    },
    offered,
    declined,
  );
  add(
    {
      key: 'accepted',
      label: 'Accepted',
      caption: underwritten
        ? `${money(loan.collateralRequired)} collateral`
        : status === 'OFFERED'
          ? 'The borrower decides'
          : declined
            ? 'Declined'
            : 'Only the borrower can',
    },
    underwritten,
    declined,
  );
  add(
    {
      key: 'disbursed',
      label: 'Disbursed',
      caption: disbursed ? `${loan.terms.installments} × ${money(loan.installmentAmount)}` : 'Clock starts',
    },
    disbursed,
    declined,
  );
  add(
    {
      key: 'repaying',
      label: 'Repaying',
      caption: disbursed
        ? `${paid} of ${loan.terms.installments} paid${late > 0 ? ` · ${late} late` : ''}`
        : 'Installments',
    },
    status === 'REPAID' || status === 'DEFAULTED',
    declined,
  );

  const final = status === 'DEFAULTED' ? 'Defaulted' : declined ? 'Declined' : 'Repaid';
  add(
    {
      key: 'final',
      label: final,
      caption:
        status === 'REPAID'
          ? loan.recorded
            ? 'Recorded in the directory'
            : 'Awaiting directory record'
          : status === 'DEFAULTED'
            ? 'Called by the lender'
            : declined
              ? 'Closed by the lender'
              : 'Balance reaches zero',
    },
    status === 'REPAID',
  );

  let currentTaken = false;
  return steps.map((s, i) => {
    const last = i === steps.length - 1;
    let state: LoanStepState;
    if (last && (status === 'DEFAULTED' || declined)) state = 'failed';
    else if (s.done) state = 'done';
    else if (s.skip) state = 'skipped';
    else if (!currentTaken) {
      state = 'current';
      currentTaken = true;
    } else state = 'upcoming';
    return { key: s.key, label: s.label, caption: s.caption, state };
  });
}

export function LoanStepper({ loan, now, dark = false }: { loan: LoanView; now: bigint; dark?: boolean }) {
  const steps = loanSteps(loan, now);
  const c = palette(dark);

  return (
    <>
      {/* Wide: one row, connectors between the dots. */}
      <ol className="hidden lg:grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => (
          <li key={s.key} className="min-w-0">
            <div className="flex items-center">
              <Dot state={s.state} dark={dark} />
              {i < steps.length - 1 && (
                <span
                  className="mx-2 h-[2px] flex-1 rounded-full"
                  style={{ background: s.state === 'done' ? 'var(--color-accent)' : c.line }}
                />
              )}
            </div>
            <p className="mt-3 pr-3 text-[12px] font-semibold" style={{ color: labelColor(s.state, c) }}>
              {s.label}
            </p>
            <p className="tnum mt-[2px] pr-3 text-[11px] leading-[1.4]" style={{ color: c.quiet }}>
              {s.caption}
            </p>
          </li>
        ))}
      </ol>

      {/* Narrow: a vertical line, one step per row. */}
      <ol className="flex flex-col lg:hidden">
        {steps.map((s, i) => (
          <li key={s.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <Dot state={s.state} dark={dark} />
              {i < steps.length - 1 && (
                <span
                  className="my-1 w-[2px] flex-1 rounded-full"
                  style={{ background: s.state === 'done' ? 'var(--color-accent)' : c.line, minHeight: 14 }}
                />
              )}
            </div>
            <div className="min-w-0 pb-3">
              <p className="text-[12px] font-semibold leading-[20px]" style={{ color: labelColor(s.state, c) }}>
                {s.label}
              </p>
              <p className="tnum text-[11px] leading-[1.4]" style={{ color: c.quiet }}>
                {s.caption}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

const palette = (dark: boolean) => ({
  ink: dark ? 'var(--color-cream)' : 'var(--color-ink)',
  quiet: dark ? 'rgba(255,247,235,0.45)' : 'rgba(15,23,42,0.45)',
  faint: dark ? 'rgba(255,247,235,0.3)' : 'rgba(15,23,42,0.3)',
  line: dark ? 'rgba(255,247,235,0.12)' : 'rgba(15,23,42,0.1)',
  ground: dark ? 'var(--color-espresso)' : '#ffffff',
});

const labelColor = (state: LoanStepState, c: ReturnType<typeof palette>): string =>
  state === 'failed'
    ? '#dc2626'
    : state === 'current'
      ? 'var(--color-accent)'
      : state === 'upcoming' || state === 'skipped'
        ? c.faint
        : c.ink;

function Dot({ state, dark }: { state: LoanStepState; dark: boolean }) {
  const c = palette(dark);
  const base = 'flex size-[20px] shrink-0 items-center justify-center rounded-full';
  if (state === 'done') {
    return (
      <span className={base} style={{ background: 'var(--color-accent)' }}>
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="#1b1410" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === 'current') {
    return (
      <span
        className={base}
        style={{ border: '2px solid var(--color-accent)', boxShadow: '0 0 0 4px rgba(212,109,37,0.14)' }}
      >
        <span className="size-[6px] rounded-full bg-accent" />
      </span>
    );
  }
  if (state === 'failed') {
    return (
      <span className={base} style={{ background: '#dc2626' }}>
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3.5 3.5l5 5m0-5-5 5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={base}
      style={{
        border: `2px ${state === 'skipped' ? 'dashed' : 'solid'} ${c.line}`,
        background: c.ground,
      }}
    />
  );
}
