import { useState, useRef, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  Crown,
  FolderKanban,
  Package,
  Truck,
  BarChart3,
  Settings,
  LayoutDashboard,
  Inbox,
  LogOut,
  User,
  ChevronDown,
} from "lucide-react";

interface NavItem {
  title: string;
  url: string;
  icon: any;
}

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
      { title: "CEO Dashboard", url: "/ceo-dashboard", icon: Crown },
      { title: "Cantieri", url: "/projects", icon: FolderKanban },
      { title: "Magazzino", url: "/inventory", icon: Package },
      { title: "Ordini", url: "/supplier-orders", icon: Truck },
      { title: "Reports", url: "/reports", icon: BarChart3 },
      { title: "Settings", url: "/settings", icon: Settings },
    ];
  } else if (isPM) {
    navItems = [
      { title: "Dashboard", url: "/pm-portal", icon: LayoutDashboard },
      { title: "I Miei Cantieri", url: "/projects", icon: FolderKanban },
      { title: "I Miei Task", url: "/my-tasks", icon: Inbox },
    ];
  } else if (isOperative) {
    navItems = [
      { title: "I Miei Task", url: "/my-tasks", icon: Inbox },
    ];
  }

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <nav className="sticky top-0 z-50 w-full">
      {/* Main bar */}
      <div className="bg-background/80 backdrop-blur-2xl border-b border-border/50">
        <div className="max-w-[1440px] mx-auto flex h-11 items-center justify-between px-6">
          {/* Logo */}
          <NavLink to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-foreground">
              <Package className="h-3.5 w-3.5 text-background" />
            </div>
            <span className="text-[13px] font-semibold tracking-tight text-foreground hidden sm:block">
              FGB Studio
            </span>
          </NavLink>

          {/* Center nav links */}
          <div className="flex items-center gap-0.5">
            {navItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                className={cn(
                  "relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200",
                  isActive(item.url)
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span>{item.title}</span>
                {isActive(item.url) && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-foreground" />
                )}
              </NavLink>
            ))}
          </div>

          {/* Right: user area */}
          <div className="flex items-center gap-2 shrink-0" ref={userMenuRef}>
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium transition-all duration-200",
                  "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-3 w-3 text-muted-foreground" />
                </div>
                <span className="hidden md:inline max-w-[100px] truncate">
                  {profile?.full_name?.split(" ")[0] || "Account"}
                </span>
                <ChevronDown className="h-3 w-3" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-border/60 bg-popover/95 backdrop-blur-2xl p-1.5 shadow-lg animate-scale-in">
                  {profile && (
                    <div className="px-3 py-2 border-b border-border/40 mb-1">
                      <p className="text-[12px] font-medium text-foreground truncate">{profile.full_name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{profile.email}</p>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      signOut();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Esci
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
