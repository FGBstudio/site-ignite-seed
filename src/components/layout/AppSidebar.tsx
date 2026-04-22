import { 
  LayoutDashboard, 
  FolderKanban,
  Package, 
  Truck,
  BarChart3,
  Settings,
  Crown,
  Inbox,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

interface NavItem {
  title: string;
  url: string;
  icon: any;
}

export function AppSidebar() {
  const location = useLocation();
  const { state } = useSidebar();
  const { role } = useAuth();
  const collapsed = state === "collapsed";

  const isAdmin = role === "ADMIN";
  const isPM = role === "PM";
  const isOperative = role === "document_manager" || role === "specialist" || role === "energy_modeler" || role === "cxa";

  let mainNavItems: NavItem[] = [];

  if (isAdmin) {
    mainNavItems = [
      { title: "CEO Dashboard", url: "/ceo-dashboard", icon: Crown },
      { title: "All Projects", url: "/projects", icon: FolderKanban },
      { title: "Tasks", url: "/admin-tasks", icon: Inbox },
      { title: "Hardwares", url: "/hardwares", icon: Package },
      { title: "Supplier Orders", url: "/supplier-orders", icon: Truck },
      { title: "Reports", url: "/reports", icon: BarChart3 },
    ];
  } else if (isPM) {
    mainNavItems = [
      { title: "My Projects", url: "/projects", icon: FolderKanban },
      { title: "PM Dashboard", url: "/pm-portal", icon: LayoutDashboard },
      { title: "My Tasks", url: "/my-tasks", icon: Inbox },
    ];
  } else if (isOperative) {
    mainNavItems = [
      { title: "Inbox / My Tasks", url: "/my-tasks", icon: Inbox },
    ];
  }

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border/60 bg-sidebar"
    >
      {/* ── Header: FGB brand (Gestionale topnav style) ── */}
      <SidebarHeader className="p-4 pb-3">
        <div className="flex items-center gap-3">
          {/* Logo mark: quadrato teal come Gestionale */}
          <div
            className={cn(
              "flex items-center justify-center rounded-lg shrink-0 transition-all duration-300",
              "bg-[#009193]",
              collapsed ? "h-8 w-8" : "h-9 w-9"
            )}
          >
            <Package className="h-4 w-4 text-white" strokeWidth={1.8} />
          </div>

          {/* Brand text: Futura uppercase tracking (Gestionale nav-brand) */}
          {!collapsed && (
            <div className="flex flex-col leading-tight">
              <span
                className="text-[13px] text-sidebar-foreground tracking-[0.12em] uppercase"
                style={{ fontFamily: "'Futura','Century Gothic','Trebuchet MS',sans-serif", fontWeight: 400 }}
              >
                FGB Studio
              </span>
              <span
                className="text-[10px] text-sidebar-foreground/40 tracking-[0.1em] uppercase"
                style={{ fontFamily: "'Futura','Century Gothic',sans-serif", fontWeight: 400 }}
              >
                Engine Room
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* ── Content: Nav items ── */}
      <SidebarContent className="px-2 pt-1">
        <SidebarGroup>
          {/* Group label: Gestionale section-label style (9-10px futura uppercase) */}
          {!collapsed && (
            <SidebarGroupLabel
              className="px-3 mb-1 text-[9px] tracking-[0.14em] uppercase text-sidebar-foreground/35"
              style={{ fontFamily: "'Futura','Century Gothic',sans-serif" }}
            >
              Menu
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-[2px]">
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                    className={cn(
                      // Gestionale nav item: h-9, rounded-lg, transizione colore
                      "rounded-lg h-9 transition-all duration-150",
                      "text-[12px] tracking-[0.02em]",
                      isActive(item.url)
                        // Active: teal tint bg (Gestionale pill-admin style)
                        ? "bg-[#009193]/10 text-[#009193] font-medium"
                        : "text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <NavLink to={item.url}>
                      <item.icon
                        className={cn(
                          "h-[17px] w-[17px] shrink-0",
                          isActive(item.url) ? "text-[#009193]" : ""
                        )}
                        strokeWidth={isActive(item.url) ? 2 : 1.7}
                      />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── System section (admin only) ── */}
        {isAdmin && (
          <SidebarGroup className="mt-auto">
            {!collapsed && (
              <SidebarGroupLabel
                className="px-3 mb-1 text-[9px] tracking-[0.14em] uppercase text-sidebar-foreground/35"
                style={{ fontFamily: "'Futura','Century Gothic',sans-serif" }}
              >
                System
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/settings")}
                    tooltip="Settings"
                    className={cn(
                      "rounded-lg h-9 transition-all duration-150 text-[12px]",
                      isActive("/settings")
                        ? "bg-[#009193]/10 text-[#009193] font-medium"
                        : "text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <NavLink to="/settings">
                      <Settings
                        className={cn(
                          "h-[17px] w-[17px]",
                          isActive("/settings") ? "text-[#009193]" : ""
                        )}
                        strokeWidth={isActive("/settings") ? 2 : 1.7}
                      />
                      <span>Settings</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* ── Footer: versione (Gestionale style) ── */}
      <SidebarFooter className="p-4 pt-2">
        {!collapsed && (
          <div
            className="rounded-lg bg-muted/40 border border-border/40 px-3 py-2"
          >
            <p
              className="text-[9px] text-muted-foreground tracking-[0.1em] uppercase"
              style={{ fontFamily: "'Futura','Century Gothic',sans-serif" }}
            >
              FGB Engine Room v2.0
            </p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
