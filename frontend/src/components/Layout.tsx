import type { ReactNode } from 'react';
import { Navbar } from './Navbar';

type Role = 'borrower' | 'lender';

export function Layout({
  role,
  onRoleToggle,
  children,
}: {
  role: Role;
  onRoleToggle: () => void;
  children: ReactNode;
}) {
  const bg = role === 'borrower' ? '#FFF7EB' : '#F9F0E0';
  const orbColor = role === 'borrower' ? 'rgba(212, 109, 37, 0.12)' : 'rgba(212, 109, 37, 0.08)';

  return (
    <div
      className="min-h-screen transition-colors duration-500 relative overflow-hidden"
      style={{ background: bg }}
    >
      {/* Ambient orbs for depth */}
      <div
        className="ambient-orb"
        style={{
          width: 600,
          height: 600,
          top: -200,
          right: -100,
          background: orbColor,
        }}
      />
      <div
        className="ambient-orb"
        style={{
          width: 400,
          height: 400,
          bottom: -100,
          left: -80,
          background: role === 'borrower' ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.03)',
        }}
      />

      <Navbar role={role} onRoleToggle={onRoleToggle} />

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-12">
        <div className="animate-fade-in-up">
          {children}
        </div>
      </main>
    </div>
  );
}
