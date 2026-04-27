import { useState, useRef, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  isInProjectsSection,
  getSectionForPath,
  HUB_SECTIONS,
} from "@/lib/hubSections";
import {
  Crown,
  FolderKanban,
  Package,
  Truck,
  BarChart3,
  Settings,
  LayoutDashboard,
  Inbox,
  Contact as ContactIcon,
} from "lucide-react";

interface NavItem {
  title: string;
  url: string;
  icon: any;
}

// ── Role pill style (Gestionale: nav-pill) ──────────────────────────────────
const ROLE_PILL: Record<string, { label: string; style: React.CSSProperties }> = {
  ADMIN: {
    label: "ADMIN",
    style: {
      background: "color-mix(in srgb, #009193 14%, transparent)",
      color: "#009193",
    },
  },
  PM: {
    label: "MANAGER",
    style: {
      background: "color-mix(in srgb, #911140 12%, transparent)",
      color: "#911140",
    },
  },
  document_manager: { label: "DOC MGR",   style: { background: "color-mix(in srgb,#555 20%,transparent)", color: "#555" } },
  specialist:       { label: "SPECIALIST", style: { background: "color-mix(in srgb,#555 20%,transparent)", color: "#555" } },
  energy_modeler:   { label: "ENERGY",     style: { background: "color-mix(in srgb,#555 20%,transparent)", color: "#555" } },
  cxa:              { label: "CXA",        style: { background: "color-mix(in srgb,#555 20%,transparent)", color: "#555" } },
};

const FUTURA: React.CSSProperties = {
  fontFamily: "'Futura','Futura PT','Century Gothic','Trebuchet MS',sans-serif",
};

