import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute, getDefaultRoute } from "@/components/ProtectedRoute";
import type { AppRole } from "@/types/custom-tables";
import Home from "./pages/Home";
import ProjectsHub from "./pages/ProjectsHub";
import ComingSoon from "./pages/ComingSoon";
import InvoicePage from "./pages/Invoice/InvoicePage";
import PaymentsLayout from "./pages/payments/PaymentsLayout";
import RegistroFatture from "./pages/payments/RegistroFatture";
import Recall from "./pages/payments/Recall";
import NoteCredito from "./pages/payments/NoteCredito";
import FatturePassive from "./pages/payments/FatturePassive";
import DaEmettere from "./pages/payments/DaEmettere";
import Insoluti from "./pages/payments/Insoluti";
import DashboardPayments from "./pages/payments/Dashboard";
import IvaPrevisionale from "./pages/payments/IvaPrevisionale";
import TasksAlerts from "./pages/payments/TasksAlerts";
import RegistroClienti from "./pages/payments/RegistroClienti";
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
import Monitor from "./pages/Monitor";
import MonitorReport from "./pages/MonitorReport";
import MyTimesheet from "./pages/MyTimesheet";
import TeamBoard from "./pages/TeamBoard";
import HrHub from "./pages/HrHub";
import HrAvailability from "./pages/hr/HrAvailability";
import HrRequests from "./pages/hr/HrRequests";
import HrAttendance from "./pages/hr/HrAttendance";
import HrScanner from "./pages/hr/HrScanner";
import HrUffici from "./pages/hr/HrUffici";
import Quotations from "./pages/Quotations";
import TimelineVista from "./pages/TimelineVista";
import CronoprogrammaPage from "./pages/Cronoprogramma";
import PortafoglioCantieri from "./pages/PortafoglioCantieri";


// MODIFICA QUI: Configurazione del QueryClient per evitare refresh molesti
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // <-- Disabilita il refresh al cambio scheda
      retry: 1,
    },
  },
});



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
      <Route path="/hr" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><HrHub /></ProtectedRoute>} />
      <Route path="/hr/availability" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><HrAvailability /></ProtectedRoute>} />
      <Route path="/hr/requests" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><HrRequests /></ProtectedRoute>} />
      <Route path="/hr/attendance" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><HrAttendance /></ProtectedRoute>} />
      <Route path="/hr/uffici" element={<ProtectedRoute allowedRoles={R("ADMIN")}><HrUffici /></ProtectedRoute>} />
      <Route path="/hr/scanner" element={<ProtectedRoute allowedRoles={R("ADMIN")}><HrScanner /></ProtectedRoute>} />

      <Route path="/monitor" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><Monitor /></ProtectedRoute>} />
      <Route path="/monitor/report" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><MonitorReport /></ProtectedRoute>} />
      {/* ── Payments ──
          Nove schede su un registro solo. Le schermate arrivano una fase per
          volta; quelle non ancora fatte dicono che il motore sotto gira già.
          `/invoice` resta raggiungibile per confronto finché la sostituzione
          non è completa, poi sparisce insieme al suo store nel localStorage. */}
      <Route path="/payments" element={<ProtectedRoute allowedRoles={R("ADMIN")}><PaymentsLayout /></ProtectedRoute>}>
        <Route index element={<DashboardPayments />} />
        <Route path="registro" element={<RegistroFatture />} />
        <Route path="da-emettere" element={<DaEmettere />} />
        <Route path="recall" element={<Recall />} />
        <Route path="insoluti" element={<Insoluti />} />
        <Route path="clienti" element={<RegistroClienti />} />
        <Route path="note-credito" element={<NoteCredito />} />
        <Route path="passive" element={<FatturePassive />} />
        <Route path="iva" element={<IvaPrevisionale />} />
        <Route path="alerts" element={<TasksAlerts />} />
      </Route>
      <Route path="/invoice" element={<ProtectedRoute allowedRoles={R("ADMIN")}><InvoicePage /></ProtectedRoute>} />
      <Route path="/quotations" element={<ProtectedRoute allowedRoles={R("ADMIN")}><Quotations /></ProtectedRoute>} />

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
      {/* La vista Timeline ridisegnata (SPECIFICA_TIMELINE v1). La rotta
          storica resta raggiungibile come /cronoprogramma-legacy finche' i
          criteri 11 non sono tutti verdi: e' la rete di sicurezza, non un
          secondo prodotto. */}
      <Route path="/projects/:projectId/cronoprogramma" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><TimelineVista /></ProtectedRoute>} />
      <Route path="/projects/:projectId/cronoprogramma-legacy" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><CronoprogrammaPage /></ProtectedRoute>} />
      {/* Stessa schermata per Operations e direzione: il perimetro cambia col
          filtro, non con la pagina. Due schermate distinte divergono. */}
      <Route path="/portafoglio" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><PortafoglioCantieri /></ProtectedRoute>} />

      {/* ── PM Dashboard ── */}
      <Route path="/pm-portal" element={<ProtectedRoute allowedRoles={R("PM")}><PMPortal /></ProtectedRoute>} />

      {/* ── Contacts ── */}
      <Route path="/contacts" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><Contacts /></ProtectedRoute>} />

      {/* ── Operative inbox ── */}
      <Route path="/my-tasks" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM", "document_manager", "specialist", "energy_modeler", "cxa")}><MyTasks /></ProtectedRoute>} />
      <Route path="/timesheet" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM")}><MyTimesheet /></ProtectedRoute>} />
      <Route path="/team-board" element={<ProtectedRoute allowedRoles={R("ADMIN", "PM", "document_manager", "specialist", "energy_modeler", "cxa")}><TeamBoard /></ProtectedRoute>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
