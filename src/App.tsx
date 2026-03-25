import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute, getDefaultRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Inventory from "./pages/Inventory";
import SupplierOrders from "./pages/SupplierOrders";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import CeoDashboard from "./pages/CeoDashboard";
import MyTasks from "./pages/MyTasks";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const basename = import.meta.env.BASE_URL.replace(/\/+$/, "") || "/";

function AppRoutes() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={getDefaultRoute(role)} replace /> : <Login />} />
      
      {/* Admin routes */}
      <Route path="/" element={<ProtectedRoute allowedRoles={["ADMIN"]}><Index /></ProtectedRoute>} />
      <Route path="/ceo-dashboard" element={<ProtectedRoute allowedRoles={["ADMIN"]}><CeoDashboard /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute allowedRoles={["ADMIN"]}><Inventory /></ProtectedRoute>} />
      <Route path="/supplier-orders" element={<ProtectedRoute allowedRoles={["ADMIN"]}><SupplierOrders /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute allowedRoles={["ADMIN"]}><Reports /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute allowedRoles={["ADMIN"]}><Settings /></ProtectedRoute>} />
      
      {/* Shared: Admin + PM */}
      <Route path="/projects" element={<ProtectedRoute allowedRoles={["ADMIN", "PM"]}><Projects /></ProtectedRoute>} />
      <Route path="/projects/:projectId" element={<ProtectedRoute allowedRoles={["ADMIN", "PM"]}><ProjectDetail /></ProtectedRoute>} />
      
      {/* Operative inbox: all roles can see their tasks */}
      <Route path="/my-tasks" element={<ProtectedRoute allowedRoles={["ADMIN", "PM", "document_manager", "specialist", "energy_modeler", "cxa"]}><MyTasks /></ProtectedRoute>} />
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter basename={basename}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
