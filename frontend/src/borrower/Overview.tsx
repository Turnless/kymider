import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Monogram, StaleBadge, VerdictBadge } from '../components/Badge';
import {
  dtiPercentOf,
  money,
  netWorthOf,
  shortHex,
  termsLabel,
} from '../lib/client';
import { useKymider } from '../lib/useKymider';

export function Overview() {
  const { client } = useKymider();
  const [revealed, setRevealed] = useState(true);

  const facts = client.facts();
  const record = client.myRecord();
  const requests = client.myRequests();
  const dti = dtiPercentOf(facts);
  const answered = requests.filter((r) => r.verdict !== 'NONE').length;
  const open = requests.filter((r) => r.terms && r.verdict === 'NONE').length;
  const stale = requests.filter((r) => r.stale).length;

  const hide = (value: string) => (revealed ? value : '•••••••');

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">Overview</h1>
          <span className="mono text-[11px] text-[rgba(15,23,42,0.4)]">
            {shortHex('0x' + record.instance)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-quiet" onClick={() => setRevealed((v) => !v)}>
            {revealed ? 'Hide values' : 'Show values'}
          </button>
          <Link to="/app/facts" className="btn btn-ink">
            Commit new facts
          </Link>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="card grid grid-cols-1 divide-y divide-[rgba(15,23,42,0.08)] px-2 py-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <Figure
              label="Net worth"
              value={hide(money(netWorthOf(facts)))}
              note="Balance less debts"
            />
            <Figure
              label="Debt-to-income"
              value={hide(dti === null ? 'n/a' : `${dti.toFixed(1)}%`)}
              note="Tightest limit asked: 30%"
            />
            <Figure
              label="Attestations"
              value={`${answered} / ${requests.filter((r) => r.terms).length}`}
              note={
                stale > 0
                  ? `${stale} superseded by newer facts`
                  : open === 1
                    ? '1 awaiting your proof'
                    : `${open} awaiting your proof`
              }
            />
          </section>

          <section className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[rgba(15,23,42,0.08)] px-5 py-[14px]">
              <h2 className="text-[13px] font-semibold">Lender requests</h2>
              <span className="text-[11px] text-[rgba(15,23,42,0.4)]">
                {requests.filter((r) => r.terms).length} requests
              </span>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="label">
                  <th className="px-5 py-[10px] text-left font-bold">Lender</th>
                  <th className="px-5 py-[10px] text-left font-bold">Requested terms</th>
                  <th className="px-5 py-[10px] text-right font-bold">Attestation</th>
                </tr>
              </thead>
              <tbody>
                {requests
                  .filter((r) => r.terms)
                  .map((r) => (
                    <tr
                      key={r.lender.id}
                      className="border-t border-[rgba(15,23,42,0.06)] align-middle"
                    >
                      <td className="px-5 py-[13px]">
                        <div className="flex items-center gap-[10px]">
                          <Monogram initials={r.lender.initials} />
                          <div>
                            <div className="text-[13px] font-semibold">{r.lender.name}</div>
                            <div className="text-[11px] text-[rgba(15,23,42,0.45)]">
                              {r.lender.kind}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="tnum px-5 py-[13px] text-[12px] text-[rgba(15,23,42,0.7)]">
                        {termsLabel(r.terms!)}
                      </td>
                      <td className="px-5 py-[13px] text-right">
                        <span className="inline-flex items-center gap-2">
                          {r.stale && <StaleBadge />}
                          <VerdictBadge verdict={r.verdict} />
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            </div>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <section className="card-dark p-5">
            <p className="label-dark mb-4">On-chain record</p>
            <dl className="flex flex-col gap-[10px] text-[11px]">
              <Row label="Instance" value={shortHex('0x' + record.instance)} />
              <Row label="Commitment" value={shortHex(record.commitment)} />
              <Row
                label="Circuit tag"
                value={shortHex(record.verifierKey)}
                title="persistentHash('kymider:sp:vk:') — a domain-separation label, not a verification key"
              />
            </dl>
            <p className="mt-5 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.42)]">
              Balances, debts and income stay on this device. Only the commitment hash and the
              verified result are written to the ledger. The circuit tag is a domain-separation
              label, not a verification key — proofs are checked by the network at submission.
            </p>
          </section>

          <section className="card p-5">
            <p className="label mb-4">Authorized lenders</p>
            <ul className="flex flex-col gap-3">
              {client.lenders().map((l) => (
                <li key={l.id} className="flex items-center gap-[10px]">
                  <Monogram initials={l.initials} />
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold">{l.name}</div>
                    <div className="mono truncate text-[10px] text-[rgba(15,23,42,0.4)]">
                      {shortHex(l.pubKey, 8, 4)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="px-5 py-3 sm:py-0">
      <p className="label mb-[6px]">{label}</p>
      <p className="tnum text-[30px] font-bold leading-none tracking-[-0.02em]">{value}</p>
      <p className="mt-[6px] text-[11px] text-[rgba(15,23,42,0.42)]">{note}</p>
    </div>
  );
}

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-3" title={title}>
      <dt className="text-[rgba(255,247,235,0.5)]">{label}</dt>
      <dd className="mono text-[rgba(255,247,235,0.9)]">{value}</dd>
    </div>
  );
}
