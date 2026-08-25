import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRole } from "@/contexts/RoleContext";
import { Search, RefreshCw } from "lucide-react";
import { storage } from "@/lib/storage";

const statusStyles: Record<string, string> = {
  completed: "bg-success/10 text-success border-success/20",
  queued: "bg-warning/10 text-warning border-warning/20",
  printing: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-muted text-muted-foreground border-border",
  failed: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusLabel: Record<string, string> = {
  queued: "Awaiting PIN",
  printing: "At Printer",
  completed: "Printed",
  cancelled: "Cancelled",
  failed: "Failed",
};

function normalizeJob(j: any) {
  return {
    id: j.id,
    document_name: j.document_name || j.documentName || j.fileName || "Unknown",
    userName: j.userName || j.username || j.user_id || "—",
    user_id: j.user_id || j.userId || j.username || "—",
    department: j.department || "—",
    printer_name: j.printer_name || j.printerName || "—",
    pages: j.pages ?? 0,
    copies: j.copies ?? 1,
    color_mode: j.color_mode || j.colorMode || "bw",
    duplex: j.duplex ?? false,
    status: j.status || "completed",
    cost: typeof j.cost === "number" ? j.cost : 0,
    submitted_at: j.submitted_at || j.submittedAt || j.createdAt || new Date().toISOString(),
    via: j.via || "app",
    branch: j.branch,
  };
}

export default function PrintJobs() {
  const { role, currentUserId, currentBranch } = useRole();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  async function loadJobs() {
    storage.autoCancelExpiredJobs(120);
    const localJobs = storage.getJobs().map(normalizeJob);

    let serverJobs: any[] = [];
    try {
      const res = await fetch("/api/history");
      if (res.ok) {
        const data = await res.json();
        serverJobs = Array.isArray(data) ? data.map(normalizeJob) : [];
      }
    } catch {
      // server unreachable — show local only
    }

    // Merge: server jobs first, deduplicate by id, then local jobs not already in server
    const serverIds = new Set(serverJobs.map(j => j.id));
    const merged = [...serverJobs, ...localJobs.filter(j => !serverIds.has(j.id))];

    // Sort newest first
    merged.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

    let filtered = merged;
    if (role !== "admin") {
      filtered = merged.filter(j =>
        j.user_id === currentUserId ||
        j.userName?.toLowerCase() === currentUserId?.toLowerCase() ||
        j.branch === currentBranch
      );
    }

    setJobs(filtered);
    setLastSynced(new Date());
    setLoading(false);
  }

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 30_000);
    return () => clearInterval(interval);
  }, [role, currentUserId, currentBranch]);

  const filtered = useMemo(() => {
    let list = jobs;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(j =>
        j.document_name.toLowerCase().includes(q) ||
        j.userName.toLowerCase().includes(q) ||
        j.printer_name.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      list = list.filter(j => j.status === statusFilter);
    }
    return list;
  }, [jobs, search, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">
          {role === "admin" ? "All Print Jobs" : "My Print Jobs"}
        </h1>
        <div className="flex items-center gap-2">
          {lastSynced && (
            <span className="text-2xs text-muted-foreground">
              Synced {lastSynced.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={loadJobs} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by document, user, printer…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 pl-7 text-xs"
            data-testid="input-search-jobs"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-36 text-xs" data-testid="select-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="queued">Awaiting PIN</SelectItem>
            <SelectItem value="printing">At Printer</SelectItem>
            <SelectItem value="completed">Printed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} job{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <Card className="shadow-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-2xs h-8">Document</TableHead>
              {role === "admin" && <TableHead className="text-2xs h-8">User</TableHead>}
              {role === "admin" && <TableHead className="text-2xs h-8">Printer</TableHead>}
              <TableHead className="text-2xs h-8">Pages</TableHead>
              <TableHead className="text-2xs h-8">Mode</TableHead>
              <TableHead className="text-2xs h-8">Status</TableHead>
              <TableHead className="text-2xs h-8">Source</TableHead>
              <TableHead className="text-2xs h-8 text-right">Cost</TableHead>
              <TableHead className="text-2xs h-8">Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">
                  No print jobs found. Jobs from Word, Excel, and other apps appear here automatically within 30 seconds of printing.
                </TableCell>
              </TableRow>
            ) : filtered.map(job => (
              <TableRow key={job.id} data-testid={`row-job-${job.id}`}>
                <TableCell className="text-xs py-1.5 font-medium max-w-[200px] truncate" title={job.document_name}>
                  {job.document_name}
                </TableCell>
                {role === "admin" && (
                  <TableCell className="text-xs py-1.5 font-medium">
                    {job.userName}
                  </TableCell>
                )}
                {role === "admin" && (
                  <TableCell className="text-xs py-1.5 text-muted-foreground truncate max-w-[140px]" title={job.printer_name}>
                    {job.printer_name}
                  </TableCell>
                )}
                <TableCell className="text-xs py-1.5">{job.pages} × {job.copies}</TableCell>
                <TableCell className="text-xs py-1.5">
                  <Badge variant="outline" className="text-2xs">
                    {job.color_mode === "color" ? "Color" : "B&W"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs py-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium border ${statusStyles[job.status] ?? ""}`}>
                    {statusLabel[job.status] ?? job.status}
                  </span>
                </TableCell>
                <TableCell className="text-xs py-1.5">
                  <Badge variant="outline" className={`text-2xs ${job.via === "windows-event-log" ? "border-blue-300 text-blue-600" : "border-muted"}`}>
                    {job.via === "windows-event-log" ? "Windows" : "App"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs py-1.5 text-right">₹{job.cost.toFixed(2)}</TableCell>
                <TableCell className="text-xs py-1.5 text-muted-foreground whitespace-nowrap">
                  {new Date(job.submitted_at).toLocaleDateString()}{" "}
                  {new Date(job.submitted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
