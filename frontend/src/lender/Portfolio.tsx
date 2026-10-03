import { useNavigate } from 'react-router-dom';
import { shortHex } from '../lib/client';
import type { LoanView } from '../lib/loans';
import { useLoans } from '../lib/useLoans';

/**
 * The lender's book: every loan naming this lender, summed. All figures come
 * from public Loan ledgers. Collateral saved is the pitch in one number: what
 * borrowers did not have to post because they proved the 110% tier.
 */

const book$ = (n: bigint): string => n.toLocaleString('en-US');

/** Underwritten loans: those that carry a tier and a collateral figure. */
const bookUnderwritten = (l: LoanView): boolean =>
  l.status === 'ACTIVE' || l.status === 'REPAID' || l.status === 'DEFAULTED';

const bookSaved = (l: LoanView): bigint =>
  bookUnderwritten(l) && l.tier === 'VERIFIED'
    ? l.collateralIfStandard - l.collateralIfVerified
    : 0n;

export function Portfolio() {
  const { desk } = useLoans();
  const navigate = useNavigate();
  const now = desk.now();

  const loans = desk.applications();
  const underwritten = loans.filter(bookUnderwritten);
  const active = loans.filter((l) => l.status === 'ACTIVE');
  const outstanding = active.filter((l) => l.disbursed);
  const repaid = loans.filter((l) => l.status === 'REPAID');
  const defaulted = loans.filter((l) => l.status === 'DEFAULTED');
  const verified = underwritten.filter((l) => l.tier === 'VERIFIED');

  const sum = (xs: LoanView[], f: (l: LoanView) => bigint) => xs.reduce((n, l) => n + f(l), 0n);
  const principalOut = sum(outstanding, (l) => l.terms.principal);
  const balanceOut = sum(outstanding, (l) => l.balanceOwed);
  const collateralHeld = sum(active, (l) => l.collateralRequired);
  const saved = sum(underwritten, bookSaved);
  const payments = sum(underwritten, (l) => l.paymentsMade);
  const late = sum(underwritten, (l) => l.latePayments);
  const onTimeRate = payments > 0n ? Number(((payments - late) * 1000n) / payments) / 10 : null;
  const pastGrace = outstanding.filter(
    (l) => l.defaultableFrom !== null && now >= l.defaultableFrom,
  );

  const rows = [...underwritten, ...loans.filter((l) => !bookUnderwritten(l))];

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Portfolio</h1>
        <dl className="flex flex-wrap gap-6 sm:gap-8">
          <BookStat label="Active" value={String(active.length)} />
          <BookStat label="Repaid" value={String(repaid.length)} />
          <BookStat label="Defaulted" value={String(defaulted.length)} />
        </dl>
      </header>

      <section className="card mb-5 grid grid-cols-1 divide-y divide-[rgba(15,23,42,0.08)] px-2 py-5 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        <BookFigure
          label="Principal out"
          value={book$(principalOut)}
          note={`${outstanding.length} disbursed, ${book$(balanceOut)} still owed`}
        />
        <BookFigure
          label="Collateral held"
          value={book$(collateralHeld)}
          note={`Across ${active.length} active ${active.length === 1 ? 'loan' : 'loans'}`}
        />
        <BookFigure
          label="Collateral saved"
          value={book$(saved)}
          note={`150% less 110% on ${verified.length} verified ${verified.length === 1 ? 'loan' : 'loans'}`}
          accent
        />
        <BookFigure
          label="On-time rate"
          value={onTimeRate === null ? 'n/a' : `${onTimeRate.toFixed(1)}%`}
          note={`${String(payments - late)} of ${String(payments)} payments on time`}
        />
      </section>

      {pastGrace.length > 0 && (
        <p className="mb-5 rounded-[13px] border border-[rgba(220,38,38,0.2)] bg-[rgba(220,38,38,0.06)] px-4 py-3 text-[12px] text-[#b91c1c]">
          {pastGrace.length} {pastGrace.length === 1 ? 'loan is' : 'loans are'} past the 3-day grace
          period and can be marked as defaulted.
        </p>
      )}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.08)] px-5 py-[14px]">
          <h2 className="text-[13px] font-semibold">Loans</h2>
          <span className="text-[11px] text-[rgba(15,23,42,0.4)]">
            {underwritten.length} underwritten · {loans.length - underwritten.length} not
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="px-5 py-14 text-center text-[12px] text-[rgba(15,23,42,0.4)]">
            No loan names you as lender yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] whitespace-nowrap">
              <thead>
                <tr className="label">
                  <th className="px-5 py-[10px] text-left font-bold">Loan</th>
                  <th className="px-5 py-[10px] text-left font-bold">Borrower key</th>
                  <th className="px-5 py-[10px] text-right font-bold">Principal</th>
                  <th className="px-5 py-[10px] text-left font-bold">Tier</th>
                  <th className="px-5 py-[10px] text-right font-bold">Collateral</th>
                  <th className="px-5 py-[10px] text-right font-bold">Saved</th>
                  <th className="px-5 py-[10px] text-right font-bold">Paid</th>
                  <th className="px-5 py-[10px] text-right font-bold">Late</th>
                  <th className="px-5 py-[10px] text-right font-bold">Balance</th>
                  <th className="px-5 py-[10px] text-right font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const u = bookUnderwritten(l);
                  return (
                    <tr
                      key={l.address}
                      onClick={() => navigate(`/app/loan/${l.address}`)}
                      className="tnum cursor-pointer border-t border-[rgba(15,23,42,0.06)] text-[12px] transition-colors hover:bg-[rgba(15,23,42,0.02)]"
                    >
                      <td className="mono px-5 py-[13px] font-semibold">
                        {shortHex('0x' + l.address, 8, 4)}
                      </td>
                      <td className="mono px-5 py-[13px] text-[11px] text-[rgba(15,23,42,0.55)]">
                        {shortHex(l.borrower, 8, 4)}
                      </td>
                      <td className="px-5 py-[13px] text-right font-semibold">
                        {book$(l.terms.principal)}
                      </td>
                      <td className="px-5 py-[13px]">
                        {!u ? (
                          <span className="text-[rgba(15,23,42,0.35)]">–</span>
                        ) : l.tier === 'VERIFIED' ? (
                          <span className="badge badge-pass">Verified</span>
                        ) : (
                          <span className="badge badge-neutral">Standard</span>
                        )}
                      </td>
                      <td className="px-5 py-[13px] text-right">
                        {u ? (
                          <>
                            {book$(l.collateralRequired)}
                            <span className="ml-1 text-[rgba(15,23,42,0.4)]">
                              {l.tier === 'VERIFIED' ? '110%' : '150%'}
                            </span>
                          </>
                        ) : (
                          <span className="text-[rgba(15,23,42,0.35)]">–</span>
                        )}
                      </td>
                      <td className="px-5 py-[13px] text-right text-[#16a34a]">
                        {bookSaved(l) > 0n ? (
                          book$(bookSaved(l))
                        ) : (
                          <span className="text-[rgba(15,23,42,0.35)]">{u ? '0' : '–'}</span>
                        )}
                      </td>
                      <td className="px-5 py-[13px] text-right">
                        {l.disbursed ? String(l.paymentsMade) : '–'}
                      </td>
                      <td
                        className="px-5 py-[13px] text-right"
                        style={{ color: l.latePayments > 0n ? '#d97706' : undefined }}
                      >
                        {l.disbursed ? String(l.latePayments) : '–'}
                      </td>
                      <td className="px-5 py-[13px] text-right">
                        {l.disbursed ? book$(l.balanceOwed) : '–'}
                      </td>
                      <td className="px-5 py-[13px] text-right">
                        <BookStatus loan={l} now={now} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-4 max-w-[760px] text-[11px] leading-[1.6] text-[rgba(15,23,42,0.4)]">
        Principal out counts disbursed loans still active. Collateral held counts active loans.
        Collateral saved is what verified borrowers did not have to post: 150% less 110% of the
        principal, on every loan underwritten at the verified tier. The on-time rate counts payments
        the contract marked on time by block time, across every loan in the book. No figure here
        required a borrower's balance, debts or income.
      </p>
    </div>
  );
}

