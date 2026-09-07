import { useState } from 'react';
import { formatUsd } from '../lib/format';

export function FactsForm() {
  const [balance, setBalance] = useState('1000000');
  const [debts, setDebts] = useState('300000');
  const [income, setIncome] = useState('1000000');

  const balanceN = BigInt(balance || '0');
  const debtsN = BigInt(debts || '0');
  const incomeN = BigInt(income || '0');
  const netWorth = balanceN >= debtsN ? balanceN - debtsN : 0n;
  const dti = incomeN > 0n ? (debtsN * 100n) / incomeN : 0n;
  const verdict = netWorth >= 500000n && dti <= 40n ? 'PASS' : 'FAIL';

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="heading-lg text-[#0F172A]">Financial Facts</h1>
        <p className="text-sm text-[#0F172A]/40 mt-1">Enter your private financial data. It never leaves this device.</p>
      </div>

      {/* Privacy banner */}
      <div className="glass rounded-xl px-4 py-3 flex items-center gap-3">
        <svg className="w-4 h-4 text-[#D46D25] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <p className="text-xs text-[#0F172A]/40 font-medium">Your financial data never leaves this device</p>
      </div>

      {/* Inputs */}
      <div className="space-y-5">
        <InputField label="Total Balance" value={balance} onChange={setBalance} hint="Savings, investments, assets" />
        <InputField label="Total Debts" value={debts} onChange={setDebts} hint="Loans, credit cards, mortgages" />
        <InputField label="Annual Income" value={income} onChange={setIncome} hint="Gross annual income" />
      </div>

      {/* Live preview */}
      <div className="glass-dark rounded-2xl p-6">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-[#F8FAFC]/40 mb-5">
          Live Preview — Computed Locally
        </p>
        <div className="grid grid-cols-3 gap-6">
          <PreviewStat label="Net Worth" value={formatUsd(netWorth)} />
          <PreviewStat label="DTI Ratio" value={`${Number(dti)}%`} />
          <PreviewStat label="Verdict" value={verdict} pass={verdict === 'PASS'} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button className="flex-1 btn-primary">Save & Commit</button>
        <button className="btn-ghost">Cancel</button>
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-[#0F172A] mb-1.5">{label}</label>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#0F172A]/25 font-medium">$</span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
          className="input-field pl-8"
        />
      </div>
      <p className="text-xs text-[#0F172A]/25 mt-1.5">{hint}</p>
    </div>
  );
}

function PreviewStat({ label, value, pass }: { label: string; value: string; pass?: boolean }) {
  return (
    <div>
      <p className="text-xs text-[#F8FAFC]/30 mb-1">{label}</p>
      <p className={`text-lg font-bold tracking-tight ${pass === true ? 'text-emerald-400' : pass === false ? 'text-red-400' : 'text-[#F8FAFC]'}`}>
        {value}
      </p>
    </div>
  );
}
