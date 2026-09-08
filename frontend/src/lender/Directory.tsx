import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../components/Badge';
import { shortHex } from '../lib/client';
import { useKymider } from '../lib/useKymider';

type Filter = 'all' | 'active' | 'suspended';

export function Directory() {
  const { client } = useKymider();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const rows = client.directory();
  const needle = query.trim().toLowerCase();
  const visible = rows.filter((r) => {
    const statusOk =
      filter === 'all' ||
      (filter === 'active' && r.status === 'ACTIVE') ||
      (filter === 'suspended' && r.status === 'SUSPENDED');
    const searchOk =
      needle === '' ||
      r.instance.toLowerCase().includes(needle) ||
      r.commitment.toLowerCase().includes(needle);
    return statusOk && searchOk;
  });

  const totalAttestations = rows.reduce((n, r) => n + r.attestationCount, 0);
  const totalPassing = rows.reduce((n, r) => n + r.passCount, 0);

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6 flex items-end justify-between gap-4">
        <h1 className="text-[26px] font-bold tracking-[-0.02em]">Directory</h1>
        <dl className="flex gap-8">
          <Stat label="Instances" value={rows.length} />
          <Stat label="Attestations" value={totalAttestations} />
          <Stat label="Passing" value={totalPassing} />
        </dl>
      </header>

      <div className="mb-4 flex items-center gap-3">
        <input
          className="input max-w-[300px]"
          type="search"
          placeholder="Search instance or commitment"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex rounded-[11px] bg-[rgba(15,23,42,0.05)] p-[3px]">
          {(
            [
              ['all', 'All'],
              ['active', 'Active'],
              ['suspended', 'Suspended'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              className={[
                'rounded-[9px] px-[15px] py-[7px] text-[12px] font-semibold transition-colors',
                filter === id
                  ? 'bg-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
                  : 'text-[rgba(15,23,42,0.48)]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11px] text-[rgba(15,23,42,0.4)]">
          {visible.length} of {rows.length} instances
        </span>
      </div>

      <section className="card overflow-hidden">
        {visible.length === 0 ? (
          <p className="px-5 py-14 text-center text-[12px] text-[rgba(15,23,42,0.4)]">
            No instance matches that search.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="label border-b border-[rgba(15,23,42,0.08)]">
                <th className="px-5 py-[11px] text-left font-bold">Instance</th>
                <th className="px-5 py-[11px] text-left font-bold">Commitment</th>
                <th className="px-5 py-[11px] text-left font-bold">Attestations</th>
                <th className="px-5 py-[11px] text-left font-bold">Last update</th>
                <th className="px-5 py-[11px] text-left font-bold">Status</th>
                <th className="px-5 py-[11px] text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.instance} className="border-t border-[rgba(15,23,42,0.06)]">
                  <td className="mono px-5 py-[13px] text-[12px] font-semibold">
                    {shortHex('0x' + r.instance, 8, 4)}
                  </td>
                  <td className="mono px-5 py-[13px] text-[11px] text-[rgba(15,23,42,0.55)]">
                    {shortHex(r.commitment, 8, 4)}
                  </td>
                  <td className="tnum px-5 py-[13px] text-[12px]">
                    <span className="font-bold">{r.attestationCount}</span>
                    <span className="ml-2 text-[rgba(15,23,42,0.45)]">
                      {r.attestationCount === 0 ? 'none yet' : `${r.passCount} pass`}
                    </span>
                    {r.staleCount > 0 && (
                      <span
                        className="ml-2 text-[#b45309]"
                        title="Recorded against a statement the borrower has since replaced"
                      >
                        · {r.staleCount} superseded
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-[13px] text-[12px] text-[rgba(15,23,42,0.55)]">
                    {r.lastUpdate}
                  </td>
                  <td className="px-5 py-[13px]">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-5 py-[13px] text-right">
                    <button
                      type="button"
                      className="btn btn-quiet px-4 py-[7px] text-[12px]"
                      onClick={() => navigate(`/app/instance/${r.instance}`)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="mt-4 max-w-[720px] text-[11px] leading-[1.6] text-[rgba(15,23,42,0.4)]">
        The directory indexes instances and the commitment each currently stands behind. It does not
        prove who deployed an instance — compare a commitment against the instance itself before
        relying on a record.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-right">
      <dd className="tnum text-[20px] font-bold leading-none">{value}</dd>
      <dt className="label mt-[5px]">{label}</dt>
    </div>
  );
}
