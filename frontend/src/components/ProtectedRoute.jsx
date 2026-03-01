import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../stores/useAppStore';
import { Loader2 } from 'lucide-react';

/**
 * Protected Route Component
 * 
 * Guards routes based on:
 * - Authentication status
 * - User role (optional)
 */

export function ProtectedRoute({ children, requiredRole = null }) {
  const { isAuthLoading, isAuthenticated, user } = useAuth();

  // Loading state
  if (isAuthLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
          <p className="text-slate-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check role if required
  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/403" replace />;
  }

  return children;
}

export default ProtectedRoute;
