import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Lock, Shield, Printer, Copy, Server, Wifi, WifiOff, RefreshCw, Eye, EyeOff, Monitor, CheckCircle2, ClipboardCopy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const [settings, setSettings] = useState({
    // Access Control
    outsideRequestsBlocked: true,
    // RFID Authentication
    rfidEnabled: true,
    // Approval Workflow
    requireApproval: false,
    // Secure Print
    requirePinAtPrinter: true,
    autoCancel: true,
    autoCancelTime: "120", // 2 hours in minutes
    // Watermark
    watermarkEnabled: false,
    // Confidential
    confidentialMode: false,
    // Scanner
    scannerEnabled: true,
    scanToEmail: true,
    colorScanning: true,
    duplexScanning: false,
    scanResolution: "300",
  });

  const toggle = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateValue = (key: keyof typeof settings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const [agentUrl, setAgentUrl] = useState("");
  const [agentKey, setAgentKey] = useState("");
  const [snmpCommunity, setSnmpCommunity] = useState("public");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [savingAgent, setSavingAgent] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then(r => r.json()).then(d => {
      if (d.agentUrl) setAgentUrl(d.agentUrl);
      if (d.agentKey) setAgentKey(d.agentKey);
      if (d.snmpCommunity) setSnmpCommunity(d.snmpCommunity);
    }).catch(() => {});
  }, []);

  const testConnection = async () => {
    setTestStatus("testing");
    try {
      const params = new URLSearchParams({ url: agentUrl });
      if (agentKey) params.set("key", agentKey);
      const res = await fetch(`/api/agent/health?${params}`);
      const data = await res.json();
      if (data.ok) {
        setTestStatus("ok");
        toast.success(`Connected to ${data.host || "agent"} — agent is online`);
      } else {
        setTestStatus("fail");
        toast.error(data.error || "Agent responded but returned an error");
      }
    } catch {
      setTestStatus("fail");
      toast.error("Could not reach the agent — check the URL and that agent.js is running");
    }
  };

  const saveAgentSettings = async () => {
    setSavingAgent(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentUrl, agentKey, snmpCommunity }),
      });
      toast.success("Print Server settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSavingAgent(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">System Settings & Printer Control</h1>

      {/* Print Server Connection */}
      <Card className="shadow-none border-primary/20">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" />
            Print Server Connection
            <Badge variant="outline" className="text-xs ml-auto">Windows Agent</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <p className="text-xs text-muted-foreground">
            Connect to the PrintGuard Agent running on your Windows Print Server (<strong>DenasaDC</strong>).
            Copy <code className="bg-muted px-1 rounded text-[10px]">agent/agent.js</code> to the server and run <code className="bg-muted px-1 rounded text-[10px]">node agent.js</code>.
          </p>
          <div className="space-y-2">
            <label className="text-xs font-medium">Agent URL</label>
            <Input
              className="h-8 text-xs"
              placeholder="http://192.168.0.90:7171"
              value={agentUrl}
              onChange={e => { setAgentUrl(e.target.value); setTestStatus("idle"); }}
              data-testid="input-agent-url"
            />
            <p className="text-[10px] text-muted-foreground">IP address or hostname of your Windows Print Server, port 7171</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">API Key <span className="text-muted-foreground font-normal">(optional)</span></label>
            <div className="relative">
              <Input
                className="h-8 text-xs pr-8"
                type={showKey ? "text" : "password"}
                placeholder="Leave blank if no key is set on the agent"
                value={agentKey}
                onChange={e => setAgentKey(e.target.value)}
                data-testid="input-agent-key"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowKey(v => !v)}
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">Set <code className="bg-muted px-1 rounded">PRINTGUARD_API_KEY</code> env var on the agent to enable key protection</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium">SNMP Community String</label>
            <Input
              className="h-8 text-xs font-mono"
              placeholder="public"
              value={snmpCommunity}
              onChange={e => setSnmpCommunity(e.target.value)}
              data-testid="input-snmp-community"
            />
            <p className="text-[10px] text-muted-foreground">Used to fetch live ink/toner levels directly from printers via SNMP. Default is <code className="bg-muted px-1 rounded">public</code>.</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={saveAgentSettings}
              disabled={savingAgent}
              data-testid="button-save-agent"
            >
              {savingAgent ? <RefreshCw className="h-3 w-3 animate-spin" /> : null}
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={testConnection}
              disabled={testStatus === "testing" || !agentUrl}
              data-testid="button-test-agent"
            >
              {testStatus === "testing" ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : testStatus === "ok" ? (
                <Wifi className="h-3 w-3 text-green-600" />
              ) : testStatus === "fail" ? (
                <WifiOff className="h-3 w-3 text-destructive" />
              ) : (
                <Wifi className="h-3 w-3" />
              )}
              {testStatus === "testing" ? "Testing…" : testStatus === "ok" ? "Connected" : testStatus === "fail" ? "Failed" : "Test Connection"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Access Control */}
      <Card className="shadow-none">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Access Control
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <SettingRow
            label="Outside requests blocked"
            desc="Only registered employees with a valid Employee ID + RFID can submit jobs to the queue. All other requests are rejected before they reach the printer."
            checked={settings.outsideRequestsBlocked}
            onChange={() => toggle("outsideRequestsBlocked")}
            badge="Enforced"
          />
        </CardContent>
      </Card>

      {/* RFID / Card Authentication */}
      <Card className="shadow-none">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4" />
            RFID / Card Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <SettingRow
            label="Enable RFID Authentication"
            desc="Allow employees to authenticate at the printer by tapping their RFID badge or NFC card instead of entering a PIN."
            checked={settings.rfidEnabled}
            onChange={() => toggle("rfidEnabled")}
            badge={settings.rfidEnabled ? "Active" : "Coming Soon"}
          />
        </CardContent>
      </Card>

      {/* Approval Workflow */}
      <Card className="shadow-none">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm font-semibold">Approval Workflow</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <SettingRow
            label="Require Admin Approval"
            desc="Every queued job needs admin sign-off before it prints."
            checked={settings.requireApproval}
            onChange={() => toggle("requireApproval")}
          />
        </CardContent>
      </Card>

      {/* Secure Print */}
      <Card className="shadow-none">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Printer className="w-4 h-4" />
            Secure Print
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-4">
          <SettingRow
            label="Require PIN at printer to release"
            desc="Employees must enter their PIN at the physical printer before pages come out"
            checked={settings.requirePinAtPrinter}
            onChange={() => toggle("requirePinAtPrinter")}
            badge="Enabled"
          />
          <Separator />
          <div className="space-y-3">
            <SettingRow
              label="Auto-cancel uncollected jobs"
              desc="Remove jobs from queue if not released within set time"
              checked={settings.autoCancel}
              onChange={() => toggle("autoCancel")}
              badge="Enabled"
            />
            {settings.autoCancel && (
              <div className="ml-0 pl-0 space-y-2">
                <label className="text-xs font-medium">Time to auto-cancel:</label>
                <div className="flex items-center gap-2">
                  <Select value={settings.autoCancelTime} onValueChange={(val) => updateValue("autoCancelTime", val)}>
                    <SelectTrigger className="w-32 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                      <SelectItem value="180">3 hours</SelectItem>
                      <SelectItem value="240">4 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <Separator />
          <SettingRow
            label="Watermark all documents"
            desc="Stamp printed pages with employee name and timestamp"
            checked={settings.watermarkEnabled}
            onChange={() => toggle("watermarkEnabled")}
          />
          <Separator />
          <SettingRow
            label="Confidential print mode"
            desc="Document name hidden in queue and logs — shown only as 'Confidential'"
            checked={settings.confidentialMode}
            onChange={() => toggle("confidentialMode")}
          />
        </CardContent>
      </Card>

      {/* Scanner Control */}
      <Card className="shadow-none">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Copy className="w-4 h-4" />
            Scanner Control
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 space-y-3">
          <SettingRow
            label="Enable scanner"
            desc="Allow employees to scan documents from the printer"
            checked={settings.scannerEnabled}
            onChange={() => toggle("scannerEnabled")}
            badge="Enabled"
          />
          <Separator />
          <SettingRow
            label="Scan to email"
            desc="Send scanned documents directly to the employee's registered email"
            checked={settings.scanToEmail}
            onChange={() => toggle("scanToEmail")}
            badge="Enabled"
          />
          <Separator />
          <SettingRow
            label="Color scanning"
            desc="Allow scanning in full colour (disabling forces greyscale)"
            checked={settings.colorScanning}
            onChange={() => toggle("colorScanning")}
            badge="Enabled"
          />
          <Separator />
          <SettingRow
            label="Duplex scanning"
            desc="Scan both sides of the document automatically"
            checked={settings.duplexScanning}
            onChange={() => toggle("duplexScanning")}
          />
          <Separator />
          <div className="space-y-2">
            <label className="text-xs font-medium">Scan resolution:</label>
            <Select value={settings.scanResolution} onValueChange={(val) => updateValue("scanResolution", val)}>
              <SelectTrigger className="w-40 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="200">200 DPI</SelectItem>
                <SelectItem value="300">300 DPI (Normal)</SelectItem>
                <SelectItem value="600">600 DPI (High Quality)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Higher DPI = sharper image, larger file</p>
          </div>
        </CardContent>
      </Card>

      {/* Kiosk Setup & GPO Guide */}
      <KioskSetupGuide agentUrl={agentUrl} />

      {/* Roles & Permissions */}
      <Card className="shadow-none">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm font-semibold">Roles & Permissions</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="space-y-2">
            {[
              { role: "Admin", perms: ["Full system access", "User management", "Policy control", "Reports", "RFID config", "Scanner settings"] },
              { role: "Employee", perms: ["Submit print jobs", "View own history", "Release jobs at printer", "Scan documents", "RFID auth"] },
            ].map(r => (
              <div key={r.role} className="flex items-start gap-3 border rounded-md p-2">
                <Badge variant="outline" className="text-2xs mt-0.5">{r.role}</Badge>
                <div className="flex flex-wrap gap-1">
                  {r.perms.map(p => (
                    <span key={p} className="text-2xs bg-muted px-1.5 py-0.5 rounded">{p}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KioskSetupGuide({ agentUrl }: { agentUrl: string }) {
  const [printerName, setPrinterName] = useState("");
  const base = typeof window !== "undefined" ? window.location.origin : "http://localhost:5001";
  const kioskUrl = printerName
    ? `${base}/kiosk?printer=${encodeURIComponent(printerName)}`
    : `${base}/kiosk`;

  function copyUrl() {
    navigator.clipboard.writeText(kioskUrl);
    toast.success("Kiosk URL copied to clipboard");
  }

  const gpoSteps = [
    {
      n: "1",
      title: "Create a shared printer queue on the Print Server",
      detail: 'Right-click "Devices and Printers" → Add Printer → Local → Create new port (or use existing). Name it "PrintGuard Secure – [Printer Name]". Tick "Share this printer" and give it a share name (e.g. PGSecure-C3020).',
    },
    {
      n: "2",
      title: "Enable Auto-Hold on the agent",
      detail: 'On the Print Server, set env var PRINTGUARD_AUTO_HOLD=true before starting agent.js. Every job sent to ANY queue will be automatically paused the moment it arrives — no client-side config needed.',
      code: "set PRINTGUARD_AUTO_HOLD=true\nnode agent.js",
    },
    {
      n: "3",
      title: "Deploy the printer to all PCs via Group Policy",
      detail: 'Open Group Policy Management (gpmc.msc) → Your Domain OU → Edit GPO → User Configuration → Windows Settings → Deployed Printers → Add the \\\\PrintServer\\PGSecure-C3020 share. Link the GPO to the Users OU. All 1000 PCs get the printer pushed automatically overnight (or on next login). Zero manual work.',
      code: "\\\\DenasaDC\\PGSecure-C3020",
    },
    {
      n: "4",
      title: "Set user PINs in PrintGuard",
      detail: 'Go to User Management → Auto-generate PINs (one click assigns all users). Share each employee their PIN (email, SMS, or printed slip). Optionally bulk-export via "Export CSV" for Canon iR import.',
    },
    {
      n: "5",
      title: "Place kiosk tablet at each printer",
      detail: 'On a tablet or small PC next to each physical printer, open a browser in full-screen/kiosk mode pointed at the URL below. Use the printer name as the ?printer= filter. Users walk up, enter Employee ID + PIN, tap Print — done.',
    },
  ];

  return (
    <Card className="shadow-none border-primary/20">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Monitor className="w-4 h-4 text-primary" />
          Secure Print Setup Guide
          <Badge className="ml-auto text-xs bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">
            No PC config needed
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-4">
        <p className="text-xs text-muted-foreground">
          Deploy secure print to all 1000 users in one Group Policy rule — no manual setup on individual PCs.
          Jobs are held on the print server; users release at a tablet kiosk next to each printer.
        </p>

        {/* Steps */}
        <div className="space-y-3">
          {gpoSteps.map(step => (
            <div key={step.n} className="flex gap-3">
              <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                {step.n}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{step.title}</p>
                <p className="text-2xs text-muted-foreground mt-0.5">{step.detail}</p>
                {step.code && (
                  <div className="mt-1.5 flex items-start gap-2 bg-muted rounded-md px-2.5 py-2">
                    <code className="text-[10px] font-mono text-foreground flex-1 whitespace-pre">{step.code}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(step.code!); toast.success("Copied"); }}
                      className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                      title="Copy"
                    >
                      <ClipboardCopy className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <Separator />

        {/* Kiosk URL Generator */}
        <div className="space-y-2">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            Kiosk URL Generator
          </p>
          <p className="text-2xs text-muted-foreground">
            Each tablet at a printer gets its own URL pre-filtered to that printer's queue.
          </p>
          <div className="flex gap-2 items-center">
            <Input
              className="h-8 text-xs"
              placeholder="Printer name (e.g. Canon iR C3020)"
              value={printerName}
              onChange={e => setPrinterName(e.target.value)}
              data-testid="input-kiosk-printer"
            />
          </div>
          <div className="flex items-center gap-2 bg-muted rounded-md px-2.5 py-2">
            <code className="text-[10px] font-mono text-foreground flex-1 break-all">{kioskUrl}</code>
            <button
              onClick={copyUrl}
              className="text-muted-foreground hover:text-foreground shrink-0"
              title="Copy URL"
              data-testid="button-copy-kiosk-url"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
            </button>
            <a
              href={kioskUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground shrink-0"
              title="Open kiosk"
              data-testid="link-open-kiosk"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <p className="text-2xs text-muted-foreground">
            Open this URL in full-screen on a tablet next to the printer. Works in Chrome kiosk mode:
            {" "}<code className="bg-muted px-1 rounded text-[10px]">chrome.exe --kiosk http://localhost:5001/kiosk?printer=...</code>
          </p>
        </div>

        {/* Agent auto-hold env reminder */}
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2.5 space-y-1">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Required: Enable Auto-Hold on the agent</p>
          <p className="text-2xs text-amber-700 dark:text-amber-400">
            Without this, jobs print immediately. Set <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">PRINTGUARD_AUTO_HOLD=true</code> as an environment variable on your Windows Print Server before starting agent.js.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingRow({ label, desc, checked, onChange, badge }: { label: string; desc: string; checked: boolean; onChange: () => void; badge?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-xs font-medium flex items-center gap-2">
          {label}
          {badge && <Badge variant="secondary" className="text-xs">{badge}</Badge>}
        </div>
        <div className="text-2xs text-muted-foreground">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
