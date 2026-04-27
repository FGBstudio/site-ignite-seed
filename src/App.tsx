import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute, getDefaultRoute } from "@/components/ProtectedRoute";
import type { AppRole } from "@/types/custom-tables";
import Home from "./pages/Home";
import ProjectsHub from "./pages/ProjectsHub";
import ComingSoon from "./pages/ComingSoon";
import InvoicePage from "./pages/Invoice/InvoicePage";
import { HUB_SECTIONS } from "@/lib/hubSections";
import Projects from "./pages/Projects";
import ProjectCreateWizard from "./pages/ProjectCreateWizard";
import ProjectDetail from "./pages/ProjectDetail";
import Inventory from "./pages/Inventory";
import Hardwares from "./pages/Hardwares";
import SupplierOrders from "./pages/SupplierOrders";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import CeoDashboard from "./pages/CeoDashboard";
import MyTasks from "./pages/MyTasks";
import PMPortal from "./pages/PMPortal";
import AdminTasks from "./pages/AdminTasks";
import Contacts from "./pages/Contacts";
import Login from "./pages/Login";
import Unsubscribe from "./pages/Unsubscribe";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const basename = import.meta.env.BASE_URL.replace(/\/+$/, "") || "/";

const R = (...roles: AppRole[]) => roles;

// Helper to look up a hub section by id (Projects-section coming-soon pages)
const section = (id: string) =>
  HUB_SECTIONS.find((s) => s.id === id)!;

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
      <Route path="/unsubscribe" element={<Unsubscribe />} />

      {/* ── Home Hub (ADMIN + PM) ── */}
      <Route path="/" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><Home /></ProtectedRoute>} />

      {/* ── Projects macro-section entry ── */}
      <Route path="/projects-hub" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><ProjectsHub /></ProtectedRoute>} />

      {/* ── Coming Soon sections ── */}
      <Route path="/office" element={<ProtectedRoute allowedRoles={R("ADMIN")}><ComingSoon section={section("office")} /></ProtectedRoute>} />
      <Route path="/hr" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><ComingSoon section={section("hr")} /></ProtectedRoute>} />
      <Route path="/monitor" element={<ProtectedRoute allowedRoles={R("ADMIN")}><ComingSoon section={section("monitor")} /></ProtectedRoute>} />
      <Route path="/invoice" element={<ProtectedRoute allowedRoles={R("ADMIN")}><InvoicePage /></ProtectedRoute>} />

      {/* ── Admin routes (Projects section) ── */}
      <Route path="/ceo-dashboard" element={<ProtectedRoute allowedRoles={R("ADMIN")}><CeoDashboard /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute allowedRoles={R("ADMIN")}><Inventory /></ProtectedRoute>} />
      <Route path="/hardwares" element={<ProtectedRoute allowedRoles={R("ADMIN")}><Hardwares /></ProtectedRoute>} />
      <Route path="/supplier-orders" element={<ProtectedRoute allowedRoles={R("ADMIN")}><SupplierOrders /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute allowedRoles={R("ADMIN")}><Reports /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute allowedRoles={R("ADMIN")}><Settings /></ProtectedRoute>} />
      <Route path="/admin-tasks" element={<ProtectedRoute allowedRoles={R("ADMIN")}><AdminTasks /></ProtectedRoute>} />

      {/* ── Shared: Admin + PM ── */}
      <Route path="/projects" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><Projects /></ProtectedRoute>} />
      <Route path="/projects/new" element={<ProtectedRoute allowedRoles={R("ADMIN")}><ProjectCreateWizard /></ProtectedRoute>} />
      <Route path="/projects/:projectId" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><ProjectDetail /></ProtectedRoute>} />

      {/* ── PM Dashboard ── */}
      <Route path="/pm-portal" element={<ProtectedRoute allowedRoles={R("PM")}><PMPortal /></ProtectedRoute>} />

      {/* ── Contacts ── */}
      <Route path="/contacts" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><Contacts /></ProtectedRoute>} />

      {/* ── Operative inbox ── */}
      <Route path="/my-tasks" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM", "document_manager", "specialist", "energy_modeler", "cxa")}><MyTasks /></ProtectedRoute>} />

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
