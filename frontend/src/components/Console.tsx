import { NavLink, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * The console frame: a warm-dark rail carried over from the landing, so
 * arriving from the site reads as a continuation rather than a jump.
 *
 * Below `lg` the rail becomes a top bar — a 190px column is half a phone
 * screen — with the section links scrolling horizontally under the brand.
 */

export type Role = 'borrower' | 'lender';

const BORROWER_NAV = [
  { to: '/app/overview', label: 'Overview' },
  { to: '/app/facts', label: 'Private facts' },
  { to: '/app/claims', label: 'Claims' },
];

const LENDER_NAV = [
  { to: '/app/directory', label: 'Directory' },
  { to: '/app/portfolio', label: 'Portfolio' },
];

export function Console({
  role,
  onRole,
  children,
  surface = 'cream',
}: {
  role: Role;
  onRole: (r: Role) => void;
  children: ReactNode;
  surface?: 'cream' | 'sand';
}) {
  const navigate = useNavigate();
  const nav = role === 'borrower' ? BORROWER_NAV : LENDER_NAV;

  const switchTo = (next: Role) => {
    onRole(next);
    navigate(next === 'borrower' ? '/app/overview' : '/app/directory');
  };

  const roleToggle = (
    <div className="flex rounded-[10px] bg-[rgba(255,247,235,0.07)] p-[3px]">
      {(['borrower', 'lender'] as const).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => switchTo(r)}
          aria-pressed={role === r}
          className={[
            'flex-1 rounded-[8px] px-3 py-[6px] text-[11px] font-semibold capitalize transition-colors',
            role === r
              ? 'bg-cream text-espresso'
              : 'text-[rgba(255,247,235,0.5)] hover:text-[rgba(255,247,235,0.8)]',
          ].join(' ')}
        >
          {r}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-col bg-espresso lg:w-[190px] lg:justify-between lg:px-4 lg:py-6">
        <div>
          <div className="flex items-center justify-between gap-3 px-4 py-3 lg:mb-8 lg:px-2 lg:py-0">
            <span className="flex items-center gap-2">
              <Mark />
              <span className="text-[11px] font-black tracking-[1.6px] text-cream">KYMIDER</span>
            </span>
            {/* On a phone the role switch belongs beside the brand, not at the
                bottom of a column that no longer exists. */}
            <span className="lg:hidden">{roleToggle}</span>
          </div>

          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-x-visible lg:px-0 lg:pb-0">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'flex shrink-0 items-center gap-[11px] rounded-[10px] px-3 py-[10px] text-[13px] transition-colors',
                    isActive
                      ? 'bg-[rgba(255,247,235,0.08)] font-semibold text-cream'
                      : 'font-medium text-[rgba(255,247,235,0.5)] hover:text-[rgba(255,247,235,0.8)]',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className="size-[5px] shrink-0 rounded-full"
                      style={{
                        background: isActive ? 'var(--color-accent)' : 'rgba(255,247,235,0.22)',
                      }}
                    />
                    {item.label}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="hidden lg:block">
          {roleToggle}
          <p className="mt-3 flex items-center gap-[6px] px-1 text-[10px] text-[rgba(255,247,235,0.35)]">
            <span className="size-[5px] rounded-full bg-accent" />
            Local simulation
          </p>
        </div>
      </aside>

      <main
        className="min-w-0 flex-1 px-4 py-5 lg:px-9 lg:py-7"
        style={{ background: surface === 'sand' ? 'var(--color-sand)' : 'var(--color-cream)' }}
      >
        {children}
      </main>
    </div>
  );
}

function Mark() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.5" fill="var(--color-accent)" />
    </svg>
  );
}
