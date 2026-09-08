import { useMemo, useState } from 'react';
import { VerdictBadge } from '../components/Badge';
import {
  dtiPercentOf,
  money,
  netWorthOf,
  previewVerdict,
  shortHex,
  termsLabel,
  type FinancialFacts,
} from '../lib/client';
import { useKymider } from '../lib/useKymider';

/** Digits regroup as you type, so a typed figure reads like a committed one. */
const group = (raw: string): string => {
  const digits = String(raw).replace(/[^0-9]/g, '');
  return digits === '' ? '' : Number(digits).toLocaleString('en-US');
};

const toBigInt = (s: string): bigint => {
  const digits = s.replace(/[^0-9]/g, '');
  return digits === '' ? 0n : BigInt(digits);
};

export function Facts() {
  const { client } = useKymider();
  const committed = client.facts();

  const [balance, setBalance] = useState(() => committed.balance.toLocaleString('en-US'));
  const [debts, setDebts] = useState(() => committed.debts.toLocaleString('en-US'));
  const [income, setIncome] = useState(() => committed.income.toLocaleString('en-US'));
  const [saving, setSaving] = useState(false);

  const draft: FinancialFacts = useMemo(
    () => ({ balance: toBigInt(balance), debts: toBigInt(debts), income: toBigInt(income) }),
    [balance, debts, income],
  );

  const dirty =
    draft.balance !== committed.balance ||
    draft.debts !== committed.debts ||
    draft.income !== committed.income;

  const netWorth = netWorthOf(draft);
  const dti = dtiPercentOf(draft);
  const openClaims = client.myRequests().filter((r) => r.terms);

  const commit = async () => {
    setSaving(true);
    try {
      await client.commitFacts(draft);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setBalance(committed.balance.toLocaleString('en-US'));
    setDebts(committed.debts.toLocaleString('en-US'));
    setIncome(committed.income.toLocaleString('en-US'));
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Private facts</h1>
        <span className="badge badge-pending">Nothing on this screen is transmitted</span>
      </header>

      <div className="grid grid-cols-[1fr_1fr] gap-5">
        <section className="card flex flex-col justify-between p-6">
          <div>
            <p className="label mb-4">Statement</p>
            <div className="flex flex-col gap-4">
              <Field
                label="Cash and equivalents"
                hint="Deposit accounts, money market, settled positions"
                value={balance}
                onChange={setBalance}
              />
              <Field
                label="Outstanding debts"
                hint="Principal outstanding across all obligations"
                value={debts}
                onChange={setDebts}
              />
              <Field
                label="Annual income"
                hint="Gross, before tax"
                value={income}
                onChange={setIncome}
              />
            </div>
          </div>

          <div className="mt-8 flex items-center gap-3">
            <button
              type="button"
              className="btn btn-ink"
              onClick={commit}
              disabled={!dirty || saving}
            >
              {saving ? 'Committing…' : 'Commit facts'}
            </button>
            <button type="button" className="btn btn-quiet" onClick={reset} disabled={!dirty}>
              Reset
            </button>
            {!dirty && (
              <span className="text-[11px] text-[rgba(15,23,42,0.4)]">
                Matches the committed statement
              </span>
            )}
          </div>
        </section>

        <div className="flex flex-col gap-5">
          <section className="card p-6">
            <p className="label mb-4">Derived on this device</p>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="mb-1 text-[11px] font-semibold text-[rgba(15,23,42,0.5)]">
                  Net worth
                </p>
                <p className="tnum text-[32px] font-bold leading-none tracking-[-0.02em]">
                  {money(netWorth)}
                </p>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold text-[rgba(15,23,42,0.5)]">
                  Debt-to-income
                </p>
                <p
                  className="tnum text-[32px] font-bold leading-none tracking-[-0.02em]"
                  style={{ color: dti !== null && dti > 40 ? '#d97706' : undefined }}
                >
                  {dti === null ? 'n/a' : `${dti.toFixed(1)}%`}
                </p>
              </div>
            </div>
            <p className="mt-4 text-[11px] leading-[1.5] text-[rgba(15,23,42,0.45)]">
              The circuit compares debt-to-income by cross-multiplication, so the ratio is evaluated
              exactly rather than rounded. Net worth floors at zero, which is why debts above your
              balance show $0 rather than a negative figure.
            </p>
          </section>

          <section className="card-dark flex-1 p-6">
            <p className="label-dark mb-4">Outcome against open claims</p>
            <ul className="flex flex-col gap-[10px]">
              {openClaims.map((r) => (
                <li
                  key={r.lender.id}
                  className="flex items-center justify-between gap-3 rounded-[13px] bg-[rgba(255,247,235,0.05)] px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-cream">{r.lender.name}</div>
                    <div className="tnum truncate text-[11px] text-[rgba(255,247,235,0.45)]">
                      {termsLabel(r.terms!)}
                    </div>
                  </div>
                  <VerdictBadge verdict={previewVerdict(draft, r.terms!)} dark />
                </li>
              ))}
            </ul>
            {dirty && (
              <p className="mt-4 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.42)]">
                A preview of what the circuit would conclude. Commit the statement, then answer each
                request from Claims to record it.
              </p>
            )}
            <div className="mt-6 border-t border-[rgba(255,247,235,0.08)] pt-4">
              <p className="label-dark mb-[6px]">
                {dirty ? 'Commitment that would be written' : 'Committed hash'}
              </p>
              <p className="mono text-[11px] text-[rgba(255,247,235,0.75)]">
                {dirty ? 'pending commit' : shortHex(client.myRecord().commitment, 18, 8)}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-[6px] block text-[12px] font-semibold">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-[13px] font-semibold text-[rgba(15,23,42,0.35)]">
          $
        </span>
        <input
          className="input pl-[26px]"
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(group(e.target.value))}
        />
      </span>
      <span className="mt-[6px] block text-[11px] text-[rgba(15,23,42,0.4)]">{hint}</span>
    </label>
  );
}
