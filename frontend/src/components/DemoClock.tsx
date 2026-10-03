import { blockDate, DAY } from '../lib/loans';
import { useLoans } from '../lib/useLoans';

const STEPS = [
  { label: '+1 day', seconds: DAY },
  { label: '+30 days', seconds: 30n * DAY },
  { label: '+31 days', seconds: 31n * DAY },
];

/**
 * The simulated chain's block clock, and the only control that moves it.
 * Labelled as a simulation control so nobody mistakes it for a feature of the
 * product: on a real network block time is the network's, not the user's.
 * +30 days lands on a 30-day due date; +31 days steps one day past it.
 */
export function DemoClock() {
  const { desk } = useLoans();

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[13px] border border-dashed border-[rgba(15,23,42,0.2)] px-3 py-2">
      <div className="min-w-0">
        <p className="flex items-center gap-[6px] text-[9px] font-bold uppercase tracking-[0.7px] text-[rgba(15,23,42,0.45)]">
          <span className="size-[5px] rounded-full bg-accent" />
          Simulation · block time
        </p>
        <p className="mono text-[12px] font-semibold text-ink">{blockDate(desk.now())}</p>
      </div>
      <div className="flex gap-1">
        {STEPS.map((s) => (
          <button
            key={s.label}
            type="button"
            className="btn btn-quiet px-[10px] py-[6px] text-[11px]"
            onClick={() => desk.advanceTime(s.seconds)}
            title={`Move the simulated block clock forward ${s.label.slice(1)}`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
