import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Printer, Clock, CheckCircle2, XCircle, RefreshCw, Users, ListOrdered, Loader2, ShieldAlert, KeyRound, Info, AlertTriangle, MonitorCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/contexts/RoleContext";
import { storage, PrintJob } from "@/lib/storage";

interface SpoolerJob {
  Id: number;
  PrinterName: string;
  UserName: string;
  DocumentName: string;
  JobStatus: string | number;
  TotalPages: number;
  SubmittedTime: string;
}

// Windows /Date(ms)/ and WMI datetime formats both land here
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

// PrintJobStatus bitmask → readable label(s)
const JOB_STATUS_FLAGS: [number, string][] = [
  [0x0001, "Paused"], [0x0002, "Error"], [0x0004, "Deleting"],
  [0x0008, "Spooling"], [0x0010, "Printing"], [0x0020, "Offline"],
  [0x0040, "Paper Out"], [0x0080, "Printed"], [0x0100, "Deleted"],
  [0x0200, "Blocked"], [0x0400, "User Action"], [0x0800, "Restart"],
  [0x1000, "Complete"], [0x2000, "Retained"],
];
function decodeJobStatus(status: string | number | undefined | null): string {
  if (status === null || status === undefined) return "Spooling";
  if (typeof status === "string" && status.trim() !== "") return status;
  const n = Number(status);
  if (isNaN(n)) return String(status);
  if (n === 0) return "Spooling";
  const labels = JOB_STATUS_FLAGS.filter(([flag]) => n & flag).map(([, label]) => label);
  return labels.length > 0 ? labels.join(", ") : "Queued";
}

