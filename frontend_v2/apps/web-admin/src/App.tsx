import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Vendors } from './pages/Vendors';
import { Usage } from './pages/Usage';
import { VendorUsage } from './pages/VendorUsage';
import { Billing } from './pages/Billing';
import { Payments } from './pages/Payments';
import { TaxReports } from './pages/TaxReports';
import { Reliability } from './pages/Reliability';
import { Support } from './pages/Support';
import { SupportNewCase } from './pages/SupportNewCase';
import { SupportCaseDetail } from './pages/SupportCaseDetail';
import { SupportConversation } from './pages/SupportConversation';
import { Controls } from './pages/Controls';
import { ShopInspection } from './pages/ShopInspection';
import { Templates } from './pages/Templates';
import { Login } from './pages/Login';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AdminRouteMeta } from './components/seo/AdminRouteMeta';

function App() {
  return (
    <>
      <AdminRouteMeta />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/vendors" element={<Vendors />} />
                  <Route path="/usage" element={<Usage />} />
                  <Route path="/usage/:vendorId" element={<VendorUsage />} />
                  <Route path="/reliability" element={<Reliability />} />
                  <Route path="/support" element={<Support />} />
                  <Route path="/support/new" element={<SupportNewCase />} />
                  <Route path="/support/:caseId" element={<SupportCaseDetail />} />
                  <Route path="/support/conversations/:conversationId" element={<SupportConversation />} />
                  <Route path="/controls" element={<Controls />} />
                  <Route path="/vendors/:vendorId/shop" element={<ShopInspection />} />
                  <Route path="/templates" element={<Templates />} />
                  <Route path="/logs" element={<Navigate to="/reliability" replace />} />
                  <Route path="/billing" element={<Billing />} />
                  <Route path="/payments" element={<Payments />} />
                  <Route path="/tax-reports" element={<TaxReports />} />
                  <Route path="*" element={<div>404 - Page Not Found</div>} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export default App;
