import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { bytesToHex, historyGenesis, openHistory, parseDisclosure, type Disclosure } from '@contracts/audit.js';
import { money, shortHex } from '../lib/client';
import type { AuditVerdict, LoanView } from '../lib/loans';
import { useLoans } from '../lib/useLoans';

/**
 * The auditor's view (Wave 3 preview, route /app/audit).
 *
 * A borrower hands over one loan's payment history as a disclosure file. The
 * auditor never takes the borrower's word for which loan it is or what the
 * chain says: the view looks the named loan up on the desk, and the desk
 * recomputes the history chain from the openings and compares it with that
 * loan's on-chain head. The table is the openings replayed; the dark panel is
 * everything the public ledger alone shows about the same loan.
 */
export function AuditView() {
  const { desk } = useLoans();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (submitted === null ? null : parseDisclosure(submitted)), [submitted]);
  const disclosure = parsed?.ok ? parsed.disclosure : null;

  // Read fresh on every render: the chain moves under an open audit (another
  // repayment, a default), and useLoans re-renders this view when it does.
  const loan: LoanView | null = disclosure ? desk.loan(disclosure.loan) : null;
  const verdict: AuditVerdict | null = disclosure ? desk.verifyDisclosure(disclosure) : null;
  const rows = useMemo(() => (disclosure ? openHistory(disclosure) : null), [disclosure]);

  // Demo convenience: in the local simulation the borrower is this browser,
  // so one of its loans can be disclosed straight into the box.
  const ownLoans = desk.myLoans().filter((l) => l.paymentsMade > 0n);

  const load = (json: string, name: string | null) => {
    setText(json);
    setFileName(name);
    setSubmitted(json);
  };

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) load(await file.text(), file.name);
  };

  const discloseOwn = (address: string) =>
    load(JSON.stringify(desk.disclose(address), null, 2), null);

  const clear = () => {
    setText('');
    setFileName(null);
    setSubmitted(null);
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-[3px] text-[11px] text-[rgba(15,23,42,0.4)]">Auditor · Wave 3 preview</p>
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">Payment history audit</h1>
        </div>
        <span className="badge badge-neutral">Read-only · nothing is written to the ledger</span>
      </header>

      <section className="card mb-5 p-5 sm:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="label">Disclosure from the borrower</p>
          {fileName && <span className="mono text-[11px] text-[rgba(15,23,42,0.45)]">{fileName}</span>}
        </div>
        <textarea
          className="input mono min-h-[132px] resize-y text-[12px] font-medium leading-[1.55]"
          spellCheck={false}
          placeholder={'{ "version": 1, "loan": "…", "payments": [ { "amount": "367", "onTime": true, "nonce": "…" } ] }'}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileName(null);
          }}
          aria-label="Disclosure JSON"
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => setSubmitted(text)}
            disabled={text.trim() === ''}
          >
            Verify against the chain
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => fileInput.current?.click()}>
            Upload JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={upload}
          />
          {(text !== '' || submitted !== null) && (
            <button type="button" className="btn btn-quiet" onClick={clear}>
              Clear
            </button>
          )}
          {ownLoans.length > 0 && (
            <label className="flex w-full items-center gap-2 text-[11px] text-[rgba(15,23,42,0.5)] sm:ml-auto sm:w-auto">
              <span className="hidden sm:inline">Demo:</span>
              <select
                className="input w-full py-[8px] text-[12px] sm:w-auto"
                value=""
                onChange={(e) => e.target.value && discloseOwn(e.target.value)}
              >
                <option value="">Disclose one of this browser&apos;s loans…</option>
                {ownLoans.map((l) => (
                  <option key={l.address} value={l.address}>
                    {shortHex('0x' + l.address, 8, 4)} · {String(l.paymentsMade)} paid
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>

      {parsed && !parsed.ok && <Verdict verdict={parsed} parseError />}

      {disclosure && verdict && (
        <>
          <Verdict verdict={verdict} />
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_360px]">
            <History rows={rows ?? []} loan={loan} verdict={verdict} />
            <div className="flex min-w-0 flex-col gap-5">
              <PublicLedger disclosure={disclosure} loan={loan} rows={rows ?? []} />
              <Learned />
            </div>
          </div>
        </>
      )}

      {submitted === null && <Learned standalone />}
    </div>
  );
}

function Verdict({ verdict, parseError = false }: { verdict: AuditVerdict; parseError?: boolean }) {
  if (verdict.ok) {
    return (
      <section className="card flex flex-wrap items-center gap-x-5 gap-y-3 border-[rgba(22,163,74,0.25)] px-5 py-4">
        <span className="badge badge-pass">Verified</span>
        <p className="min-w-0 flex-1 text-[13px] leading-[1.55]">
          The disclosure opens this loan&apos;s on-chain history exactly:{' '}
          <span className="tnum font-semibold">
            {verdict.payments} {verdict.payments === 1 ? 'payment' : 'payments'}, {verdict.late} late,{' '}
            {money(verdict.total)} repaid
          </span>
          . Nothing was added, dropped, reordered or edited.
        </p>
      </section>
    );
  }
  const [kind, ...rest] = verdict.reason.split(': ');
  return (
    <section className="card flex flex-wrap items-start gap-x-5 gap-y-3 border-[rgba(220,38,38,0.25)] px-5 py-4">
      <span className="badge badge-fail">{parseError ? 'Unreadable' : 'Rejected'}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold first-letter:uppercase">{kind}</p>
        {rest.length > 0 && (
          <p className="mono mt-1 break-words text-[11px] text-[rgba(15,23,42,0.55)]">{rest.join(': ')}</p>
        )}
        <p className="mt-2 text-[11px] leading-[1.6] text-[rgba(15,23,42,0.45)]">
          {parseError
            ? 'The file is not a well-formed disclosure, so it was not checked against the chain.'
            : 'Treat every row below as unproven. Only a disclosure that lands exactly on the on-chain head says anything about this loan.'}
        </p>
      </div>
    </section>
  );
}

function History({
  rows,
  loan,
  verdict,
}: {
  rows: NonNullable<ReturnType<typeof openHistory>>;
  loan: LoanView | null;
  verdict: AuditVerdict;
}) {
  const chainHead = loan?.historyCommitment.toLowerCase().replace(/^0x/, '') ?? null;
  return (
    <section className="card min-w-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.08)] px-5 py-[14px]">
        <h2 className="text-[13px] font-semibold">What the disclosure opens</h2>
        <span className={`badge ${verdict.ok ? 'badge-pass' : 'badge-fail'}`}>
          {verdict.ok ? 'Proven' : 'Unproven'}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[12px] text-[rgba(15,23,42,0.45)]">
          No payments opened. That is a valid history only for a loan with no repayments yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[400px]">
            <thead>
              <tr className="label">
                <th className="px-4 py-[10px] sm:px-5 text-left font-bold">#</th>
                <th className="px-4 py-[10px] sm:px-5 text-right font-bold">Amount</th>
                <th className="px-4 py-[10px] sm:px-5 text-left font-bold">Timeliness</th>
                <th className="px-4 py-[10px] sm:px-5 text-left font-bold">Chain head after</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const last = r.index === rows.length;
                const lands = last && chainHead !== null && r.head === chainHead;
                return (
                  <tr key={r.index} className="border-t border-[rgba(15,23,42,0.06)] align-middle">
                    <td className="tnum px-4 py-[12px] sm:px-5 text-[12px] text-[rgba(15,23,42,0.5)]">{r.index}</td>
                    <td className="tnum px-4 py-[12px] sm:px-5 text-right text-[13px] font-semibold">{money(r.amount)}</td>
                    <td className="px-4 py-[12px] sm:px-5">
                      <span className={`badge ${r.onTime ? 'badge-pass' : 'badge-pending'}`}>
                        {r.onTime ? 'On time' : 'Late'}
                      </span>
                    </td>
                    <td className="px-4 py-[12px] sm:px-5">
                      <span className="mono text-[11px] text-[rgba(15,23,42,0.6)]">{r.head.slice(0, 12)}…</span>
                      {last && (
                        <span
                          className={`ml-2 whitespace-nowrap text-[10px] font-semibold ${lands ? 'text-[#16a34a]' : 'text-[#dc2626]'}`}
                        >
                          {lands ? '= on-chain head' : '≠ on-chain head'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-[rgba(15,23,42,0.07)] px-5 py-4 text-[11px] leading-[1.6] text-[rgba(15,23,42,0.45)]">
        Each head is the hash of the one before it, the payment&apos;s amount, its on-time flag and a
        nonce from the borrower&apos;s private seed, computed here exactly as the Loan contract computed it
        at repayment. Change any field, or the order, and every head after it changes.
      </p>
    </section>
  );
}

function PublicLedger({
  disclosure,
  loan,
  rows,
}: {
  disclosure: Disclosure;
  loan: LoanView | null;
  rows: NonNullable<ReturnType<typeof openHistory>>;
}) {
  const opened = rows.length;
  const openedLate = rows.filter((r) => !r.onTime).length;
  const openedHead = rows.length > 0 ? rows[rows.length - 1]!.head : bytesToHex(historyGenesis());
  return (
    <section className="card-dark p-5">
      <p className="label-dark mb-4">What the public ledger shows</p>
      {loan === null ? (
        <p className="text-[12px] leading-[1.6] text-[rgba(255,247,235,0.6)]">
          No loan at <span className="mono">{shortHex('0x' + disclosure.loan, 10, 4)}</span>. A disclosure
          is checked only against the loan it names, so there is nothing to check it against.
        </p>
      ) : (
        <>
          <dl className="flex flex-col gap-[10px] text-[11px]">
            <Row label="Loan" value={shortHex('0x' + loan.address, 10, 4)} />
            <Row label="Status" value={loan.status.toLowerCase()} />
            <Row label="Borrower key" value={shortHex(loan.borrower, 8, 4)} />
            <Row
              label="Payments made"
              value={String(loan.paymentsMade)}
              off={BigInt(opened) !== loan.paymentsMade}
            />
            <Row
              label="Late payments"
              value={String(loan.latePayments)}
              off={BigInt(openedLate) !== loan.latePayments}
            />
            <Row label="Balance owed" value={money(loan.balanceOwed)} />
            <Row
              label="History commitment"
              value={shortHex(loan.historyCommitment, 12, 4)}
              off={openedHead !== loan.historyCommitment.toLowerCase().replace(/^0x/, '')}
            />
          </dl>
          <p className="mt-5 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.42)]">
            Counts and one hash. On its own the ledger cannot say which payments were late or what each
            one was; the disclosure opens that, and the hash proves the opening is the whole truth.
          </p>
        </>
      )}
    </section>
  );
}

function Learned({ standalone = false }: { standalone?: boolean }) {
  return (
    <section className={`card p-5 ${standalone ? 'max-w-[760px]' : ''}`}>
      <p className="label mb-3">What the auditor learns, and what they don&apos;t</p>
      <p className="text-[12px] leading-[1.7] text-[rgba(15,23,42,0.7)]">
        A verified disclosure tells you every repayment on this one loan: its amount, whether the
        contract judged it on time by block time, and its order, with proof that nothing was added,
        dropped, reordered or edited. It does not tell you the borrower&apos;s balance, debts or income
        behind the collateral tier, anything about their other loans, or who they are beyond the public
        borrower key. It binds to the loan only because this view looks up the loan the file names on
        the chain, and the audit itself leaves no record on the ledger.
      </p>
    </section>
  );
}

/** `off`: the disclosure disagrees with this figure. */
function Row({ label, value, off = false }: { label: string; value: string; off?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[rgba(255,247,235,0.5)]">{label}</dt>
      <dd className={`mono truncate text-right ${off ? 'text-[#f09484]' : 'text-[rgba(255,247,235,0.9)]'}`}>
        {off && (
          <span className="mr-[6px]" title="The disclosure disagrees with the ledger here">
            ≠
          </span>
        )}
        {value}
      </dd>
    </div>
  );
}
