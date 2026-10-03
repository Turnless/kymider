import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monogram } from '../components/Badge';
import { DemoClock } from '../components/DemoClock';
import { useLoanAction } from '../components/LoanAction';
import { LoanStatusBadge, LoanSpinner, TierBadge } from '../components/LoanBadges';
import { LoanCollateralCompare } from '../components/LoanCollateral';
import {
  digitsToBigInt,
  groupDigits,
  owedOf,
  percentToBps,
  relative,
} from '../components/LoanFormat';
import { LoanRefusal } from '../components/LoanRefusal';
import { money, shortHex } from '../lib/client';
import { blockDate, DAY, percentOfBps, type LoanTerms, type LoanView } from '../lib/loans';
import { useKymider } from '../lib/useKymider';
import { useLoans } from '../lib/useLoans';

export function BorrowerLoans() {
  const { desk } = useLoans();
  const { client } = useKymider();
  const navigate = useNavigate();
  const act = useLoanAction();

  const lenders = client.lenders();
  // The lender console's persona first, so an application made here is the one
  // waiting when the demo switches roles.
  const [lenderId, setLenderId] = useState(() => {
    const me = client.me().id;
    return lenders.some((l) => l.id === me) ? me : (lenders[0]?.id ?? '');
  });
  const [principal, setPrincipal] = useState('10,000');
  const [interest, setInterest] = useState('8');
  const [installments, setInstallments] = useState('3');
  const [periodDays, setPeriodDays] = useState('30');

  const loans = desk.myLoans();
  const records = desk.repaidRecords();
  const now = desk.now();

  const terms: LoanTerms = {
    principal: digitsToBigInt(principal),
    interestBps: percentToBps(interest),
    installments: digitsToBigInt(installments),
    periodSeconds: digitsToBigInt(periodDays) * DAY,
  };
  const owed = owedOf(terms);
  const installment = terms.installments > 0n ? (owed + terms.installments - 1n) / terms.installments : 0n;
  const lender = lenders.find((l) => l.id === lenderId);

  const owing = loans.reduce((n, l) => n + (l.status === 'ACTIVE' && l.disbursed ? l.balanceOwed : 0n), 0n);

  const apply = async () => {
    const address = await act.run('apply', () => desk.apply(lenderId, terms));
    if (address) navigate(`/app/loans/${address}`);
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">Loans</h1>
          <p className="mt-1 max-w-[560px] text-[12px] leading-[1.6] text-[rgba(15,23,42,0.5)]">
            Prove solvency in zero knowledge and post 110% collateral instead of 150%. The lender
            sees the tier, never the balance, debts or income behind it.
          </p>
        </div>
        <DemoClock />
      </header>

      {/* The pitch, at the size it deserves. */}
      <section className="card-dark mb-5 grid gap-8 p-6 lg:grid-cols-[1fr_1fr] lg:gap-10">
        <div className="min-w-0">
          <p className="label-dark mb-4">Apply for a loan</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <label className="col-span-full block">
              <span className="mb-[6px] block text-[11px] font-semibold text-[rgba(255,247,235,0.6)]">
                Lender
              </span>
              <select
                className="w-full rounded-[11px] border border-[rgba(255,247,235,0.14)] bg-[rgba(255,247,235,0.06)] px-3 py-[10px] text-[14px] font-semibold text-cream outline-none transition-colors focus:border-accent"
                value={lenderId}
                onChange={(e) => setLenderId(e.target.value)}
              >
                {lenders.map((l) => (
                  <option key={l.id} value={l.id} className="text-ink">
                    {l.name} · {l.kind}
                  </option>
                ))}
              </select>
            </label>
            <div className="col-span-full">
              <DarkField
                label="Principal"
                prefix="$"
                value={principal}
                onChange={(v) => setPrincipal(groupDigits(v))}
              />
            </div>
            <DarkField
              label="Interest, flat"
              suffix="%"
              value={interest}
              onChange={(v) => setInterest(v.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
            />
            <DarkField
              label="Installments"
              value={installments}
              onChange={(v) => setInstallments(v.replace(/[^0-9]/g, ''))}
            />
            <div className="col-span-2 sm:col-span-1">
              <DarkField
                label="Period"
                suffix="days"
                value={periodDays}
                onChange={(v) => setPeriodDays(v.replace(/[^0-9]/g, ''))}
              />
            </div>
          </div>

          <p className="tnum mt-4 text-[11px] leading-[1.6] text-[rgba(255,247,235,0.5)]">
            {terms.installments > 0n && terms.periodSeconds > 0n ? (
              <>
                You would owe {money(owed)} ({percentOfBps(terms.interestBps)} flat), in{' '}
                {String(terms.installments)} installments of {money(installment)} every{' '}
                {periodDays} days.
              </>
            ) : (
              'Enter at least one installment and a period of at least a day.'
            )}
          </p>

          <button
            type="button"
            className="btn btn-accent mt-5 w-full py-[13px] sm:w-auto sm:px-[30px]"
            style={{ boxShadow: '0 0 34px rgba(212,109,37,0.28)' }}
            onClick={apply}
            disabled={act.busy !== null || !lender}
          >
            {act.busy === 'apply' ? (
              <>
                <LoanSpinner /> Deploying the loan
              </>
            ) : (
              `Apply to ${lender?.name ?? 'lender'}`
            )}
          </button>
          <LoanRefusal message={act.refusalFor('apply')} onDismiss={act.clear} dark />
          <p className="mt-4 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.4)]">
            Applying deploys a Loan contract bound to the facts your solvency instance committed,
            and lists it in the loan directory. The figures themselves are not part of it.
          </p>
        </div>

        <div className="min-w-0 lg:border-l lg:border-[rgba(255,247,235,0.08)] lg:pl-10">
          <p className="label-dark mb-4">Collateral for {money(terms.principal)}</p>
          <LoanCollateralCompare principal={terms.principal} dark />
          <p className="mt-4 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.4)]">
            The contract accepts exactly one figure per tier. A proof that clears the lender's bar
            sets 110%; no proof, a failed proof or a lapsed one sets 150%.
          </p>
        </div>
      </section>

      <section className="card mb-5 grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-8">
        <div>
          <p className="label mb-4">Repayment record</p>
          <div className="flex items-baseline gap-3">
            <p className="tnum text-[30px] font-bold leading-none tracking-[-0.02em]">{records.length}</p>
            <p className="text-[13px] font-semibold">
              {records.length === 1 ? 'repaid loan' : 'repaid loans'} on record in the directory
            </p>
          </div>
          <p className="mt-3 max-w-[460px] text-[11px] leading-[1.6] text-[rgba(15,23,42,0.5)]">
            {records.length >= 2
              ? 'What you can prove on a new application: that two repaid loans exist under your key. The lender learns the count, not which loans, which lenders or how much.'
              : 'Two are needed to prove a repayment history on an application. A loan counts once its lender records the repayment in the directory.'}
          </p>
        </div>
        {records.length > 0 && (
          <div className="min-w-0 md:border-l md:border-[rgba(15,23,42,0.07)] md:pl-8">
            <p className="mb-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-[0.6px] text-[rgba(15,23,42,0.4)]">
              <span>The records</span>
              <span className="badge badge-pending">Only you see this list</span>
            </p>
            <ul className="flex flex-col gap-[10px]">
              {records.map((r) => (
                <li key={r.loan} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-[10px]">
                    <Monogram initials={r.lender.initials} />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-semibold">{r.lender.name}</span>
                      <span className="mono block truncate text-[10px] text-[rgba(15,23,42,0.4)]">
                        {shortHex('0x' + r.loan, 8, 4)}
                      </span>
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-[12px] font-semibold">{money(r.principal)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.08)] px-5 py-[14px]">
          <h2 className="text-[13px] font-semibold">Your loans</h2>
          <span className="tnum text-[11px] text-[rgba(15,23,42,0.4)]">
            {loans.length} {loans.length === 1 ? 'loan' : 'loans'}
            {owing > 0n && ` · ${money(owing)} owed`}
          </span>
        </div>
        {loans.length === 0 ? (
          <p className="px-5 py-12 text-center text-[12px] text-[rgba(15,23,42,0.4)]">
            No loans yet. An application appears here as soon as it is deployed.
          </p>
        ) : (
          <>
            {/* A seven-column table is unreadable on a phone; below md each
                loan is a two-line card that opens the same detail. */}
            <ul className="md:hidden">
              {loans.map((l) => (
                <LoanCard key={l.address} loan={l} now={now} onOpen={() => navigate(`/app/loans/${l.address}`)} />
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="label">
                    <th className="px-5 py-[10px] text-left font-bold">Lender</th>
                    <th className="px-5 py-[10px] text-right font-bold">Principal</th>
                    <th className="px-5 py-[10px] text-left font-bold">Tier</th>
                    <th className="px-5 py-[10px] text-right font-bold">Collateral</th>
                    <th className="px-5 py-[10px] text-right font-bold">Balance</th>
                    <th className="px-5 py-[10px] text-left font-bold">Next due</th>
                    <th className="px-5 py-[10px] text-right font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((l) => (
                    <LoanRow key={l.address} loan={l} now={now} onOpen={() => navigate(`/app/loans/${l.address}`)} />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function LoanRow({ loan: l, now, onOpen }: { loan: LoanView; now: bigint; onOpen: () => void }) {
  const repaying = l.status === 'ACTIVE' && l.disbursed;
  const overdue = repaying && now > l.nextDueAt;
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-t border-[rgba(15,23,42,0.06)] align-middle transition-colors hover:bg-[rgba(15,23,42,0.02)]"
    >
      <td className="px-5 py-[13px]">
        <div className="flex items-center gap-[10px]">
          <Monogram initials={l.lender.initials} />
          <div className="min-w-0">
            <div className="whitespace-nowrap text-[13px] font-semibold">{l.lender.name}</div>
            <div className="mono whitespace-nowrap text-[10px] text-[rgba(15,23,42,0.4)]">{shortHex('0x' + l.address, 6, 4)}</div>
          </div>
        </div>
      </td>
      <td className="tnum px-5 py-[13px] text-right text-[13px] font-semibold">{money(l.terms.principal)}</td>
      <td className="px-5 py-[13px]">
        <TierBadge tier={l.tier} live={l.tierLive || l.status !== 'APPLIED'} />
      </td>
      <td className="tnum px-5 py-[13px] text-right text-[12px]">
        {l.collateralRequired > 0n ? (
          <span className="font-semibold">{money(l.collateralRequired)}</span>
        ) : l.status === 'APPLIED' ? (
          <span className="text-[rgba(15,23,42,0.5)]" title="110% with a live verified tier, 150% otherwise">
            {money(l.collateralIfVerified)} or {money(l.collateralIfStandard)}
          </span>
        ) : (
          <span className="text-[rgba(15,23,42,0.35)]">—</span>
        )}
      </td>
      <td className="tnum px-5 py-[13px] text-right text-[12px] font-semibold">
        {l.disbursed ? money(l.balanceOwed) : <span className="font-normal text-[rgba(15,23,42,0.35)]">—</span>}
      </td>
      <td className="tnum px-5 py-[13px] text-[12px]">
        {repaying ? (
          <>
            <div className="font-semibold">{money(l.amountDue)}</div>
            <div className="text-[11px]" style={{ color: overdue ? '#d97706' : 'rgba(15,23,42,0.45)' }}>
              {blockDate(l.nextDueAt).slice(0, 10)} · {overdue ? `overdue ${relative(l.nextDueAt, now).replace(' ago', '')}` : relative(l.nextDueAt, now)}
            </div>
          </>
        ) : (
          <span className="text-[rgba(15,23,42,0.35)]">—</span>
        )}
      </td>
      <td className="px-5 py-[13px] text-right">
        <LoanStatusBadge status={l.status} />
      </td>
    </tr>
  );
}

function LoanCard({ loan: l, now, onOpen }: { loan: LoanView; now: bigint; onOpen: () => void }) {
  const repaying = l.status === 'ACTIVE' && l.disbursed;
  const overdue = repaying && now > l.nextDueAt;
  return (
    <li
      onClick={onOpen}
      className="cursor-pointer border-t border-[rgba(15,23,42,0.06)] px-5 py-[13px] first:border-t-0"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-[10px]">
          <Monogram initials={l.lender.initials} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{l.lender.name}</span>
            <span className="mono block text-[10px] text-[rgba(15,23,42,0.4)]">{shortHex('0x' + l.address, 6, 4)}</span>
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="tnum text-[13px] font-semibold">{money(l.terms.principal)}</span>
          <LoanStatusBadge status={l.status} />
        </span>
      </div>
      <div className="tnum mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-[36px] text-[11px] text-[rgba(15,23,42,0.5)]">
        <TierBadge tier={l.tier} live={l.tierLive || l.status !== 'APPLIED'} />
        {l.collateralRequired > 0n && <span>Collateral {money(l.collateralRequired)}</span>}
        {repaying && (
          <span style={{ color: overdue ? '#d97706' : undefined }}>
            {money(l.amountDue)} due {blockDate(l.nextDueAt).slice(0, 10)}
          </span>
        )}
      </div>
    </li>
  );
}

function DarkField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  inputMode = 'numeric',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  inputMode?: 'numeric' | 'decimal';
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-[6px] block truncate text-[11px] font-semibold text-[rgba(255,247,235,0.6)]">
        {label}
      </span>
      <span className="relative block">
        {prefix && (
          <span className="pointer-events-none absolute left-[12px] top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[rgba(255,247,235,0.35)]">
            {prefix}
          </span>
        )}
        <input
          className="tnum w-full rounded-[11px] border border-[rgba(255,247,235,0.14)] bg-[rgba(255,247,235,0.06)] py-[10px] pr-3 text-[14px] font-semibold text-cream outline-none transition-colors focus:border-accent"
          style={{ paddingLeft: prefix ? 24 : 12, paddingRight: suffix ? 48 : 12 }}
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-[12px] top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[rgba(255,247,235,0.35)]">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}
