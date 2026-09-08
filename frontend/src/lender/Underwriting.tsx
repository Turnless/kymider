import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StaleBadge, StatusBadge, VerdictBadge } from '../components/Badge';
import { shortHex, termsLabel } from '../lib/client';
import { useKymider } from '../lib/useKymider';

const group = (raw: string): string => {
  const digits = String(raw).replace(/[^0-9]/g, '');
  return digits === '' ? '' : Number(digits).toLocaleString('en-US');
};
const toBigInt = (s: string): bigint => {
  const digits = s.replace(/[^0-9]/g, '');
  return digits === '' ? 0n : BigInt(digits);
};

export function Underwriting() {
  const { address = '' } = useParams();
  const { client } = useKymider();
  const [threshold, setThreshold] = useState('500,000');
  const [maxDti, setMaxDti] = useState('40');
  const [busy, setBusy] = useState<'request' | 'decide' | null>(null);
  const [reopening, setReopening] = useState(false);

  const detail = client.instance(address);
  if (!detail) {
    return (
      <div className="mx-auto max-w-[1180px]">
        <p className="text-[13px] text-[rgba(15,23,42,0.6)]">
          No such instance.{' '}
          <Link to="/app/directory" className="font-semibold">
            Back to directory
          </Link>
        </p>
      </div>
    );
  }

  const me = client.me();
  const mine = detail.requests.find((r) => r.lender.id === me.id)!;
  const others = detail.requests.filter((r) => r.lender.id !== me.id && r.verdict !== 'NONE');

  const decided = mine.claimState === 'APPROVED' || mine.claimState === 'REJECTED';
  // A decided claim no longer ends the relationship: the contract closes it and
  // the same pair can underwrite again on new terms. `reopening` is that second
  // pass, kept local because nothing on-chain distinguishes "done" from
  // "about to ask again".
  const reopened = decided && reopening;
  const canRequest = mine.claimState === 'NONE' || reopened;
  const step = canRequest ? 1 : mine.verdict === 'NONE' ? 2 : 3;

  const request = async () => {
    setBusy('request');
    try {
      setReopening(false);
      await client.requestClaim(address, {
        thresholdNetWorth: toBigInt(threshold),
        maxDti: toBigInt(maxDti),
      });
    } finally {
      setBusy(null);
    }
  };

  const decide = async (approve: boolean) => {
    setBusy('decide');
    try {
      await client.decide(address, approve);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="mb-[3px] text-[11px] text-[rgba(15,23,42,0.4)]">Directory</p>
          <div className="flex items-center gap-3">
            <h1 className="mono text-[20px] font-bold tracking-[-0.01em]">
              {shortHex('0x' + detail.record.instance, 10, 4)}
            </h1>
            <StatusBadge status={detail.record.status} />
          </div>
        </div>
        <Link to="/app/directory" className="btn btn-quiet">
          Back to directory
        </Link>
      </header>

      <div className="grid grid-cols-[1fr_1fr] gap-5">
        <div className="flex flex-col gap-5">
          <section className="card p-6">
            <p className="label mb-4">Public record</p>
            <dl className="flex flex-col gap-[10px] text-[11px]">
              <Row label="Instance" value={shortHex('0x' + detail.record.instance, 10, 4)} />
              <Row label="Commitment" value={shortHex(detail.record.commitment, 10, 4)} />
              <Row
                label="Directory entry"
                value={detail.record.status === 'SUSPENDED' ? 'Suspended' : 'Matches the instance'}
                tone={detail.record.status === 'SUSPENDED' ? 'warn' : 'ok'}
              />
              <Row label="Attestations recorded" value={String(detail.record.attestationCount)} />
              {detail.record.staleCount > 0 && (
                <Row
                  label="Superseded by newer facts"
                  value={String(detail.record.staleCount)}
                  tone="warn"
                />
              )}
            </dl>
          </section>

          <section className="card flex-1 p-6">
            <p className="label mb-4">Attestations to other lenders</p>
            {others.length === 0 ? (
              <p className="text-[12px] text-[rgba(15,23,42,0.4)]">
                No other lender has an attestation on this instance.
              </p>
            ) : (
              <ul className="flex flex-col gap-[10px]">
                {others.map((r) => (
                  <li
                    key={r.lender.id}
                    className="flex items-center justify-between gap-3 rounded-[13px] bg-[rgba(15,23,42,0.03)] px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="tnum text-[12px] font-semibold">{termsLabel(r.terms!)}</div>
                      <div className="text-[11px] text-[rgba(15,23,42,0.45)]">
                        {r.lender.name} · {r.requestedAt}
                      </div>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-2">
                      {r.stale && <StaleBadge />}
                      <VerdictBadge verdict={r.verdict} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-5 border-t border-[rgba(15,23,42,0.07)] pt-4 text-[11px] leading-[1.6] text-[rgba(15,23,42,0.4)]">
              Verdicts are public; the figures behind them are not. An unchanged commitment means
              the same statement still stands behind every one of these.
            </p>
          </section>
        </div>

        <section className="card-dark flex flex-col p-6">
          <div className="mb-5 flex items-center justify-between">
            <p className="label-dark">Underwriting</p>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className="h-[3px] w-5 rounded-full"
                  style={{
                    background: n <= step ? 'var(--color-accent)' : 'rgba(255,247,235,0.18)',
                  }}
                />
              ))}
              <span className="ml-2 text-[11px] text-[rgba(255,247,235,0.5)]">
                {decided && !reopened ? 'Complete' : `Step ${step} of 3`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Term
              label="Minimum net worth"
              prefix="$"
              value={threshold}
              onChange={(v) => setThreshold(group(v))}
              disabled={step !== 1}
            />
            <Term
              label="Maximum debt-to-income"
              prefix="%"
              value={maxDti}
              onChange={(v) => setMaxDti(v.replace(/[^0-9]/g, ''))}
              disabled={step !== 1}
            />
          </div>

          <p className="mt-3 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.42)]">
            {step === 1
              ? 'The borrower is asked only whether both conditions hold. Neither figure behind the answer is transmitted.'
              : 'The network verified the proof before recording it. This result cannot be produced from figures that do not match the committed statement.'}
          </p>

          <button
            type="button"
            className={`btn mt-5 w-full py-[13px] ${step === 1 ? 'btn-accent' : 'btn-quiet'}`}
            style={
              step === 1
                ? undefined
                : { background: 'rgba(255,247,235,0.08)', color: 'rgba(255,247,235,0.6)', border: 'none' }
            }
            onClick={request}
            disabled={step !== 1 || busy !== null}
          >
            {busy === 'request'
              ? 'Requesting…'
              : step === 1
                ? 'Request claim'
                : decided
                  ? 'Claim closed'
                  : 'Claim answered'}
          </button>

          {step === 3 && (
            <div className="rise mt-6">
              <div className="mb-3 flex items-start justify-between">
                <p className="label-dark">Network-verified result</p>
                <p className="text-right text-[10px] leading-[1.5] text-[rgba(255,247,235,0.4)]">
                  Verified against
                  <br />
                  the committed statement
                </p>
              </div>
              <p
                className="text-[44px] font-black leading-none tracking-[-0.03em]"
                style={{ color: mine.verdict === 'PASS' ? '#7BD9A5' : '#F09484' }}
              >
                {mine.verdict === 'PASS' ? 'Pass' : 'Fail'}
              </p>
              <p className="tnum mt-2 text-[12px] text-[rgba(255,247,235,0.6)]">
                {termsLabel(mine.terms!)}
              </p>

              {mine.stale && (
                <div
                  className="mt-4 rounded-[13px] px-4 py-3"
                  style={{ background: 'rgba(217,119,6,0.14)', border: '1px solid rgba(217,119,6,0.3)' }}
                >
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.6px] text-[#e9b168]">
                    Superseded
                  </p>
                  <p className="text-[11px] leading-[1.5] text-[rgba(255,247,235,0.62)]">
                    The borrower has committed a different statement since this verdict was
                    recorded. It remains a true answer about the earlier one — ask again before
                    deciding on it.
                  </p>
                </div>
              )}

              <div className="mt-4 grid grid-cols-3 gap-3">
                {['Cash and equivalents', 'Outstanding debts', 'Annual income'].map((label) => (
                  <div
                    key={label}
                    className="rounded-[13px] bg-[rgba(255,247,235,0.04)] px-3 py-[10px]"
                  >
                    <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.6px] text-[rgba(255,247,235,0.35)]">
                      {label}
                    </p>
                    <p className="text-[13px] font-semibold text-[rgba(255,247,235,0.3)]">
                      not disclosed
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-auto pt-6">
            {decided && !reopened ? (
              <div
                className="rounded-[13px] px-4 py-4"
                style={{
                  background:
                    mine.claimState === 'APPROVED'
                      ? 'rgba(94,201,138,0.12)'
                      : 'rgba(232,112,95,0.12)',
                }}
              >
                <p
                  className="text-[11px] font-bold uppercase tracking-[0.6px]"
                  style={{ color: mine.claimState === 'APPROVED' ? '#7BD9A5' : '#F09484' }}
                >
                  {mine.claimState === 'APPROVED' ? 'Application approved' : 'Application declined'}
                </p>
                <p className="mt-1 text-[11px] text-[rgba(255,247,235,0.5)]">
                  Recorded on the borrower instance.
                </p>
                {/* A decision used to be the end of this pair, permanently.
                    The claim is closed rather than sealed now, so the same
                    lender can come back on different terms. */}
                <button
                  type="button"
                  className="btn mt-3 px-4 py-[7px] text-[12px]"
                  style={{ background: 'rgba(255,247,235,0.12)', color: 'var(--color-cream)' }}
                  onClick={() => setReopening(true)}
                >
                  Underwrite again
                </button>
              </div>
            ) : (
              step === 3 && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="btn btn-accent flex-1 py-[13px]"
                    onClick={() => decide(true)}
                    disabled={busy !== null}
                  >
                    Approve application
                  </button>
                  <button
                    type="button"
                    className="btn py-[13px]"
                    style={{ background: 'rgba(255,247,235,0.1)', color: 'var(--color-cream)' }}
                    onClick={() => decide(false)}
                    disabled={busy !== null}
                  >
                    Decline
                  </button>
                </div>
              )
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn';
}) {
  const color =
    tone === 'ok' ? '#16a34a' : tone === 'warn' ? '#d97706' : 'rgba(15,23,42,0.85)';
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[rgba(15,23,42,0.5)]">{label}</dt>
      <dd className="mono" style={{ color }}>
        {value}
      </dd>
    </div>
  );
}

function Term({
  label,
  prefix,
  value,
  onChange,
  disabled,
}: {
  label: string;
  prefix: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-[6px] block text-[11px] font-semibold text-[rgba(255,247,235,0.6)]">
        {label}
      </span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-[12px] top-1/2 -translate-y-1/2 text-[12px] font-semibold text-[rgba(255,247,235,0.35)]">
          {prefix}
        </span>
        <input
          className="tnum w-full rounded-[11px] border border-[rgba(255,247,235,0.14)] bg-[rgba(255,247,235,0.06)] py-[10px] pl-[24px] pr-3 text-[14px] font-semibold text-cream outline-none transition-colors focus:border-accent disabled:opacity-60"
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      </span>
    </label>
  );
}
