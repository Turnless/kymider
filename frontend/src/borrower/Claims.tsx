import { useState } from 'react';
import { ClaimStateBadge, Monogram, StaleBadge, VerdictBadge } from '../components/Badge';
import { shortHex, termsLabel, type Verdict } from '../lib/client';
import { useKymider } from '../lib/useKymider';

type Filter = 'all' | 'pass' | 'fail';

export function Claims() {
  const { client } = useKymider();
  const [filter, setFilter] = useState<Filter>('all');
  const [proving, setProving] = useState<string | null>(null);

  const requests = client.myRequests().filter((r) => r.terms);
  // The one request still waiting on the borrower is promoted out of the list —
  // there is exactly one thing to do on this screen, so it should not be a row.
  // A superseded verdict is the same kind of "waiting on you", so it queues
  // behind the unanswered ones rather than sitting silently in the table.
  const pending = requests.find((r) => r.verdict === 'NONE') ?? requests.find((r) => r.stale);
  const rest = requests.filter((r) => r !== pending);
  const visible = rest.filter((r) =>
    filter === 'all' ? true : filter === 'pass' ? r.verdict === 'PASS' : r.verdict === 'FAIL',
  );
  const answered = requests.filter((r) => r.verdict !== 'NONE').length;

  const prove = async (lenderId: string) => {
    setProving(lenderId);
    try {
      await client.proveFor(lenderId);
    } finally {
      setProving(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Claims</h1>
        <div className="flex rounded-[11px] bg-[rgba(15,23,42,0.05)] p-[3px]">
          {(
            [
              ['all', 'All'],
              ['pass', 'Passed'],
              ['fail', 'Failed'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={[
                'rounded-[9px] px-[15px] py-[7px] text-[12px] font-semibold transition-colors',
                filter === id
                  ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                  : 'text-[rgba(15,23,42,0.48)]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {pending && (
        <section className="card-dark rise mb-5 flex flex-col items-start justify-between gap-5 p-6 sm:flex-row sm:items-center sm:gap-6">
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.8px] text-accent">
              <span className="size-[5px] rounded-full bg-accent" />
              {pending.stale ? 'Superseded by your new facts' : 'Awaiting your proof'}
            </p>
            <h2 className="text-[20px] font-bold tracking-[-0.01em] text-cream">
              {pending.lender.name}
            </h2>
            <p className="tnum mt-1 text-[12px] text-[rgba(255,247,235,0.65)]">
              {termsLabel(pending.terms!)}
            </p>
            <p className="mt-3 text-[11px] text-[rgba(255,247,235,0.42)]">
              {pending.stale
                ? 'The recorded verdict answers an older statement. Prove again so it reflects what you have committed.'
                : 'Answering this reveals a pass or fail against the terms above — nothing else.'}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-accent w-full shrink-0 px-[30px] py-4 text-[14px] sm:w-auto"
            style={{ boxShadow: '0 0 34px rgba(212,109,37,0.32)' }}
            onClick={() => prove(pending.lender.id)}
            disabled={proving !== null}
          >
            {proving === pending.lender.id ? (
              <>
                <Spinner /> Generating proof
              </>
            ) : pending.stale ? (
              'Prove again'
            ) : (
              'Generate proof'
            )}
          </button>
        </section>
      )}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.08)] px-5 py-[14px]">
          <h2 className="text-[13px] font-semibold">{pending ? 'Answered claims' : 'All claims'}</h2>
          <span className="text-[11px] text-[rgba(15,23,42,0.4)]">
            {answered} of {requests.length} answered
          </span>
        </div>

        {visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-[12px] text-[rgba(15,23,42,0.4)]">
            No claims match this filter.
          </p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[680px]">
            <thead>
              <tr className="label">
                <th className="px-5 py-[10px] text-left font-bold">Lender</th>
                <th className="px-5 py-[10px] text-left font-bold">Requested terms</th>
                <th className="px-5 py-[10px] text-left font-bold">Decision</th>
                <th className="px-5 py-[10px] text-right font-bold">Attestation</th>
                <th className="px-5 py-[10px] text-right font-bold">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.lender.id} className="border-t border-[rgba(15,23,42,0.06)]">
                  <td className="px-5 py-[13px]">
                    <div className="flex items-center gap-[10px]">
                      <Monogram initials={r.lender.initials} />
                      <div>
                        <div className="text-[13px] font-semibold">{r.lender.name}</div>
                        <div className="text-[11px] text-[rgba(15,23,42,0.45)]">
                          requested {r.requestedAt}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="tnum px-5 py-[13px] text-[12px] text-[rgba(15,23,42,0.7)]">
                    {termsLabel(r.terms!)}
                  </td>
                  <td className="px-5 py-[13px]">
                    <ClaimStateBadge state={r.claimState} />
                  </td>
                  <td className="px-5 py-[13px] text-right">
                    <span className="inline-flex items-center gap-2">
                      {r.stale && <StaleBadge />}
                      <VerdictBadge verdict={r.verdict} />
                    </span>
                  </td>
                  <td className="mono px-5 py-[13px] text-right text-[11px] text-[rgba(15,23,42,0.4)]">
                    {receiptOf(r.lender.pubKey, r.verdict)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}

const receiptOf = (pubKey: string, verdict: Verdict): string =>
  verdict === 'NONE' ? '—' : shortHex(pubKey, 6, 4);

function Spinner() {
  return (
    <svg className="spin" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
