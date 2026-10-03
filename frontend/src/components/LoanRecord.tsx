import type { ReactNode } from 'react';
import { money, shortHex } from '../lib/client';
import type { LoanView } from '../lib/loans';
import { ListingBadge, LoanStatusBadge, TierBadge } from './LoanBadges';

/**
 * What the Loan instance publishes, and nothing else: the same card for the
 * borrower and the lender, because both see exactly this. The payment-history
 * chain head is the only trace of individual payments the ledger keeps.
 */
export function LoanPublicRecord({ loan, note }: { loan: LoanView; note?: ReactNode }) {
  return (
    <section className="card-dark p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="label-dark">Public on-chain record</p>
        <span className="text-[10px] text-[rgba(255,247,235,0.4)]">Anyone can read this</span>
      </div>
      <dl className="flex flex-col gap-[10px] text-[11px]">
        <Row label="Loan instance" value={shortHex('0x' + loan.address, 8, 4)} />
        <Row label="Borrower key" value={shortHex(loan.borrower, 8, 4)} />
        <Row label="Lender key" value={shortHex(loan.lender.pubKey, 8, 4)} />
        <Row
          label="Facts commitment"
          value={loan.factsBound ? 'Matches solvency instance' : 'Does not match'}
          tone={loan.factsBound ? 'ok' : 'warn'}
        />
        <Row label="Status" value={<LoanStatusBadge status={loan.status} dark />} />
        <Row
          label="Tier"
          value={
            <TierBadge
              tier={loan.tier}
              live={loan.tierLive || (loan.status !== 'APPLIED' && loan.status !== 'OFFERED')}
              dark
            />
          }
        />
        {loan.status === 'OFFERED' && (
          <Row label="Collateral offered" value={money(loan.offeredCollateral)} />
        )}
        <Row
          label="Collateral required"
          value={loan.collateralRequired > 0n ? money(loan.collateralRequired) : '—'}
        />
        <Row label="Balance owed" value={loan.disbursed ? money(loan.balanceOwed) : '—'} />
        <Row label="Payments made" value={String(loan.paymentsMade)} />
        <Row
          label="Late payments"
          value={String(loan.latePayments)}
          tone={loan.latePayments > 0n ? 'warn' : undefined}
        />
        <Row
          label="History commitment"
          value={shortHex('0x' + loan.historyCommitment.replace(/^0x/, ''), 10, 6)}
          title={loan.historyCommitment}
        />
        <Row label="Repaid loans proven" value={loan.historyProofCount === 0 ? 'none' : String(loan.historyProofCount)} />
        <Row label="Directory" value={<ListingBadge listing={loan.listing} dark />} />
      </dl>
      <p className="mt-5 text-[11px] leading-[1.5] text-[rgba(255,247,235,0.42)]">
        {note ??
          'The ledger state keeps counts, the balance and one history commitment, not a list of payments. Each repayment still moves the public balance, so its amount can be read from the transaction; what the commitment adds is a single checkable record of the whole history, which the borrower can open to an auditor.'}
      </p>
    </section>
  );
}

function Row({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: ReactNode;
  tone?: 'ok' | 'warn';
  title?: string;
}) {
  const color = tone === 'ok' ? '#7bd9a5' : tone === 'warn' ? '#e9b168' : 'rgba(255,247,235,0.9)';
  return (
    <div className="flex items-center justify-between gap-3" title={title}>
      <dt className="shrink-0 text-[rgba(255,247,235,0.5)]">{label}</dt>
      <dd className={`min-w-0 truncate text-right ${typeof value === 'string' ? 'mono' : ''}`} style={{ color }}>
        {value}
      </dd>
    </div>
  );
}
