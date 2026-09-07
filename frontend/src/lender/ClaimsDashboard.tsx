import { useState } from 'react';
import { StatusBadge } from '../components/StatusBadge';
import { truncateAddress, formatUsd } from '../lib/format';

type Claim = {
  id: string;
  borrowerAddress: string;
  thresholdNetWorth: bigint;
  maxDti: bigint;
  status: 'pending' | 'approved' | 'rejected';
  attestation: 'PASS' | 'FAIL' | 'NONE';
};

const MOCK_CLAIMS: Claim[] = [
  { id: '1', borrowerAddress: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b', thresholdNetWorth: 500000n, maxDti: 40n, status: 'approved', attestation: 'PASS' },
  { id: '2', borrowerAddress: '0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c', thresholdNetWorth: 200000n, maxDti: 50n, status: 'pending', attestation: 'NONE' },
  { id: '3', borrowerAddress: '0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d', thresholdNetWorth: 1000000n, maxDti: 30n, status: 'rejected', attestation: 'FAIL' },
];

export function ClaimsDashboard() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const filtered = filter === 'all' ? MOCK_CLAIMS : MOCK_CLAIMS.filter((c) => c.status === filter);

  const counts = {
    all: MOCK_CLAIMS.length,
    pending: MOCK_CLAIMS.filter((c) => c.status === 'pending').length,
    approved: MOCK_CLAIMS.filter((c) => c.status === 'approved').length,
    rejected: MOCK_CLAIMS.filter((c) => c.status === 'rejected').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-lg text-[#0F172A]">Claims Dashboard</h1>
        <p className="text-sm text-[#0F172A]/40 mt-1">Track all claims across borrowers</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: counts.all, color: 'text-[#0F172A]' },
          { label: 'Pending', value: counts.pending, color: 'text-amber-600' },
          { label: 'Approved', value: counts.approved, color: 'text-emerald-600' },
          { label: 'Rejected', value: counts.rejected, color: 'text-red-600' },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-4 card-hover">
            <p className="text-[11px] font-semibold tracking-wider uppercase text-[#0F172A]/30 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold tracking-tight ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 glass rounded-xl w-fit">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer border-0 ${
              filter === f
                ? 'bg-[#000000] text-[#F8FAFC]'
                : 'bg-transparent text-[#0F172A]/40 hover:text-[#0F172A]'
            }`}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {/* Claims */}
      <div className="space-y-3 stagger">
        {filtered.map((claim) => (
          <div key={claim.id} className="glass rounded-2xl p-5 card-hover">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[#0F172A]/40">{truncateAddress(claim.borrowerAddress)}</span>
                  <StatusBadge variant={claim.status}>{claim.status}</StatusBadge>
                </div>
                <p className="text-sm text-[#0F172A]/60">
                  Net worth &ge; {formatUsd(claim.thresholdNetWorth)}, DTI &le; {Number(claim.maxDti)}%
                </p>
              </div>

              <div className="flex items-center gap-3">
                {claim.attestation !== 'NONE' && (
                  <span className={`badge ${claim.attestation === 'PASS' ? 'badge-pass' : 'badge-fail'}`}>{claim.attestation}</span>
                )}
                {claim.status === 'pending' && claim.attestation !== 'NONE' && (
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-emerald-600 text-[#F8FAFC] text-xs font-semibold rounded-xl hover:bg-emerald-700 transition-colors cursor-pointer border-0">Approve</button>
                    <button className="px-4 py-2 bg-red-600 text-[#F8FAFC] text-xs font-semibold rounded-xl hover:bg-red-700 transition-colors cursor-pointer border-0">Reject</button>
                  </div>
                )}
                {claim.status === 'pending' && claim.attestation === 'NONE' && (
                  <span className="text-xs text-[#0F172A]/25 italic">Waiting for borrower to prove...</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16"><p className="text-sm text-[#0F172A]/30">No claims in this category</p></div>
      )}
    </div>
  );
}
