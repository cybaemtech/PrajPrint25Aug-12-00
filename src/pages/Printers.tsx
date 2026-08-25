import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { storage } from "@/lib/storage";
import type { Printer } from "@/lib/storage";
import { Search, MapPin, Loader2, ScanLine, Printer as PrinterIcon, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type PrinterStatus = 'online' | 'offline' | 'warning' | 'error';

const statusColors: Record<PrinterStatus, string> = {
  online: "bg-success",
  offline: "bg-destructive",
  warning: "bg-warning",
  error: "bg-destructive",
};

const statusBadge: Record<PrinterStatus, string> = {
  online: "bg-success/10 text-success border-success/20",
  offline: "bg-destructive/10 text-destructive border-destructive/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  error: "bg-destructive/10 text-destructive border-destructive/20",
};

const normalizeStatus = (status?: string): PrinterStatus => {
  if (status === "online" || status === "offline" || status === "warning" || status === "error") return status;
  return "online";
};

const normalizeType = (type?: string): "color" | "bw" => (type === "color" ? "color" : "bw");

const normalizePrinter = (raw: any): Printer => ({
  id: raw.id || `p-${(raw.name || raw.ip || "unknown").toString().toLowerCase().replace(/\s+/g, "-")}`,
  name: raw.name || "Unknown Printer",
  location: raw.location || "Previously used",
  branch: raw.branch || "Hinjewadi",
  status: normalizeStatus(raw.status),
  type: normalizeType(raw.type),
  tonerLevel: Number.isFinite(raw.tonerLevel) ? raw.tonerLevel : 100,
  paperLevel: Number.isFinite(raw.paperLevel) ? raw.paperLevel : 100,
  jobCount: Number.isFinite(raw.jobCount) ? raw.jobCount : 0,
  ip: raw.ip || raw.printerIP || "-",
  model: raw.model || "Unknown Model",
  totalPrints: Number.isFinite(raw.totalPrints) ? raw.totalPrints : 0,
  totalScans: Number.isFinite(raw.totalScans) ? raw.totalScans : 0,
  lastMaintenance: raw.lastMaintenance || "Not recorded",
  canScan: raw.canScan ?? false,
  inkLevels: raw.inkLevels,
});

const mergePrinters = (...lists: Printer[][]): Printer[] => {
  const merged = new Map<string, Printer>();
  lists.flat().forEach((printer) => {
    const normalized = normalizePrinter(printer);
    const key = normalized.name.toLowerCase();
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, normalized);
      return;
    }
    merged.set(key, normalizePrinter({
      ...existing,
      ...normalized,
      status: existing.status === "online" || normalized.status === "online" ? "online" : normalized.status,
      jobCount: Math.max(existing.jobCount || 0, normalized.jobCount || 0),
      totalPrints: Math.max(existing.totalPrints || 0, normalized.totalPrints || 0),
      inkLevels: normalized.inkLevels || existing.inkLevels,
      canScan: normalized.canScan || existing.canScan,
    }));
  });
  return Array.from(merged.values());
};

function agentPrinterStatusMap(code: number): PrinterStatus {
  if (code === 0 || code === 7 || code === 8) return "online";
  if (code === 6 || code === 3) return "offline";
  return "warning";
}

function mapAgentPrinter(p: any): Printer {
  const ip = p.ip || (() => {
    const m = (p.PortName || "").match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    return m ? m[1] : null;
  })();
  const driver = (p.DriverName || "").toLowerCase();
  const canScan = driver.includes("mfp") || driver.includes("scan") || driver.includes("ufr") || driver.includes("c3");
  const toner = p.toner || null;
  return normalizePrinter({
    id: `agent-${(p.Name || "printer").toLowerCase().replace(/[\s\\/:*?"<>|]/g, "-")}`,
    name: p.Name || "Unknown Printer",
    model: p.DriverName || "Unknown Model",
    ip: ip || "-",
    location: ip ? ip : (p.PortName || "-"),
    branch: "Hinjewadi",
    status: agentPrinterStatusMap(p.PrinterStatus ?? 0),
    jobCount: p.JobCount || 0,
    type: toner && (toner.cyan !== undefined) ? "color" : "bw",
    tonerLevel: toner ? toner.black : 100,
    paperLevel: 100,
    totalPrints: p.JobCount || 0,
    totalScans: 0,
    canScan,
    inkLevels: toner ? toner : undefined,
  });
}

