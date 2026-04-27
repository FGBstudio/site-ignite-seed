import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Entry point for the "Projects" macro-section.
 * Redirects to the role-appropriate landing page inside the existing app.
 */
export default function ProjectsHub() {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (role === "ADMIN") return <Navigate to="/ceo-dashboard" replace />;
  if (role === "PM") return <Navigate to="/projects" replace />;
  return <Navigate to="/login" replace />;
}
