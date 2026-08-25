import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { storage } from "@/lib/storage";
import {
  Server, Printer, Users, ListOrdered, RefreshCw, Wifi, WifiOff,
  UserPlus, UserMinus, Trash2, Search, CheckCircle2, XCircle,
  Download, AlertTriangle, ShieldCheck, ShieldOff,
} from "lucide-react";

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentPrinter {
  Name: string;
  PortName: string;
  DriverName: string;
  PrinterStatus: string | number;
  Shared: boolean;
  ShareName: string;
  JobCount: number;
  allowedUsers: string[];
  accessMode: "restricted" | "open";
}

interface AgentJob {
  Id: number;
  PrinterName: string;
  UserName: string;
  DocumentName: string;
  JobStatus: string;
  TotalPages: number;
  SubmittedTime: string;
}

interface ADUser {
  SamAccountName: string;
  Name: string;
  DisplayName: string;
  Department: string;
  EmailAddress: string;
  Enabled: boolean;
  Title: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

async function agentListFetch<T>(path: string): Promise<T[]> {
  const res = await fetch(path);
  const data = await res.json();
  // Server returns { ok: false, error: "...", items: [] } when agent is unreachable
  if (!res.ok || data?.ok === false) return [];
  return Array.isArray(data) ? data : [];
}

function useAgentPrinters(connected: boolean) {
  return useQuery<AgentPrinter[]>({
    queryKey: ["/api/agent/printers"],
    queryFn: () => agentListFetch<AgentPrinter>("/api/agent/printers"),
    enabled: connected,
    retry: false,
    refetchInterval: connected ? 15000 : false,
  });
}

function useAgentQueue(printer = "*", connected = false) {
  return useQuery<AgentJob[]>({
    queryKey: ["/api/agent/queue", printer],
    queryFn: () => agentListFetch<AgentJob>(`/api/agent/queue?printer=${encodeURIComponent(printer)}`),
    enabled: connected,
    retry: false,
    refetchInterval: connected ? 8000 : false,
  });
}

function useADUsers(connected: boolean) {
  return useQuery<ADUser[]>({
    queryKey: ["/api/agent/users"],
    queryFn: () => agentListFetch<ADUser>("/api/agent/users"),
    enabled: connected,
    retry: false,
  });
}

// ─── Status badge helpers ────────────────────────────────────────────────────

function printerStatusBadge(status: string | number) {
  const s = String(status).toLowerCase();
  if (s === "0" || s === "ready" || s === "normal") return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Ready</Badge>;
  if (s.includes("error")) return <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Error</Badge>;
  if (s.includes("offline") || s === "4") return <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-xs">Offline</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

// ─── Permission Manager Dialog ────────────────────────────────────────────────

function PermissionDialog({
  printer,
  adUsers,
  open,
  onClose,
}: {
  printer: AgentPrinter | null;
  adUsers: ADUser[];
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const allowMutation = useMutation({
    mutationFn: ({ username }: { username: string }) =>
      apiFetch("/api/agent/printer/allow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printer: printer?.Name, username }),
      }),
    onSuccess: (_, { username }) => {
      toast.success(`Access granted to ${username}`);
      qc.invalidateQueries({ queryKey: ["/api/agent/printers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const denyMutation = useMutation({
    mutationFn: ({ username }: { username: string }) =>
      apiFetch("/api/agent/printer/deny", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printer: printer?.Name, username }),
      }),
    onSuccess: (_, { username }) => {
      toast.success(`Access revoked from ${username}`);
      qc.invalidateQueries({ queryKey: ["/api/agent/printers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!printer) return null;

  const allowed = new Set(printer.allowedUsers.map(u => u.toLowerCase()));
  const filtered = adUsers.filter(u =>
    !search ||
    u.SamAccountName?.toLowerCase().includes(search.toLowerCase()) ||
    u.DisplayName?.toLowerCase().includes(search.toLowerCase()) ||
    u.Department?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Manage Access — {printer.Name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
          {printer.accessMode === "restricted" ? (
            <><ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" /> <span><strong>Restricted</strong> — only users in the allowed list can print</span></>
          ) : (
            <><ShieldOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> <span><strong>Open</strong> — all users can print (add at least one user to restrict)</span></>
          )}
        </div>

        {printer.allowedUsers.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Allowed users ({printer.allowedUsers.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {printer.allowedUsers.map(u => (
                <div key={u} className="flex items-center gap-1 bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5 text-xs">
                  {u}
                  <button
                    onClick={() => denyMutation.mutate({ username: u })}
                    className="ml-0.5 hover:text-destructive transition-colors"
                    data-testid={`button-revoke-${u}`}
                  >
                    <XCircle className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <Separator />

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-xs"
            placeholder="Search AD users by name, username or department…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-user-search"
          />
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-8">No users found</p>
          ) : (
            <div className="space-y-1">
              {filtered.map(u => {
                const sam = u.SamAccountName?.toLowerCase();
                const isAllowed = allowed.has(sam);
                return (
                  <div
                    key={u.SamAccountName}
                    className={`flex items-center gap-3 px-2.5 py-2 rounded-lg border transition-colors ${isAllowed ? "bg-primary/5 border-primary/15" : "border-transparent hover:bg-muted/40"}`}
                    data-testid={`row-aduser-${u.SamAccountName}`}
                  >
                    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary/70 to-blue-400 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                      {(u.DisplayName || u.Name || u.SamAccountName || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-tight truncate">{u.DisplayName || u.Name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {u.SamAccountName}{u.Department ? ` · ${u.Department}` : ""}
                        {!u.Enabled && <span className="ml-1 text-destructive">· Disabled</span>}
                      </p>
                    </div>
                    {isAllowed ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px] px-2 text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => denyMutation.mutate({ username: u.SamAccountName })}
                        disabled={denyMutation.isPending}
                        data-testid={`button-deny-${u.SamAccountName}`}
                      >
                        <UserMinus className="h-3 w-3 mr-1" /> Revoke
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => allowMutation.mutate({ username: u.SamAccountName })}
                        disabled={allowMutation.isPending}
                        data-testid={`button-allow-${u.SamAccountName}`}
                      >
                        <UserPlus className="h-3 w-3 mr-1" /> Allow
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} data-testid="button-close-dialog">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "printers" | "queue" | "users";

export default function PrintServerManager() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("printers");
  const [selectedPrinter, setSelectedPrinter] = useState<AgentPrinter | null>(null);
  const [permOpen, setPermOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [queuePrinter, setQueuePrinter] = useState("*");

  // Connection health — must come first; other queries are gated on this
  const { data: health, isLoading: loadingHealth } = useQuery({
    queryKey: ["/api/agent/health"],
    queryFn: () => apiFetch("/api/agent/health"),
    retry: false,
    refetchInterval: 30000,
  });

  const connected = !!health?.ok;

  const { data: printers, isLoading: loadingPrinters, error: printersError, refetch: refetchPrinters } = useAgentPrinters(connected);
  const { data: queue, isLoading: loadingQueue, refetch: refetchQueue } = useAgentQueue(queuePrinter, connected);
  const { data: adUsers, isLoading: loadingUsers, refetch: refetchUsers } = useADUsers(connected);

  // Cancel job
  const cancelMutation = useMutation({
    mutationFn: ({ printer, jobId }: { printer: string; jobId: number }) =>
      apiFetch(`/api/agent/queue?printer=${encodeURIComponent(printer)}&jobId=${jobId}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Job cancelled");
      qc.invalidateQueries({ queryKey: ["/api/agent/queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Import AD user to PrintGuard
  const importMutation = useMutation({
    mutationFn: (user: ADUser) => {
      const newUser = {
        id: `ad-${user.SamAccountName}`,
        employee_id: user.SamAccountName,
        name: user.DisplayName || user.Name,
        email: user.EmailAddress || "",
        department: user.Department || "General",
        branch: "Hinjewadi",
        pin: "",
        role: "employee" as const,
        status: (user.Enabled ? "active" : "inactive") as "active" | "inactive",
        authMethod: "AD",
        usedPages: 0,
        totalCost: 0,
        monthlyQuota: 300,
      };
      // Write to server (data/users.json)
      fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      return Promise.resolve(newUser);
    },
    onSuccess: (newUser) => {
      // Write to localStorage (what the Users page reads)
      const existing = storage.getUsers();
      const alreadyExists = existing.some(u => u.id === newUser.id);
      if (alreadyExists) {
        toast.info(`${newUser.name} is already in PrintGuard`);
      } else {
        storage.setUsers([...existing, newUser]);
        toast.success(`${newUser.name} imported — assign a PIN in User Management`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const printerList = Array.isArray(printers) ? printers : [];
  const queueList = Array.isArray(queue) ? queue : [];
  const userList = Array.isArray(adUsers) ? adUsers : [];

  const filteredUsers = userList.filter(u =>
    !userSearch ||
    (u.DisplayName || "").toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.SamAccountName || "").toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.Department || "").toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Print Server Manager</h1>
          <p className="text-xs text-muted-foreground">Manage Windows Print Server printers, queues and user access</p>
        </div>
        <div className="flex items-center gap-2">
          {loadingHealth ? (
            <Badge variant="outline" className="text-xs gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Connecting…</Badge>
          ) : connected ? (
            <Badge className="bg-green-100 text-green-700 border-green-200 text-xs gap-1">
              <Wifi className="h-3 w-3" /> Connected · {health?.host}
            </Badge>
          ) : (
            <Badge className="bg-red-100 text-red-700 border-red-200 text-xs gap-1">
              <WifiOff className="h-3 w-3" /> Agent not reachable
            </Badge>
          )}
        </div>
      </div>

      {/* Not configured banner */}
      {!connected && !loadingHealth && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 shadow-none">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Print Server Agent not connected</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                1. Copy <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">agent/agent.js</code> to your Windows Print Server (DenasaDC)
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                2. Run <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">node agent.js</code> on that machine (Node.js 16+ required)
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                3. Go to <strong>Settings → Print Server</strong> and enter the agent URL (e.g. <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">http://192.168.0.90:7171</code>)
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["printers", "queue", "users"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium capitalize border-b-2 transition-colors ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            data-testid={`tab-${t}`}
          >
            {t === "printers" && <Printer className="inline h-3.5 w-3.5 mr-1.5" />}
            {t === "queue" && <ListOrdered className="inline h-3.5 w-3.5 mr-1.5" />}
            {t === "users" && <Users className="inline h-3.5 w-3.5 mr-1.5" />}
            {t === "printers" ? `Printers (${printerList.length})` : t === "queue" ? `Live Queue (${queueList.length})` : `AD Users (${userList.length})`}
          </button>
        ))}
      </div>

      {/* ── Printers Tab ─────────────────────────────────────────────────────── */}
      {tab === "printers" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => refetchPrinters()} data-testid="button-refresh-printers">
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>

          {loadingPrinters ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1,2,3].map(i => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : printersError ? (
            <p className="text-xs text-destructive text-center py-8">{(printersError as Error).message}</p>
          ) : printerList.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No printers returned from agent</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {printerList.map(p => (
                <Card key={p.Name} className="shadow-none hover:border-primary/40 transition-colors cursor-pointer" onClick={() => { setSelectedPrinter(p); setPermOpen(true); }} data-testid={`card-printer-${p.Name}`}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Printer className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold leading-tight truncate">{p.Name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{p.DriverName}</p>
                      </div>
                      {printerStatusBadge(p.PrinterStatus)}
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        {p.accessMode === "restricted" ? (
                          <span className="flex items-center gap-1 text-[10px] text-primary"><ShieldCheck className="h-3 w-3" /> Restricted ({p.allowedUsers.length} users)</span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><ShieldOff className="h-3 w-3" /> Open access</span>
                        )}
                      </div>
                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={e => { e.stopPropagation(); setSelectedPrinter(p); setPermOpen(true); }} data-testid={`button-manage-${p.Name}`}>
                        Manage Access
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Queue Tab ─────────────────────────────────────────────────────────── */}
      {tab === "queue" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2">
              <select
                className="h-7 text-xs border rounded-md px-2 bg-background"
                value={queuePrinter}
                onChange={e => setQueuePrinter(e.target.value)}
                data-testid="select-queue-printer"
              >
                <option value="*">All Printers</option>
                {printerList.map(p => <option key={p.Name} value={p.Name}>{p.Name}</option>)}
              </select>
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => refetchQueue()} data-testid="button-refresh-queue">
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>

          {loadingQueue ? (
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : queueList.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2 opacity-50" />
              <p className="text-xs text-muted-foreground">Queue is empty</p>
            </div>
          ) : (
            <Card className="shadow-none">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">ID</TableHead>
                    <TableHead className="text-xs">Document</TableHead>
                    <TableHead className="text-xs">User</TableHead>
                    <TableHead className="text-xs">Printer</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Pages</TableHead>
                    <TableHead className="text-xs w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueList.map(j => (
                    <TableRow key={`${j.PrinterName}-${j.Id}`} data-testid={`row-job-${j.Id}`}>
                      <TableCell className="text-xs font-mono">{j.Id}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">{j.DocumentName}</TableCell>
                      <TableCell className="text-xs">{j.UserName}</TableCell>
                      <TableCell className="text-xs">{j.PrinterName}</TableCell>
                      <TableCell className="text-xs"><Badge variant="outline" className="text-xs">{j.JobStatus}</Badge></TableCell>
                      <TableCell className="text-xs">{j.TotalPages ?? "—"}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                          onClick={() => cancelMutation.mutate({ printer: j.PrinterName, jobId: j.Id })}
                          disabled={cancelMutation.isPending}
                          title="Cancel job"
                          data-testid={`button-cancel-job-${j.Id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* ── Users Tab ─────────────────────────────────────────────────────────── */}
      {tab === "users" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 justify-between">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-7 text-xs"
                placeholder="Search by name, username, department…"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                data-testid="input-ad-search"
              />
            </div>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5" onClick={() => refetchUsers()} data-testid="button-refresh-users">
              <RefreshCw className="h-3 w-3" /> Sync from AD
            </Button>
          </div>

          {loadingUsers ? (
            <div className="space-y-2">
              {[1,2,3,4,5].map(i => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : userList.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No Active Directory users returned. Ensure AD tools are installed on the print server.</p>
          ) : (
            <Card className="shadow-none">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Username</TableHead>
                    <TableHead className="text-xs">Department</TableHead>
                    <TableHead className="text-xs">Email</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map(u => (
                    <TableRow key={u.SamAccountName} data-testid={`row-user-${u.SamAccountName}`}>
                      <TableCell className="text-xs font-medium">{u.DisplayName || u.Name}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{u.SamAccountName}</TableCell>
                      <TableCell className="text-xs">{u.Department || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{u.EmailAddress || "—"}</TableCell>
                      <TableCell>
                        {u.Enabled ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Active</Badge>
                        ) : (
                          <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-xs">Disabled</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 text-[10px] px-2 gap-1"
                          onClick={() => importMutation.mutate(u)}
                          disabled={importMutation.isPending}
                          data-testid={`button-import-${u.SamAccountName}`}
                        >
                          <Download className="h-3 w-3" /> Import
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Permissions Dialog */}
      <PermissionDialog
        printer={selectedPrinter}
        adUsers={userList}
        open={permOpen}
        onClose={() => { setPermOpen(false); setSelectedPrinter(null); }}
      />
    </div>
  );
}
