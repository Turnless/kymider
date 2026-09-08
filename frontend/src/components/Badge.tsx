import type { ClaimState, InstanceStatus, Verdict } from '../lib/client';

/** The verdict the network recorded, or that none has been recorded yet. */
export function VerdictBadge({ verdict, dark = false }: { verdict: Verdict; dark?: boolean }) {
  if (verdict === 'PASS') {
    return <span className={`badge ${dark ? 'badge-pass-dark' : 'badge-pass'}`}>Pass</span>;
  }
  if (verdict === 'FAIL') {
    return <span className={`badge ${dark ? 'badge-fail-dark' : 'badge-fail'}`}>Fail</span>;
  }
  return <span className="badge badge-pending">Not proved</span>;
}

export function ClaimStateBadge({ state }: { state: ClaimState }) {
  if (state === 'APPROVED') return <span className="badge badge-pass">Approved</span>;
  if (state === 'REJECTED') return <span className="badge badge-fail">Declined</span>;
  if (state === 'PENDING') return <span className="badge badge-pending">Open</span>;
  return <span className="badge badge-neutral">No claim</span>;
}

export function StatusBadge({ status }: { status: InstanceStatus }) {
  return (
    <span className={`badge ${status === 'SUSPENDED' ? 'badge-fail' : 'badge-pass'}`}>
      {status === 'SUSPENDED' ? 'Suspended' : 'Active'}
    </span>
  );
}

/**
 * Marks a verdict recorded against a statement that has since been replaced.
 * The verdict is still genuine — it just answers a question about older facts.
 */
export function StaleBadge({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`badge ${dark ? '' : 'badge-pending'}`}
      style={
        dark
          ? {
              background: 'rgba(217,119,6,0.18)',
              color: '#e9b168',
              border: '1px solid rgba(217,119,6,0.35)',
            }
          : undefined
      }
      title="Recorded against an earlier committed statement"
    >
      Superseded
    </span>
  );
}

/** The lender's monogram chip. */
export function Monogram({ initials }: { initials: string }) {
  return (
    <span className="inline-flex size-[26px] shrink-0 items-center justify-center rounded-lg bg-[rgba(212,109,37,0.12)] text-[10px] font-bold text-accent">
      {initials}
    </span>
  );
}
