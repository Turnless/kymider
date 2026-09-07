import { Link, useLocation } from 'react-router-dom';

type Role = 'borrower' | 'lender';

export function Navbar({
  role,
  onRoleToggle,
}: {
  role: Role;
  onRoleToggle: () => void;
}) {
  const location = useLocation();
  const isLanding = location.pathname === '/';

  const borrowerLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/facts', label: 'My Facts' },
    { to: '/claims', label: 'Claims' },
    { to: '/authorize', label: 'Authorize' },
  ];

  const lenderLinks = [
    { to: '/registry', label: 'Registry' },
    { to: '/claims', label: 'Claims' },
  ];

  const links = role === 'borrower' ? borrowerLinks : lenderLinks;

  return (
    <header className="sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4">
        <nav className="glass-strong rounded-2xl px-5 py-3 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 no-underline group">
            <div className="w-9 h-9 rounded-xl bg-[#000000] flex items-center justify-center">
              <span className="text-[#F8FAFC] text-sm font-bold tracking-tight">K</span>
            </div>
            <span className="text-[#0F172A] text-lg font-semibold tracking-tight">
              Kymider
            </span>
          </Link>

          {/* Nav links — desktop */}
          {!isLanding && (
            <div className="hidden md:flex items-center gap-1">
              {links.map((link) => {
                const active = location.pathname === link.to;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 no-underline ${
                      active
                        ? 'bg-[#000000] text-[#F8FAFC]'
                        : 'text-[#0F172A]/50 hover:text-[#0F172A] hover:bg-[#000000]/[0.04]'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Right side */}
          <div className="flex items-center gap-3">
            <button
              onClick={onRoleToggle}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider text-[#0F172A]/60 hover:text-[#0F172A] border border-[#0F172A]/10 hover:border-[#0F172A]/20 transition-all cursor-pointer bg-transparent"
            >
              <span className="w-2 h-2 rounded-full bg-[#D46D25]" />
              {role}
            </button>

            <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl glass text-xs font-medium text-[#0F172A]/40">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              Connected
            </div>

            {!isLanding && (
              <MobileNav links={links} />
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}

function MobileNav({ links }: { links: { to: string; label: string }[] }) {
  const location = useLocation();

  return (
    <div className="md:hidden">
      <div className="flex items-center gap-1">
        {links.map((link) => {
          const active = location.pathname === link.to;
          return (
            <Link
              key={link.to}
              to={link.to}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all no-underline ${
                active
                  ? 'bg-[#000000] text-[#F8FAFC]'
                  : 'text-[#0F172A]/40'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
