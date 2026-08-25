import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { Printer, FileText, IndianRupee, Leaf, Clock, AlertTriangle, Upload, Search, Wifi, Usb, CheckCircle2, Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/contexts/RoleContext";
import { storage } from "@/lib/storage";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";

const volumeChartConfig = {
  bw: { label: "B&W", color: "hsl(var(--primary))" },
  color: { label: "Color", color: "hsl(var(--warning))" },
  scans: { label: "Scans", color: "hsl(var(--success))" },
};

const deptChartConfig = {
  cost: { label: "Cost (₹)", color: "hsl(var(--primary))" },
};

const ratioChartConfig = {
  "B&W": { label: "B&W", color: "hsl(var(--primary))" },
  Color: { label: "Color", color: "hsl(var(--warning))" },
};

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-success/10 text-success border-success/20",
    queued: "bg-warning/10 text-warning border-warning/20",
    printing: "bg-primary/10 text-primary border-primary/20",
    cancelled: "bg-muted text-muted-foreground border-border",
    failed: "bg-destructive/10 text-destructive border-destructive/20",
  };
  const labels: Record<string, string> = {
    completed: "Printed", queued: "Queued", printing: "Printing",
    cancelled: "Cancelled", failed: "Failed",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium border ${styles[status] ?? ""}`}>
      {labels[status] ?? status}
    </span>
  );
}

function agentStatusToStr(code: number): string {
  if (code === 0 || code === 7 || code === 8) return "online";
  if (code === 6 || code === 3) return "offline";
  return "warning";
}

export default function Dashboard() {
  const { role, currentUserId, currentBranch } = useRole();
  const [recentJobs, setRecentJobs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(storage.getStats());
  const [printerAlerts, setPrinterAlerts] = useState<any[]>([]);
  const [agentPrinters, setAgentPrinters] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/agent/printers')
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data) && data.length > 0) setAgentPrinters(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let jobs = storage.getJobs();

    if (role === "admin") {
      jobs = jobs;
    } else {
      jobs = jobs.filter(j => j.branch === currentBranch);
    }

    setRecentJobs(jobs.slice(0, 10));

    const completedJobs = jobs.filter(j => j.status === 'completed');
    const totalCost = completedJobs.reduce((sum, j) => sum + j.cost, 0);
    const totalPages = completedJobs.reduce((sum, j) => sum + j.pages, 0);
    const colorPages = completedJobs.filter(j => j.color_mode === 'color').reduce((sum, j) => sum + j.pages, 0);
    const bwPages = totalPages - colorPages;

    const today = new Date().toISOString().split('T')[0];
    const jobsToday = jobs.filter(j => j.submitted_at.startsWith(today));

    const scanJobs = storage.getScanJobs().filter(j =>
      role === "admin" ? true : j.branch === currentBranch
    );
    const scansToday = scanJobs.filter(j => j.scanned_at.startsWith(today));

    const localPrinters = storage.getPrinters().filter(p =>
      role === "admin" ? true : p.branch === currentBranch
    );
    const printers = localPrinters;

    const alerts = printers.filter(p => p.status !== "online" || (p.tonerLevel !== undefined && p.tonerLevel < 20));
    setPrinterAlerts(alerts);

    const deptStats: Record<string, number> = {};
    completedJobs.forEach(j => {
      deptStats[j.department] = (deptStats[j.department] || 0) + j.cost;
    });

    const last7Days = [...Array(7)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });

    const printVolumeData = last7Days.map(date => {
      const dayJobs = completedJobs.filter(j => j.submitted_at.startsWith(date));
      const dayScans = scanJobs.filter(j => j.scanned_at.startsWith(date));
      return {
        date: date.split('-').slice(1).join('/'),
        bw: dayJobs.filter(j => j.color_mode === 'bw').reduce((sum, j) => sum + j.pages, 0),
        color: dayJobs.filter(j => j.color_mode === 'color').reduce((sum, j) => sum + j.pages, 0),
        scans: dayScans.reduce((sum, j) => sum + j.pages, 0),
      };
    });

    const filteredStats = {
      kpis: {
        totalPrintsToday: jobsToday.length,
        totalScansToday: scansToday.length,
        activePrinters: printers.filter(p => p.status === 'online').length,
        totalPrinters: printers.length,
        scannerPrinters: printers.filter(p => p.canScan && p.status === 'online').length,
        costThisMonth: totalCost,
        paperSavedDuplex: completedJobs.filter(j => j.duplex).reduce((sum, j) => sum + j.pages, 0),
        pendingJobs: jobs.filter(j => j.status === 'queued' || j.status === 'printing').length,
      },
      departmentCostData: Object.entries(deptStats).map(([department, cost]) => ({ department, cost })),
      colorRatioData: [
        { name: 'B&W', value: bwPages, fill: 'hsl(var(--primary))' },
        { name: 'Color', value: colorPages, fill: 'hsl(var(--warning))' },
      ],
      printVolumeData,
    };

    setStats(filteredStats);
  }, [role, currentUserId, currentBranch]);

  const kpis = [
    { label: "Prints Today", value: stats.kpis.totalPrintsToday, icon: FileText, color: "text-primary" },
    { label: "Scans Today", value: stats.kpis.totalScansToday, icon: ScanLine, color: "text-success" },
    { label: "Active Printers", value: `${stats.kpis.activePrinters}/${stats.kpis.totalPrinters}`, icon: Printer, color: "text-primary" },
    { label: "Active Scanners", value: stats.kpis.scannerPrinters, icon: ScanLine, color: "text-success" },
    { label: "Cost This Month", value: `₹${stats.kpis.costThisMonth.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: IndianRupee, color: "text-warning" },
    { label: "Paper Saved (Duplex)", value: `${stats.kpis.paperSavedDuplex.toLocaleString()} pgs`, icon: Leaf, color: "text-success" },
    { label: "Pending Jobs", value: stats.kpis.pendingJobs, icon: Clock, color: "text-primary" },
    { label: "Printer Alerts", value: printerAlerts.length, icon: AlertTriangle, color: printerAlerts.length > 0 ? "text-destructive" : "text-muted-foreground" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">
          {role === "admin" ? "Admin Dashboard" : "My Dashboard"}
        </h1>
        <QuickPrint />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="shadow-none">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <kpi.icon className={`h-3 w-3 ${kpi.color}`} />
                <span className="text-2xs text-muted-foreground leading-tight">{kpi.label}</span>
              </div>
              <div className="text-base font-bold">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2 shadow-none">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm font-semibold">Print & Scan Volume (Last 7 Days)</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-2">
            <ChartContainer config={volumeChartConfig} className="h-[200px] w-full">
              <LineChart data={stats.printVolumeData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="bw" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="B&W Prints" />
                <Line type="monotone" dataKey="color" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} name="Color Prints" />
                <Line type="monotone" dataKey="scans" stroke="hsl(var(--success))" strokeWidth={2} dot={false} strokeDasharray="4 2" name="Scans" />
              </LineChart>
            </ChartContainer>
            <div className="flex gap-4 mt-1 justify-end">
              <span className="flex items-center gap-1 text-2xs text-muted-foreground"><span className="inline-block h-1.5 w-4 rounded bg-primary" /> B&W</span>
              <span className="flex items-center gap-1 text-2xs text-muted-foreground"><span className="inline-block h-1.5 w-4 rounded bg-warning" /> Color</span>
              <span className="flex items-center gap-1 text-2xs text-muted-foreground"><span className="inline-block h-1.5 w-4 rounded bg-success" /> Scans</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="p-3 pb-0">
            <CardTitle className="text-sm font-semibold">Color vs B&W Ratio</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-2 flex items-center justify-center">
            <ChartContainer config={ratioChartConfig} className="h-[200px] w-full">
              <PieChart>
                <Pie data={stats.colorRatioData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" nameKey="name">
                  {stats.colorRatioData.map((entry: any, idx: number) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartTooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Department Cost + Toner Alerts (admin) */}
      {role === "admin" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card className="shadow-none">
            <CardHeader className="p-3 pb-0">
              <CardTitle className="text-sm font-semibold">Department Costs</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-2">
              <ChartContainer config={deptChartConfig} className="h-[180px] w-full">
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
              <CardTitle className="text-sm font-semibold">Printer & Toner Alerts</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-2">
              {printerAlerts.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-success py-4">
                  <CheckCircle2 className="h-4 w-4" /> All printers operational
                </div>
              ) : (
                <div className="space-y-2">
                  {printerAlerts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-xs border rounded-md p-2">
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-muted-foreground text-2xs">{p.location}</div>
                        {p.tonerLevel < 20 && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-2xs text-destructive font-medium">Toner Low</span>
                            <Progress value={p.tonerLevel} className="h-1 w-16" />
                            <span className="text-2xs text-destructive">{p.tonerLevel}%</span>
                          </div>
                        )}
                      </div>
                      <Badge
                        variant={p.status === "offline" || p.status === "error" ? "destructive" : "secondary"}
                        className="text-2xs capitalize"
                      >
                        {p.status === "warning" && p.tonerLevel < 20 ? "Low Toner" : p.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Printer Toner Summary */}
      <Card className="shadow-none">
        <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Printer Ink / Toner Status</CardTitle>
          {agentPrinters.length > 0 && (
            <span className="text-2xs text-success flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />
              Live from print server ({agentPrinters.length} printers)
            </span>
          )}
        </CardHeader>
        <CardContent className="p-3 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(agentPrinters.length > 0 ? agentPrinters : storage.getPrinters().filter(p => role === "admin" ? true : p.branch === currentBranch))
              .map((p: any, idx: number) => {
                const isAgent = agentPrinters.length > 0;
                const name = isAgent ? (p.Name || p.name) : p.name;
                const model = isAgent ? (p.DriverName || p.model || "") : (p.model || "");
                const portName = isAgent ? (p.PortName || "") : "";
                const ipMatch = portName.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
                const ip = isAgent ? (ipMatch ? ipMatch[1] : portName) : (p.ip || "");
                const status = isAgent ? agentStatusToStr(p.PrinterStatus ?? 0) : (p.status || "online");
                const jobCount = isAgent ? (p.JobCount || 0) : (p.totalPrints || 0);
                const driver = (model).toLowerCase();
                const canScan = isAgent
                  ? driver.includes("mfp") || driver.includes("scan") || driver.includes("ufr") || driver.includes("c3")
                  : p.canScan;
                return (
                  <div key={isAgent ? (p.Name || idx) : p.id} className="border rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate">{name}</div>
                        <div className="text-2xs text-muted-foreground truncate">{isAgent ? (ip || model) : p.location}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-1">
                        {canScan && (
                          <Badge variant="outline" className="text-2xs px-1 py-0 text-success border-success/30">
                            <ScanLine className="h-2.5 w-2.5 mr-0.5" /> MFP
                          </Badge>
                        )}
                        <span className={`h-1.5 w-1.5 rounded-full ${status === 'online' ? 'bg-success' : status === 'warning' ? 'bg-warning' : 'bg-destructive'}`} />
                      </div>
                    </div>
                    {(() => {
                      const toner = isAgent ? p.toner : p.inkLevels;
                      if (toner && toner.black !== undefined) return (
                        <div className="space-y-1">
                          <InkBar label="K" value={toner.black} color="bg-gray-800 dark:bg-gray-200" />
                          {toner.cyan !== undefined && (
                            <>
                              <InkBar label="C" value={toner.cyan} color="bg-cyan-500" />
                              <InkBar label="M" value={toner.magenta ?? 0} color="bg-pink-500" />
                              <InkBar label="Y" value={toner.yellow ?? 0} color="bg-yellow-400" />
                            </>
                          )}
                        </div>
                      );
                      if (isAgent) return (
                        <div className="text-2xs text-muted-foreground italic py-0.5">
                          SNMP toner — enable on printer to see levels
                        </div>
                      );
                      return null;
                    })()}
                    <div className="flex items-center justify-between text-2xs text-muted-foreground pt-0.5 border-t">
                      <span>{isAgent ? (ip ? `IP: ${ip}` : model) : `Paper: ${p.paperLevel}%`}</span>
                      <span>{jobCount.toLocaleString()} {isAgent ? "jobs" : "total prints"}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card className="shadow-none">
        <CardHeader className="p-3 pb-0">
          <CardTitle className="text-sm font-semibold">Recent Print Jobs</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-2xs h-8">Document</TableHead>
                <TableHead className="text-2xs h-8">User</TableHead>
                <TableHead className="text-2xs h-8">Printer</TableHead>
                <TableHead className="text-2xs h-8">Pages</TableHead>
                <TableHead className="text-2xs h-8">Status</TableHead>
                <TableHead className="text-2xs h-8 text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                    No print jobs yet
                  </TableCell>
                </TableRow>
              ) : recentJobs.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="text-xs py-1.5 font-medium max-w-[180px] truncate">{job.document_name || job.documentName}</TableCell>
                  <TableCell className="text-xs py-1.5">{job.userName || 'User'}</TableCell>
                  <TableCell className="text-xs py-1.5 text-muted-foreground max-w-[140px] truncate">{job.printer_name || job.printerName || 'System Printer'}</TableCell>
                  <TableCell className="text-xs py-1.5">{job.pages}</TableCell>
                  <TableCell className="text-xs py-1.5">
                    <StatusBadge status={job.status} />
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-right">₹{job.cost.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function InkBar({ label, value, color }: { label: string; value: number; color: string }) {
  const textColor = value < 20 ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="flex items-center gap-1.5">
      <span className={`text-2xs font-mono font-bold w-3 ${textColor}`}>{label}</span>
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color} ${value < 20 ? 'opacity-100' : 'opacity-80'}`} style={{ width: `${value}%` }} />
      </div>
      <span className={`text-2xs font-medium w-7 text-right ${value < 20 ? 'text-destructive' : 'text-muted-foreground'}`}>{value}%</span>
    </div>
  );
}

function QuickPrint() {
  const { currentUserId } = useRole();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [colorMode, setColorMode] = useState("bw");
  const [duplex, setDuplex] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [pages, setPages] = useState(1);
  const [printers, setPrinters] = useState<any[]>([]);

  const handleStartScan = async () => {
    setScanning(true);
    setStep(2);
    try {
      const response = await fetch('/api/printers');
      if (!response.ok) throw new Error('API Error');
      const data = await response.json();
      const mapped = data.map((p: any) => ({
        ...p,
        icon: p.type === 'color' ? Wifi : Usb,
        color: 'text-success',
        typeDisplay: p.type === 'color' ? 'Color Network' : 'B&W'
      }));
      const localPrinters = storage.getPrinters().map(p => ({
        ...p,
        icon: Wifi,
        color: 'text-success',
        typeDisplay: p.type === 'color' ? 'Color Network' : 'B&W'
      }));
      const allPrinters = mapped.length > 0 ? mapped : localPrinters;
      setPrinters(allPrinters);
      if (allPrinters.length > 0) setSelectedPrinter(allPrinters[0].id);
    } catch {
      const localPrinters = storage.getPrinters().map(p => ({
        ...p,
        icon: Wifi,
        color: 'text-success',
        typeDisplay: p.type === 'color' ? 'Color Network' : 'B&W'
      }));
      setPrinters(localPrinters);
      if (localPrinters.length > 0) setSelectedPrinter(localPrinters[0].id);
    } finally {
      setScanning(false);
    }
  };

  const countPdfPages = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      if (file.type !== 'application/pdf') { resolve(1); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const matches = content.match(/\/Type\s*\/Page\b/g);
        resolve(matches ? matches.length : 1);
      };
      reader.readAsBinaryString(file);
    });
  };

  const printAuditSlip = (job: any, url?: string | null) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const isImage = file?.type.startsWith('image/');
    const isPdf = file?.type === 'application/pdf';
    const html = `<html><head><title>${job.document_name} - Print</title><style>
      body{margin:0;padding:0;font-family:sans-serif;}
      .doc{padding:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;}
      img{max-width:100%;max-height:100vh;height:auto;width:auto;display:block;object-fit:contain;}
      embed{width:100%;height:100vh;border:none;}
      @media print{.doc{margin:0;width:100%;height:100vh;}body{margin:0;}@page{margin:0;size:auto;}}
    </style></head><body>${url ? `<div class="doc">
      ${isImage ? `<img src="${url}" style="width:100%;display:block;" />` :
        isPdf ? `<embed src="${url}" type="application/pdf" width="100%" height="1100px" />` :
        `<div style="padding:50px;text-align:center;border:1px solid #eee;margin:20px;">
          <h1 style="font-size:1.5em;color:#333;">${job.document_name}</h1>
          <p style="color:#666;">Document ready for printing.</p>
        </div>`}</div>` : ''}
    <script>window.onload=function(){setTimeout(()=>{window.print();},800);}</script>
    </body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleUpload = () => {
    if (!file) { toast.error("Please select a file to print"); return; }

    const printer = printers.find(p => p.id === selectedPrinter) || printers[0];
    if (!printer) {
      toast.error("No printer selected", { description: "Please scan for printers first." });
      return;
    }

    setLoading(true);
    setTimeout(() => {
      try {
        const newJob = storage.addJob({
          user_id: currentUserId,
          document_name: file.name,
          color_mode: colorMode as 'bw' | 'color',
          duplex,
          pages,
          printer_name: printer?.name || 'Unknown Printer',
          printer_ip: printer?.ip,
          status: 'completed',
        });
        toast.success(`Sent to ${printer?.name} — printing ${pages} page${pages > 1 ? 's' : ''}`);
        printAuditSlip(newJob, previewUrl);
        setOpen(false);
        setFile(null);
        setStep(1);
        setPages(1);
        setSelectedPrinter(null);
        setTimeout(() => window.location.reload(), 800);
      } catch {
        toast.error("Print failed");
      } finally {
        setLoading(false);
      }
    }, 1200);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all active:scale-95">
          <Printer className="h-4 w-4 mr-2" /> Quick Print
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{step === 1 ? "1. Print Settings" : "2. Select Printer"}</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Select Document</Label>
              <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${file ? 'border-primary/50 bg-primary/5' : 'border-muted hover:border-primary/30'}`}>
                <input type="file" id="file-upload" className="hidden"
                  onChange={async (e) => {
                    const selectedFile = e.target.files?.[0] || null;
                    setFile(selectedFile);
                    if (selectedFile) {
                      if (previewUrl) URL.revokeObjectURL(previewUrl);
                      setPreviewUrl(URL.createObjectURL(selectedFile));
                      if (selectedFile.type === 'application/pdf') {
                        const count = await countPdfPages(selectedFile);
                        setPages(count);
                        toast.info(`Detected ${count} page${count > 1 ? 's' : ''} in PDF`);
                      } else {
                        setPages(1);
                      }
                    } else {
                      setPreviewUrl(null);
                    }
                  }}
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  {file ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 text-sm font-medium text-primary">
                        <CheckCircle2 className="h-4 w-4" /> {file.name}
                      </div>
                      {previewUrl && (
                        <div className="mt-2 border rounded overflow-hidden bg-background max-h-[120px] flex items-center justify-center">
                          {file.type.startsWith('image/') ? (
                            <img src={previewUrl} className="max-w-full max-h-[120px] object-contain" alt="Preview" />
                          ) : (
                            <div className="p-4 text-xs text-muted-foreground flex flex-col items-center gap-2">
                              <FileText className="h-8 w-8 text-primary/50" />
                              PDF — {pages} page{pages > 1 ? 's' : ''} detected
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground/40" />
                      <div className="text-sm text-muted-foreground">Click to upload or drag & drop</div>
                      <div className="text-2xs text-muted-foreground/60">PDF, images supported</div>
                    </div>
                  )}
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Color Mode</Label>
                <RadioGroup value={colorMode} onValueChange={setColorMode} className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="bw" id="bw" />
                    <Label htmlFor="bw" className="text-xs">B&W</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="color" id="color" />
                    <Label htmlFor="color" className="text-xs">Color</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Number of Pages</Label>
                <Input type="number" min={1} value={pages} onChange={e => setPages(parseInt(e.target.value) || 1)} className="h-8 text-xs" />
              </div>

              <div className="col-span-2 flex items-center justify-between">
                <Label htmlFor="duplex-mode" className="text-xs font-normal">Double Sided (Duplex)</Label>
                <Switch id="duplex-mode" checked={duplex} onCheckedChange={setDuplex} />
              </div>
            </div>

            <Button className="w-full" disabled={!file} onClick={handleStartScan}>
              <Search className="mr-2 h-4 w-4" /> Find Printers
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {scanning ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm font-medium">Detecting Company printers...</p>
                <p className="text-xs text-muted-foreground">Scanning network for connected devices</p>
              </div>
            ) : (
              <>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {printers.length === 0 ? (
                    <div className="text-center py-6 text-sm text-muted-foreground">No printers detected on network</div>
                  ) : printers.map(p => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer transition-colors ${selectedPrinter === p.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                      onClick={() => setSelectedPrinter(p.id)}
                    >
                      <div className={`h-2 w-2 rounded-full ${p.status === 'online' ? 'bg-success' : 'bg-warning'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{p.name}</div>
                        <div className="text-2xs text-muted-foreground">{p.location} · {p.ip}</div>
                      </div>
                      {p.canScan && (
                        <Badge variant="outline" className="text-2xs text-success border-success/30 shrink-0">
                          <ScanLine className="h-2.5 w-2.5 mr-0.5" /> MFP
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-2xs shrink-0">{p.type === 'color' ? 'Color' : 'B&W'}</Badge>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setStep(1)}>Back</Button>
                  <Button
                    className="flex-1"
                    disabled={loading || (!selectedPrinter && printers.length > 0)}
                    onClick={handleUpload}
                  >
                    {loading ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending to Printer...</>
                    ) : (
                      <><Printer className="h-4 w-4 mr-2" /> Print Now</>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
