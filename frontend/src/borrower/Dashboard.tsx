import { StatusBadge } from '../components/StatusBadge';
import { formatUsd, truncateAddress } from '../lib/format';

const MOCK = {
  instanceAddress: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
  commitment: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  status: 'active' as const,
  netWorth: 700000n,
  dti: 30n,
  lastUpdated: '2 hours ago',
  claimsCount: 3,
  attestationsPass: 2,
};

export function BorrowerDashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="heading-lg text-[#0F172A]">Dashboard</h1>
        <p className="text-sm text-[#0F172A]/40 mt-1">Your solvency profile at a glance</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        <StatCard label="Status" value={<StatusBadge variant="active" pulse>Active</StatusBadge>} />
        <StatCard label="Net Worth" value={formatUsd(MOCK.netWorth)} accent />
        <StatCard label="Debt-to-Income" value={`${Number(MOCK.dti)}%`} />
        <StatCard label="Claims" value={`${MOCK.claimsCount} total`} sub={`${MOCK.attestationsPass} verified`} />
      </div>

      {/* Instance info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InfoCard
          title="SolvencyProof Instance"
          rows={[
            { label: 'Address', value: truncateAddress(MOCK.instanceAddress) },
            { label: 'Status', value: 'Active', badge: 'active' },
            { label: 'Last Updated', value: MOCK.lastUpdated },
          ]}
        />
        <InfoCard
          title="On-Chain Commitment"
          rows={[
            { label: 'Hash', value: truncateAddress(MOCK.commitment) },
            { label: 'Facts Committed', value: '3 (balance, debts, income)' },
            { label: 'Privacy', value: 'Facts never revealed' },
          ]}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="glass rounded-2xl p-5 card-hover">
      <p className="text-[11px] font-semibold tracking-wider uppercase text-[#0F172A]/30 mb-2">
        {label}
      </p>
      <div className={`text-xl font-bold tracking-tight ${accent ? 'text-[#D46D25]' : 'text-[#0F172A]'}`}>
        {value}
      </div>
      {sub && <p className="text-xs text-[#0F172A]/30 mt-1">{sub}</p>}
    </div>
  );
}

function InfoCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: string; badge?: 'active' | 'suspended' }[];
}) {
  return (
    <div className="glass rounded-2xl p-5 card-hover">
      <h3 className="text-sm font-semibold text-[#0F172A] mb-4">{title}</h3>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="text-xs text-[#0F172A]/35">{row.label}</span>
            {row.badge ? (
              <StatusBadge variant={row.badge}>{row.value}</StatusBadge>
            ) : (
              <span className="text-xs font-medium text-[#0F172A] font-mono">{row.value}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
