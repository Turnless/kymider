import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { truncateAddress } from '../lib/format';

export function BorrowerDetail() {
  const { address } = useParams<{ address: string }>();
  const [threshold, setThreshold] = useState('500000');
  const [maxDti, setMaxDti] = useState('40');

  const borrower = {
    address: address || '0x1a2b...1a2b',
    owner: '0xaaaa...90ab',
    commitment: '0xabcdef...7890',
    status: 'active' as const,
    attestations: [
      { lender: '0xdead...7890', result: 'PASS' as const },
      { lender: '0xcafe...7890', result: 'FAIL' as const },
    ],
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="heading-lg text-[#0F172A]">Borrower Detail</h1>
        <p className="text-sm text-[#0F172A]/40 mt-1 font-mono">{truncateAddress(borrower.address)}</p>
      </div>

      {/* Public info */}
      <div className="glass rounded-2xl p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <InfoRow label="Instance Address" value={truncateAddress(borrower.address)} />
          <InfoRow label="Owner" value={truncateAddress(borrower.owner)} />
          <InfoRow label="Commitment" value={truncateAddress(borrower.commitment)} />
          <div>
            <p className="text-xs text-[#0F172A]/30 mb-1.5">Status</p>
            <StatusBadge variant={borrower.status}>{borrower.status}</StatusBadge>
          </div>
        </div>
      </div>

      {/* Existing attestations */}
      {borrower.attestations.length > 0 && (
        <div>
          <p className="text-xs font-semibold tracking-wider uppercase text-[#0F172A]/30 mb-3">Existing Attestations</p>
          <div className="flex gap-2">
            {borrower.attestations.map((a, i) => (
              <span key={i} className={`badge ${a.result === 'PASS' ? 'badge-pass' : 'badge-fail'}`}>{a.result}</span>
            ))}
          </div>
        </div>
      )}

      {/* Request claim form */}
      <div className="glass-dark rounded-2xl p-6">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-[#F8FAFC]/40 mb-5">Request a Claim</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-xs text-[#F8FAFC]/40 mb-1.5">Minimum Net Worth (USD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#F8FAFC]/20">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full pl-7 pr-3 py-3 bg-[#F8FAFC]/[0.06] border border-[#F8FAFC]/[0.08] rounded-xl text-sm text-[#F8FAFC] focus:outline-none focus:border-[#D46D25] transition-all"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-[#F8FAFC]/40 mb-1.5">Maximum DTI (%)</label>
            <input
              type="text"
              inputMode="numeric"
              value={maxDti}
              onChange={(e) => setMaxDti(e.target.value.replace(/[^0-9]/g, ''))}
              className="w-full px-3 py-3 bg-[#F8FAFC]/[0.06] border border-[#F8FAFC]/[0.08] rounded-xl text-sm text-[#F8FAFC] focus:outline-none focus:border-[#D46D25] transition-all"
            />
          </div>
        </div>

        <p className="text-xs text-[#F8FAFC]/20 mb-5">
          The borrower will see your request and can choose to prove solvency against these terms. You will only see PASS or FAIL.
        </p>

        <button className="w-full btn-secondary">Request Claim</button>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[#0F172A]/30 mb-1.5">{label}</p>
      <p className="text-sm font-mono text-[#0F172A]">{value}</p>
    </div>
  );
}
