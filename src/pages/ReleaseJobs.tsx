import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer, Lock, Send, RefreshCw, Eye, EyeOff, ShieldCheck, Clock, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { storage } from "@/lib/storage";
import type { User } from "@/lib/storage";

interface SpoolerJob {
  Id: number;
  PrinterName: string;
  UserName: string;
  DocumentName: string;
  JobStatus: string;
  TotalPages: number;
  SubmittedTime: string;
  _source: "spooler";
}

interface LocalJob {
  id: string;
  document_name: string;
  pages: number;
  copies: number;
  color_mode: string;
  status: string;
  submitted_at: string;
  printer_name?: string;
  cost: number;
  _source: "local";
}

type AnyJob = SpoolerJob | LocalJob;

function isSpooler(job: AnyJob): job is SpoolerJob {
  return job._source === "spooler";
}

export default function ReleaseJobs() {
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [authedUser, setAuthedUser] = useState<User | null>(null);
  const [jobs, setJobs] = useState<AnyJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [agentConnected, setAgentConnected] = useState<boolean | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchJobs = useCallback(async (user: User) => {
    setLoading(true);
    const combined: AnyJob[] = [];

    // 1. Try to get held jobs from Windows Print Server via agent
    try {
      const res = await fetch("/api/agent/jobs/held");
      const data = await res.json();
      if (data.ok && Array.isArray(data.items)) {
        setAgentConnected(true);
        // Match by Windows username — tries display name, first name, employee_id, email prefix
        const userMatchers = [
          user.name.toLowerCase(),
          user.name.split(" ")[0].toLowerCase(),
          user.employee_id.toLowerCase(),
          (user.email || "").split("@")[0].toLowerCase(),
        ];
        const userJobs = data.items.filter((j: any) => {
          const winUser = (j.UserName || "").toLowerCase().replace(/.*\\/, ""); // strip DOMAIN\
          return userMatchers.some(m => winUser.includes(m) || m.includes(winUser));
        });
        userJobs.forEach((j: any) => combined.push({ ...j, _source: "spooler" }));
      } else {
        setAgentConnected(false);
      }
    } catch {
      setAgentConnected(false);
    }

    // 2. Always include local queued jobs for this user (fallback / PrintGuard-submitted jobs)
    const localJobs = storage.getJobs()
      .filter(j => j.user_id === user.id && (j.status === "queued" || j.status === "printing"))
      .map(j => ({ ...j, _source: "local" as const }));
    localJobs.forEach(j => combined.push(j));

    setJobs(combined);
    setLastRefresh(new Date());
    setLoading(false);
  }, []);

  // Auto-refresh every 15 seconds while logged in
  useEffect(() => {
    if (!authedUser) return;
    const interval = setInterval(() => fetchJobs(authedUser), 15000);
    return () => clearInterval(interval);
  }, [authedUser, fetchJobs]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.trim() === "") {
      toast.error("PIN is required");
      return;
    }
    const users = storage.getUsers();
    const user = users.find(u => u.employee_id === employeeId && u.status !== "inactive");
    if (!user) {
      toast.error("Employee ID not found");
      return;
    }
    if (!user.pin) {
      toast.error("No PIN assigned to this account — contact your admin to set a PIN before using secure print.");
      return;
    }
    if (user.pin !== pin) {
      toast.error("Incorrect PIN");
      return;
    }
    setAuthedUser(user);
    fetchJobs(user);
    toast.success(`Welcome, ${user.name.split(" ")[0]}`);
  };

  const handleRelease = async (job: AnyJob) => {
    const key = isSpooler(job) ? String(job.Id) : job.id;
    setReleasing(key);
    try {
      if (isSpooler(job)) {
        const res = await fetch("/api/agent/jobs/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            printerName: job.PrinterName,
            jobId: job.Id,
            username: job.UserName,
            documentName: job.DocumentName,
            pages: job.TotalPages,
            userId: authedUser?.id,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          toast.success("Job released — printing now!");
          setJobs(prev => prev.filter(j => isSpooler(j) ? j.Id !== job.Id : true));
          // Record in local audit log so Reports can track it
          storage.addJob({
            user_id: authedUser!.id,
            userName: authedUser!.name,
            document_name: job.DocumentName,
            pages: job.TotalPages || 1,
            copies: 1,
            color_mode: 'bw',
            duplex: false,
            status: 'completed',
            submitted_at: job.SubmittedTime || new Date().toISOString(),
            released_at: new Date().toISOString(),
            cost: (job.TotalPages || 1) * 0.10,
            department: authedUser!.department || 'General',
            branch: authedUser!.branch,
            printer_name: job.PrinterName,
            employee_id: authedUser!.employee_id,
          });
        } else {
          toast.error(data.error || "Release failed");
        }
      } else {
        storage.releaseJob(job.id, pin);
        toast.success("Job released — printing now!");
        setJobs(prev => prev.filter(j => !isSpooler(j) && j.id !== job.id));
      }
    } catch (err: any) {
      toast.error(err.message || "Release failed");
    } finally {
      setReleasing(null);
    }
  };

  if (!authedUser) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md shadow-lg border-2 border-primary/10">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto bg-primary/10 w-14 h-14 rounded-full flex items-center justify-center mb-3">
              <ShieldCheck className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-xl">Secure Print Release</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your Employee ID and PIN to see and release your held print jobs
            </p>
          </CardHeader>
          <CardContent className="pt-2">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Employee ID</label>
                <Input
                  placeholder="e.g. EMP001"
                  value={employeeId}
                  onChange={e => setEmployeeId(e.target.value.toUpperCase())}
                  required
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">PIN (your Secured Print PIN)</label>
                <div className="relative">
                  <Input
                    type={showPin ? "text" : "password"}
                    placeholder="Enter your PIN"
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                    required
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPin(v => !v)}
                  >
                    {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full h-10">
                <Lock className="h-4 w-4 mr-2" /> Verify & View My Jobs
              </Button>
            </form>
            <p className="text-2xs text-muted-foreground text-center mt-4">
              This PIN is the same one you enter on the printer panel to release your prints
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const jobKey = (job: AnyJob) => isSpooler(job) ? String(job.Id) : job.id;
  const jobDoc = (job: AnyJob) => isSpooler(job) ? job.DocumentName : job.document_name;
  const jobPages = (job: AnyJob) => isSpooler(job) ? job.TotalPages : job.pages;
  const jobPrinter = (job: AnyJob) => isSpooler(job) ? job.PrinterName : (job.printer_name || "System Printer");
  const jobTime = (job: AnyJob) => isSpooler(job) ? job.SubmittedTime : job.submitted_at;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Secure Print Release</h1>
          <p className="text-xs text-muted-foreground">
            Logged in as <span className="font-semibold text-foreground">{authedUser.name}</span>
            {lastRefresh && (
              <span className="ml-2 text-muted-foreground">
                · Refreshed {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => fetchJobs(authedUser)}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setAuthedUser(null)}>
            Log Out
          </Button>
        </div>
      </div>

      {/* PIN reminder card */}
      <Card className="shadow-none border-primary/20 bg-primary/5">
        <CardContent className="p-3 flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Lock className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-foreground">Your Secured Print PIN</p>
            <p className="text-2xs text-muted-foreground">Enter this PIN on the printer panel to release your jobs</p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`font-mono text-lg font-bold tracking-widest ${showPin ? "text-primary" : "text-muted-foreground"}`}>
              {showPin ? authedUser.pin : "••••"}
            </div>
            <button
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setShowPin(v => !v)}
            >
              {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Agent status */}
      {agentConnected === false && (
        <Card className="shadow-none border-warning/20 bg-warning/5">
          <CardContent className="p-3 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-warning shrink-0" />
            <p className="text-xs text-warning-foreground">
              Windows Print Server agent not connected — showing PrintGuard-submitted jobs only.
              Configure the agent URL in <strong>Settings → Print Server</strong>.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Jobs list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : jobs.length === 0 ? (
        <Card className="shadow-none border-dashed">
          <CardContent className="p-12 text-center">
            <Printer className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
            <h3 className="text-sm font-semibold">No held jobs found</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Jobs you print with Secured Print enabled will appear here waiting for release.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">{jobs.length} job{jobs.length !== 1 ? "s" : ""} waiting</p>
          {jobs.map(job => {
            const key = jobKey(job);
            const isReleasingThis = releasing === key;
            return (
              <Card key={key} className="shadow-none hover:border-primary/40 transition-colors">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="bg-primary/5 p-2.5 rounded-lg shrink-0">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{jobDoc(job) || "Unknown Document"}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      <span className="flex items-center gap-1 text-2xs text-muted-foreground">
                        <Printer className="h-3 w-3" /> {jobPrinter(job)}
                      </span>
                      <span className="text-2xs text-muted-foreground">·</span>
                      <span className="text-2xs text-muted-foreground">{jobPages(job) || "?"} pages</span>
                      {jobTime(job) && (
                        <>
                          <span className="text-2xs text-muted-foreground">·</span>
                          <span className="flex items-center gap-1 text-2xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(jobTime(job)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge
                      variant="outline"
                      className={isSpooler(job)
                        ? "text-2xs border-warning/30 text-warning bg-warning/5"
                        : "text-2xs border-primary/30 text-primary bg-primary/5"
                      }
                    >
                      {isSpooler(job) ? "Held at Printer" : "In Queue"}
                    </Badge>
                    <Button
                      size="sm"
                      className="h-8 px-4 text-xs"
                      onClick={() => handleRelease(job)}
                      disabled={isReleasingThis}
                    >
                      {isReleasingThis
                        ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" />
                        : <Send className="h-3.5 w-3.5 mr-1" />
                      }
                      {isReleasingThis ? "Releasing…" : "Release"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
