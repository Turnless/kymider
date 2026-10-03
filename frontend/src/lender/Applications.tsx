import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { shortHex } from '../lib/client';
import { blockDate, duration, type LoanView } from '../lib/loans';
import { useLoans } from '../lib/useLoans';

/**
 * Every loan that names this lender, sorted by what the lender has to do
 * next. The stage is derived from the public Loan ledger alone; nothing on
 * this screen needs, or could show, the borrower's facts.
 */

type AppsStage =
  | 'quote'
  | 'underwrite'
  | 'offered'
  | 'disburse'
  | 'repaying'
  | 'pastGrace'
  | 'record'
  | 'closed';

const APPS_STAGES: { id: AppsStage; label: string; heading: string; note: string }[] = [
  {
    id: 'quote',
    label: 'Quote',
    heading: 'Awaiting your quote',
    note: 'Name the bar a borrower must clear for the 110% tier.',
  },
  {
    id: 'underwrite',
    label: 'Offer',
    heading: 'Awaiting your offer',
    note: "Quoted. Offer the collateral for whatever tier the borrower holds, or decline.",
  },
  {
    id: 'offered',
    label: 'Offered',
    heading: 'Waiting for the borrower to accept',
    note: "You offered the tier's figure. Nothing binds until the borrower accepts it.",
  },
  {
    id: 'disburse',
    label: 'Disburse',
    heading: 'To disburse',
    note: 'Accepted by the borrower. Disbursing starts the repayment clock.',
  },
  {
    id: 'pastGrace',
    label: 'Past grace',
    heading: 'Past grace: default can be called',
    note: 'An installment is more than 3 days overdue.',
  },
  {
    id: 'repaying',
    label: 'Repaying',
    heading: 'Repaying',
    note: 'Disbursed and inside the schedule or its grace period.',
  },
  {
    id: 'record',
    label: 'Record',
    heading: 'Repaid, not yet recorded',
    note: 'Record the repayment in the directory so the borrower can cite it later.',
  },
  {
    id: 'closed',
    label: 'Closed',
    heading: 'Closed',
    note: 'Repaid and recorded, defaulted, or declined.',
  },
];

const appsStageOf = (l: LoanView, now: bigint): AppsStage => {
  if (l.status === 'APPLIED') {
    return l.quote === null || l.quote.expiresAt <= now ? 'quote' : 'underwrite';
  }
  if (l.status === 'OFFERED') return 'offered';
  if (l.status === 'ACTIVE') {
    if (!l.disbursed) return 'disburse';
    return l.defaultableFrom !== null && now >= l.defaultableFrom ? 'pastGrace' : 'repaying';
  }
  if (l.status === 'REPAID' && !l.recorded) return 'record';
  return 'closed';
};

/** Waiting on the borrower (an offer, or a loan inside its schedule): not the lender's move. */
const waiting = (s: AppsStage): boolean => s === 'offered' || s === 'repaying' || s === 'closed';

const appsAmount = (n: bigint): string => n.toLocaleString('en-US');

type AppsFilter = 'action' | 'all' | AppsStage;

