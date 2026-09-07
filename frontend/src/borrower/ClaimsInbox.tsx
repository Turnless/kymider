import { StatusBadge } from '../components/StatusBadge';
import { truncateAddress, formatUsd } from '../lib/format';

type Claim = {
  id: string;
  lenderAddress: string;
  thresholdNetWorth: bigint;
  maxDti: bigint;
  status: 'pending' | 'approved' | 'rejected';
  attestation: 'PASS' | 'FAIL' | 'NONE';
};

const MOCK_CLAIMS: Claim[] = [
  { id: '1', lenderAddress: '0xdeadbeef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', thresholdNetWorth: 500000n, maxDti: 40n, status: 'approved', attestation: 'PASS' },
  { id: '2', lenderAddress: '0xcafebabe1234567890abcdef1234567890abcdef1234567890abcdef1234567890', thresholdNetWorth: 200000n, maxDti: 50n, status: 'pending', attestation: 'NONE' },
  { id: '3', lenderAddress: '0xface1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab', thresholdNetWorth: 1000000n, maxDti: 30n, status: 'rejected', attestation: 'FAIL' },
];

export function ClaimsInbox() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="heading-lg text-[#0F172A]">Claims Inbox</h1>
        <p className="text-sm text-[#0F172A]/40 mt-1">Lender requests and your attestation results</p>
      </div>

      {MOCK_CLAIMS.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-[#0F172A]/15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <h3 className="text-sm font-semibold text-[#0F172A]/60 mb-1">No claims yet</h3>
          <p className="text-xs text-[#0F172A]/30">Share your instance address with lenders to receive claims</p>
        </div>
      ) : (
        <div className="space-y-3 stagger">
          {MOCK_CLAIMS.map((claim) => (
            <div key={claim.id} className="glass rounded-2xl p-5 card-hover">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#0F172A]/40">{truncateAddress(claim.lenderAddress)}</span>
                    <StatusBadge variant={claim.status}>{claim.status}</StatusBadge>
                  </div>
                  <p className="text-sm text-[#0F172A]/60">
                    Net worth &ge; {formatUsd(claim.thresholdNetWorth)}, DTI &le; {Number(claim.maxDti)}%
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {claim.attestation !== 'NONE' && (
                    <span className={`badge ${claim.attestation === 'PASS' ? 'badge-pass' : 'badge-fail'}`}>
                      {claim.attestation}
                    </span>
                  )}
                  {claim.status === 'pending' && (
                    <div className="flex gap-2">
                      <button className="btn-primary text-xs px-4 py-2">Prove Solvency</button>
                      <button className="btn-ghost text-xs px-4 py-2">Reject</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
