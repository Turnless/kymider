import { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../components/StatusBadge';
import { truncateAddress } from '../lib/format';

type Borrower = {
  instanceAddress: string;
  owner: string;
  commitment: string;
  status: 'active' | 'suspended';
};

const MOCK_BORROWERS: Borrower[] = [
  { instanceAddress: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b', owner: '0xaaaa1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab', commitment: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', status: 'active' },
  { instanceAddress: '0x2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c', owner: '0xbbbb1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab', commitment: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', status: 'active' },
  { instanceAddress: '0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d', owner: '0xcccc1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab', commitment: '0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321', status: 'suspended' },
];

export function Registry() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'suspended'>('all');

  const filtered = MOCK_BORROWERS.filter((b) => {
    if (filter !== 'all' && b.status !== filter) return false;
    if (search && !b.instanceAddress.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading-lg text-[#0F172A]">Borrower Registry</h1>
        <p className="text-sm text-[#0F172A]/40 mt-1">Browse registered borrower instances</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field flex-1"
        />
        <div className="flex gap-1 p-1 glass rounded-xl">
          {(['all', 'active', 'suspended'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer border-0 ${
                filter === f
                  ? 'bg-[#000000] text-[#F8FAFC]'
                  : 'bg-transparent text-[#0F172A]/40 hover:text-[#0F172A]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table — desktop */}
      <div className="hidden md:block glass rounded-2xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#0F172A]/[0.06]">
              <th className="text-left px-6 py-3.5 text-[11px] font-semibold tracking-wider uppercase text-[#0F172A]/30">Borrower</th>
              <th className="text-left px-6 py-3.5 text-[11px] font-semibold tracking-wider uppercase text-[#0F172A]/30">Commitment</th>
              <th className="text-left px-6 py-3.5 text-[11px] font-semibold tracking-wider uppercase text-[#0F172A]/30">Status</th>
              <th className="text-right px-6 py-3.5 text-[11px] font-semibold tracking-wider uppercase text-[#0F172A]/30">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.instanceAddress} className="border-b border-[#0F172A]/[0.03] last:border-0 hover:bg-[#000000]/[0.02] transition-colors">
                <td className="px-6 py-4"><span className="text-sm font-mono text-[#0F172A]">{truncateAddress(b.instanceAddress)}</span></td>
                <td className="px-6 py-4"><span className="text-xs font-mono text-[#0F172A]/35">{truncateAddress(b.commitment)}</span></td>
                <td className="px-6 py-4"><StatusBadge variant={b.status}>{b.status}</StatusBadge></td>
                <td className="px-6 py-4 text-right">
                  <Link to={`/borrower/${b.instanceAddress}`} className="btn-primary text-xs px-4 py-2 no-underline">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards — mobile */}
      <div className="md:hidden space-y-3 stagger">
        {filtered.map((b) => (
          <Link key={b.instanceAddress} to={`/borrower/${b.instanceAddress}`} className="block glass rounded-2xl p-4 card-hover no-underline">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-mono text-[#0F172A]">{truncateAddress(b.instanceAddress, 8)}</span>
              <StatusBadge variant={b.status}>{b.status}</StatusBadge>
            </div>
            <p className="text-xs text-[#0F172A]/30 font-mono">Commitment: {truncateAddress(b.commitment, 8)}</p>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16"><p className="text-sm text-[#0F172A]/30">No borrowers match your search</p></div>
      )}
    </div>
  );
}
