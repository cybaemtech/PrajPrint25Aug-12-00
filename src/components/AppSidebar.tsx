import {
  LayoutDashboard, Printer, FileText, Users, ShieldCheck,
  BarChart3, Settings, ChevronDown, Zap, ListOrdered, MapPin, LogOut, Server, Key, Eye, EyeOff, ScanLine,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useRole } from "@/contexts/RoleContext";
import { storage } from "@/lib/storage";
import { useState } from "react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import logoSrc from "@/assets/cybaem-logo.png";

const navItems = [
  { title: "Dashboard",    url: "/",             icon: LayoutDashboard },
  { title: "Quick Print",  url: "/quick-print",  icon: Zap },
  { title: "Print Queue",  url: "/queue",         icon: ListOrdered },
  { title: "Printers",     url: "/printers",      icon: Printer },
  { title: "Print Jobs",   url: "/print-jobs",    icon: FileText },
  { title: "Scan History", url: "/scan-jobs",     icon: ScanLine },
  { title: "Users",        url: "/users",         icon: Users },
  { title: "Branches",     url: "/branches",      icon: MapPin },
  { title: "Cost Control", url: "/cost-control",  icon: ShieldCheck },
  { title: "Reports",      url: "/reports",       icon: BarChart3 },
  { title: "Settings",     url: "/settings",      icon: Settings },
  { title: "Print Server", url: "/print-server",  icon: Server },
];

const adminOnly = ["Users", "Branches", "Cost Control", "Settings", "Print Server"];

interface AppSidebarProps { onLogout?: () => void }

export function AppSidebar({ onLogout }: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { role, setRole, currentUser } = useRole();
  const [showPin, setShowPin] = useState(false);

  const displayName = currentUser?.name || (role === "admin" ? "Admin" : "Employee");
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();

  // Look up the full user record so we can show the PIN
  // Match by id first, then fall back to employee_id (login system uses different IDs than storage)
  const fullUser = currentUser
    ? storage.getUsers().find(u => u.id === currentUser.id || u.employee_id === currentUser.employee_id) ?? null
    : null;

  const visible = navItems.filter(item =>
    role === "admin" ? true : !adminOnly.includes(item.title)
  );

  return (
    <Sidebar collapsible="icon">
      {/* ── Brand ── */}
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={`flex items-center py-3 ${collapsed ? "justify-center px-2" : "px-3"}`}>
          {collapsed ? (
            <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center shadow-sm">
              <span className="text-xs font-black text-[#1a3355]">CT</span>
            </div>
          ) : (
            <div className="bg-white rounded-lg px-2.5 py-1.5 shadow-sm inline-flex">
              <img
                src={logoSrc}
                alt="Cybaem Tech"
                className="h-6 w-auto object-contain"
              />
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="px-3 pb-2.5 flex items-center gap-1.5">
            <span className="text-[10px] text-sidebar-foreground/40 font-medium tracking-wider uppercase">PrintGuard</span>
            <span className="h-1 w-1 rounded-full bg-sidebar-primary/60" />
            <span className="text-[10px] text-sidebar-primary/70 font-medium">Enterprise</span>
          </div>
        )}
      </SidebarHeader>

      {/* ── Nav ── */}
      <SidebarContent className="py-2">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-sidebar-foreground/30 px-4 mb-0.5">
              Menu
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map((item) => {
                const isActive = item.url === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        activeClassName=""
                        className={[
                          "flex items-center gap-2.5 px-3 py-2 mx-1.5 rounded-lg text-xs font-medium transition-all duration-150",
                          isActive
                            ? "bg-sidebar-primary text-white shadow-sm shadow-sidebar-primary/30"
                            : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                        ].join(" ")}
                      >
                        <item.icon className={`h-4 w-4 shrink-0 transition-colors ${isActive ? "text-white" : "text-sidebar-foreground/50"}`} />
                        {!collapsed && <span>{item.title}</span>}
                        {!collapsed && isActive && (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/60" />
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── User footer ── */}
      <SidebarFooter className="border-t border-sidebar-border p-2">
        {!collapsed ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-sidebar-foreground hover:bg-sidebar-accent transition-colors group">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-sidebar-primary to-blue-400 flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm">
                  {initials}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-semibold truncate leading-tight text-sidebar-foreground/90">{displayName}</div>
                  <div className="text-[10px] text-sidebar-foreground/45 capitalize leading-tight mt-0.5">
                    {role} · {currentUser?.branch || "Hinjewadi"}
                  </div>
                </div>
                <ChevronDown className="h-3 w-3 text-sidebar-foreground/30 shrink-0 group-hover:text-sidebar-foreground/60 transition-colors" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-64 p-0" sideOffset={8}>
              {/* Profile header */}
              <div className="px-3 py-2.5 border-b">
                <p className="text-xs font-semibold text-foreground">{displayName}</p>
                <p className="text-2xs text-muted-foreground mt-0.5">
                  {currentUser?.employee_id} · {currentUser?.branch}
                </p>
              </div>

              {/* Secured Print PIN — most important for employees */}
              {fullUser && (
                <div className="px-3 py-2.5 border-b bg-primary/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Key className="h-3.5 w-3.5 text-primary" />
                      <span className="text-2xs font-semibold text-foreground">Your Secured Print PIN</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="font-mono font-bold text-sm tracking-widest text-primary"
                        data-testid="text-my-pin"
                      >
                        {showPin ? fullUser.pin : "••••"}
                      </span>
                      <button
                        onClick={(e) => { e.preventDefault(); setShowPin(v => !v); }}
                        className="text-muted-foreground hover:text-foreground"
                        data-testid="button-toggle-pin"
                        title={showPin ? "Hide PIN" : "Show PIN"}
                      >
                        {showPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-2xs text-muted-foreground mt-1">
                    Enter this PIN on the printer panel to release your jobs
                  </p>
                </div>
              )}

              {onLogout && (
                <div className="p-1">
                  <DropdownMenuItem onClick={onLogout} className="text-xs text-destructive focus:text-destructive focus:bg-destructive/5">
                    <LogOut className="h-3.5 w-3.5 mr-2" /> Sign out
                  </DropdownMenuItem>
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="flex justify-center py-1">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-sidebar-primary to-blue-400 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
              {initials}
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