export function TopNavbar() {
  const location = useLocation();
  const { role, profile, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isAdmin = role === "ADMIN";
  const isPM = role === "PM";
  const isOperative =
    role === "document_manager" ||
    role === "specialist" ||
    role === "energy_modeler" ||
    role === "cxa";

  let navItems: NavItem[] = [];

  if (isAdmin) {
    navItems = [
      { title: "Admin Dashboard", url: "/ceo-dashboard", icon: Crown },
      { title: "Projects", url: "/projects", icon: FolderKanban },
      { title: "Contacts", url: "/contacts", icon: ContactIcon },
      { title: "Tasks & Alerts", url: "/admin-tasks", icon: Inbox },
      { title: "Hardwares", url: "/hardwares", icon: Package },
      { title: "Orders", url: "/supplier-orders", icon: Truck },
      { title: "Reports", url: "/reports", icon: BarChart3 },
      { title: "Settings", url: "/settings", icon: Settings },
    ];
  } else if (isPM) {
    navItems = [
      { title: "Dashboard", url: "/pm-portal", icon: LayoutDashboard },
      { title: "My Projects", url: "/projects", icon: FolderKanban },
      { title: "Contacts", url: "/contacts", icon: ContactIcon },
      { title: "My Tasks", url: "/my-tasks", icon: Inbox },
    ];
  } else if (isOperative) {
    navItems = [
      { title: "My Tasks", url: "/my-tasks", icon: Inbox },
    ];
  }

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  // Section context: are we inside the "Projects" macro-section, or one of the
  // standalone hub sections (Office, HR, Monitor, Invoice)?
  const inProjects = isInProjectsSection(location.pathname);
  const standaloneSection = getSectionForPath(location.pathname);

  // Current page label for breadcrumb (only meaningful inside Projects)
  const currentPage = navItems.find((item) => isActive(item.url));

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pill = role ? ROLE_PILL[role] : null;

  return (
    <nav
      className="bg-card sticky top-0 z-50"
      style={{
        height: 52,
        borderBottom: "0.5px solid hsl(var(--border))",
        transition: "background .4s, border-color .4s",
      }}
    >
      <div
        className="max-w-[1440px] mx-auto px-6 flex items-center h-full gap-0"
        style={{ height: 52 }}
      >
        {/* ── Logo + brand → always back to Home Hub ── */}
        <NavLink
          to="/"
          className="flex items-center gap-[9px] shrink-0 transition-opacity hover:opacity-70"
          style={{ cursor: "pointer" }}
        >
          {/* Square teal logo mark */}
          <div
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#009193] shrink-0"
          >
            <Package className="h-[14px] w-[14px] text-white" strokeWidth={1.8} />
          </div>
          {/* Brand: Futura uppercase (Gestionale .nav-brand) */}
          <span
            className="text-foreground text-[13px]"
            style={{ ...FUTURA, letterSpacing: "0.13em", textTransform: "uppercase", fontWeight: 400 }}
          >
            FGB
          </span>
        </NavLink>

        {/* ── Separator (Gestionale .nav-sep) ── */}
        <div
          className="shrink-0 mx-[14px]"
          style={{ width: 1, height: 18, background: "hsl(var(--border))" }}
        />

        {/* ── Breadcrumb / current page ── */}
        <div
          className="flex items-center gap-[5px] text-[13px] shrink-0"
          style={{ fontFamily: "'DM Sans',sans-serif" }}
        >
          <NavLink to="/" className="text-muted-foreground hover:text-[#009193] transition-colors">
            Home
          </NavLink>

          {/* Inside Projects macro-section */}
          {inProjects && (
            <>
              <span className="text-muted-foreground/50 mx-0.5">/</span>
              <span className="text-foreground font-medium">Projects</span>
              {currentPage && (
                <>
                  <span className="text-muted-foreground/50 mx-0.5">/</span>
                  <span className="text-muted-foreground">{currentPage.title}</span>
                </>
              )}
            </>
          )}

          {/* Inside a Coming-Soon standalone hub section */}
          {!inProjects && standaloneSection && (
            <>
              <span className="text-muted-foreground/50 mx-0.5">/</span>
              <span className="text-foreground font-medium" style={{ textTransform: "capitalize" }}>
                {standaloneSection.name.toLowerCase()}
              </span>
            </>
          )}
        </div>

        {/* ── Spacer ── */}
        <div className="flex-1" />

        {/* ── Functional tabs: only inside the Projects macro-section ── */}
        {inProjects && (
          <div className="hidden lg:flex items-center gap-[2px] mr-4">
            {navItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                className={cn(
                  "relative flex items-center gap-[5px] px-3 h-[52px]",
                  "text-[11px] transition-colors duration-150 border-b-2",
                  // Gestionale .fat-tab style
                  isActive(item.url)
                    ? "text-[#009193] border-[#009193]"
                    : "text-muted-foreground border-transparent hover:text-foreground"
                )}
                style={{ ...FUTURA, letterSpacing: "0.08em", textTransform: "uppercase" }}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.7} />
                <span className="whitespace-nowrap">{item.title}</span>
              </NavLink>
            ))}
          </div>
        )}

        {/* ── User area (Gestionale .nav-usr) ── */}
        <div className="flex items-center gap-[10px] shrink-0" ref={userMenuRef}>
          {/* Role pill (Gestionale .nav-pill) */}
          {pill && (
            <span
              className="text-[10px] px-[10px] py-[3px] rounded-full"
              style={{ ...FUTURA, letterSpacing: "0.06em", ...pill.style }}
            >
              {pill.label}
            </span>
          )}

          {/* Email label */}
          {profile?.email && (
            <span className="hidden md:block text-[11px] text-muted-foreground max-w-[150px] truncate"
              style={{ fontFamily: "'DM Sans',sans-serif" }}>
              {profile.email}
            </span>
          )}

          {/* Logout button (Gestionale .nav-logout) */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="text-muted-foreground transition-all hover:bg-muted/50"
              style={{
                fontSize: 11,
                padding: "4px 12px",
                border: "0.5px solid hsl(var(--border))",
                borderRadius: 6,
                background: "transparent",
                cursor: "pointer",
                ...FUTURA,
                letterSpacing: "0.06em",
              }}
            >
              {profile?.full_name?.split(" ")[0] || "Account"}
            </button>

            {userMenuOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-52 bg-card p-1.5 z-50"
                style={{
                  border: "0.5px solid hsl(var(--border))",
                  borderRadius: 12,
                  boxShadow: "var(--shadow-lg, 0 8px 32px rgba(0,0,0,.10))",
                  animation: "pIn .2s ease",
                }}
              >
                {profile && (
                  <div
                    className="px-3 py-2 mb-1"
                    style={{ borderBottom: "0.5px solid hsl(var(--border))" }}
                  >
                    <p className="text-[12px] font-medium text-foreground truncate">{profile.full_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{profile.email}</p>
                  </div>
                )}
                <button
                  onClick={() => { setUserMenuOpen(false); signOut(); }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] text-destructive transition-colors hover:bg-destructive/10"
                  style={FUTURA}
                >
                  Esci / Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
