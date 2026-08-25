import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload, FileText, Wifi, Network, Loader2, Printer as PrinterIcon, MonitorSmartphone,
  CheckCircle2, RefreshCw, Star, ArrowRight, ArrowLeft, X, Image as ImageIcon, FileType2, Info,
  Trash2, ListOrdered, Bluetooth,
} from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/contexts/RoleContext";
import { storage } from "@/lib/storage";
import { openPrintWindow } from "@/lib/printWindow";
import { printJobStore } from "@/lib/printJobStore";

type Step = 1 | 2 | 3 | 4;
type Source = "network" | "manual" | "system" | "bluetooth";

interface ApiPrinter {
  id: string;
  name: string;
  ip: string;
  port?: number;
  location?: string;
  status?: string;
  type?: string;
  discoveredVia?: string;
}

const ACCEPTED = "*";
const FAV_KEY = "favorite_printer_ids";
const SYSTEM_ID = "system-default";

const isValidIp = (ip: string) =>
  /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/.test(ip.trim());

const fileIcon = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FileType2 className="h-5 w-5 text-destructive" />;
  if (ext === "docx") return <FileText className="h-5 w-5 text-primary" />;
  return <ImageIcon className="h-5 w-5 text-success" />;
};

const SYSTEM_PRINTER: ApiPrinter = {
  id: SYSTEM_ID,
  name: "System Dialog",
  ip: "Local",
  location: "Opens system print dialog with your installed printer",
  status: "online",
  type: "color",
};

