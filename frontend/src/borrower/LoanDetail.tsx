import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { VerdictBadge } from '../components/Badge';
import { DemoClock } from '../components/DemoClock';
import { useLoanAction } from '../components/LoanAction';
import { LoanSpinner, LoanStatusBadge, TierBadge } from '../components/LoanBadges';
import { LoanCollateralCompare } from '../components/LoanCollateral';
import { owedOf, quoteLabel, relative } from '../components/LoanFormat';
import { LoanPublicRecord } from '../components/LoanRecord';
import { LoanRefusal } from '../components/LoanRefusal';
import { LoanStepper } from '../components/LoanStepper';
import { money, previewVerdict, shortHex } from '../lib/client';
import {
  blockDate,
  duration,
  percentOfBps,
  type AuditDisclosure,
  type LoanView,
  type TierName,
} from '../lib/loans';
import { useKymider } from '../lib/useKymider';
import { useLoans } from '../lib/useLoans';

type Act = ReturnType<typeof useLoanAction>;

export function BorrowerLoanDetail() {
  const { address = '' } = useParams();
  const { desk } = useLoans();
  const act = useLoanAction();

  const loan = desk.myLoans().find((l) => l.address === address) ?? desk.loan(address);
  if (!loan) {
    return (
      <div className="mx-auto max-w-[1180px]">
        <p className="text-[13px] text-[rgba(15,23,42,0.6)]">
          No loan at that address.{' '}
          <Link to="/app/loans" className="font-semibold">
            Back to loans
          </Link>
        </p>
      </div>
    );
  }

  const now = desk.now();

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link to="/app/loans" className="mb-[3px] block text-[11px] text-[rgba(15,23,42,0.45)]">
            ← Loans
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="mono text-[20px] font-bold tracking-[-0.01em]">
              {shortHex('0x' + loan.address, 10, 4)}
            </h1>
            <LoanStatusBadge status={loan.status} />
            <TierBadge tier={loan.tier} live={loan.tierLive || loan.status !== 'APPLIED'} />
          </div>
          <p className="tnum mt-1 text-[12px] text-[rgba(15,23,42,0.5)]">
            {money(loan.terms.principal)} from {loan.lender.name}
          </p>
        </div>
        <DemoClock />
      </header>

      <section className="card mb-5 p-5 sm:p-6">
        <LoanStepper loan={loan} now={now} />
      </section>

      <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-5">
          <NextStep loan={loan} now={now} act={act} />
          {loan.status === 'APPLIED' && <HistoryProof loan={loan} act={act} />}
        </div>
        <TermsCard loan={loan} />
      </div>

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold tracking-[-0.01em]">Two ledgers for one loan</h2>
        <p className="text-[11px] text-[rgba(15,23,42,0.45)]">
          The private log opens the public commitment, and nothing else does.
        </p>
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-2 lg:items-start">
        <PaymentLog loan={loan} />
        <LoanPublicRecord loan={loan} />
      </div>

      <AuditorCard loan={loan} />
    </div>
  );
}

// --- the one thing that is the borrower's to do -----------------------------

