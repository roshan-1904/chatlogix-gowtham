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
import { Faqs } from './pages/Faqs';
import { Queries } from './pages/Queries';
import { QueryDetail } from './pages/QueryDetail';
import { FaqCreate } from './pages/FaqCreate';
import { FaqEdit } from './pages/FaqEdit';
import { CatalogImport } from './pages/CatalogImport';
import { CatalogImportPhoto } from './pages/CatalogImportPhoto';
import { CatalogImportTemplate } from './pages/CatalogImportTemplate';
import { CatalogImportGoLive } from './pages/CatalogImportGoLive';
import { Settings } from './pages/Settings';
import { Wallet } from './pages/Wallet';
import { Login } from './pages/Login';
import { Signup } from './pages/onboarding/Signup';
import { OnboardingWelcome } from './pages/onboarding/OnboardingWelcome';
import { OnboardingCatalog } from './pages/onboarding/OnboardingCatalog';
import { OnboardingClarify } from './pages/onboarding/OnboardingClarify';
import { OnboardingConfirm } from './pages/onboarding/OnboardingConfirm';
import { OnboardingAiSetup } from './pages/onboarding/OnboardingAiSetup';
import { OnboardingDemoChat } from './pages/onboarding/OnboardingDemoChat';
import { OnboardingReview } from './pages/onboarding/OnboardingReview';
import { OnboardingSubmitted } from './pages/onboarding/OnboardingSubmitted';
import { OnboardingRejected } from './pages/onboarding/OnboardingRejected';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { VendorRouteMeta } from './components/seo/VendorRouteMeta';

function App() {
  return (
    <>
      <VendorRouteMeta />
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
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/onboarding/*"
          element={
            <ProtectedRoute requiredRole="vendor" onboardingOnly>
              <Routes>
                <Route path="/" element={<Navigate to="catalog" replace />} />
                <Route path="welcome" element={<OnboardingWelcome />} />
                <Route path="catalog" element={<OnboardingCatalog />} />
                <Route path="clarify" element={<OnboardingClarify />} />
                <Route path="confirm" element={<OnboardingConfirm />} />
                <Route path="ai-setup" element={<OnboardingAiSetup />} />
                <Route path="demo-chat" element={<OnboardingDemoChat />} />
                <Route path="review" element={<OnboardingReview />} />
                <Route path="submitted" element={<OnboardingSubmitted />} />
                <Route path="rejected" element={<OnboardingRejected />} />
              </Routes>
            </ProtectedRoute>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute requiredRole="vendor" requireApproved>
              <Layout>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/conversations" element={<Conversations />} />
                  <Route path="/queries" element={<Queries />} />
                  <Route path="/queries/:id" element={<QueryDetail />} />
                  <Route path="/orders" element={<Orders />} />
                  <Route path="/orders/:orderId" element={<OrderDetails />} />
                  <Route path="/catalog" element={<Products />} />
                  <Route path="/catalog/new" element={<ProductCreate />} />
                  <Route path="/catalog/import" element={<CatalogImport />} />
                  <Route path="/catalog/import/photo" element={<CatalogImportPhoto />} />
                  <Route path="/catalog/import/template" element={<CatalogImportTemplate />} />
                  <Route path="/catalog/import/:jobId/go-live" element={<CatalogImportGoLive />} />
                  <Route path="/catalog/:id/edit" element={<ProductEdit />} />
                  <Route path="/faqs" element={<Faqs />} />
                  <Route path="/faqs/new" element={<FaqCreate />} />
                  <Route path="/faqs/:id/edit" element={<FaqEdit />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/wallet" element={<Wallet />} />
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
