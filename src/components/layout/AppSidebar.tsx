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
      { title: "Tutti i Cantieri", url: "/projects", icon: FolderKanban },
      { title: "Magazzino", url: "/inventory", icon: Package },
      { title: "Ordini Fornitori", url: "/supplier-orders", icon: Truck },
      { title: "Reports", url: "/reports", icon: BarChart3 },
    ];
  } else if (isPM) {
    mainNavItems = [
      { title: "I Miei Cantieri", url: "/projects", icon: FolderKanban },
      { title: "Dashboard PM", url: "/pm-portal", icon: LayoutDashboard },
      { title: "I Miei Task", url: "/my-tasks", icon: Inbox },
    ];
  } else if (isOperative) {
    mainNavItems = [
      { title: "Inbox / I Miei Task", url: "/my-tasks", icon: Inbox },
    ];
  }

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/60">
      <SidebarHeader className="p-4 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground">
            <Package className="h-4 w-4 text-background" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold tracking-tight text-sidebar-foreground">FGB Studio</span>
              <span className="text-[11px] text-sidebar-foreground/50 font-medium">Engine Room</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 pt-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-medium text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-1">
            {!collapsed && "Menu"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url)}
                    tooltip={item.title}
                    className={cn(
                      "rounded-lg h-9 transition-all duration-200 font-medium text-[13px]",
                      isActive(item.url) 
                        ? "bg-primary/10 text-primary" 
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <NavLink to={item.url}>
                      <item.icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup className="mt-auto">
            <SidebarGroupLabel className="text-[11px] font-medium text-sidebar-foreground/40 uppercase tracking-widest px-3 mb-1">
              {!collapsed && "Sistema"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/settings")}
                    tooltip="Settings"
                    className={cn(
                      "rounded-lg h-9 transition-all duration-200 font-medium text-[13px]",
                      isActive("/settings")
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    )}
                  >
                    <NavLink to="/settings">
                      <Settings className="h-[18px] w-[18px]" strokeWidth={1.8} />
                      <span>Settings</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        {!collapsed && (
          <div className="rounded-xl bg-muted/50 p-3">
            <p className="text-[11px] text-muted-foreground font-medium">FGB Engine Room v2.0</p>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
