import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useRole } from "@/contexts/RoleContext";
import { storage } from "@/lib/storage";
import type { ScanJob } from "@/lib/storage";
import { Search, ScanLine, RefreshCw, Plus, FileText, Mail, FolderOpen, Monitor } from "lucide-react";
import { toast } from "sonner";

const destinationIcon: Record<string, JSX.Element> = {
  email: <Mail className="h-3 w-3" />,
  folder: <FolderOpen className="h-3 w-3" />,
  app: <Monitor className="h-3 w-3" />,
};

const destinationLabel: Record<string, string> = {
  email: "Email",
  folder: "Network Folder",
  app: "App",
};

function formatFileSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ScanJobs() {
  const { role, currentUserId, currentBranch } = useRole();
  const [jobs, setJobs] = useState<ScanJob[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  function loadJobs() {
    setLoading(true);
    let all = storage.getScanJobs();
    if (role !== "admin") {
      all = all.filter(j => j.user_id === currentUserId || j.branch === currentBranch);
    }
    all.sort((a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime());
    setJobs(all);
    setLastSynced(new Date());
    setLoading(false);
  }

  useEffect(() => {
    loadJobs();
    const iv = setInterval(loadJobs, 30_000);
    return () => clearInterval(iv);
  }, [role, currentUserId, currentBranch]);

  const filtered = useMemo(() => {
    if (!search) return jobs;
    const q = search.toLowerCase();
    return jobs.filter(j =>
      j.document_name.toLowerCase().includes(q) ||
      j.userName.toLowerCase().includes(q) ||
      j.scanner_name.toLowerCase().includes(q) ||
      j.branch.toLowerCase().includes(q)
    );
  }, [jobs, search]);

  const totalPages = jobs.reduce((s, j) => s + j.pages, 0);
  const colorScans = jobs.filter(j => j.color_mode === 'color').length;
  const bwScans = jobs.filter(j => j.color_mode === 'bw').length;
  const today = new Date().toISOString().split('T')[0];
  const todayScans = jobs.filter(j => j.scanned_at.startsWith(today)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold">
          {role === "admin" ? "All Scan Jobs" : "My Scans"}
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
          <LogScanDialog
            open={logOpen}
            onOpenChange={setLogOpen}
            currentUserId={currentUserId}
            onLogged={() => { loadJobs(); toast.success("Scan recorded successfully"); }}
          />
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Scans Today", value: todayScans, color: "text-primary" },
          { label: "Total Scans", value: jobs.length, color: "text-foreground" },
          { label: "Total Pages", value: totalPages.toLocaleString(), color: "text-foreground" },
          { label: "Color / B&W", value: `${colorScans} / ${bwScans}`, color: "text-warning" },
        ].map(s => (
          <Card key={s.label} className="shadow-none">
            <CardContent className="p-3">
              <div className="text-2xs text-muted-foreground">{s.label}</div>
              <div className={`text-base font-bold mt-0.5 ${s.color}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by document, user, scanner…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 pl-7 text-xs"
            data-testid="input-search-scans"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      <Card className="shadow-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-2xs h-8">Document Name</TableHead>
              {role === "admin" && <TableHead className="text-2xs h-8">User</TableHead>}
              <TableHead className="text-2xs h-8">Scanner</TableHead>
              <TableHead className="text-2xs h-8">Pages</TableHead>
              <TableHead className="text-2xs h-8">Mode</TableHead>
              <TableHead className="text-2xs h-8">DPI</TableHead>
              <TableHead className="text-2xs h-8">Destination</TableHead>
              <TableHead className="text-2xs h-8">File Size</TableHead>
              {role === "admin" && <TableHead className="text-2xs h-8">Branch</TableHead>}
              <TableHead className="text-2xs h-8">Scanned At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-8">Loading…</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-12">
                  <ScanLine className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No scan records found. Use "Log Scan" to capture a scanned document.
                </TableCell>
              </TableRow>
            ) : filtered.map(job => (
              <TableRow key={job.id} data-testid={`row-scan-${job.id}`}>
                <TableCell className="text-xs py-1.5 font-medium max-w-[200px] truncate" title={job.document_name}>
                  <div className="flex items-center gap-1.5">
                    <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                    {job.document_name}
                  </div>
                </TableCell>
                {role === "admin" && (
                  <TableCell className="text-xs py-1.5">{job.userName}</TableCell>
                )}
                <TableCell className="text-xs py-1.5">
                  <div className="font-medium truncate max-w-[140px]">{job.scanner_name}</div>
                  {job.scanner_ip && <div className="text-2xs text-muted-foreground font-mono">{job.scanner_ip}</div>}
                </TableCell>
                <TableCell className="text-xs py-1.5">{job.pages}</TableCell>
                <TableCell className="text-xs py-1.5">
                  <Badge variant="outline" className="text-2xs">
                    {job.color_mode === "color" ? "Color" : "B&W"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs py-1.5 text-muted-foreground">{job.resolution} DPI</TableCell>
                <TableCell className="text-xs py-1.5">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    {destinationIcon[job.destination]}
                    {destinationLabel[job.destination] || job.destination}
                  </span>
                </TableCell>
                <TableCell className="text-xs py-1.5 text-muted-foreground">{formatFileSize(job.file_size)}</TableCell>
                {role === "admin" && (
                  <TableCell className="text-xs py-1.5 text-muted-foreground">{job.branch}</TableCell>
                )}
                <TableCell className="text-xs py-1.5 text-muted-foreground whitespace-nowrap">
                  {new Date(job.scanned_at).toLocaleDateString()}{" "}
                  {new Date(job.scanned_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function LogScanDialog({
  open,
  onOpenChange,
  currentUserId,
  onLogged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentUserId: string;
  onLogged: () => void;
}) {
  const printers = storage.getPrinters().filter(p => p.canScan);
  const [docName, setDocName] = useState("");
  const [pages, setPages] = useState(1);
  const [colorMode, setColorMode] = useState<"bw" | "color">("bw");
  const [duplex, setDuplex] = useState(false);
  const [resolution, setResolution] = useState("300");
  const [scannerId, setScannerId] = useState(printers[0]?.id || "");
  const [destination, setDestination] = useState<"email" | "folder" | "app">("app");
  const [saving, setSaving] = useState(false);

  const selectedScanner = printers.find(p => p.id === scannerId);

  const handleSubmit = () => {
    if (!docName.trim()) { toast.error("Document name is required"); return; }
    if (!scannerId) { toast.error("Please select a scanner"); return; }
    setSaving(true);
    setTimeout(() => {
      storage.addScanJob({
        user_id: currentUserId,
        document_name: docName.trim(),
        pages,
        color_mode: colorMode,
        duplex,
        resolution: parseInt(resolution),
        scanner_name: selectedScanner?.name || "Unknown Scanner",
        scanner_ip: selectedScanner?.ip,
        destination,
        status: "completed",
        file_size: pages * (colorMode === "color" ? 614400 : 204800),
      });
      setSaving(false);
      onOpenChange(false);
      setDocName("");
      setPages(1);
      setColorMode("bw");
      setDuplex(false);
      setResolution("300");
      onLogged();
    }, 800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-7 text-xs gap-1.5 bg-success hover:bg-success/90 text-white" data-testid="button-log-scan">
          <Plus className="h-3.5 w-3.5" /> Log Scan
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-4 w-4 text-success" /> Log Scanned Document
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Document Name <span className="text-destructive">*</span></Label>
            <Input
              placeholder="e.g. Contract_Vendor_May.pdf"
              value={docName}
              onChange={e => setDocName(e.target.value)}
              className="h-8 text-xs"
              data-testid="input-scan-docname"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Scanner</Label>
              <Select value={scannerId} onValueChange={setScannerId}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-scanner">
                  <SelectValue placeholder="Select scanner" />
                </SelectTrigger>
                <SelectContent>
                  {printers.map(p => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedScanner && (
                <div className="text-2xs text-muted-foreground">{selectedScanner.location} · {selectedScanner.ip}</div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Pages</Label>
              <Input
                type="number"
                min={1}
                value={pages}
                onChange={e => setPages(parseInt(e.target.value) || 1)}
                className="h-8 text-xs"
                data-testid="input-scan-pages"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Color Mode</Label>
              <RadioGroup value={colorMode} onValueChange={(v) => setColorMode(v as "bw" | "color")} className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="bw" id="scan-bw" />
                  <Label htmlFor="scan-bw" className="text-xs font-normal">B&W</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="color" id="scan-color" />
                  <Label htmlFor="scan-color" className="text-xs font-normal">Color</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Resolution</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="200" className="text-xs">200 DPI</SelectItem>
                  <SelectItem value="300" className="text-xs">300 DPI (Normal)</SelectItem>
                  <SelectItem value="600" className="text-xs">600 DPI (High)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Save To</Label>
              <Select value={destination} onValueChange={(v) => setDestination(v as any)}>
                <SelectTrigger className="h-8 text-xs" data-testid="select-destination">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="app" className="text-xs">App (This System)</SelectItem>
                  <SelectItem value="email" className="text-xs">Email</SelectItem>
                  <SelectItem value="folder" className="text-xs">Network Folder</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pt-5">
              <Switch id="scan-duplex" checked={duplex} onCheckedChange={setDuplex} />
              <Label htmlFor="scan-duplex" className="text-xs font-normal">Duplex Scan</Label>
            </div>
          </div>

          <Button
            className="w-full bg-success hover:bg-success/90 text-white"
            onClick={handleSubmit}
            disabled={saving || !docName.trim() || !scannerId}
            data-testid="button-submit-scan"
          >
            {saving ? (
              <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              <><ScanLine className="h-4 w-4 mr-2" /> Save Scan Record</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