const statusStyle: Record<string, string> = {
  queued: "bg-warning/10 text-warning border-warning/20",
  printing: "bg-primary/10 text-primary border-primary/20",
  completed: "bg-success/10 text-success border-success/20",
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

export default function PrintQueue() {
  const { role, currentUserId } = useRole();
  const [queue, setQueue] = useState<PrintJob[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [spoolerJobs, setSpoolerJobs] = useState<SpoolerJob[]>([]);
  const [spoolerConnected, setSpoolerConnected] = useState<boolean | null>(null);

  // Cancel confirm dialog
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; job: PrintJob | null }>({ open: false, job: null });
  const [cancelPin, setCancelPin] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  // Complete confirm dialog
  const [completeDialog, setCompleteDialog] = useState<{ open: boolean; job: PrintJob | null }>({ open: false, job: null });
  const [completeLoading, setCompleteLoading] = useState(false);

  const loadQueue = useCallback(() => {
    const q = storage.getQueue();
    setQueue(q);
  }, []);

  const loadSpooler = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/jobs/all");
      const data = await res.json();
      if (data.ok && Array.isArray(data.items)) {
        setSpoolerJobs(data.items);
        setSpoolerConnected(true);
      } else {
        setSpoolerConnected(false);
      }
    } catch {
      setSpoolerConnected(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
    loadSpooler();
    const q = setInterval(loadQueue, 8000);
    const s = setInterval(loadSpooler, 5000);
    return () => { clearInterval(q); clearInterval(s); };
  }, [loadQueue, loadSpooler]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadQueue();
    loadSpooler();
    setTimeout(() => setRefreshing(false), 600);
  };

  const openCancel = (job: PrintJob) => {
    setCancelDialog({ open: true, job });
    setCancelPin("");
    setCancelError("");
  };

  const confirmCancel = () => {
    const { job } = cancelDialog;
    if (!job) return;
    setCancelLoading(true);
    setCancelError("");

    // Admin can cancel any job; employee must enter their own PIN
    if (role === "admin") {
      storage.cancelJob(job.id);
      printJobStore.remove(job.id);
      toast.success("Job cancelled.");
      setCancelDialog({ open: false, job: null });
      loadQueue();
      setCancelLoading(false);
      return;
    }

    // Employee: verify own PIN
    if (!cancelPin.trim()) {
      setCancelError("Please enter your PIN.");
      setCancelLoading(false);
      return;
    }
    const users = storage.getUsers();
    const user = users.find(u => u.id === currentUserId && u.pin === cancelPin);
    if (!user) {
      setCancelError("Incorrect PIN. Please try again.");
      setCancelLoading(false);
      return;
    }
    if (job.user_id !== currentUserId) {
      setCancelError("You can only cancel your own jobs.");
      setCancelLoading(false);
      return;
    }
    storage.cancelJob(job.id);
    printJobStore.remove(job.id);
    toast.success("Your print job has been cancelled.");
    setCancelDialog({ open: false, job: null });
    loadQueue();
    setCancelLoading(false);
  };

  const openComplete = (job: PrintJob) => {
    setCompleteDialog({ open: true, job });
  };

  const confirmComplete = () => {
    const { job } = completeDialog;
    if (!job) return;
    setCompleteLoading(true);
    storage.completeJob(job.id);
    printJobStore.remove(job.id);
    toast.success(`Job "${job.document_name}" marked as completed.`);
    setCompleteDialog({ open: false, job: null });

    // Auto-start the next queued job after completing this one
    const currentQueue = storage.getQueue();
    const nextJob = currentQueue.find(
      j => j.id !== job.id && j.status === "queued"
    );
    if (nextJob) {
      storage.startJob(nextJob.id);
      toast.info(`Next job "${nextJob.document_name}" started automatically.`);
      const opts = printJobStore.get(nextJob.id);
      if (opts) {
        openPrintWindow(opts).catch(() => {});
      }
    }

    loadQueue();
    setCompleteLoading(false);
  };

  const startJob = (job: PrintJob) => {
    // Jobs are released at the physical Canon printer by entering the user's PIN.
    // We do NOT send directly via TCP — that bypasses the PIN requirement entirely.
    // Clicking "At Printer" just marks the job so the user knows to go release it.
    storage.startJob(job.id);
    loadQueue();
    toast.info(`Go to the printer and enter your PIN to release "${job.document_name}".`);
  };

  const myQueueItems = queue.filter(j => j.user_id === currentUserId);
  const myPosition = myQueueItems[0]?.queue_position;

  return (
    <div className="space-y-6 p-4 md:p-6" data-testid="page-print-queue">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-queue-title">Print Queue</h1>
          <p className="text-sm text-muted-foreground">Live queue — jobs print in order of submission.</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-queue">
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard icon={<ListOrdered className="h-4 w-4" />} label="In Queue" value={queue.filter(j => j.status === "queued").length} color="text-primary" />
        <StatCard icon={<Printer className="h-4 w-4" />} label="Printing" value={queue.filter(j => j.status === "printing").length} color="text-warning" />
        <StatCard icon={<Users className="h-4 w-4" />} label="Spooler Jobs" value={spoolerJobs.length} color="text-foreground" />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Your Position" value={myPosition ?? "—"} color="text-success" />
      </div>

      {/* Live Windows Spooler section */}
      <Card className="shadow-none" data-testid="card-spooler">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MonitorCheck className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Live Windows Spooler</CardTitle>
              {spoolerConnected === true && (
                <Badge variant="outline" className="text-2xs border-success/40 text-success">Connected</Badge>
              )}
              {spoolerConnected === false && (
                <Badge variant="outline" className="text-2xs border-destructive/40 text-destructive">Disconnected</Badge>
              )}
            </div>
            <span className="text-2xs text-muted-foreground">Auto-refreshes every 5s</span>
          </div>
          <CardDescription>All jobs currently in the Windows print spooler — including held, error, and in-progress jobs from any app (Word, Excel, Notepad…)</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {spoolerConnected === false ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 opacity-30" />
              <p className="text-sm">Agent not reachable. Make sure <code className="text-xs bg-muted px-1 rounded">node agent.js</code> is running on the print server.</p>
            </div>
          ) : spoolerJobs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 opacity-30" />
              <p className="text-sm">No active jobs in the Windows spooler right now.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-2xs h-8">Document</TableHead>
                  <TableHead className="text-2xs h-8">User</TableHead>
                  <TableHead className="text-2xs h-8">Printer</TableHead>
                  <TableHead className="text-2xs h-8">Pages</TableHead>
                  <TableHead className="text-2xs h-8">Windows Status</TableHead>
                  <TableHead className="text-2xs h-8">Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {spoolerJobs.map(job => {
                  const decodedStatus = decodeJobStatus(job.JobStatus);
                  const jobStatusStr = decodedStatus.toLowerCase();
                  const isError = jobStatusStr.includes("error");
                  const isPaused = jobStatusStr.includes("paused") || jobStatusStr.includes("retained");
                  return (
                    <TableRow key={`${job.PrinterName}-${job.Id}`} className={isError ? "bg-destructive/5" : ""} data-testid={`row-spooler-${job.Id}`}>
                      <TableCell className="text-xs py-1.5 font-medium max-w-[180px] truncate" title={job.DocumentName}>{job.DocumentName}</TableCell>
                      <TableCell className="text-xs py-1.5">{job.UserName || "—"}</TableCell>
                      <TableCell className="text-xs py-1.5 max-w-[140px] truncate" title={job.PrinterName}>{job.PrinterName}</TableCell>
                      <TableCell className="text-xs py-1.5">{job.TotalPages ?? 0}</TableCell>
                      <TableCell className="text-xs py-1.5">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium border ${
                          isError ? "bg-destructive/10 text-destructive border-destructive/20" :
                          isPaused ? "bg-warning/10 text-warning border-warning/20" :
                          "bg-primary/10 text-primary border-primary/20"
                        }`}>
                          {isError && <AlertTriangle className="h-2.5 w-2.5" />}
                          {isPaused && <KeyRound className="h-2.5 w-2.5" />}
                          {decodedStatus}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-muted-foreground whitespace-nowrap">
                        {(() => { const d = parseWindowsDate(job.SubmittedTime); return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"; })()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* PIN workflow info banner */}
      <div className="flex items-start gap-2 bg-warning/5 border border-warning/20 rounded-lg px-3 py-2.5">
        <KeyRound className="h-4 w-4 text-warning mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">How to release your print job:</span> Walk to the Canon printer → enter your <strong>PIN</strong> on the panel → your document prints. Jobs are <em>never</em> sent automatically — the PIN at the printer is the only release mechanism.
        </p>
      </div>

      {/* Employee: your jobs banner with PIN reminder */}
      {role === "employee" && myQueueItems.length > 0 && (() => {
        const users = storage.getUsers();
        const me = users.find(u => u.id === currentUserId);
        return (
          <Alert data-testid="alert-my-position">
            <Info className="h-4 w-4" />
            <AlertDescription>
              You have <strong>{myQueueItems.length}</strong> job{myQueueItems.length > 1 ? "s" : ""} waiting.
              {me?.pin && <> Go to the printer and enter your PIN: <strong className="font-mono tracking-widest">{me.pin}</strong> to release.</>}
            </AlertDescription>
          </Alert>
        );
      })()}

      {/* Queue table */}
      <Card className="shadow-none" data-testid="card-queue-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Active Queue</CardTitle>
          <CardDescription>{queue.length === 0 ? "No jobs in queue right now." : `${queue.length} job${queue.length !== 1 ? "s" : ""} waiting or printing.`}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {queue.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground" data-testid="empty-queue">
              <CheckCircle2 className="h-10 w-10 opacity-30" />
              <p className="text-sm">Queue is clear — no pending jobs.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-2xs h-8 w-12">#</TableHead>
                  <TableHead className="text-2xs h-8">Document</TableHead>
                  <TableHead className="text-2xs h-8">User</TableHead>
                  <TableHead className="text-2xs h-8">Dept</TableHead>
                  <TableHead className="text-2xs h-8">Printer</TableHead>
                  <TableHead className="text-2xs h-8">Pages</TableHead>
                  <TableHead className="text-2xs h-8">Mode</TableHead>
                  <TableHead className="text-2xs h-8">Status</TableHead>
                  <TableHead className="text-2xs h-8">Submitted</TableHead>
                  <TableHead className="text-2xs h-8 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((job) => {
                  const isOwn = job.user_id === currentUserId;
                  const canCancel = role === "admin" || isOwn;
                  return (
                    <TableRow
                      key={job.id}
                      className={isOwn ? "bg-primary/5" : ""}
                      data-testid={`row-queue-job-${job.id}`}
                    >
                      <TableCell className="text-xs py-2 font-bold text-primary" data-testid={`text-position-${job.id}`}>
                        #{job.queue_position}
                      </TableCell>
                      <TableCell className="text-xs py-2 font-medium max-w-[160px] truncate">
                        {job.document_name}
                        {isOwn && <span className="ml-1 text-2xs text-primary">(you)</span>}
                      </TableCell>
                      <TableCell className="text-xs py-2">{job.userName}</TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground">{job.department}</TableCell>
                      <TableCell className="text-xs py-2">{job.printer_name || "—"}</TableCell>
                      <TableCell className="text-xs py-2">{job.pages} × {job.copies}</TableCell>
                      <TableCell className="text-xs py-2">
                        <Badge variant="outline" className="text-2xs">
                          {job.color_mode === "color" ? "Color" : "B&W"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium border ${statusStyle[job.status]}`}>
                          {job.status === "queued" && <KeyRound className="h-2.5 w-2.5" />}
                          {statusLabel[job.status] ?? job.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs py-2 text-muted-foreground whitespace-nowrap">
                        {new Date(job.submitted_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-xs py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Employee: remind them to go to printer */}
                          {job.status === "queued" && isOwn && role === "employee" && (
                            <Button
                              size="sm" variant="outline"
                              className="h-6 text-2xs px-2"
                              onClick={() => startJob(job)}
                              data-testid={`button-start-${job.id}`}
                            >
                              <KeyRound className="h-3 w-3 mr-1" /> At Printer
                            </Button>
                          )}
                          {/* Admin: mark any active job as printed */}
                          {role === "admin" && (job.status === "queued" || job.status === "printing") && (
                            <Button
                              size="sm" variant="default"
                              className="h-6 text-2xs px-2"
                              onClick={() => openComplete(job)}
                              data-testid={`button-complete-${job.id}`}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Printed
                            </Button>
                          )}
                          {canCancel && (
                            <Button
                              size="sm" variant="ghost"
                              className="h-6 text-2xs px-1.5 text-destructive hover:text-destructive"
                              onClick={() => openCancel(job)}
                              data-testid={`button-cancel-${job.id}`}
                            >
                              <XCircle className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Cancel dialog */}
      <Dialog open={cancelDialog.open} onOpenChange={(o) => !o && setCancelDialog({ open: false, job: null })}>
        <DialogContent data-testid="dialog-cancel">
          <DialogHeader>
            <DialogTitle>Cancel Print Job</DialogTitle>
            <DialogDescription>
              Cancel <strong>{cancelDialog.job?.document_name}</strong>?
              {role === "employee" && " Enter your PIN to confirm."}
            </DialogDescription>
          </DialogHeader>
          {role === "employee" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="cancel-pin">Your PIN</Label>
                <Input
                  id="cancel-pin" type="password" maxLength={10}
                  placeholder="Enter your PIN"
                  value={cancelPin} onChange={e => { setCancelPin(e.target.value); setCancelError(""); }}
                  data-testid="input-cancel-pin"
                />
              </div>
              {cancelError && (
                <Alert variant="destructive">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertDescription>{cancelError}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog({ open: false, job: null })}>Keep Job</Button>
            <Button variant="destructive" onClick={confirmCancel} disabled={cancelLoading} data-testid="button-confirm-cancel">
              {cancelLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cancel Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete dialog */}
      <Dialog open={completeDialog.open} onOpenChange={(o) => !o && setCompleteDialog({ open: false, job: null })}>
        <DialogContent data-testid="dialog-complete">
          <DialogHeader>
            <DialogTitle>Mark as Completed</DialogTitle>
            <DialogDescription>
              Confirm that <strong>{completeDialog.job?.document_name}</strong> has finished printing?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialog({ open: false, job: null })}>Back</Button>
            <Button onClick={confirmComplete} disabled={completeLoading} data-testid="button-confirm-complete">
              {completeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Mark Done</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`${color} opacity-70`}>{icon}</div>
        <div>
          <div className={`text-xl font-bold ${color}`} data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
