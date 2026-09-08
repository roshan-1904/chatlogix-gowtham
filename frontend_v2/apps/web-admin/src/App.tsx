import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
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
                  <Route path="/vendors" element={<div>Vendors (Coming Soon)</div>} />
                  <Route path="/templates" element={<div>Templates (Coming Soon)</div>} />
                  <Route path="/logs" element={<div>Logs (Coming Soon)</div>} />
                  <Route path="/billing" element={<div>Billing (Coming Soon)</div>} />
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
