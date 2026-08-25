import { ReactNode, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useRole } from "@/contexts/RoleContext";
import { Bell, LogOut, MapPin, User, CheckCircle2, AlertTriangle, XCircle, Info, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";

const levelIcon: Record<AppNotification["level"], JSX.Element> = {
  error:   <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />,
  info:    <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />,
};

const levelBg: Record<AppNotification["level"], string> = {
  error:   "bg-destructive/5 border-destructive/15",
  warning: "bg-warning/5 border-warning/15",
  success: "bg-success/5 border-success/15",
  info:    "bg-primary/5 border-primary/15",
};

export function Layout({ children, onLogout }: { children: ReactNode; onLogout: () => void }) {
  const { role, currentUser } = useRole();
  const notifications = useNotifications();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const visible = notifications.filter(n => !dismissed.has(n.id));
  const alertCount = visible.filter(n => n.level === "error" || n.level === "warning").length;

  const dismiss = (id: string) => setDismissed(prev => new Set([...prev, id]));
  const dismissAll = () => setDismissed(new Set(notifications.map(n => n.id)));

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar onLogout={onLogout} />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="h-12 flex items-center border-b bg-card px-3 gap-3 shrink-0 shadow-sm">
            <SidebarTrigger className="h-7 w-7 text-muted-foreground hover:text-foreground" />

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              {currentUser && (
                <>
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/60 rounded-lg text-xs border border-border/50">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold text-foreground">{currentUser.name}</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/40 rounded-lg text-xs border border-blue-200/60 dark:border-blue-800/40">
                    <MapPin className="h-3.5 w-3.5 text-blue-500" />
                    <span className="text-blue-600 dark:text-blue-400 font-semibold">{currentUser.branch}</span>
                  </div>
                </>
              )}

              <Badge
                variant="outline"
                className="text-2xs capitalize px-2 py-1 bg-muted/40 border-border/60"
              >
                {role}
              </Badge>

              {/* Bell */}
              <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                  <button
                    data-testid="button-notifications"
                    className="relative p-1.5 rounded-lg hover:bg-muted transition-colors"
                  >
                    <Bell className="h-4 w-4 text-muted-foreground" />
                    {alertCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[9px] font-bold text-white flex items-center justify-center">
                        {alertCount > 9 ? "9+" : alertCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>

                <PopoverContent
                  align="end"
                  sideOffset={8}
                  className="w-80 p-0 shadow-lg border border-border/60"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                    <div>
                      <h3 className="text-sm font-semibold">Notifications</h3>
                      <p className="text-2xs text-muted-foreground">
                        {visible.length} active alert{visible.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {visible.length > 1 && (
                      <button
                        onClick={dismissAll}
                        className="text-2xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </div>

                  {/* List */}
                  <div className="max-h-80 overflow-y-auto divide-y divide-border/40">
                    {visible.length === 0 ? (
                      <div className="px-4 py-8 text-center">
                        <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2 opacity-60" />
                        <p className="text-xs text-muted-foreground">All clear — no alerts</p>
                      </div>
                    ) : (
                      visible.map(n => (
                        <div
                          key={n.id}
                          className={`flex items-start gap-3 px-4 py-3 ${levelBg[n.level]} border-l-2 mx-0 transition-colors hover:brightness-95`}
                          style={{
                            borderLeftColor:
                              n.level === "error"   ? "hsl(var(--destructive))" :
                              n.level === "warning" ? "hsl(var(--warning))" :
                              n.level === "success" ? "hsl(var(--success))" :
                              "hsl(var(--primary))",
                          }}
                        >
                          {levelIcon[n.level]}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold leading-tight">{n.title}</p>
                            <p className="text-2xs text-muted-foreground mt-0.5 leading-snug">{n.body}</p>
                            <p className="text-2xs text-muted-foreground/60 mt-1">{n.time}</p>
                          </div>
                          <button
                            onClick={() => dismiss(n.id)}
                            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors mt-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title="Logout"
                data-testid="button-logout"
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-5">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