export function LenderApplications() {
  const { desk } = useLoans();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<AppsFilter>('action');

  const now = desk.now();
  const loans = desk.applications();
  const staged = loans.map((l) => ({ loan: l, stage: appsStageOf(l, now) }));
  const count = (s: AppsStage) => staged.filter((r) => r.stage === s).length;
  const needsAction = staged.filter((r) => !waiting(r.stage)).length;

  const visible = staged.filter((r) =>
    filter === 'all'
      ? true
      : filter === 'action'
        ? !waiting(r.stage)
        : r.stage === filter,
  );

  const chips: [AppsFilter, string, number][] = [
    ['action', 'Needs you', needsAction],
    ['all', 'All', loans.length],
    ...APPS_STAGES.map((s) => [s.id, s.label, count(s.id)] as [AppsFilter, string, number]),
  ];

  const principalOpen = staged
    .filter((r) => r.stage === 'quote' || r.stage === 'underwrite')
    .reduce((n, r) => n + r.loan.terms.principal, 0n);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">Applications</h1>
          <p className="mt-1 text-[12px] text-[rgba(15,23,42,0.45)]">
            Loans that name you as lender. Block time {blockDate(now)}.
          </p>
        </div>
        <dl className="flex flex-wrap gap-6 sm:gap-8">
          <AppsStat label="Loans" value={String(loans.length)} />
          <AppsStat label="Need you" value={String(needsAction)} />
          <AppsStat label="Principal asked" value={appsAmount(principalOpen)} />
        </dl>
      </header>

      <div className="mb-4 flex items-center gap-3">
        <div className="flex min-w-0 overflow-x-auto rounded-[11px] bg-[rgba(15,23,42,0.05)] p-[3px]">
          {chips.map(([id, label, n]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={[
                'flex shrink-0 items-center gap-[6px] rounded-[9px] px-[13px] py-[7px] text-[12px] font-semibold transition-colors',
                filter === id
                  ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                  : 'text-[rgba(15,23,42,0.48)]',
              ].join(' ')}
            >
              {label}
              <span
                className={`tnum text-[10px] ${n === 0 ? 'text-[rgba(15,23,42,0.28)]' : 'text-[rgba(15,23,42,0.5)]'}`}
              >
                {n}
              </span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <section className="card px-5 py-14 text-center text-[12px] text-[rgba(15,23,42,0.4)]">
          {loans.length === 0
            ? 'No borrower has applied to you yet. An application appears here once a Loan instance naming you is listed in the directory.'
            : filter === 'action'
              ? 'Nothing needs you right now. Every open loan is waiting on its borrower or on the clock.'
              : 'No loan is at this stage.'}
        </section>
      ) : (
        <>
          {/* On a phone a nine-column table hides everything past the principal,
            so each loan becomes a card carrying the same facts. */}
          <div className="flex flex-col gap-5 sm:hidden">
            {APPS_STAGES.filter((s) => visible.some((r) => r.stage === s.id)).map((s) => (
              <section key={s.id}>
                <h2 className="mb-2 text-[13px] font-semibold">
                  {s.heading}
                  <span className="tnum ml-2 text-[rgba(15,23,42,0.4)]">{count(s.id)}</span>
                </h2>
                <ul className="flex flex-col gap-3">
                  {visible
                    .filter((r) => r.stage === s.id)
                    .map(({ loan: l, stage }) => (
                      <li
                        key={l.address}
                        onClick={() => navigate(`/app/loan/${l.address}`)}
                        className="card cursor-pointer px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="tnum text-[20px] font-bold leading-none">
                              {appsAmount(l.terms.principal)}
                            </p>
                            <p className="mono mt-[6px] text-[11px] text-[rgba(15,23,42,0.5)]">
                              {shortHex('0x' + l.address, 8, 4)} · {shortHex(l.borrower, 6, 4)}
                            </p>
                          </div>
                          <AppsTier loan={l} now={now} />
                        </div>
                        <p className="mt-3 text-[12px] text-[rgba(15,23,42,0.7)]">
                          <AppsStatusLine loan={l} stage={stage} now={now} />
                        </p>
                        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                          {l.factsBound ? (
                            <span className="font-semibold text-[#16a34a]">✓ Facts match</span>
                          ) : (
                            <span className="font-semibold text-[#dc2626]">
                              ✕ Facts do not match
                            </span>
                          )}
                          {l.historyProofCount >= 2 ? (
                            <span className="font-semibold text-[#16a34a]">
                              {l.historyProofCount} prior repaid loans proven
                            </span>
                          ) : (
                            <span className="text-[rgba(15,23,42,0.4)]">No history proof</span>
                          )}
                        </p>
                        {!waiting(stage) && (
                          <button
                            type="button"
                            className="btn btn-ink mt-3 w-full py-[9px] text-[12px]"
                          >
                            {APPS_ACTION[stage]}
                          </button>
                        )}
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
          <section className="card hidden overflow-hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px]">
                <thead>
                  <tr className="label">
                    <th className="px-4 py-[11px] text-left font-bold">Loan</th>
                    <th className="px-4 py-[11px] text-left font-bold">Borrower key</th>
                    <th className="px-4 py-[11px] text-right font-bold">Principal</th>
                    <th className="px-4 py-[11px] text-left font-bold">Tier</th>
                    <th className="px-4 py-[11px] text-left font-bold">Status</th>
                    <th className="px-4 py-[11px] text-left font-bold">Facts</th>
                    <th className="px-4 py-[11px] text-left font-bold">History</th>
                    <th className="px-4 py-[11px] text-right font-bold">Action</th>
                  </tr>
                </thead>
                {APPS_STAGES.filter((s) => visible.some((r) => r.stage === s.id)).map((s) => (
                  <tbody key={s.id}>
                    <tr className="border-t border-[rgba(15,23,42,0.08)] bg-[rgba(15,23,42,0.025)]">
                      <td colSpan={8} className="px-4 py-[10px]">
                        <span className="text-[12px] font-semibold">{s.heading}</span>
                        <span className="tnum ml-2 text-[12px] text-[rgba(15,23,42,0.4)]">
                          {count(s.id)}
                        </span>
                        <span className="ml-3 text-[11px] text-[rgba(15,23,42,0.45)]">
                          {s.note}
                        </span>
                      </td>
                    </tr>
                    {visible
                      .filter((r) => r.stage === s.id)
                      .map(({ loan: l, stage }) => (
                        <tr
                          key={l.address}
                          onClick={() => navigate(`/app/loan/${l.address}`)}
                          className="cursor-pointer border-t border-[rgba(15,23,42,0.06)] align-middle transition-colors hover:bg-[rgba(15,23,42,0.02)]"
                        >
                          <td className="mono px-4 py-[13px] whitespace-nowrap text-[12px] font-semibold">
                            {shortHex('0x' + l.address, 8, 4)}
                          </td>
                          <td className="mono px-4 py-[13px] whitespace-nowrap text-[11px] text-[rgba(15,23,42,0.55)]">
                            {shortHex(l.borrower, 8, 4)}
                          </td>
                          <td className="tnum px-4 py-[13px] whitespace-nowrap text-right text-[12px] font-semibold">
                            {appsAmount(l.terms.principal)}
                          </td>
                          <td className="px-4 py-[13px] whitespace-nowrap">
                            <AppsTier loan={l} now={now} />
                          </td>
                          <td className="px-4 py-[13px] text-[12px] text-[rgba(15,23,42,0.7)]">
                            <AppsStatusLine loan={l} stage={stage} now={now} />
                          </td>
                          <td className="px-4 py-[13px] whitespace-nowrap text-[11px]">
                            {l.factsBound ? (
                              <span
                                className="font-semibold text-[#16a34a]"
                                title="The facts commitment on this loan matches the borrower's SolvencyProof instance"
                              >
                                ✓ Facts match
                              </span>
                            ) : (
                              <span
                                className="font-semibold text-[#dc2626]"
                                title="The facts commitment on this loan does not match the borrower's SolvencyProof instance"
                              >
                                ✕ Facts do not match
                              </span>
                            )}
                          </td>
                          <td className="max-w-[150px] px-4 py-[13px] text-[11px] leading-[1.4]">
                            {l.historyProofCount >= 2 ? (
                              <span className="font-semibold text-[#16a34a]">
                                {l.historyProofCount} prior repaid loans proven
                              </span>
                            ) : (
                              <span className="text-[rgba(15,23,42,0.4)]">None attached</span>
                            )}
                          </td>
                          <td className="px-4 py-[13px] whitespace-nowrap text-right">
                            <button
                              type="button"
                              className={`btn px-4 py-[7px] text-[12px] ${
                                waiting(stage) ? 'btn-quiet' : 'btn-ink'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/app/loan/${l.address}`);
                              }}
                            >
                              {APPS_ACTION[stage]}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                ))}
              </table>
            </div>
          </section>
        </>
      )}

      <p className="mt-4 max-w-[760px] text-[11px] leading-[1.6] text-[rgba(15,23,42,0.4)]">
        ✓ Facts match means the loan's facts commitment matches the borrower's SolvencyProof
        instance, so any tier proven on this loan was proven from the same statement. "2 prior
        repaid loans proven" means the borrower showed the directory two repaid Kymider loans; you
        are not told which loans, which lenders, or for how much.
      </p>
    </div>
  );
}

const APPS_ACTION: Record<AppsStage, string> = {
  quote: 'Quote',
  underwrite: 'Offer',
  offered: 'Open',
  disburse: 'Disburse',
  repaying: 'Open',
  pastGrace: 'Review default',
  record: 'Record',
  closed: 'Open',
};

function AppsTier({ loan: l, now }: { loan: LoanView; now: bigint }) {
  if (l.status === 'APPLIED') {
    if (l.tier === 'VERIFIED' && l.tierLive) {
      return (
        <span className="inline-flex flex-col gap-[3px]">
          <span className="badge badge-pass">Verified</span>
          <span className="tnum text-[10px] text-[rgba(15,23,42,0.45)]">
            lapses in {duration(l.tierExpiresAt - now)}
          </span>
        </span>
      );
    }
    if (l.tier === 'VERIFIED') return <span className="badge badge-pending">Verified, lapsed</span>;
    if (l.tier === 'STANDARD') return <span className="badge badge-neutral">Standard</span>;
    return <span className="text-[11px] text-[rgba(15,23,42,0.4)]">Not proved</span>;
  }
  if (l.status === 'DECLINED')
    return <span className="text-[11px] text-[rgba(15,23,42,0.4)]">n/a</span>;
  if (l.status === 'OFFERED')
    return l.offeredTier === 'VERIFIED' ? (
      <span className="badge badge-pass">Offered 110%</span>
    ) : (
      <span className="badge badge-neutral">Offered 150%</span>
    );
  return l.tier === 'VERIFIED' ? (
    <span className="badge badge-pass">Verified 110%</span>
  ) : (
    <span className="badge badge-neutral">Standard 150%</span>
  );
}

function AppsStatusLine({
  loan: l,
  stage,
  now,
}: {
  loan: LoanView;
  stage: AppsStage;
  now: bigint;
}) {
  switch (stage) {
    case 'quote':
      return l.quote ? (
        <span className="text-[#b45309]">Quote expired {blockDate(l.quote.expiresAt)}</span>
      ) : (
        <span>Applied, not quoted</span>
      );
    case 'underwrite':
      return (
        <span className="tnum">
          Quote expires in {duration(l.quote!.expiresAt - now)}
          {l.tier === 'NONE' && (
            <span className="ml-1 text-[rgba(15,23,42,0.45)]">
              {l.proofWaived ? '· proof waived' : '· not proved yet'}
            </span>
          )}
        </span>
      );
    case 'offered':
      return (
        <span className="tnum">
          Offered {appsAmount(l.offeredCollateral)} collateral · waiting for the borrower to accept
        </span>
      );
    case 'disburse':
      return (
        <span className="tnum">
          Accepted at {appsAmount(l.collateralRequired)} collateral, not disbursed
        </span>
      );
    case 'repaying':
      return (
        <span className="tnum">
          {String(l.paymentsMade)} paid · next due {blockDate(l.nextDueAt)}
          {l.latePayments > 0n && (
            <span className="ml-1 text-[#b45309]">· {String(l.latePayments)} late</span>
          )}
        </span>
      );
    case 'pastGrace':
      return (
        <span className="tnum font-semibold text-[#dc2626]">
          Due {blockDate(l.nextDueAt)}, {duration(now - l.nextDueAt)} overdue
        </span>
      );
    case 'record':
      return (
        <span className="tnum">Repaid in {String(l.paymentsMade)} payments, not recorded</span>
      );
    case 'closed':
      if (l.status === 'REPAID') return <span className="text-[#16a34a]">Repaid · recorded</span>;
      if (l.status === 'DEFAULTED')
        return (
          <span className="tnum text-[#dc2626]">
            Defaulted · {appsAmount(l.balanceOwed)} unpaid
          </span>
        );
      return <span className="text-[rgba(15,23,42,0.5)]">Declined</span>;
  }
}

function AppsStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <dd className="tnum text-[20px] font-bold leading-none">{value}</dd>
      <dt className="label mt-[5px]">{label}</dt>
    </div>
  );
}
