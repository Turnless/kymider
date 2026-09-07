import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { BorrowerLanding } from './borrower/Landing';
import { BorrowerDashboard } from './borrower/Dashboard';
import { FactsForm } from './borrower/FactsForm';
import { ClaimsInbox } from './borrower/ClaimsInbox';
import { AuthorizeLender } from './borrower/AuthorizeLender';
import { LenderLanding } from './lender/Landing';
import { Registry } from './lender/Registry';
import { BorrowerDetail } from './lender/BorrowerDetail';
import { ClaimsDashboard } from './lender/ClaimsDashboard';

type Role = 'borrower' | 'lender';

export default function App() {
  const [role, setRole] = useState<Role>('borrower');

  const toggleRole = useCallback(() => {
    setRole((r) => (r === 'borrower' ? 'lender' : 'borrower'));
  }, []);

  return (
    <BrowserRouter>
      <Layout role={role} onRoleToggle={toggleRole}>
        <Routes>
          {/* Landing — shows based on role */}
          <Route
            path="/"
            element={
              role === 'borrower' ? <BorrowerLanding /> : <LenderLanding />
            }
          />

          {/* Borrower routes */}
          <Route path="/dashboard" element={<BorrowerDashboard />} />
          <Route path="/facts" element={<FactsForm />} />
          <Route path="/claims" element={role === 'borrower' ? <ClaimsInbox /> : <ClaimsDashboard />} />
          <Route path="/authorize" element={<AuthorizeLender />} />

          {/* Lender routes */}
          <Route path="/registry" element={<Registry />} />
          <Route path="/borrower/:address" element={<BorrowerDetail />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