function InkBar({ label, value, color }: { label: string; value: number; color: string }) {
  const low = value < 20;
  return (
    <div className="flex items-center gap-1">
      <span className={`text-2xs font-mono font-bold w-3 ${low ? 'text-destructive' : 'text-muted-foreground'}`}>{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} ${low ? 'opacity-100' : 'opacity-75'}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-2xs w-7 text-right font-medium ${low ? 'text-destructive' : 'text-muted-foreground'}`}>{value}%</span>
    </div>
  );
}

type SnmpResult = { inkLevels?: Record<string, number>; loading: boolean; error?: string };

export default function Printers() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Printer | null>(null);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [snmpResults, setSnmpResults] = useState<Record<string, SnmpResult>>({});
  const [snmpCommunity, setSnmpCommunity] = useState("public");
  const [pollingAll, setPollingAll] = useState(false);
  const { role, currentBranch } = useRole();

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(d => {
      if (d.snmpCommunity) setSnmpCommunity(d.snmpCommunity);
    }).catch(() => {});
  }, []);

  const isValidIpv4 = (ip: string) => /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);

  const pollSnmp = async (printer: Printer) => {
    const ip = (printer.ip || "").trim();
    if (!ip || ip === "-" || !isValidIpv4(ip)) return;
    setSnmpResults(prev => ({ ...prev, [printer.id]: { loading: true } }));
    try {
      const res = await fetch(`/api/snmp/toner?ip=${encodeURIComponent(ip)}&community=${encodeURIComponent(snmpCommunity)}`);
      const data = await res.json();
      if (data.ok && data.inkLevels && Object.keys(data.inkLevels).length > 0) {
        setSnmpResults(prev => ({ ...prev, [printer.id]: { loading: false, inkLevels: data.inkLevels } }));
        toast.success(`SNMP: live toner data fetched from ${printer.name}`);
      } else {
        setSnmpResults(prev => ({ ...prev, [printer.id]: { loading: false, error: data.error || "No toner data returned" } }));
        toast.error(`SNMP: ${data.error || "No toner data from " + printer.name}`);
      }
    } catch (e: any) {
      setSnmpResults(prev => ({ ...prev, [printer.id]: { loading: false, error: e.message } }));
      toast.error(`SNMP poll failed: ${e.message}`);
    }
  };

  const pollAllSnmp = async () => {
    const pollable = printers.filter(p => p.ip && isValidIpv4(p.ip.trim()));
    if (pollable.length === 0) { toast.error("No printers with valid IP addresses to poll"); return; }
    setPollingAll(true);
    await Promise.allSettled(pollable.map(p => pollSnmp(p)));
    setPollingAll(false);
  };

  const loadPrinters = async () => {
    setLoading(true);
    const localPrinters = (storage.getPrinters() || []).map(normalizePrinter);
    setPrinters(localPrinters);

    try {
      const [printersResult, agentResult] = await Promise.allSettled([
        fetch('/api/printers'),
        fetch('/api/agent/printers'),
      ]);

      const apiPrinters =
        printersResult.status === "fulfilled" && printersResult.value.ok
          ? ((await printersResult.value.json()) || []).map((p: any) => normalizePrinter(p))
          : [];

      let agentPrinters: Printer[] = [];
      if (agentResult.status === "fulfilled" && agentResult.value.ok) {
        const raw = await agentResult.value.json();
        if (Array.isArray(raw)) {
          agentPrinters = raw.map(mapAgentPrinter);
        }
      }

      const merged = agentPrinters.length > 0
        ? mergePrinters(agentPrinters, apiPrinters)
        : mergePrinters(localPrinters, apiPrinters);

      setPrinters(merged);
      if (merged.length > 0) storage.setPrinters(merged);
    } catch {
      setPrinters(localPrinters);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPrinters(); }, []);

  const branchFiltered = printers.filter(p =>
    role === "admin" ? true : (p.branch === currentBranch)
  );

  const filtered = branchFiltered.filter(p =>
    (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.location || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.ip || "").includes(search)
  );

  const onlineCount = branchFiltered.filter(p => p.status === "online").length;
  const warningCount = branchFiltered.filter(p => p.status === "warning").length;
  const offlineCount = branchFiltered.filter(p => p.status === "offline" || p.status === "error").length;
  const scannerCount = branchFiltered.filter(p => p.canScan && p.status === "online").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-bold">Printer & Scanner Management</h1>
          {role === "employee" && (
            <Badge variant="outline" className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {currentBranch}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success inline-block" /> {onlineCount} Online</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning inline-block" /> {warningCount} Warning</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive inline-block" /> {offlineCount} Offline</span>
            <span className="flex items-center gap-1 text-success"><ScanLine className="h-3 w-3" /> {scannerCount} Scanners</span>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={pollAllSnmp} disabled={pollingAll || loading} title={`Poll all printers for live toner (SNMP community: ${snmpCommunity})`} data-testid="button-poll-all-snmp">
            {pollingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wifi className="h-3 w-3 text-primary" />} Poll Toner (SNMP)
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={loadPrinters} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className={`flex-1 ${selected ? "lg:w-2/3" : ""}`}>
          <div className="relative mb-3">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search by name, location, or IP…" value={search} onChange={e => setSearch(e.target.value)} className="h-8 pl-7 text-xs" />
          </div>

          <Card className="shadow-none min-h-[300px]">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground animate-pulse">Detecting Company printers & scanners...</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-2xs h-8 w-8"></TableHead>
                    <TableHead className="text-2xs h-8">Name / Model</TableHead>
                    <TableHead className="text-2xs h-8">Location</TableHead>
                    <TableHead className="text-2xs h-8">Capabilities</TableHead>
                    <TableHead className="text-2xs h-8">IP Address</TableHead>
                    <TableHead className="text-2xs h-8">Print Jobs</TableHead>
                    <TableHead className="text-2xs h-8">Scans</TableHead>
                    <TableHead className="text-2xs h-8">Ink / Toner</TableHead>
                    <TableHead className="text-2xs h-8">Paper</TableHead>
                    <TableHead className="text-2xs h-8 w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="py-20 text-center text-muted-foreground italic text-xs">
                        No printers found. Connect a USB or Network printer.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map(p => (
                      <TableRow
                        key={p.id}
                        className={`cursor-pointer ${selected?.id === p.id ? "bg-accent" : ""}`}
                        onClick={() => setSelected(selected?.id === p.id ? null : p)}
                        data-testid={`row-printer-${p.id}`}
                      >
                        <TableCell className="py-1.5 px-2">
                          <span className={`h-2 w-2 rounded-full inline-block ${statusColors[p.status]}`} />
                        </TableCell>
                        <TableCell className="text-xs py-1.5">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-2xs text-muted-foreground">{p.model}</div>
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-muted-foreground">{p.location}</TableCell>
                        <TableCell className="text-xs py-1.5">
                          <div className="flex items-center gap-1 flex-wrap">
                            <Badge variant="outline" className="text-2xs">
                              <PrinterIcon className="h-2.5 w-2.5 mr-0.5" />
                              {p.type === "color" ? "Color" : "B&W"}
                            </Badge>
                            {p.canScan && (
                              <Badge variant="outline" className="text-2xs text-success border-success/30">
                                <ScanLine className="h-2.5 w-2.5 mr-0.5" /> Scan
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs py-1.5 font-mono text-muted-foreground">{p.ip}</TableCell>
                        <TableCell className="text-xs py-1.5">
                          <div className="font-medium">{p.jobCount.toLocaleString()}</div>
                          <div className="text-2xs text-muted-foreground">{(p.totalPrints || 0).toLocaleString()} pgs</div>
                        </TableCell>
                        <TableCell className="text-xs py-1.5">
                          {p.canScan ? (
                            <div className="font-medium">{(p.totalScans || 0).toLocaleString()}</div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-1.5">
                          {(() => {
                            const snmp = snmpResults[p.id];
                            const liveInk = snmp?.inkLevels;
                            const displayInk = liveInk || p.inkLevels;
                            if (snmp?.loading) {
                              return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
                            }
                            if (displayInk) {
                              return (
                                <div className="space-y-0.5 min-w-[90px]">
                                  {liveInk && <span className="text-[9px] text-primary font-medium">LIVE</span>}
                                  <InkBar label="K" value={displayInk.black ?? 0} color="bg-gray-800 dark:bg-gray-200" />
                                  {displayInk.cyan !== undefined && (
                                    <>
                                      <InkBar label="C" value={displayInk.cyan} color="bg-cyan-500" />
                                      <InkBar label="M" value={displayInk.magenta ?? 0} color="bg-pink-500" />
                                      <InkBar label="Y" value={displayInk.yellow ?? 0} color="bg-yellow-400" />
                                    </>
                                  )}
                                </div>
                              );
                            }
                            return (
                              <div className="flex items-center gap-1.5">
                                <Progress value={p.tonerLevel} className="h-1.5 w-12" />
                                <span className="text-2xs text-muted-foreground">{p.tonerLevel}%</span>
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-xs py-1.5">
                          <div className="flex items-center gap-1.5">
                            <Progress value={p.paperLevel} className="h-1.5 w-12" />
                            <span className="text-2xs text-muted-foreground">{p.paperLevel}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-1.5 px-1">
                          {p.ip && p.ip !== "-" && (
                            <button
                              onClick={e => { e.stopPropagation(); pollSnmp(p); }}
                              disabled={snmpResults[p.id]?.loading}
                              title={`Poll live toner via SNMP (${p.ip})`}
                              data-testid={`button-snmp-poll-${p.id}`}
                              className={`rounded p-1 transition-colors ${
                                snmpResults[p.id]?.error
                                  ? "text-destructive hover:bg-destructive/10"
                                  : snmpResults[p.id]?.inkLevels
                                  ? "text-primary hover:bg-primary/10"
                                  : "text-muted-foreground hover:bg-accent"
                              }`}
                            >
                              {snmpResults[p.id]?.loading ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : snmpResults[p.id]?.error ? (
                                <WifiOff className="h-3 w-3" />
                              ) : (
                                <Wifi className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>

        {/* Detail Panel */}
        {selected && (
          <Card className="hidden lg:block w-80 shadow-none shrink-0 self-start">
            <CardHeader className="p-3 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{selected.name}</CardTitle>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium border capitalize ${statusBadge[selected.status]}`}>
                  {selected.status}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-3 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3 w-3" /> {selected.location}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Detail label="Model" value={selected.model} />
                <Detail label="IP Address" value={selected.ip} />
                <Detail label="Branch" value={selected.branch} />
                <Detail label="Type" value={selected.type === "color" ? "Color" : "B&W"} />
                <Detail label="Total Prints" value={(selected.totalPrints || 0).toLocaleString()} />
                {selected.canScan && <Detail label="Total Scans" value={(selected.totalScans || 0).toLocaleString()} />}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-2xs">
                  <PrinterIcon className="h-2.5 w-2.5 mr-0.5" /> Print
                </Badge>
                {selected.canScan && (
                  <Badge variant="outline" className="text-2xs text-success border-success/30">
                    <ScanLine className="h-2.5 w-2.5 mr-0.5" /> Scan (MFP)
                  </Badge>
                )}
              </div>

              {/* Ink / Toner */}
              <div className="space-y-1.5">
                <span className="text-2xs font-semibold text-primary uppercase tracking-wider">Ink / Toner</span>
                {selected.inkLevels ? (
                  <div className="space-y-1.5 pt-1">
                    <InkDetailBar label="Black (K)" value={selected.inkLevels.black} color="bg-gray-800 dark:bg-gray-200" />
                    {selected.type === 'color' && selected.inkLevels.cyan !== undefined && (
                      <>
                        <InkDetailBar label="Cyan (C)" value={selected.inkLevels.cyan} color="bg-cyan-500" />
                        <InkDetailBar label="Magenta (M)" value={selected.inkLevels.magenta ?? 0} color="bg-pink-500" />
                        <InkDetailBar label="Yellow (Y)" value={selected.inkLevels.yellow ?? 0} color="bg-yellow-400" />
                      </>
                    )}
                  </div>
                ) : (
                  <LevelBar label="Toner" value={selected.tonerLevel} />
                )}
              </div>

              <LevelBar label="Paper" value={selected.paperLevel} />

              <div className="pt-1 border-t">
                <span className="text-2xs text-muted-foreground">Last Maintenance</span>
                <div className="font-medium">{selected.lastMaintenance}</div>
              </div>

              <div className="border-t pt-3">
                <span className="text-2xs font-semibold text-primary uppercase tracking-wider">Recent Print Jobs</span>
                <div className="mt-2 space-y-2 max-h-[200px] overflow-y-auto pr-1">
                  {storage.getJobs()
                    .filter(j => j.printer_name === selected.name)
                    .slice(0, 5)
                    .map(job => (
                      <div key={job.id} className="p-2 bg-muted/30 rounded border border-border/50 text-[10px]">
                        <div className="font-medium truncate">{job.document_name}</div>
                        <div className="flex justify-between text-muted-foreground mt-1">
                          <span>{job.userName}</span>
                          <span>{new Date(job.submitted_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  }
                  {storage.getJobs().filter(j => j.printer_name === selected.name).length === 0 && (
                    <div className="text-center py-3 text-muted-foreground italic">No jobs recorded yet</div>
                  )}
                </div>
              </div>

              {selected.canScan && (
                <div className="border-t pt-3">
                  <span className="text-2xs font-semibold text-success uppercase tracking-wider">Recent Scans</span>
                  <div className="mt-2 space-y-2 max-h-[160px] overflow-y-auto pr-1">
                    {storage.getScanJobs()
                      .filter(j => j.scanner_name === selected.name)
                      .slice(0, 5)
                      .map(job => (
                        <div key={job.id} className="p-2 bg-success/5 rounded border border-success/15 text-[10px]">
                          <div className="font-medium truncate">{job.document_name}</div>
                          <div className="flex justify-between text-muted-foreground mt-1">
                            <span>{job.userName}</span>
                            <span>{new Date(job.scanned_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))
                    }
                    {storage.getScanJobs().filter(j => j.scanner_name === selected.name).length === 0 && (
                      <div className="text-center py-3 text-muted-foreground italic">No scans recorded yet</div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | number }) {
  return (
    <div>
      <span className="text-2xs text-muted-foreground">{label}</span>
      <div className="font-medium truncate">{value || "-"}</div>
    </div>
  );
}

function LevelBar({ label, value }: { label: string; value: number }) {
  const color = value > 50 ? "bg-success" : value > 20 ? "bg-warning" : "bg-destructive";
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-2xs text-muted-foreground">{label}</span>
        <span className="text-2xs font-medium">{value}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function InkDetailBar({ label, value, color }: { label: string; value: number; color: string }) {
  const low = value < 20;
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className={`text-2xs ${low ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
          {label} {low && '⚠ Low'}
        </span>
        <span className={`text-2xs font-medium ${low ? 'text-destructive' : ''}`}>{value}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
