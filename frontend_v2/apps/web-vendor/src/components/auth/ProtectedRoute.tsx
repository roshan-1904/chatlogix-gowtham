import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, type RegistrationStatus } from '@chatlogix/auth';
import { redirectPathForStatus } from '../../lib/onboarding';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: 'admin' | 'vendor' | 'vendor_staff';
  /** When true, only approved vendors may access (main portal). */
  requireApproved?: boolean;
  /** When true, only non-approved vendors (onboarding funnel). */
  onboardingOnly?: boolean;
}

export function ProtectedRoute({
  children,
  requiredRole,
  requireApproved = false,
  onboardingOnly = false,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasRole, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-600">Access denied. Required role: {requiredRole}</div>
      </div>
    );
  }

  const status = (user?.registrationStatus ?? 'approved') as RegistrationStatus;
  const isApproved = status === 'approved';

  if (requireApproved && !isApproved) {
    const target = redirectPathForStatus(status, 1);
    return <Navigate to={target} replace />;
  }

  if (onboardingOnly && isApproved) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
