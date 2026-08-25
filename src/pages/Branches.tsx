import { storage } from "@/lib/storage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MapPin, Printer, Users, FileText, Zap } from "lucide-react";

const BRANCHES = ["Hinjewadi", "Wakad", "Urawade"] as const;

const branchMeta: Record<string, { color: string; bg: string; accent: string; desc: string }> = {
  Hinjewadi: { color: "text-blue-600", bg: "bg-blue-50", accent: "bg-blue-500", desc: "HQ — Main Operations Centre" },
  Wakad:     { color: "text-violet-600", bg: "bg-violet-50", accent: "bg-violet-500", desc: "Regional Office" },
  Urawade:   { color: "text-emerald-600", bg: "bg-emerald-50", accent: "bg-emerald-500", desc: "Plant & Logistics Hub" },
};

export default function Branches() {
  const printers = storage.getPrinters();
  const users    = storage.getUsers();
  const jobs     = storage.getJobs();

  const branchData = BRANCHES.map(branch => {
    const bp  = printers.filter(p => p.branch === branch);
    const bu  = users.filter(u => u.branch === branch);
    const bj  = jobs.filter(j => j.branch === branch);
    const bCompleted = bj.filter(j => j.status === "completed");
    const bPending   = bj.filter(j => j.status === "queued" || j.status === "printing");
    const totalCost  = bCompleted.reduce((s, j) => s + j.cost, 0);
    const online     = bp.filter(p => p.status === "online").length;
    const meta       = branchMeta[branch];
    const avgToner   = bp.length ? Math.round(bp.reduce((s, p) => s + p.tonerLevel, 0) / bp.length) : 100;

    return { branch, bp, bu, bj, bCompleted, bPending, totalCost, online, meta, avgToner };
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold">Branch Overview</h1>
        <p className="text-xs text-muted-foreground mt-0.5">All Praj locations — printers, users, and print activity</p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Printers", value: printers.length, icon: Printer, sub: `${printers.filter(p => p.status === "online").length} online` },
          { label: "Total Users",    value: users.length,    icon: Users,   sub: `across ${BRANCHES.length} branches` },
          { label: "Total Jobs",     value: jobs.length,     icon: FileText, sub: `${jobs.filter(j => j.status === "queued" || j.status === "printing").length} pending` },
        ].map(({ label, value, icon: Icon, sub }) => (
          <Card key={label} className="shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-xl font-bold">{value}</div>
                <div className="text-2xs text-muted-foreground">{label}</div>
                <div className="text-2xs text-muted-foreground/70">{sub}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Branch cards */}
      <div className="grid grid-cols-1 gap-4">
        {branchData.map(({ branch, bp, bu, bCompleted, bPending, totalCost, online, meta, avgToner }) => (
          <Card key={branch} className="shadow-sm overflow-hidden">
            {/* Coloured top strip */}
            <div className={`h-1.5 w-full ${meta.accent}`} />

            <CardHeader className="px-5 pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-8 w-8 rounded-full ${meta.bg} flex items-center justify-center`}>
                    <MapPin className={`h-4 w-4 ${meta.color}`} />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold">{branch}</CardTitle>
                    <p className="text-2xs text-muted-foreground">{meta.desc}</p>
                  </div>
                </div>
                <Badge variant="outline" className={`${meta.color} border-current/30 ${meta.bg} text-xs`}>
                  {online}/{bp.length} printers online
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="px-5 pb-5 space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Printers", value: bp.length, icon: Printer },
                  { label: "Users", value: bu.length, icon: Users },
                  { label: "Completed Jobs", value: bCompleted.length, icon: FileText },
                  { label: "Pending", value: bPending.length, icon: Zap },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-lg bg-muted/50 p-3 text-center">
                    <Icon className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
                    <div className="text-lg font-bold">{value}</div>
                    <div className="text-2xs text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>

              {/* Toner + cost */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Avg toner level</span>
                    <span className="font-medium">{avgToner}%</span>
                  </div>
                  <Progress value={avgToner} className="h-1.5"
                    style={{ "--progress-color": avgToner < 25 ? "hsl(var(--destructive))" : avgToner < 50 ? "hsl(var(--warning))" : "hsl(var(--success))" } as any}
                  />
                </div>
                <div className="text-right">
                  <div className="text-2xs text-muted-foreground">Total print cost</div>
                  <div className="text-lg font-bold">₹{totalCost.toFixed(2)}</div>
                </div>
              </div>

              {/* Printer list */}
              {bp.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Printers at this location</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {bp.map(p => (
                      <div key={p.id} className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${p.status === "online" ? "bg-success" : "bg-destructive"}`} />
                          <span className="truncate font-medium">{p.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <Badge variant="outline" className="text-2xs h-5 px-1.5">
                            {p.type === "color" ? "Color" : "B&W"}
                          </Badge>
                          <span className="text-2xs text-muted-foreground">{p.tonerLevel}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Users */}
              {bu.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Staff at this location</div>
                  <div className="flex flex-wrap gap-1.5">
                    {bu.map(u => (
                      <div key={u.id} className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-2xs">
                        <span className={`h-1.5 w-1.5 rounded-full ${u.role === "admin" ? "bg-primary" : "bg-success"}`} />
                        <span className="font-medium">{u.name}</span>
                        <span className="text-muted-foreground capitalize">{u.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
