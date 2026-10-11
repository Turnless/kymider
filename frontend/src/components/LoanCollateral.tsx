import { money } from '../lib/client';
import { percentOfBps, type TierName } from '../lib/loans';
import { collateralSplit } from './LoanFormat';

/**
 * The pitch in one panel: for this principal, what collateral a solvency proof
 * buys (110%) against what it costs without one (150%), and what that keeps
 * free. Bars are drawn to scale against 150%, with a tick at 100% (the
 * principal itself).
 *
 * `applies` highlights the tier that holds for this loan; leave it out on a
 * form, where neither has been decided yet. `ratios` are the loan's own
 * (105% / 130% once two repaid loans are proven on it); 110% / 150% by default.
 */
export function LoanCollateralCompare({
  principal,
  applies,
  ratios,
  dark = false,
}: {
  principal: bigint;
  applies?: TierName;
  ratios?: { verifiedBps: bigint; standardBps: bigint };
  dark?: boolean;
}) {
  const vBps = ratios?.verifiedBps ?? 11_000n;
  const sBps = ratios?.standardBps ?? 15_000n;
  const { verified, standard, kept } = collateralSplit(principal, vBps, sBps);
  const vPct = percentOfBps(vBps);
  const sPct = percentOfBps(sBps);
  const ink = dark ? 'var(--color-cream)' : 'var(--color-ink)';
  const quiet = dark ? 'rgba(255,247,235,0.5)' : 'rgba(15,23,42,0.5)';
  const track = dark ? 'rgba(255,247,235,0.07)' : 'rgba(15,23,42,0.05)';
  const greyBar = dark ? 'rgba(255,247,235,0.28)' : 'rgba(15,23,42,0.22)';

  const rows = [
    {
      tier: 'VERIFIED' as const,
      label: 'With a solvency proof',
      pct: vPct,
      amount: verified,
      width: (Number(vBps) / Number(sBps)) * 100,
      color: 'var(--color-accent)',
    },
    {
      tier: 'STANDARD' as const,
      label: 'Without',
      pct: sPct,
      amount: standard,
      width: 100,
      color: greyBar,
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-4">
        {rows.map((r) => {
          const dim = applies !== undefined && applies !== 'NONE' && applies !== r.tier;
          return (
            <div key={r.tier} style={{ opacity: dim ? 0.45 : 1 }}>
              <div className="mb-[6px] flex items-baseline justify-between gap-3">
                <span className="text-[12px] font-semibold" style={{ color: quiet }}>
                  {r.label}{' '}
                  <span className="tnum" style={{ color: ink }}>
                    · {r.pct}
                  </span>
                  {applies === r.tier && (
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-[0.6px] text-accent">
                      applies
                    </span>
                  )}
                </span>
                <span
                  className="tnum text-[22px] font-bold leading-none tracking-[-0.02em]"
                  style={{ color: ink }}
                >
                  {money(r.amount)}
                </span>
              </div>
              <div className="relative h-[8px] rounded-full" style={{ background: track }}>
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${r.width}%`, background: r.color }}
                />
                {/* 100%: the principal itself. */}
                <span
                  className="absolute top-[-3px] h-[14px] w-px"
                  style={{ left: `${(10_000 / Number(sBps)) * 100}%`, background: quiet }}
                  aria-hidden="true"
                />
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-4"
        style={{ borderColor: dark ? 'rgba(255,247,235,0.08)' : 'rgba(15,23,42,0.08)' }}
      >
        <span className="text-[12px] font-semibold" style={{ color: quiet }}>
          You keep free
        </span>
        <span className="tnum text-[30px] font-black leading-none tracking-[-0.03em] text-accent">
          {money(kept)}
        </span>
      </div>
      <p className="tnum mt-3 text-[11px] leading-[1.6]" style={{ color: quiet }}>
        Collateral with a solvency proof: {money(verified)} ({vPct}) · without: {money(standard)}{' '}
        ({sPct}) · you keep {money(kept)} free
      </p>
    </div>
  );
}