function NextStep({ loan, now, act }: { loan: LoanView; now: bigint; act: Act }) {
  const { desk } = useLoans();
  const { client } = useKymider();
  const lender = loan.lender.name;

  if (loan.status === 'APPLIED' && !loan.quote) {
    return (
      <Panel kicker="Waiting on the lender" title={`${lender} has not quoted yet`}>
        <p className="text-[12px] leading-[1.6] text-[rgba(255,247,235,0.6)]">
          The quote names the bar for the verified tier: a minimum net worth and a maximum
          debt-to-income. You then prove against it on this device. Until then there is nothing to
          prove against, and the contract would refuse to try.
        </p>
      </Panel>
    );
  }

  if (loan.status === 'APPLIED' && loan.quote) {
    const q = loan.quote;
    const expired = now >= q.expiresAt;
    const preview = previewVerdict(client.facts(), {
      thresholdNetWorth: q.thresholdNetWorth,
      maxDti: q.maxDti,
    });
    const proven = loan.tier !== 'NONE';
    const wouldBe: TierName = preview === 'PASS' ? 'VERIFIED' : 'STANDARD';

    return (
      <Panel
        kicker="Your step · Prove tier"
        title={proven ? `Tier recorded. Waiting for ${lender} to underwrite` : `Clear ${lender}'s bar for 110% collateral`}
      >
        <div className="rounded-[13px] bg-[rgba(255,247,235,0.05)] px-4 py-3">
          <p className="label-dark mb-1">
            The lender's bar · quote {loan.quotesIssued} of {loan.quoteLimit}
          </p>
          <p className="tnum text-[15px] font-semibold text-cream">{quoteLabel(q)}</p>
          <p className="tnum mt-1 text-[11px]" style={{ color: expired ? '#e9b168' : 'rgba(255,247,235,0.45)' }}>
            {expired
              ? `Expired ${blockDate(q.expiresAt)} (${relative(q.expiresAt, now)}). The lender has to quote again.`
              : `A tier proven against it holds until ${blockDate(q.expiresAt)} (${relative(q.expiresAt, now)}).`}
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[13px] bg-[rgba(255,247,235,0.05)] px-4 py-3">
          <div className="min-w-0">
            <p className="label-dark mb-1">Preview on this device</p>
            <p className="text-[12px] text-[rgba(255,247,235,0.7)]">
              {preview === 'PASS' ? 'Your committed facts clear the bar' : 'Your committed facts do not clear the bar'}
              {' → '}
              <span className="font-semibold text-cream">
                {wouldBe === 'VERIFIED' ? 'Verified · 110%' : 'Standard · 150%'}
              </span>
            </p>
          </div>
          <VerdictBadge verdict={preview} dark />
        </div>

        {proven && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-[rgba(255,247,235,0.6)]">
            On the ledger now: <TierBadge tier={loan.tier} live={loan.tierLive} dark />
          </p>
        )}

        <p className="mt-4 flex items-start gap-2 text-[12px] font-semibold leading-[1.5] text-cream">
          <LockIcon />
          Your balance, debts and income stay on this device; the lender sees only the tier.
        </p>
        {preview === 'FAIL' && (
          <p className="mt-2 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.45)]">
            A proof that does not clear the bar is recorded as Standard: 150% collateral, a usable
            answer rather than a dead end.
          </p>
        )}
        {!loan.factsBound && (
          <p className="mt-2 text-[11px] leading-[1.5] text-[#e9b168]">
            Your solvency instance has committed again since this loan was opened, so its commitment
            no longer matches this loan's. A proof needs the facts and salt this loan was opened with.
          </p>
        )}

        <button
          type="button"
          className="btn btn-accent mt-5 w-full py-[13px] sm:w-auto sm:px-[30px]"
          style={{ boxShadow: '0 0 34px rgba(212,109,37,0.28)' }}
          onClick={() => act.run('prove', () => desk.proveTier(loan.address))}
          disabled={act.busy !== null}
        >
          {act.busy === 'prove' ? (
            <>
              <LoanSpinner /> Generating proof
            </>
          ) : proven ? (
            'Prove again'
          ) : (
            'Prove tier'
          )}
        </button>
        {loan.tierProven && (
          <p className="mt-2 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.45)]">
            One proof per quote: the contract refuses another until the lender quotes again, so a
            lender learns at most {loan.quoteLimit} answers about your facts on this loan.
          </p>
        )}
        <LoanRefusal message={act.refusalFor('prove')} onDismiss={act.clear} dark />
      </Panel>
    );
  }

  if (loan.status === 'ACTIVE' && !loan.disbursed) {
    return (
      <Panel kicker="Waiting on the lender" title={`Underwritten. Waiting for ${lender} to disburse`}>
        <p className="tnum text-[12px] leading-[1.6] text-[rgba(255,247,235,0.6)]">
          Accepted at {loan.tier === 'VERIFIED' ? 'the verified tier' : 'the standard tier'} with{' '}
          <span className="font-semibold text-cream">{money(loan.collateralRequired)}</span>{' '}
          collateral. Disbursing starts the clock: the first installment falls due{' '}
          {duration(loan.terms.periodSeconds)} after.
        </p>
      </Panel>
    );
  }

  if (loan.status === 'ACTIVE') {
    const onTime = now <= loan.nextDueAt;
    const defaultable = loan.defaultableFrom !== null && now >= loan.defaultableFrom;
    const index = Number(loan.paymentsMade) + 1;
    return (
      <Panel kicker="Your step · Repay" title={`Installment ${index} of ${loan.terms.installments}`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="label-dark mb-[6px]">Amount due</p>
            <p className="tnum text-[40px] font-black leading-none tracking-[-0.03em] text-cream">
              {money(loan.amountDue)}
            </p>
          </div>
          <div className="text-right">
            <p className="label-dark mb-[6px]">Due</p>
            <p className="tnum text-[13px] font-semibold text-cream">{blockDate(loan.nextDueAt)}</p>
            <p className="tnum text-[11px]" style={{ color: onTime ? 'rgba(255,247,235,0.45)' : '#e9b168' }}>
              {relative(loan.nextDueAt, now)}
            </p>
          </div>
        </div>

        <p
          className="mt-4 rounded-[13px] px-4 py-3 text-[12px] leading-[1.5]"
          style={
            onTime
              ? { background: 'rgba(94,201,138,0.1)', color: '#a7e3c1' }
              : { background: 'rgba(217,119,6,0.14)', color: '#e9b168' }
          }
        >
          {onTime
            ? 'Paying now is on time. Block time decides lateness, not you or the lender.'
            : defaultable
              ? `This installment is ${duration(now - loan.nextDueAt)} late and past the 3-day grace period: the lender can now call a default. Paying now is still accepted, and recorded as late.`
              : `This installment is ${duration(now - loan.nextDueAt)} late. Paying now is recorded as late on the ledger; the lender can call a default from ${blockDate(loan.defaultableFrom!)}.`}
        </p>

        <p className="tnum mt-3 text-[11px] text-[rgba(255,247,235,0.45)]">
          Balance owed {money(loan.balanceOwed)} → {money(loan.balanceOwed - loan.amountDue)} after this payment.
        </p>

        <button
          type="button"
          className="btn btn-accent mt-5 w-full py-[13px] sm:w-auto sm:px-[30px]"
          style={{ boxShadow: '0 0 34px rgba(212,109,37,0.28)' }}
          onClick={() => act.run('repay', () => desk.repay(loan.address))}
          disabled={act.busy !== null}
        >
          {act.busy === 'repay' ? (
            <>
              <LoanSpinner /> Paying
            </>
          ) : (
            `Repay ${money(loan.amountDue)}`
          )}
        </button>
        <LoanRefusal message={act.refusalFor('repay')} onDismiss={act.clear} dark />
      </Panel>
    );
  }

  if (loan.status === 'REPAID') {
    return (
      <Panel kicker="Closed" title="Repaid in full" tone="pass">
        <p className="tnum text-[12px] leading-[1.6] text-[rgba(255,247,235,0.6)]">
          {String(loan.paymentsMade)} payments, {String(loan.latePayments)} late.{' '}
          {loan.recorded
            ? 'The lender has recorded the repayment in the directory, so it counts toward proving two repaid loans on a future application.'
            : `It counts toward your repayment record once ${lender} records it in the directory.`}
        </p>
      </Panel>
    );
  }

  if (loan.status === 'DEFAULTED') {
    return (
      <Panel kicker="Closed" title="Defaulted" tone="fail">
        <p className="tnum text-[12px] leading-[1.6] text-[rgba(255,247,235,0.6)]">
          {lender} called a default after an installment passed its 3-day grace period.{' '}
          {String(loan.paymentsMade)} of {String(loan.terms.installments)} installments were paid;{' '}
          {money(loan.balanceOwed)} was outstanding.
        </p>
      </Panel>
    );
  }

  return (
    <Panel kicker="Closed" title={`${lender} declined this application`}>
      <p className="text-[12px] leading-[1.6] text-[rgba(255,247,235,0.6)]">
        Nothing was disbursed and no collateral was set. The lender saw only the tier, if one was
        proven; your figures were never part of the application.
      </p>
    </Panel>
  );
}