function BookStatus({ loan: l, now }: { loan: LoanView; now: bigint }) {
  if (l.status === 'APPLIED') return <span className="badge badge-pending">Applied</span>;
  if (l.status === 'OFFERED') return <span className="badge badge-pending">Offered</span>;
  if (l.status === 'ACTIVE') {
    if (!l.disbursed) return <span className="badge badge-pending">To disburse</span>;
    if (l.defaultableFrom !== null && now >= l.defaultableFrom)
      return <span className="badge badge-fail">Past grace</span>;
    return <span className="badge badge-pass">Repaying</span>;
  }
  if (l.status === 'REPAID')
    return (
      <span className={`badge ${l.recorded ? 'badge-pass' : 'badge-pending'}`}>
        {l.recorded ? 'Repaid' : 'Repaid · record'}
      </span>
    );
  if (l.status === 'DEFAULTED') return <span className="badge badge-fail">Defaulted</span>;
  return <span className="badge badge-neutral">Declined</span>;
}

function BookFigure({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className="px-5 py-3 lg:py-0">
      <p className="label mb-[6px]">{label}</p>
      <p
        className="tnum text-[30px] font-bold leading-none tracking-[-0.02em]"
        style={{ color: accent ? '#16a34a' : undefined }}
      >
        {value}
      </p>
      <p className="mt-[6px] text-[11px] text-[rgba(15,23,42,0.42)]">{note}</p>
    </div>
  );
}

function BookStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <dd className="tnum text-[20px] font-bold leading-none">{value}</dd>
      <dt className="label mt-[5px]">{label}</dt>
    </div>
  );
}
