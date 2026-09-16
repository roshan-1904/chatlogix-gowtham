import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@chatlogix/auth';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, hasRole } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Checking your session…</p>
      </div>
    );
  }

  if (!isAuthenticated || !hasRole('admin')) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