function Panel({
  kicker,
  title,
  tone,
  children,
}: {
  kicker: string;
  title: string;
  tone?: 'pass' | 'fail';
  children: ReactNode;
}) {
  const color = tone === 'pass' ? '#7bd9a5' : tone === 'fail' ? '#f09484' : 'var(--color-accent)';
  return (
    <section className="card-dark rise p-6">
      <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.8px]" style={{ color }}>
        <span className="size-[5px] rounded-full" style={{ background: color }} />
        {kicker}
      </p>
      <h2 className="mb-4 text-[20px] font-bold tracking-[-0.01em] text-cream">{title}</h2>
      {children}
    </section>
  );
}

// --- prove two repaid loans --------------------------------------------------

function HistoryProof({ loan, act }: { loan: LoanView; act: Act }) {
  const { desk } = useLoans();
  const records = desk.repaidRecords().filter((r) => r.loan !== loan.address);
  const [picked, setPicked] = useState<string[]>([]);

  if (loan.historyProofCount >= 2) {
    return (
      <section className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="label">Repayment history</p>
          <span className="badge badge-pass">Two repaid loans proven</span>
        </div>
        <p className="mt-3 text-[12px] leading-[1.6] text-[rgba(15,23,42,0.6)]">
          The directory now shows {loan.lender.name} that this application's borrower has two
          repaid loans on record. Which loans, which lenders and how much stay with you.
        </p>
      </section>
    );
  }

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 2 ? p : [...p, id]));

  const prove = async () => {
    const [a, b] = picked;
    const ok = await act.run('history', async () => {
      await desk.proveHistory(loan.address, a, b);
      return true;
    });
    if (ok) setPicked([]);
  };

  return (
    <section className="card p-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="label">Optional · Prove two repaid loans</p>
        <span className="tnum text-[11px] text-[rgba(15,23,42,0.4)]">
          {records.length} on record · {picked.length} of 2 picked
        </span>
      </div>
      <p className="mb-4 text-[12px] leading-[1.6] text-[rgba(15,23,42,0.6)]">
        Attach a repayment history to this application. The lender learns that two repaid loans
        exist in the directory under your key, not which loans, which lenders or how much.
      </p>

      {records.length < 2 ? (
        <p className="rounded-[13px] bg-[rgba(15,23,42,0.03)] px-4 py-3 text-[12px] text-[rgba(15,23,42,0.55)]">
          {records.length === 0 ? 'No repaid loans' : 'One repaid loan'} on record yet. Two are
          needed; a loan counts once its lender records the repayment in the directory.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {records.map((r) => {
            const on = picked.includes(r.loan);
            const full = !on && picked.length >= 2;
            return (
              <li key={r.loan}>
                <label
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-[13px] px-4 py-3 transition-colors"
                  style={{
                    background: on ? 'rgba(212,109,37,0.08)' : 'rgba(15,23,42,0.03)',
                    border: `1px solid ${on ? 'rgba(212,109,37,0.35)' : 'transparent'}`,
                    opacity: full ? 0.5 : 1,
                  }}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={full}
                      onChange={() => toggle(r.loan)}
                      className="size-4 shrink-0 accent-[#d46d25]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-semibold">{r.lender.name}</span>
                      <span className="mono block truncate text-[10px] text-[rgba(15,23,42,0.4)]">
                        {shortHex('0x' + r.loan, 8, 4)}
                      </span>
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-[12px] font-semibold">{money(r.principal)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {records.length >= 2 && (
        <>
          <p className="mt-3 text-[11px] text-[rgba(15,23,42,0.45)]">
            This list is private to you. Only the proof that two of them exist is published.
          </p>
          <button
            type="button"
            className="btn btn-ink mt-4 w-full sm:w-auto"
            onClick={prove}
            disabled={picked.length !== 2 || act.busy !== null}
          >
            {act.busy === 'history' ? (
              <>
                <LoanSpinner /> Generating proof
              </>
            ) : (
              'Prove two repaid loans'
            )}
          </button>
        </>
      )}
      <LoanRefusal message={act.refusalFor('history')} onDismiss={act.clear} />
    </section>
  );
}

// --- terms and collateral ----------------------------------------------------

function TermsCard({ loan }: { loan: LoanView }) {
  const t = loan.terms;
  const owed = owedOf(t);
  const installment = loan.disbursed
    ? loan.installmentAmount
    : (owed + t.installments - 1n) / (t.installments > 0n ? t.installments : 1n);
  const applies: TierName | undefined =
    loan.collateralRequired > 0n
      ? loan.tier
      : loan.status === 'APPLIED' && loan.tier === 'VERIFIED' && loan.tierLive
        ? 'VERIFIED'
        : loan.status === 'APPLIED' && loan.tier !== 'NONE'
          ? 'STANDARD'
          : undefined;

  return (
    <section className="card flex flex-col p-6">
      <p className="label mb-4">Terms</p>
      <dl className="flex flex-col gap-[10px] text-[12px]">
        <TermRow label="Principal" value={money(t.principal)} />
        <TermRow label="Interest, flat" value={percentOfBps(t.interestBps)} />
        <TermRow label="Installments" value={`${t.installments} × ${money(installment)}`} />
        <TermRow label="Every" value={duration(t.periodSeconds)} />
        <TermRow label="Total owed" value={money(owed)} />
      </dl>

      <div className="mt-6 border-t border-[rgba(15,23,42,0.07)] pt-5">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <p className="label">Collateral</p>
          <span className="text-[11px] text-[rgba(15,23,42,0.45)]">
            {loan.collateralRequired > 0n ? 'Set at underwriting' : loan.status === 'DECLINED' ? 'Never set' : 'Set when underwritten'}
          </span>
        </div>
        <LoanCollateralCompare principal={t.principal} applies={applies} />
      </div>
    </section>
  );
}

function TermRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[rgba(15,23,42,0.5)]">{label}</dt>
      <dd className="tnum font-semibold">{value}</dd>
    </div>
  );
}

// --- the private ledger ------------------------------------------------------

function PaymentLog({ loan }: { loan: LoanView }) {
  const { desk } = useLoans();
  const log = desk.paymentLog(loan.address);

  return (
    <section className="card flex min-w-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(15,23,42,0.08)] px-5 py-[14px]">
        <h3 className="text-[13px] font-semibold">Payment log</h3>
        <span className="badge badge-pending">Private to this device</span>
      </div>
      {log.length === 0 ? (
        <p className="px-5 py-10 text-center text-[12px] text-[rgba(15,23,42,0.4)]">
          No payments yet.
        </p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="label">
              <th className="px-5 py-[10px] text-left font-bold">#</th>
              <th className="px-3 py-[10px] text-left font-bold">Paid at</th>
              <th className="px-3 py-[10px] text-right font-bold">Amount</th>
              <th className="px-5 py-[10px] text-right font-bold">Timing</th>
            </tr>
          </thead>
          <tbody>
            {log.map((p) => (
              <tr key={p.index} className="border-t border-[rgba(15,23,42,0.06)]">
                <td className="tnum px-5 py-[11px] text-[12px] text-[rgba(15,23,42,0.45)]">{p.index + 1}</td>
                <td className="tnum px-3 py-[11px] text-[12px]">{blockDate(p.at).slice(0, 16)}</td>
                <td className="tnum px-3 py-[11px] text-right text-[12px] font-semibold">{money(p.amount)}</td>
                <td className="px-5 py-[11px] text-right">
                  <span className={`badge ${p.onTime ? 'badge-pass' : 'badge-pending'}`}>
                    {p.onTime ? 'On time' : 'Late'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-auto border-t border-[rgba(15,23,42,0.07)] px-5 py-4 text-[11px] leading-[1.6] text-[rgba(15,23,42,0.45)]">
        Kept by this browser, never sent. The ledger holds only how many payments were made, how
        many were late, and the history commitment these entries open.
      </p>
    </section>
  );
}

// --- opening the history to an auditor ---------------------------------------

function AuditorCard({ loan }: { loan: LoanView }) {
  const { desk } = useLoans();
  const act = useLoanAction();
  const [disclosure, setDisclosure] = useState<AuditDisclosure | null>(null);
  const [copied, setCopied] = useState(false);

  const json = disclosure
    ? JSON.stringify(disclosure, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
    : '';
  const nothing = loan.paymentsMade === 0n;

  const open = () => {
    setCopied(false);
    void act.run('disclose', () => setDisclosure(desk.disclose(loan.address)));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `kymider-loan-${loan.address.slice(0, 8)}-history.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="card p-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="label mb-3">Wave 3 preview · Selective disclosure</p>
          <h3 className="text-[17px] font-bold tracking-[-0.01em]">Open this loan's history to an auditor</h3>
          <p className="mt-2 text-[12px] leading-[1.6] text-[rgba(15,23,42,0.6)]">
            Hands over the openings of this loan's payment log: each amount, whether it was on time,
            and its nonce. An auditor rebuilds the chain and checks it against the public history
            commitment. It covers this loan only, and only when you choose to share it.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-ink"
              onClick={open}
              disabled={nothing || act.busy !== null}
            >
              {disclosure ? 'Rebuild disclosure' : 'Open history to an auditor'}
            </button>
            <Link to="/app/audit" className="text-[12px] font-semibold">
              Go to the auditor screen →
            </Link>
          </div>
          {nothing && (
            <p className="mt-3 text-[11px] text-[rgba(15,23,42,0.45)]">
              Nothing to open until the first payment is made.
            </p>
          )}
          <LoanRefusal message={act.refusalFor('disclose')} onDismiss={act.clear} />
        </div>

        <div className="min-w-0">
          {disclosure ? (
            <div className="rise">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-[rgba(15,23,42,0.5)]">
                  {disclosure.payments.length} payments · paste or upload on the auditor screen
                </p>
                <div className="flex gap-2">
                  <button type="button" className="btn btn-quiet px-3 py-[6px] text-[12px]" onClick={copy}>
                    {copied ? 'Copied' : 'Copy JSON'}
                  </button>
                  <button type="button" className="btn btn-quiet px-3 py-[6px] text-[12px]" onClick={download}>
                    Download
                  </button>
                </div>
              </div>
              <pre className="mono max-h-[260px] overflow-auto rounded-[13px] bg-espresso p-4 text-[11px] leading-[1.6] text-[rgba(255,247,235,0.8)]">
                {json}
              </pre>
            </div>
          ) : (
            <div className="flex h-full min-h-[120px] items-center justify-center rounded-[13px] border border-dashed border-[rgba(15,23,42,0.14)] px-4 text-center text-[12px] text-[rgba(15,23,42,0.4)]">
              The disclosure appears here. Nothing leaves this device until you copy or download it.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="mt-[2px] shrink-0">
      <rect x="3" y="7" width="10" height="7" rx="2" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
    </svg>
  );
}
