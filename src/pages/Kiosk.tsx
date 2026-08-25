import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Send, RefreshCw, FileText, Clock, Printer, LogOut, Keyboard, CheckCircle2, WifiOff } from "lucide-react";
import { storage } from "@/lib/storage";
import type { User } from "@/lib/storage";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpoolerJob {
  Id: number;
  PrinterName: string;
  UserName: string;
  DocumentName: string;
  TotalPages: number;
  SubmittedTime: string;
  _source: "spooler";
}
interface LocalJob {
  id: string;
  document_name: string;
  pages: number;
  copies: number;
  status: string;
  submitted_at: string;
  printer_name?: string;
  _source: "local";
}
type AnyJob = SpoolerJob | LocalJob;
const isSpooler = (j: AnyJob): j is SpoolerJob => j._source === "spooler";

// ─── PIN Pad ──────────────────────────────────────────────────────────────────

function PinPad({ value, onChange, onSubmit, label }: {
  value: string; onChange: (v: string) => void; onSubmit?: () => void; label: string;
}) {
  const digits = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-medium text-white/70">{label}</span>
        <div className="flex gap-2 items-center justify-center min-h-[2.5rem]">
          {value.length === 0 && <span className="text-white/30 text-lg tracking-widest">Enter {label}</span>}
          {value.split("").map((_, i) => (
            <span key={i} className="w-3 h-3 rounded-full bg-white/90 inline-block" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 w-56">
        {digits.map((d, i) => (
          <button
            key={i}
            data-testid={`kiosk-key-${d}`}
            onClick={() => {
              if (d === "") return;
              if (d === "⌫") { onChange(value.slice(0, -1)); return; }
              if (value.length < 12) onChange(value + d);
            }}
            disabled={d === ""}
            className={`
              h-14 rounded-xl font-bold text-xl transition-all active:scale-95
              ${d === "" ? "invisible" : "bg-white/10 hover:bg-white/20 text-white border border-white/10 active:bg-white/30"}
              ${d === "⌫" ? "text-base" : ""}
            `}
          >
            {d}
          </button>
        ))}
      </div>
      {onSubmit && value.length > 0 && (
        <Button
          className="w-56 h-12 text-base font-semibold rounded-xl bg-white text-slate-900 hover:bg-white/90"
          onClick={onSubmit}
          data-testid="kiosk-btn-next"
        >
          Continue →
        </Button>
      )}
    </div>
  );
}

// ─── Main Kiosk ───────────────────────────────────────────────────────────────

const IDLE_TIMEOUT = 90; // seconds before auto-logout

export default function Kiosk() {
  const [params] = useSearchParams();
  const printerFilter = params.get("printer") || "";

  const [step, setStep] = useState<"emp" | "pin" | "jobs" | "released">("emp");
  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [authedUser, setAuthedUser] = useState<User | null>(null);
  const [jobs, setJobs] = useState<AnyJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [releasing, setReleasing] = useState<number | string | null>(null);
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);
  const [idleTimer, setIdleTimer] = useState(IDLE_TIMEOUT);
  const [releasedDoc, setReleasedDoc] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset idle timer on any interaction
  const resetIdle = useCallback(() => setIdleTimer(IDLE_TIMEOUT), []);
  useEffect(() => {
    window.addEventListener("pointerdown", resetIdle);
    window.addEventListener("keydown", resetIdle);
    return () => {
      window.removeEventListener("pointerdown", resetIdle);
      window.removeEventListener("keydown", resetIdle);
    };
  }, [resetIdle]);

  // Count down idle timer while logged in
  useEffect(() => {
    if (step === "emp") { setIdleTimer(IDLE_TIMEOUT); return; }
    timerRef.current = setInterval(() => {
      setIdleTimer(t => {
        if (t <= 1) { handleLogout(); return IDLE_TIMEOUT; }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step]);

  // Auto-refresh jobs every 12s
  useEffect(() => {
    if (step !== "jobs" || !authedUser) return;
    const iv = setInterval(() => fetchJobs(authedUser), 12000);
    return () => clearInterval(iv);
  }, [step, authedUser]);

  function handleLogout() {
    setStep("emp"); setEmpId(""); setPin(""); setAuthedUser(null); setJobs([]);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  const fetchJobs = useCallback(async (user: User) => {
    setLoading(true);
    const combined: AnyJob[] = [];
    try {
      const res = await fetch("/api/agent/jobs/held");
      const data = await res.json();
      if (data.ok && Array.isArray(data.items)) {
        setAgentOnline(true);
        const matchers = [
          user.name.toLowerCase(),
          user.name.split(" ")[0].toLowerCase(),
          user.employee_id.toLowerCase(),
          (user.email || "").split("@")[0].toLowerCase(),
        ];
        data.items
          .filter((j: any) => {
            const win = (j.UserName || "").toLowerCase().replace(/.*\\/, "");
            const matchesUser = matchers.some(m => win.includes(m) || m.includes(win));
            const matchesPrinter = !printerFilter || (j.PrinterName || "").toLowerCase().includes(printerFilter.toLowerCase());
            return matchesUser && matchesPrinter;
          })
          .forEach((j: any) => combined.push({ ...j, _source: "spooler" }));
      } else setAgentOnline(false);
    } catch { setAgentOnline(false); }

    // Local queued jobs
    storage.getJobs()
      .filter(j => j.user_id === user.id && (j.status === "queued" || j.status === "printing"))
      .filter(j => !printerFilter || (j.printer_name || "").toLowerCase().includes(printerFilter.toLowerCase()))
      .forEach(j => combined.push({ ...j, _source: "local" as const }));

    setJobs(combined);
    setLoading(false);
  }, [printerFilter]);

  function submitEmpId() {
    const users = storage.getUsers();
    const found = users.find(u => u.employee_id === empId.trim() && u.status !== "inactive");
    if (!found) { toast.error("Employee ID not found"); return; }
    if (!found.pin) { toast.error("No PIN set for this account — see your admin"); return; }
    setStep("pin");
  }

  function submitPin() {
    const users = storage.getUsers();
    const user = users.find(u => u.employee_id === empId.trim());
    if (!user || user.pin !== pin) {
      toast.error("Incorrect PIN");
      setPin("");
      return;
    }
    setAuthedUser(user);
    setStep("jobs");
    fetchJobs(user);
  }

  async function releaseJob(job: AnyJob) {
    const key = isSpooler(job) ? job.Id : job.id;
    setReleasing(key);
    try {
      if (isSpooler(job)) {
        const res = await fetch("/api/agent/jobs/release", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            printerName: job.PrinterName, jobId: job.Id,
            username: job.UserName, documentName: job.DocumentName,
            pages: job.TotalPages, userId: authedUser?.id,
          }),
        });
        const data = await res.json();
        if (!data.ok) { toast.error(data.error || "Release failed"); setReleasing(null); return; }
        storage.addJob({
          user_id: authedUser!.id, userName: authedUser!.name,
          document_name: job.DocumentName, pages: job.TotalPages || 1,
          copies: 1, color_mode: "bw", duplex: false, status: "completed",
          submitted_at: job.SubmittedTime || new Date().toISOString(),
          released_at: new Date().toISOString(),
          cost: (job.TotalPages || 1) * 0.10,
          department: authedUser!.department || "General",
          branch: authedUser!.branch, printer_name: job.PrinterName,
          employee_id: authedUser!.employee_id,
        });
        setReleasedDoc(job.DocumentName);
      } else {
        storage.releaseJob(job.id, pin);
        setReleasedDoc((job as LocalJob).document_name);
      }
      setJobs(prev => prev.filter(j => (isSpooler(j) ? j.Id : j.id) !== key));
      setStep("released");
      setTimeout(() => { setStep("jobs"); setReleasedDoc(""); fetchJobs(authedUser!); }, 4000);
    } catch (e: any) {
      toast.error(e.message || "Release failed");
    } finally {
      setReleasing(null);
    }
  }

  async function releaseAll() {
    for (const j of [...jobs]) await releaseJob(j);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const gradBg = "min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6 select-none";

  // Header bar (shown when logged in)
  const headerBar = authedUser ? (
    <div className="fixed top-0 inset-x-0 flex items-center justify-between px-6 py-3 bg-black/30 backdrop-blur border-b border-white/5 z-10">
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-emerald-400" />
        <span className="text-white font-semibold text-sm">{authedUser.name}</span>
        <span className="text-white/40 text-xs">· {authedUser.employee_id}</span>
      </div>
      <div className="flex items-center gap-4">
        {printerFilter && (
          <div className="flex items-center gap-1.5 text-xs text-white/50">
            <Printer className="h-3.5 w-3.5" />
            {printerFilter}
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-white/40">
          <Clock className="h-3.5 w-3.5" />
          Auto-logout in {idleTimer}s
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/90 transition-colors"
          data-testid="kiosk-btn-logout"
        >
          <LogOut className="h-3.5 w-3.5" /> Log out
        </button>
      </div>
    </div>
  ) : null;

  // ── Step: Employee ID ───────────────────────────────────────────────────────
  if (step === "emp") {
    return (
      <div className={gradBg}>
        <div className="flex flex-col items-center gap-8 w-full max-w-sm">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="bg-white/10 p-4 rounded-2xl mb-1">
              <ShieldCheck className="h-10 w-10 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-white">Secure Print Release</h1>
            {printerFilter && (
              <div className="flex items-center gap-2 text-white/50 text-sm">
                <Printer className="h-4 w-4" /> {printerFilter}
              </div>
            )}
            <p className="text-white/50 text-sm">Enter your Employee ID to release held jobs</p>
          </div>
          <PinPad
            value={empId}
            onChange={v => setEmpId(v.toUpperCase())}
            onSubmit={empId.length >= 3 ? submitEmpId : undefined}
            label="Employee ID"
          />
          <p className="text-white/25 text-xs text-center mt-2">
            Tap digits above · use keyboard if connected
          </p>
        </div>
      </div>
    );
  }

  // ── Step: PIN ───────────────────────────────────────────────────────────────
  if (step === "pin") {
    return (
      <div className={gradBg}>
        {headerBar}
        <div className="flex flex-col items-center gap-8 w-full max-w-sm pt-16">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="bg-white/10 p-4 rounded-2xl mb-1">
              <Keyboard className="h-10 w-10 text-blue-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Enter Your PIN</h2>
            <p className="text-white/50 text-sm">The 4-digit secure print PIN assigned by your admin</p>
          </div>
          <PinPad
            value={pin}
            onChange={setPin}
            onSubmit={pin.length >= 4 ? submitPin : undefined}
            label="Secure Print PIN"
          />
          <button
            className="text-white/30 text-xs hover:text-white/60 transition-colors"
            onClick={() => { setStep("emp"); setPin(""); }}
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Step: Released confirmation ─────────────────────────────────────────────
  if (step === "released") {
    return (
      <div className={gradBg}>
        {headerBar}
        <div className="flex flex-col items-center gap-5 pt-16 text-center">
          <div className="bg-emerald-500/20 p-5 rounded-full">
            <CheckCircle2 className="h-14 w-14 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">Printing Now!</h2>
          {releasedDoc && <p className="text-white/60 text-sm max-w-xs">{releasedDoc}</p>}
          <p className="text-white/30 text-xs mt-2">Returning to job list in a moment…</p>
        </div>
      </div>
    );
  }

  // ── Step: Jobs list ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col select-none">
      {headerBar}
      <div className="flex-1 flex flex-col items-center pt-20 pb-8 px-4 gap-5 max-w-xl mx-auto w-full">

        {/* Agent offline banner */}
        {agentOnline === false && (
          <div className="w-full flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2.5">
            <WifiOff className="h-4 w-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">Print server agent offline — showing local queue only</p>
          </div>
        )}

        {/* Status / refresh */}
        <div className="w-full flex items-center justify-between">
          <h2 className="text-white text-base font-semibold">
            {loading ? "Loading…" : `${jobs.length} job${jobs.length !== 1 ? "s" : ""} waiting`}
          </h2>
          <div className="flex items-center gap-3">
            {jobs.length > 1 && (
              <button
                onClick={releaseAll}
                disabled={releasing !== null || loading}
                className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-40 font-medium"
                data-testid="kiosk-btn-release-all"
              >
                Release All ({jobs.length})
              </button>
            )}
            <button
              onClick={() => fetchJobs(authedUser!)}
              disabled={loading}
              className="text-white/40 hover:text-white/70 transition-colors"
              data-testid="kiosk-btn-refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Empty state */}
        {!loading && jobs.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-12">
            <div className="bg-white/5 p-6 rounded-2xl">
              <Printer className="h-12 w-12 text-white/20 mx-auto" />
            </div>
            <p className="text-white/40 text-sm">No held jobs found</p>
            <p className="text-white/25 text-xs max-w-xs">
              Print a document from your PC, then come back here to release it
            </p>
            <button
              onClick={() => fetchJobs(authedUser!)}
              className="text-xs text-white/40 hover:text-white/70 mt-2 underline underline-offset-2"
            >
              Refresh
            </button>
          </div>
        )}

        {/* Jobs */}
        <div className="w-full space-y-3">
          {jobs.map(job => {
            const key = isSpooler(job) ? job.Id : job.id;
            const doc = isSpooler(job) ? job.DocumentName : (job as any).document_name;
            const pages = isSpooler(job) ? job.TotalPages : (job as any).pages;
            const printer = isSpooler(job) ? job.PrinterName : ((job as any).printer_name || "Queue");
            const time = isSpooler(job) ? job.SubmittedTime : (job as any).submitted_at;
            const isReleasing = releasing === key;
            return (
              <div
                key={String(key)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4"
                data-testid={`kiosk-job-${key}`}
              >
                <div className="bg-white/10 p-3 rounded-xl shrink-0">
                  <FileText className="h-6 w-6 text-white/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{doc || "Unknown Document"}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    <span className="text-white/40 text-xs flex items-center gap-1">
                      <Printer className="h-3 w-3" />{printer}
                    </span>
                    <span className="text-white/40 text-xs">{pages ?? "?"} pages</span>
                    {time && (
                      <span className="text-white/30 text-xs flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => releaseJob(job)}
                  disabled={isReleasing || releasing !== null}
                  data-testid={`kiosk-btn-release-${key}`}
                  className={`
                    flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95
                    ${isReleasing
                      ? "bg-white/10 text-white/40"
                      : "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20 disabled:opacity-40"
                    }
                  `}
                >
                  {isReleasing
                    ? <RefreshCw className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />
                  }
                  {isReleasing ? "Printing…" : "Print"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
