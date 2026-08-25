import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { Search, Download, Shield, RefreshCw, Monitor, User, Printer, FileText, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { storage } from "@/lib/storage";
import { Badge } from "@/components/ui/badge";

const chartConfig = {
  pages: { label: "Pages", color: "hsl(var(--primary))" },
  cost:  { label: "Cost ($)", color: "hsl(var(--warning))" },
};

function parseWindowsDate(val: unknown): Date | null {
  if (!val) return null;
  const s = String(val);
  const dotnet = s.match(/\/Date\((\d+)\)\//);
  if (dotnet) return new Date(parseInt(dotnet[1], 10));
  const wmi = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (wmi) return new Date(`${wmi[1]}-${wmi[2]}-${wmi[3]}T${wmi[4]}:${wmi[5]}:${wmi[6]}`);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

const STATUS_STYLE: Record<string, string> = {
  completed: "bg-success/10 text-success border-success/20",
  queued:    "bg-warning/10 text-warning border-warning/20",
  printing:  "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-muted text-muted-foreground border-border",
  failed:    "bg-destructive/10 text-destructive border-destructive/20",
  spooler:   "bg-primary/10 text-primary border-primary/20",
};

const STATUS_LABEL: Record<string, string> = {
  completed: "Printed",
  queued:    "Awaiting PIN",
  printing:  "Printing",
  cancelled: "Cancelled",
  failed:    "Failed",
  spooler:   "In Spooler",
};

const PIE_COLORS = ["hsl(var(--primary))", "hsl(var(--warning))", "hsl(var(--success))", "hsl(var(--destructive))"];

interface AuditEntry {
  id: string;
  timestamp: string;
  sortTs: number;
  userName: string;
  document: string;
  status: string;
  printerName: string;
  pages: number;
  cost: number;
  source: "app" | "spooler" | "agent";
}

interface UserDrillData {
  fullName: string;
  department: string;
  entries: AuditEntry[];
  totalJobs: number;
  completedJobs: number;
  pendingJobs: number;
  cancelledJobs: number;
  totalPages: number;
  totalCost: number;
  topPrinters: { name: string; count: number }[];
  recentDoc: string;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium border ${STATUS_STYLE[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function UserDrillDialog({ data, open, onClose }: { data: UserDrillData | null; open: boolean; onClose: () => void }) {
  if (!data) return null;

  const pieData = [
    { name: "Printed",      value: data.completedJobs },
    { name: "Awaiting PIN", value: data.pendingJobs },
    { name: "Cancelled",    value: data.cancelledJobs },
  ].filter(d => d.value > 0);

  const recentActivity = data.entries.slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0" data-testid="dialog-user-drill">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div>{data.fullName}</div>
              <div className="text-xs font-normal text-muted-foreground">{data.department}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="px-5 py-4 space-y-5">
          {/* KPI row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total Jobs",  value: data.totalJobs,    icon: <FileText className="h-3.5 w-3.5 text-primary" /> },
              { label: "Pages",       value: data.totalPages,   icon: <TrendingUp className="h-3.5 w-3.5 text-success" /> },
              { label: "Total Cost",  value: `₹${data.totalCost.toFixed(2)}`, icon: <TrendingUp className="h-3.5 w-3.5 text-warning" /> },
              { label: "Printers",    value: data.topPrinters.length, icon: <Printer className="h-3.5 w-3.5 text-muted-foreground" /> },
            ].map(k => (
              <Card key={k.label} className="shadow-none">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">{k.icon}<span className="text-2xs text-muted-foreground">{k.label}</span></div>
                  <div className="text-lg font-bold leading-none">{k.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Job breakdown + Top printers */}
          <div className="grid grid-cols-2 gap-3">
            {/* Status pie */}
            <Card className="shadow-none">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs font-semibold">Job Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 flex items-center gap-3">
                {pieData.length > 0 ? (
                  <>
                    <PieChart width={90} height={90}>
                      <Pie data={pieData} cx={40} cy={40} innerRadius={22} outerRadius={40} dataKey="value" paddingAngle={2}>
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                    <div className="space-y-1.5">
                      {pieData.map((d, i) => (
                        <div key={d.name} className="flex items-center gap-1.5 text-xs">
                          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                          <span className="text-muted-foreground">{d.name}</span>
                          <span className="font-semibold ml-auto pl-2">{d.value}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">No jobs yet.</span>
                )}
              </CardContent>
            </Card>

            {/* Top printers */}
            <Card className="shadow-none">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs font-semibold">Most-Used Printers</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {data.topPrinters.length === 0
                  ? <span className="text-xs text-muted-foreground">No data.</span>
                  : data.topPrinters.slice(0, 4).map((p, i) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <span className="text-2xs font-bold text-muted-foreground w-4">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs truncate font-medium" title={p.name}>{p.name}</div>
                        <div className="h-1 mt-0.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (p.count / data.topPrinters[0].count) * 100)}%` }} />
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground w-5 text-right">{p.count}</span>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>

          {/* Recent jobs */}
          <Card className="shadow-none">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-xs font-semibold">Recent Print Jobs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-2xs h-7 pl-3">Time</TableHead>
                    <TableHead className="text-2xs h-7">Document</TableHead>
                    <TableHead className="text-2xs h-7">Status</TableHead>
                    <TableHead className="text-2xs h-7">Printer</TableHead>
                    <TableHead className="text-2xs h-7 text-right pr-3">Pg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentActivity.map(e => (
                    <TableRow key={e.id} data-testid={`row-drill-${e.id}`}>
                      <TableCell className="text-xs py-1.5 pl-3 text-muted-foreground whitespace-nowrap">
                        {new Date(e.timestamp).toLocaleDateString()} {new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 max-w-[140px] truncate" title={e.document}>{e.document}</TableCell>
                      <TableCell className="text-xs py-1.5"><StatusBadge status={e.status} /></TableCell>
                      <TableCell className="text-xs py-1.5 text-muted-foreground max-w-[100px] truncate" title={e.printerName}>{e.printerName}</TableCell>
                      <TableCell className="text-xs py-1.5 text-right pr-3">{e.pages || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Reports() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [spoolerJobs, setSpoolerJobs] = useState<any[]>([]);
  const [serverHistory, setServerHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [drillUser, setDrillUser] = useState<string | null>(null);

  const stats = storage.getStats();
  const jobs = storage.getJobs();
  const users = storage.getUsers();
  const pagesByUser = storage.getPagesByUser();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [spoolerRes, historyRes] = await Promise.all([
        fetch("/api/agent/jobs/all").catch(() => null),
        fetch("/api/history").catch(() => null),
      ]);
      if (spoolerRes?.ok) {
        const d = await spoolerRes.json();
        if (d.ok && Array.isArray(d.items)) setSpoolerJobs(d.items);
      }
      if (historyRes?.ok) {
        const d = await historyRes.json();
        if (Array.isArray(d)) setServerHistory(d);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const userPageData = users
    .map(u => ({
      name: u.name.split(' ')[0],
      fullName: u.name,
      department: u.department || "—",
      totalPages: pagesByUser[u.id]?.totalPages ?? 0,
      bwPages:    pagesByUser[u.id]?.bwPages ?? 0,
      colorPages: pagesByUser[u.id]?.colorPages ?? 0,
      jobs:       pagesByUser[u.id]?.jobs ?? 0,
      pending:    pagesByUser[u.id]?.pending ?? 0,
    }))
    .sort((a, b) => b.jobs - a.jobs);

  const appEntries: AuditEntry[] = jobs.map(j => ({
    id: j.id,
    timestamp: j.submitted_at,
    sortTs: new Date(j.submitted_at).getTime(),
    userName: j.userName,
    document: j.document_name || "—",
    status: j.status,
    printerName: j.printer_name || "System Printer",
    pages: j.pages,
    cost: j.status === "completed" ? j.cost : 0,
    source: "app" as const,
  }));

  const agentEntries: AuditEntry[] = serverHistory
    .filter(h => !jobs.some(j => j.id === h.id))
    .map(h => ({
      id: h.id,
      timestamp: h.createdAt || h.submitted_at || "",
      sortTs: new Date(h.createdAt || h.submitted_at || 0).getTime(),
      userName: h.username || h.userName || "—",
      document: h.fileName || h.document_name || "—",
      status: h.status || "completed",
      printerName: h.printerName || h.printer_name || "—",
      pages: h.pages ?? 0,
      cost: h.status === "completed" ? (h.cost ?? 0) : 0,
      source: "agent" as const,
    }));

  const existingDocs = new Set([...appEntries, ...agentEntries].map(e => `${e.userName}|${e.document}|${e.printerName}`));

  const spoolerEntries: AuditEntry[] = spoolerJobs
    .filter(j => !existingDocs.has(`${j.UserName}|${j.DocumentName}|${j.PrinterName}`))
    .map(j => {
      const ts = parseWindowsDate(j.SubmittedTime);
      return {
        id: `spooler-${j.PrinterName}-${j.Id}`,
        timestamp: ts ? ts.toISOString() : new Date().toISOString(),
        sortTs: ts ? ts.getTime() : Date.now(),
        userName: j.UserName || "—",
        document: j.DocumentName || "—",
        status: "spooler",
        printerName: j.PrinterName || "—",
        pages: j.TotalPages ?? 0,
        cost: 0,
        source: "spooler" as const,
      };
    });

  const allEntries: AuditEntry[] = [...appEntries, ...agentEntries, ...spoolerEntries]
    .sort((a, b) => b.sortTs - a.sortTs);

  const allStatuses = [...new Set(allEntries.map(e => e.status))];

  const filtered = allEntries.filter(e => {
    const matchSearch = !search ||
      e.userName.toLowerCase().includes(search.toLowerCase()) ||
      e.document.toLowerCase().includes(search.toLowerCase()) ||
      e.printerName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = actionFilter === "all" || e.status === actionFilter;
    return matchSearch && matchStatus;
  });

  // Build drill-down data for the selected user
  const drillData = useMemo<UserDrillData | null>(() => {
    if (!drillUser) return null;
    const u = users.find(x => x.name === drillUser);
    const entries = allEntries.filter(e => e.userName === drillUser);
    const printerCount: Record<string, number> = {};
    entries.forEach(e => { printerCount[e.printerName] = (printerCount[e.printerName] ?? 0) + 1; });
    const topPrinters = Object.entries(printerCount)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return {
      fullName: drillUser,
      department: u?.department || "—",
      entries,
      totalJobs: entries.length,
      completedJobs: entries.filter(e => e.status === "completed").length,
      pendingJobs: entries.filter(e => e.status === "queued" || e.status === "spooler").length,
      cancelledJobs: entries.filter(e => e.status === "cancelled" || e.status === "failed").length,
      totalPages: entries.reduce((s, e) => s + (e.pages || 0), 0),
      totalCost: entries.reduce((s, e) => s + (e.cost || 0), 0),
      topPrinters,
      recentDoc: entries[0]?.document ?? "—",
    };
  }, [drillUser, allEntries, users]);

  const handleExport = () => {
    const csv = [
      ["Timestamp", "User", "Document", "Status", "Printer", "Pages", "Cost", "Source"].join(","),
      ...allEntries.map(e => [
        new Date(e.timestamp).toLocaleString(),
        `"${e.userName}"`,
        `"${e.document}"`,
        STATUS_LABEL[e.status] ?? e.status,
        `"${e.printerName}"`,
        e.pages,
        e.cost.toFixed(2),
        e.source,
      ].join(","))
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "printguard-audit.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit log exported as CSV");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Reports & Audit</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={refresh} disabled={loading} data-testid="button-refresh-reports">
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleExport} data-testid="button-export-csv">
            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="shadow-none">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm font-semibold">Department Comparison</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-2">
            <ChartContainer config={chartConfig} className="h-[180px] w-full">
              <BarChart data={stats.departmentCostData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="department" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm font-semibold">Volume Trends</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-2">
            <ChartContainer config={chartConfig} className="h-[180px] w-full">
              <BarChart data={stats.printVolumeData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="value" fill="hsl(var(--warning))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Compliance */}
      <div className="flex gap-3">
        {["SOX Compliance", "GDPR Data Handling", "ISO 27001"].map(item => (
          <Card key={item} className="shadow-none flex-1">
            <CardContent className="p-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-success" />
              <div>
                <div className="text-xs font-medium">{item}</div>
                <div className="text-2xs text-success">Compliant</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Print Activity per User */}
      <Card className="shadow-none">
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Print Activity per User</CardTitle>
            <span className="text-2xs text-muted-foreground">Click a user to view details</span>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <ChartContainer config={{ bwPages: { label: "B&W", color: "hsl(var(--muted-foreground))" }, colorPages: { label: "Color", color: "hsl(var(--warning))" } }} className="h-[180px] w-full">
            <BarChart data={userPageData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="bwPages"    stackId="a" fill="hsl(var(--muted-foreground))" radius={[0, 0, 0, 0]} name="B&W" />
              <Bar dataKey="colorPages" stackId="a" fill="hsl(var(--warning))"          radius={[3, 3, 0, 0]} name="Color" />
            </BarChart>
          </ChartContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-2xs h-8">User</TableHead>
                <TableHead className="text-2xs h-8">Department</TableHead>
                <TableHead className="text-2xs h-8 text-right">Total Jobs</TableHead>
                <TableHead className="text-2xs h-8 text-right">Pending</TableHead>
                <TableHead className="text-2xs h-8 text-right">B&W Pages</TableHead>
                <TableHead className="text-2xs h-8 text-right">Color Pages</TableHead>
                <TableHead className="text-2xs h-8 text-right">Pages Printed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userPageData.map(u => (
                <TableRow
                  key={u.fullName}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setDrillUser(u.fullName)}
                  data-testid={`row-user-${u.fullName}`}
                >
                  <TableCell className="text-xs py-1.5 font-medium text-primary hover:underline">{u.fullName}</TableCell>
                  <TableCell className="text-xs py-1.5 text-muted-foreground">{u.department}</TableCell>
                  <TableCell className="text-xs py-1.5 text-right">{u.jobs}</TableCell>
                  <TableCell className="text-xs py-1.5 text-right">
                    {u.pending > 0
                      ? <Badge variant="outline" className="text-2xs text-warning border-warning/30">{u.pending}</Badge>
                      : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-right">{u.bwPages}</TableCell>
                  <TableCell className="text-xs py-1.5 text-right">
                    {u.colorPages > 0
                      ? <Badge variant="outline" className="text-2xs text-warning border-warning/30">{u.colorPages}</Badge>
                      : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-right font-semibold">{u.totalPages}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Audit Log */}
      <Card className="shadow-none">
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Audit Log</CardTitle>
            <span className="text-2xs text-muted-foreground">{allEntries.length} entries · auto-refreshes every 30s</span>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search user, document, printer…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 pl-7 text-xs" data-testid="input-audit-search" />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="h-8 w-44 text-xs" data-testid="select-audit-filter">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {allStatuses.map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s] ?? s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No entries match your filter.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-2xs h-8">Timestamp</TableHead>
                  <TableHead className="text-2xs h-8">User</TableHead>
                  <TableHead className="text-2xs h-8">Document</TableHead>
                  <TableHead className="text-2xs h-8">Status</TableHead>
                  <TableHead className="text-2xs h-8">Printer</TableHead>
                  <TableHead className="text-2xs h-8 text-right">Pages</TableHead>
                  <TableHead className="text-2xs h-8 text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 50).map(e => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setDrillUser(e.userName)}
                    data-testid={`row-audit-${e.id}`}
                  >
                    <TableCell className="text-xs py-1.5 text-muted-foreground whitespace-nowrap">
                      {new Date(e.timestamp).toLocaleDateString()} {new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell className="text-xs py-1.5 font-medium text-primary hover:underline">{e.userName}</TableCell>
                    <TableCell className="text-xs py-1.5 max-w-[180px] truncate" title={e.document}>{e.document}</TableCell>
                    <TableCell className="text-xs py-1.5">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={e.status} />
                        {e.source === "spooler" && (
                          <span title="From Windows Spooler"><Monitor className="h-3 w-3 text-muted-foreground" /></span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs py-1.5 text-muted-foreground max-w-[140px] truncate" title={e.printerName}>{e.printerName}</TableCell>
                    <TableCell className="text-xs py-1.5 text-right">{e.pages || "—"}</TableCell>
                    <TableCell className="text-xs py-1.5 text-right">{e.cost > 0 ? `₹${e.cost.toFixed(2)}` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* User drill-down dialog */}
      <UserDrillDialog
        data={drillData}
        open={!!drillUser}
        onClose={() => setDrillUser(null)}
      />
    </div>
  );
}
