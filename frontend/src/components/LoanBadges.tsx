import type { ListingStatusName, LoanStatusName, TierName } from '../lib/loans';

/**
 * Badges for the Wave 2 loan screens, in the same pill style as Badge.tsx.
 * `dark` gives the variants that stay legible on an espresso card.
 */

const ACTIVE_LIGHT = {
  background: 'rgba(212,109,37,0.1)',
  color: '#c2410c',
  border: '1px solid rgba(212,109,37,0.25)',
};
const ACTIVE_DARK = {
  background: 'rgba(212,109,37,0.18)',
  color: '#f0a56a',
  border: '1px solid rgba(212,109,37,0.35)',
};
const NEUTRAL_DARK = {
  background: 'rgba(255,247,235,0.08)',
  color: 'rgba(255,247,235,0.6)',
  border: '1px solid rgba(255,247,235,0.14)',
};
const PENDING_DARK = {
  background: 'rgba(217,119,6,0.18)',
  color: '#e9b168',
  border: '1px solid rgba(217,119,6,0.35)',
};

const STATUS_LABEL: Record<LoanStatusName, string> = {
  APPLIED: 'Applied',
  OFFERED: 'Offered',
  ACTIVE: 'Active',
  REPAID: 'Repaid',
  DEFAULTED: 'Defaulted',
  DECLINED: 'Declined',
};

/** The Loan instance's lifecycle status. */
export function LoanStatusBadge({ status, dark = false }: { status: LoanStatusName; dark?: boolean }) {
  const label = STATUS_LABEL[status];
  switch (status) {
    case 'APPLIED':
    case 'OFFERED':
      return (
        <span className={`badge ${dark ? '' : 'badge-pending'}`} style={dark ? PENDING_DARK : undefined}>
          {label}
        </span>
      );
    case 'ACTIVE':
      return (
        <span className="badge" style={dark ? ACTIVE_DARK : ACTIVE_LIGHT}>
          {label}
        </span>
      );
    case 'REPAID':
      return <span className={`badge ${dark ? 'badge-pass-dark' : 'badge-pass'}`}>{label}</span>;
    case 'DEFAULTED':
      return <span className={`badge ${dark ? 'badge-fail-dark' : 'badge-fail'}`}>{label}</span>;
    case 'DECLINED':
      return (
        <span className={`badge ${dark ? '' : 'badge-neutral'}`} style={dark ? NEUTRAL_DARK : undefined}>
          {label}
        </span>
      );
  }
}

/**
 * The collateral tier. VERIFIED reads "Verified · 110%", STANDARD "Standard ·
 * 150%". Pass `live={false}` for a VERIFIED tier whose quote has lapsed: the
 * contract would underwrite it at 150%, and the badge says so.
 */
export function TierBadge({
  tier,
  live = true,
  dark = false,
}: {
  tier: TierName;
  live?: boolean;
  dark?: boolean;
}) {
  if (tier === 'VERIFIED' && live) {
    return <span className={`badge ${dark ? 'badge-pass-dark' : 'badge-pass'}`}>Verified · 110%</span>;
  }
  if (tier === 'VERIFIED') {
    return (
      <span
        className={`badge ${dark ? '' : 'badge-pending'}`}
        style={dark ? PENDING_DARK : undefined}
        title="Proven against a quote that has since expired; it would underwrite at 150%"
      >
        Lapsed
      </span>
    );
  }
  if (tier === 'STANDARD') {
    return (
      <span className={`badge ${dark ? '' : 'badge-neutral'}`} style={dark ? NEUTRAL_DARK : undefined}>
        Standard · 150%
      </span>
    );
  }
  return (
    <span className={`badge ${dark ? '' : 'badge-neutral'}`} style={dark ? NEUTRAL_DARK : undefined}>
      No tier
    </span>
  );
}

const LISTING_LABEL: Record<ListingStatusName, string> = {
  OPEN: 'Listed · open',
  ACTIVE: 'Listed · active',
  REPAID: 'Listed · repaid',
  DEFAULTED: 'Listed · defaulted',
  CLOSED: 'Listed · closed',
};

/** The loan's entry in the LoanDirectory, or that it has none. */
export function ListingBadge({ listing, dark = false }: { listing: ListingStatusName | null; dark?: boolean }) {
  if (listing === null) {
    return (
      <span className={`badge ${dark ? '' : 'badge-neutral'}`} style={dark ? NEUTRAL_DARK : undefined}>
        Not listed
      </span>
    );
  }
  if (listing === 'DEFAULTED') {
    return <span className={`badge ${dark ? 'badge-fail-dark' : 'badge-fail'}`}>{LISTING_LABEL[listing]}</span>;
  }
  if (listing === 'REPAID') {
    return <span className={`badge ${dark ? 'badge-pass-dark' : 'badge-pass'}`}>{LISTING_LABEL[listing]}</span>;
  }
  return (
    <span className={`badge ${dark ? '' : 'badge-neutral'}`} style={dark ? NEUTRAL_DARK : undefined}>
      {LISTING_LABEL[listing]}
    </span>
  );
}

/** The same spinner the Claims screen shows while a proof runs. */
export function LoanSpinner() {
  return (
    <svg className="spin" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
