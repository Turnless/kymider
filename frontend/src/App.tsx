import { useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Console, type Role } from './components/Console';
import { Landing } from './Landing';
import { Overview } from './borrower/Overview';
import { Facts } from './borrower/Facts';
import { Claims } from './borrower/Claims';
import { Directory } from './lender/Directory';
import { Underwriting } from './lender/Underwriting';
import { KymiderContext } from './lib/useKymider';
import { SimulatedKymiderClient } from './lib/simulatedClient';

export default function App() {
  // Building the client deploys real contract instances, so it happens once.
  const client = useMemo(() => new SimulatedKymiderClient(), []);

  return (
    <KymiderContext.Provider value={client}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app/*" element={<ConsoleRoutes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </KymiderContext.Provider>
  );
}

function ConsoleRoutes() {
  const location = useLocation();
  const lenderRoute =
    location.pathname.startsWith('/app/directory') ||
    location.pathname.startsWith('/app/instance') ||
    location.pathname.startsWith('/app/portfolio');
  const [role, setRole] = useState<Role>(lenderRoute ? 'lender' : 'borrower');

  return (
    <Console role={role} onRole={setRole} surface={role === 'lender' ? 'sand' : 'cream'}>
      <Routes>
        <Route path="overview" element={<Overview />} />
        <Route path="facts" element={<Facts />} />
        <Route path="claims" element={<Claims />} />
        <Route path="directory" element={<Directory />} />
        <Route path="instance/:address" element={<Underwriting />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="*" element={<Navigate to="/app/overview" replace />} />
      </Routes>
    </Console>
  );
}

/** Not part of the Wave 1 demo path — named so the rail doesn't lie about it. */
function Portfolio() {
  return (
    <div className="mx-auto max-w-[1180px]">
      <h1 className="mb-3 text-[26px] font-bold tracking-[-0.02em]">Portfolio</h1>
      <p className="max-w-[520px] text-[13px] leading-[1.7] text-[rgba(15,23,42,0.5)]">
        Approved applications collect here once a lender is underwriting more than one borrower.
        Wave 1 covers a single claim end to end; this view arrives with the time-boxed proofs in
        Wave 2.
      </p>
    </div>
  );
}
