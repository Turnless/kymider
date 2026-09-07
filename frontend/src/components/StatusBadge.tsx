import type { ReactNode } from 'react';

type Variant = 'pass' | 'fail' | 'pending' | 'approved' | 'rejected' | 'active' | 'suspended';

export function StatusBadge({
  variant,
  children,
  pulse = false,
}: {
  variant: Variant;
  children: ReactNode;
  pulse?: boolean;
}) {
  const classes: Record<Variant, string> = {
    pass: 'badge-pass',
    fail: 'badge-fail',
    pending: 'badge-pending',
    approved: 'badge-pass',
    rejected: 'badge-fail',
    active: 'badge-pass',
    suspended: 'badge-pending',
  };

  const dotColor: Record<Variant, string> = {
    pass: 'bg-emerald-500',
    fail: 'bg-red-500',
    pending: 'bg-amber-500',
    approved: 'bg-emerald-500',
    rejected: 'bg-red-500',
    active: 'bg-emerald-500',
    suspended: 'bg-amber-500',
  };

  return (
    <span className={`badge ${classes[variant]}`}>
      <span className="relative flex h-2 w-2">
        {pulse && (
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${dotColor[variant]}`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor[variant]}`} />
      </span>
      {children}
    </span>
  );
}