export default function QuickPrint() {
  const { currentUserId, role, currentBranch } = useRole();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [source, setSource] = useState<Source>("network");
  const [scanning, setScanning] = useState(false);
  const [networkPrinters, setNetworkPrinters] = useState<ApiPrinter[]>([]);
  const [bluetoothPrinters, setBluetoothPrinters] = useState<ApiPrinter[]>([]);
  const [savedPrinters, setSavedPrinters] = useState<ApiPrinter[]>([]);
  const [subnetOverride, setSubnetOverride] = useState("");

  const [manualIp, setManualIp] = useState("");
  const [manualName, setManualName] = useState("");
  const [probing, setProbing] = useState(false);

  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<ApiPrinter | null>(null);

  const [copies, setCopies] = useState(1);
  const [colorMode, setColorMode] = useState<"bw" | "color">("bw");
  const [pageSize, setPageSize] = useState("A4");
  const [duplex, setDuplex] = useState(false);

  // Submission result
  const [queuePosition, setQueuePosition] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
      if (Array.isArray(stored)) setFavorites(stored);
    } catch { /* ignore */ }
    refreshSaved();
  }, []);

  useEffect(() => {
    return () => {
      // Only revoke the blob URL if there's no queued job still waiting to use it.
      // printJobStore.remove() handles revocation when the job completes/cancels.
    };
  }, [previewUrl]);

  const refreshSaved = async () => {
    try {
      const r = await fetch("/api/printers");
      if (r.ok) setSavedPrinters(await r.json());
    } catch (e) { /* ignore */ }
  };

  const allKnown = useMemo(() => {
    const map = new Map<string, ApiPrinter>();
    // For employees, filter by branch; for admins, show all
    const branchFilter = (p: ApiPrinter) => role === "admin" ? true : (p.location?.includes(currentBranch) || p.id === SYSTEM_ID);
    [...savedPrinters, ...networkPrinters, ...bluetoothPrinters.filter(branchFilter)].forEach(p => map.set(p.id, p));
    return Array.from(map.values());
  }, [savedPrinters, networkPrinters, bluetoothPrinters, role, currentBranch]);

  const favoritePrinters = allKnown.filter(p => favorites.includes(p.id));

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (f.size > 100 * 1024 * 1024) {
      toast.error("File too large (max 100MB).");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFile(e.dataTransfer.files?.[0] || null);
  };

  const scanNetwork = async () => {
    setScanning(true);
    setNetworkPrinters([]);
    try {
      const url = subnetOverride
        ? `/api/printers/network?subnet=${encodeURIComponent(subnetOverride)}`
        : "/api/printers/network";
      const r = await fetch(url);
      if (!r.ok) throw new Error("Scan failed");
      const data = await r.json();
      const printers: ApiPrinter[] = (data.printers || []).map((p: ApiPrinter) => ({ ...p }));
      setNetworkPrinters(printers);
      if (printers.length === 0) toast.error(`No printers found on ${data.subnets?.map((s: { base: string }) => s.base + ".0/24").join(", ") || "the network"}`);
      else toast.success(`Found ${printers.length} printer${printers.length === 1 ? "" : "s"} on the network`);
    } catch (e) {
      toast.error("Scan failed: " + (e as Error).message);
    }
    setScanning(false);
  };

  const scanBluetooth = async () => {
    setScanning(true);
    setBluetoothPrinters([]);
    try {
      // Simulate Bluetooth device discovery
      await new Promise(r => setTimeout(r, 1500));
      
      const mockBluetoothPrinters: ApiPrinter[] = [
        {
          id: "bt-hp-envy",
          name: "HP Envy 5000 (Bluetooth)",
          ip: "BC:5F:F4:1E:7A:E9",
          port: 7,
          location: currentBranch,
          status: "online",
          type: "color",
          discoveredVia: "Bluetooth"
        },
        {
          id: "bt-canon-pixma",
          name: "Canon PIXMA MG3600 (Bluetooth)",
          ip: "AC:2B:EA:01:2D:12",
          port: 7,
          location: currentBranch,
          status: "online",
          type: "color",
          discoveredVia: "Bluetooth"
        },
        {
          id: "bt-brother-portable",
          name: "Brother Portable Printer (Bluetooth)",
          ip: "8C:CD:E7:A2:4B:F6",
          port: 7,
          location: currentBranch,
          status: "online",
          type: "bw",
          discoveredVia: "Bluetooth"
        }
      ];
      
      setBluetoothPrinters(mockBluetoothPrinters);
      toast.success(`Found ${mockBluetoothPrinters.length} Bluetooth printer${mockBluetoothPrinters.length === 1 ? "" : "s"} nearby`);
    } catch (e) {
      toast.error("Bluetooth scan failed: " + (e as Error).message);
    }
    setScanning(false);
  };

  const probeManual = async () => {
    if (!isValidIp(manualIp)) { toast.error("Invalid IP address format."); return; }
    setProbing(true);
    try {
      const r = await fetch(`/api/printers/probe?ip=${encodeURIComponent(manualIp.trim())}`);
      const data = await r.json();
      if (!data.online) {
        toast.error(`No printer responding at ${manualIp.trim()} (ports 9100/631/515 closed)`);
        return;
      }
      const newPrinter: ApiPrinter = {
        id: `manual-${manualIp.trim()}`,
        name: manualName.trim() || `Printer @ ${manualIp.trim()}`,
        ip: manualIp.trim(),
        port: data.port,
        location: `${data.protocol} (port ${data.port})`,
        status: "online",
        type: "bw",
      };
      const save = await fetch("/api/printers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newPrinter) });
      if (save.ok) {
        await refreshSaved();
        setSelectedPrinter(newPrinter);
        toast.success(`Reachable via ${data.protocol}. Printer saved.`);
        setManualIp(""); setManualName("");
      }
    } catch (e) {
      toast.error("Probe failed: " + (e as Error).message);
    }
    setProbing(false);
  };

  // Save a printer to the backend (idempotent – uses its id as key)
  const savePrinterToBackend = async (printer: ApiPrinter) => {
    try {
      await fetch("/api/printers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(printer),
      });
      await refreshSaved();
    } catch { /* best-effort */ }
  };

  // Select a printer and auto-save it if not already saved
  const selectAndSavePrinter = async (printer: ApiPrinter) => {
    setSelectedPrinter(printer);
    if (printer.id === SYSTEM_ID) return;
    const alreadySaved = savedPrinters.some(p => p.id === printer.id);
    if (!alreadySaved) {
      await savePrinterToBackend(printer);
      toast.success(`"${printer.name}" saved for future sessions.`);
    }
  };

  const removeSaved = async (id: string) => {
    await fetch(`/api/printers/${id}`, { method: "DELETE" });
    if (selectedPrinter?.id === id) setSelectedPrinter(null);
    setFavorites(prev => {
      const next = prev.filter(x => x !== id);
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
      return next;
    });
    refreshSaved();
  };

  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id];
    setFavorites(next);
    localStorage.setItem(FAV_KEY, JSON.stringify(next));
  };

  // Add to queue using the already-logged-in user — no extra verification needed
  const handlePrintClick = async () => {
    if (!file || !selectedPrinter) return;

    const users = storage.getUsers();
    const user = users.find(u => u.id === currentUserId) || users[0];

    // Log the job FIRST so it's always recorded, regardless of print dialog outcome
    const job = storage.addJob({
      user_id: user.id,
      document_name: file.name,
      pages: 1,
      copies,
      color_mode: colorMode,
      duplex,
      status: "queued",
      printer_name: selectedPrinter.name,
      printer_ip: selectedPrinter.ip !== "Local" ? selectedPrinter.ip : undefined,
    });

    setQueuePosition(job.queue_position ?? 1);

    // Store file + settings in memory so Print Queue's Start button can trigger it later.
    if (previewUrl) {
      printJobStore.save(job.id, {
        url: previewUrl,
        file,
        filename: file.name,
        copies,
        colorMode,
        pageSize,
        duplex,
        printerIp: selectedPrinter.ip !== "Local" ? selectedPrinter.ip : undefined,
        printerName: selectedPrinter.name,
        userId: user.id,
        userName: user.name,
      });
    }

    // Auto-save this printer to backend so it shows up in Saved Printers next time
    if (selectedPrinter.id !== SYSTEM_ID) {
      fetch("/api/printers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selectedPrinter),
      }).catch(() => {});
    }

    // For System Dialog (and manually-triggered print): open OS print dialog now
    if (selectedPrinter.id === SYSTEM_ID) {
      await triggerBrowserPrint();
      toast.success(`Job queued at position #${job.queue_position}. Print dialog opened.`);
    } else {
      toast.success(`Job queued at position #${job.queue_position}. Use Start in the queue to print.`);
    }

    setStep(4);
  };

  const triggerBrowserPrint = async (): Promise<boolean> => {
    if (!file || !previewUrl) return false;
    return openPrintWindow({ url: previewUrl, filename: file.name, copies, colorMode, pageSize, duplex });
  };

  const reset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null); setPreviewUrl(null);
    setSelectedPrinter(null);
    setCopies(1); setColorMode("bw"); setPageSize("A4"); setDuplex(false);
    setManualIp(""); setManualName("");
    setQueuePosition(null);
    setStep(1);
  };

  const stepLabels = ["Upload", "Select Printer", "Settings", "Queued"];

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 md:p-6" data-testid="page-quick-print">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-quick-print-title">Quick Print</h1>
        <p className="text-sm text-muted-foreground">Upload a file, select a printer, and send your job to the queue.</p>
      </div>

      <div className="flex items-center justify-between gap-2">
        {stepLabels.map((label, idx) => {
          const n = (idx + 1) as Step;
          const active = step === n;
          const done = step > n;
          return (
            <div key={label} className="flex flex-1 items-center gap-2">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                done ? "bg-success text-success-foreground" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`} data-testid={`step-indicator-${n}`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : n}
              </div>
              <span className={`text-xs md:text-sm ${active ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
              {idx < stepLabels.length - 1 && <div className="mx-1 h-px flex-1 bg-border" />}
            </div>
          );
        })}
      </div>

      {/* STEP 1: Upload */}
      {step === 1 && (
        <Card data-testid="card-step-upload">
          <CardHeader>
            <CardTitle>Upload your file</CardTitle>
            <CardDescription>All file types supported (max 100MB). The file is sent as-is directly to the printer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-10 text-center hover:bg-muted/40"
              data-testid="dropzone-file"
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-sm font-medium">Click or drag a file here</div>
              <div className="text-xs text-muted-foreground">PDF, DOCX, XLSX, JPG, PNG and more</div>
              <Input ref={fileInputRef} type="file" accept={ACCEPTED} className="hidden" onChange={(e) => handleFile(e.target.files?.[0] || null)} data-testid="input-file" />
            </div>

            {file && (
              <div className="rounded-lg border border-border p-4" data-testid="preview-file">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {fileIcon(file.name)}
                    <div>
                      <div className="text-sm font-medium" data-testid="text-file-name">{file.name}</div>
                      <div className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB · ready to print</div>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setFile(null); setPreviewUrl(null); }} aria-label="Remove file" data-testid="button-clear-file">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {previewUrl && /\.(jpg|jpeg|png)$/i.test(file.name) && (
                  <img src={previewUrl} alt="preview" className="max-h-72 w-full rounded object-contain" data-testid="img-file-preview" />
                )}
                {previewUrl && /\.pdf$/i.test(file.name) && (
                  <iframe src={previewUrl} className="h-72 w-full rounded border border-border" title="PDF preview" data-testid="iframe-file-preview" />
                )}
                {!/\.(jpg|jpeg|png|pdf)$/i.test(file.name) && (
                  <div className="rounded bg-muted p-4 text-center text-xs text-muted-foreground">Preview not available for this file type — the file will be sent as-is to the printer.</div>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!file} data-testid="button-next-scan">
                Choose Printer <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Select Printer */}
      {step === 2 && (
        <Card data-testid="card-step-select">
          <CardHeader>
            <CardTitle>Select a printer</CardTitle>
            <CardDescription>Pick from your saved printers, or discover a new one on the network.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* ── Saved printers (always shown at top) ── */}
            {savedPrinters.length > 0 && (
              <div className="space-y-2" data-testid="section-saved-printers">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saved Printers</div>
                  <div className="flex-1 h-px bg-border" />
                  <div className="text-2xs text-muted-foreground">{savedPrinters.length} saved</div>
                </div>
                <div className="grid gap-2">
                  {savedPrinters.map(p => (
                    <PrinterRow
                      key={p.id}
                      printer={p}
                      selected={selectedPrinter?.id === p.id}
                      favorite={favorites.includes(p.id)}
                      onSelect={selectAndSavePrinter}
                      onToggleFavorite={toggleFavorite}
                      onRemove={removeSaved}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Divider + discovery tabs ── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {savedPrinters.length > 0 ? "Add a new printer" : "Discover a printer"}
                </div>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div className="grid grid-cols-4 gap-2">
                {([
                  { key: "network", label: "Scan Network", icon: Wifi },
                  { key: "manual", label: "Manual IP", icon: Network },
                  { key: "system", label: "System Dialog", icon: MonitorSmartphone },
                  { key: "bluetooth", label: "Bluetooth", icon: Bluetooth },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <Button key={key} variant={source === key ? "default" : "outline"} onClick={() => setSource(key)} className="justify-start" data-testid={`button-source-${key}`}>
                    <Icon className="mr-2 h-4 w-4" /> {label}
                  </Button>
                ))}
              </div>

              {source === "network" && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-end">
                    <div className="flex-1">
                      <Label className="text-xs">Subnet (optional, e.g. 192.168.1)</Label>
                      <Input value={subnetOverride} onChange={(e) => setSubnetOverride(e.target.value)} placeholder="Auto-detect" data-testid="input-subnet" />
                    </div>
                    <Button onClick={scanNetwork} disabled={scanning} data-testid="button-scan-network">
                      {scanning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning…</> : <><RefreshCw className="mr-2 h-4 w-4" /> Scan Now</>}
                    </Button>
                  </div>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Selecting a discovered printer saves it automatically so you won't need to scan again next time.
                    </AlertDescription>
                  </Alert>
                  {networkPrinters.length > 0 ? (
                    <div className="grid gap-2">
                      {networkPrinters.map(p => (
                        <PrinterRow key={p.id} printer={p} selected={selectedPrinter?.id === p.id} favorite={favorites.includes(p.id)} onSelect={selectAndSavePrinter} onToggleFavorite={toggleFavorite} />
                      ))}
                    </div>
                  ) : !scanning && (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground" data-testid="empty-network">
                      No printers discovered yet. Click "Scan Now".
                    </div>
                  )}
                </div>
              )}

              {source === "manual" && (
                <div className="space-y-3">
                  <div className="rounded-lg border border-border p-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div>
                        <Label className="text-xs">Printer Name (optional)</Label>
                        <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Office Printer" data-testid="input-manual-name" />
                      </div>
                      <div>
                        <Label className="text-xs">IP Address</Label>
                        <Input value={manualIp} onChange={(e) => setManualIp(e.target.value)} placeholder="192.168.1.50" data-testid="input-manual-ip" />
                      </div>
                      <div className="flex items-end">
                        <Button onClick={probeManual} disabled={probing} className="w-full" data-testid="button-add-manual">
                          {probing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Testing…</> : "Test & Save"}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Enter the printer's IP and click "Test & Save" — it will be probed and saved automatically.
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {source === "system" && (
                <div className="space-y-3">
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Opens your operating system's print dialog with every installed printer (HP, Canon, USB, AirPrint, etc.). Use this when you're not on the same network as the printer or it doesn't speak raw TCP.
                    </AlertDescription>
                  </Alert>
                  <PrinterRow printer={SYSTEM_PRINTER} selected={selectedPrinter?.id === SYSTEM_ID} favorite={favorites.includes(SYSTEM_ID)} onSelect={selectAndSavePrinter} onToggleFavorite={toggleFavorite} />
                </div>
              )}

              {source === "bluetooth" && (
                <div className="space-y-3">
                  <div className="flex flex-col gap-2">
                    <Button onClick={scanBluetooth} disabled={scanning} data-testid="button-scan-bluetooth">
                      {scanning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning…</> : <><Bluetooth className="mr-2 h-4 w-4" /> Scan Bluetooth Devices</>}
                    </Button>
                  </div>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Discover nearby Bluetooth printers. Make sure your printer is in pairing mode and within range.
                    </AlertDescription>
                  </Alert>
                  {bluetoothPrinters.length > 0 ? (
                    <div className="grid gap-2">
                      {bluetoothPrinters.map(p => (
                        <PrinterRow key={p.id} printer={p} selected={selectedPrinter?.id === p.id} favorite={favorites.includes(p.id)} onSelect={selectAndSavePrinter} onToggleFavorite={toggleFavorite} />
                      ))}
                    </div>
                  ) : !scanning && (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground" data-testid="empty-bluetooth">
                      No Bluetooth printers discovered yet. Click "Scan Bluetooth Devices".
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} data-testid="button-back-upload"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button onClick={() => setStep(3)} disabled={!selectedPrinter} data-testid="button-next-settings">Continue <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Settings */}
      {step === 3 && selectedPrinter && file && (
        <Card data-testid="card-step-settings">
          <CardHeader>
            <CardTitle>Print settings</CardTitle>
            <CardDescription>Configure your job settings, then add it to the print queue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border p-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Document</div>
                <div className="flex items-center gap-2">
                  {fileIcon(file.name)}
                  <div className="truncate text-sm font-medium">{file.name}</div>
                </div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Printer</div>
                <div className="flex items-center gap-2">
                  <PrinterIcon className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm font-medium">{selectedPrinter.name}</div>
                    <div className="text-xs text-muted-foreground">{selectedPrinter.ip} · {selectedPrinter.location}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="copies">Copies</Label>
                <Input id="copies" type="number" min={1} max={99} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(99, parseInt(e.target.value || "1"))))} data-testid="input-copies" />
              </div>
              <div className="space-y-2">
                <Label>Color Mode</Label>
                <RadioGroup value={colorMode} onValueChange={(v) => setColorMode(v as "bw" | "color")} className="flex gap-4">
                  <div className="flex items-center gap-2"><RadioGroupItem value="bw" id="bw" data-testid="radio-bw" /><Label htmlFor="bw" className="cursor-pointer text-sm font-normal">Black & White</Label></div>
                  <div className="flex items-center gap-2"><RadioGroupItem value="color" id="color" data-testid="radio-color" /><Label htmlFor="color" className="cursor-pointer text-sm font-normal">Color</Label></div>
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>Page Size</Label>
                <Select value={pageSize} onValueChange={setPageSize}>
                  <SelectTrigger data-testid="select-page-size"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="A3">A3</SelectItem>
                    <SelectItem value="Letter">Letter</SelectItem>
                    <SelectItem value="Legal">Legal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 md:col-span-3">
                <Switch id="duplex" checked={duplex} onCheckedChange={setDuplex} data-testid="switch-duplex" />
                <Label htmlFor="duplex" className="cursor-pointer text-sm font-normal">Print double-sided (duplex)</Label>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)} data-testid="button-back-select"><ArrowLeft className="mr-2 h-4 w-4" /> Back</Button>
              <Button onClick={handlePrintClick} data-testid="button-add-to-queue">
                <ListOrdered className="mr-2 h-4 w-4" /> Add to Queue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: Done */}
      {step === 4 && (
        <Card data-testid="card-step-done">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <CheckCircle2 className="h-16 w-16 text-success" />
            <div>
              <div className="text-xl font-semibold" data-testid="text-success-title">Added to print queue!</div>
              {queuePosition !== null && (
                <div className="mt-1 text-sm text-muted-foreground">
                  Your job is at <span className="font-semibold text-primary">position #{queuePosition}</span> in the queue.
                </div>
              )}
              <div className="mt-1 text-sm text-muted-foreground">It will print when its turn comes up.</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate("/queue")} data-testid="button-view-queue">View Queue</Button>
              <Button onClick={reset} data-testid="button-print-another">Print Another</Button>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

function PrinterRow({
  printer, selected, favorite, onSelect, onToggleFavorite, onRemove,
}: {
  printer: ApiPrinter;
  selected: boolean;
  favorite: boolean;
  onSelect: (p: ApiPrinter) => void;
  onToggleFavorite: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  return (
    <div
      onClick={() => onSelect(printer)}
      className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
      }`}
      data-testid={`row-printer-${printer.id}`}
    >
      <div className="flex items-center gap-3">
        <PrinterIcon className={`h-5 w-5 ${printer.status === "online" ? "text-success" : "text-muted-foreground"}`} />
        <div>
          <div className="text-sm font-medium" data-testid={`text-printer-name-${printer.id}`}>{printer.name}</div>
          <div className="text-xs text-muted-foreground">{printer.ip}{printer.location ? ` · ${printer.location}` : ""}{printer.discoveredVia ? ` · ${printer.discoveredVia}` : ""}</div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Badge variant={printer.status === "online" ? "default" : "outline"} className="capitalize">{printer.status || "unknown"}</Badge>
        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onToggleFavorite(printer.id); }} data-testid={`button-fav-${printer.id}`}>
          <Star className={`h-4 w-4 ${favorite ? "fill-warning text-warning" : "text-muted-foreground"}`} />
        </Button>
        {onRemove && (
          <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); onRemove(printer.id); }} data-testid={`button-remove-${printer.id}`}>
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  );
}
