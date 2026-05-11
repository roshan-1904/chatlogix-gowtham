import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Conversations } from './pages/Conversations';
import { Orders } from './pages/Orders';
import { OrderDetails } from './pages/OrderDetails';
import { Products } from './pages/Products';
import { ProductCreate } from './pages/ProductCreate';
import { ProductEdit } from './pages/ProductEdit';
import { CatalogImport } from './pages/CatalogImport';
import { CatalogImportPhoto } from './pages/CatalogImportPhoto';
import { CatalogImportTemplate } from './pages/CatalogImportTemplate';
import { CatalogImportGoLive } from './pages/CatalogImportGoLive';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

function App() {
  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#363636',
            color: '#fff',
            borderRadius: '8px',
            padding: '12px 16px',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#4ade80',
              secondary: '#fff',
            },
          },
          error: {
            duration: 5000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute requiredRole="vendor">
            <Layout>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/conversations" element={<Conversations />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/orders/:orderId" element={<OrderDetails />} />
                <Route path="/catalog" element={<Products />} />
                <Route path="/catalog/new" element={<ProductCreate />} />
                <Route path="/catalog/import" element={<CatalogImport />} />
                <Route path="/catalog/import/photo" element={<CatalogImportPhoto />} />
                <Route path="/catalog/import/template" element={<CatalogImportTemplate />} />
                <Route path="/catalog/import/:jobId/go-live" element={<CatalogImportGoLive />} />
                <Route path="/catalog/:id/edit" element={<ProductEdit />} />
                <Route path="/settings" element={<Settings />} />
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

