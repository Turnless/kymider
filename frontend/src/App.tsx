import { lazy, Suspense, useMemo, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Console, type Role } from './components/Console';
import { Landing } from './Landing';
import { Overview } from './borrower/Overview';
import { Facts } from './borrower/Facts';
import { Claims } from './borrower/Claims';
import { BorrowerLoans } from './borrower/Loans';
import { BorrowerLoanDetail } from './borrower/LoanDetail';
import { Directory } from './lender/Directory';
import { Underwriting } from './lender/Underwriting';
import { LenderApplications } from './lender/Applications';
import { LenderLoan } from './lender/LenderLoan';
import { Portfolio } from './lender/Portfolio';
import { AuditView } from './auditor/Audit';
import { KymiderContext } from './lib/useKymider';

// Live mode pulls in its own copies of the compiled contracts and, on
// connect, the wallet's provider stack, so it loads only when opened.
const LiveView = lazy(() => import('./live/Live').then((m) => ({ default: m.LiveView })));
import { LoanDeskContext } from './lib/useLoans';
import { SimulatedKymiderClient } from './lib/simulatedClient';
import { SimulatedLoanDesk } from './lib/simulatedLoanDesk';

export default function App() {
  // Building the client deploys real contract instances, so it happens once.
  // The loan desk runs on the same borrower and lenders, and seeds its loans
  // by executing the Loan and LoanDirectory circuits.
  const { client, desk } = useMemo(() => {
    const client = new SimulatedKymiderClient();
    return { client, desk: new SimulatedLoanDesk(client) };
  }, []);

  return (
    <KymiderContext.Provider value={client}>
      <LoanDeskContext.Provider value={desk}>
      {/* Served from /<repo>/ on GitHub Pages, from / everywhere else. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/app/*" element={<ConsoleRoutes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </LoanDeskContext.Provider>
    </KymiderContext.Provider>
  );
}

function ConsoleRoutes() {
  const location = useLocation();
  const path = location.pathname;
  const routeRole = roleOf(path);
  const [role, setRole] = useState<Role>(routeRole ?? 'borrower');

  // A link can cross roles (the borrower's "go to the auditor" link, a lender
  // deep link), so the rail follows the route, adjusted during render rather
  // than in an effect. Live chain belongs to every role and keeps whichever
  // one is selected.
  if (routeRole && routeRole !== role) setRole(routeRole);

  return (
    <Console role={role} onRole={setRole} surface={role === 'borrower' ? 'cream' : 'sand'}>
      <Routes>
        <Route path="overview" element={<Overview />} />
        <Route path="facts" element={<Facts />} />
        <Route path="claims" element={<Claims />} />
        <Route path="loans" element={<BorrowerLoans />} />
        <Route path="loans/:address" element={<BorrowerLoanDetail />} />
        <Route path="applications" element={<LenderApplications />} />
        <Route path="loan/:address" element={<LenderLoan />} />
        <Route path="directory" element={<Directory />} />
        <Route path="instance/:address" element={<Underwriting />} />
        <Route path="portfolio" element={<Portfolio />} />
        <Route path="audit" element={<AuditView />} />
        <Route
          path="live"
          element={
            <Suspense fallback={<p className="text-[13px] text-[rgba(15,23,42,0.5)]">Loading the live view…</p>}>
              <LiveView />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/app/overview" replace />} />
      </Routes>
    </Console>
  );
}

function roleOf(path: string): Role | null {
  if (path.startsWith('/app/audit')) return 'auditor';
  if (['/app/applications', '/app/loan/', '/app/directory', '/app/instance', '/app/portfolio'].some((p) => path.startsWith(p))) {
    return 'lender';
  }
  if (['/app/overview', '/app/facts', '/app/claims', '/app/loans'].some((p) => path.startsWith(p))) return 'borrower';
  return null;
}
