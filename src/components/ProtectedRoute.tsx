import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { AppRole } from "@/types/custom-tables";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

function getDefaultRoute(role: AppRole | null): string {
  switch (role) {
    // ADMIN and PM land on the Home Hub (5 pictograms)
    case "ADMIN":
    case "PM":
      return "/";
    case "document_manager":
    case "specialist":
    case "energy_modeler":
    case "cxa":
      return "/my-tasks";
    default:
      return "/login";
  }
}

export { getDefaultRoute };

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to={getDefaultRoute(role)} replace />;
  }

  return <>{children}</>;
}
