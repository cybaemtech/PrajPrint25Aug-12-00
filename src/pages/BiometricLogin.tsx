import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, CreditCard, CheckCircle2, Loader2, Wifi, Shield, Usb } from "lucide-react";
import logoSrc from "@/assets/cybaem-logo.png";

interface Employee {
  id: string;
  employee_id: string;
  name: string;
  branch: string;
  role: "admin" | "employee";
  pin: string;
  rfid: string;
}

const MOCK_EMPLOYEES: Employee[] = [
  { id: "u1", employee_id: "EMP001", name: "Rajesh Kumar",  branch: "Hinjewadi", role: "admin",    pin: "1234", rfid: "RFID001A2B3C" },
  { id: "u2", employee_id: "EMP002", name: "Priya Sharma",  branch: "Wakad",     role: "employee", pin: "5678", rfid: "RFID002D4E5F" },
  { id: "u3", employee_id: "EMP003", name: "Arjun Singh",   branch: "Urawade",   role: "employee", pin: "9012", rfid: "RFID003G6H7I" },
  { id: "u4", employee_id: "EMP004", name: "Neha Gupta",    branch: "Wakad",     role: "employee", pin: "3456", rfid: "RFID004J8K9L" },
  { id: "u5", employee_id: "EMP005", name: "Amit Patel",    branch: "Hinjewadi", role: "admin",    pin: "7890", rfid: "RFID005M0N1O" },
];

interface BiometricLoginProps { onLoginSuccess: (user: Employee) => void }

export const BiometricLogin = ({ onLoginSuccess }: BiometricLoginProps) => {
  const [scanning, setScanning]       = useState(false);
  const [scannedUser, setScannedUser] = useState<Employee | null>(null);
  const [success, setSuccess]         = useState(false);
  const [dots, setDots]               = useState(0);

  useEffect(() => {
    if (!scanning) return;
    const t = setInterval(() => setDots(d => (d + 1) % 4), 400);
    return () => clearInterval(t);
  }, [scanning]);

  const loginAs = (user: Employee) => {
    setScannedUser(user);
    setSuccess(true);
    setTimeout(() => onLoginSuccess(user), 1100);
  };

  const handleTapCard = () => {
    setScanning(true);
    setTimeout(() => {
      const user = MOCK_EMPLOYEES[Math.floor(Math.random() * MOCK_EMPLOYEES.length)];
      setScanning(false);
      loginAs(user);
    }, 1600);
  };

  /* ── Success screen ── */
  if (success && scannedUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
        <div className="text-center space-y-5 animate-in fade-in zoom-in duration-500">
          <div className="h-20 w-20 mx-auto rounded-full bg-green-100 border-2 border-green-200 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Access Granted</h2>
            <p className="text-gray-500 text-sm mt-1">Welcome back, {scannedUser.name}</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-6 py-4 text-left space-y-2 max-w-xs mx-auto">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Employee ID</span>
              <span className="text-gray-800 font-mono font-medium">{scannedUser.employee_id}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">Branch</span>
              <span className="text-gray-800">{scannedUser.branch}</span>
            </div>
            <div className="flex justify-between text-xs items-center">
              <span className="text-gray-400">Role</span>
              <Badge variant={scannedUser.role === "admin" ? "default" : "secondary"} className="text-2xs h-4 capitalize">
                {scannedUser.role}
              </Badge>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <Loader2 className="h-3 w-3 animate-spin" />
            Entering system…
          </div>
        </div>
      </div>
    );
  }

  /* ── Main login ── */
  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30">

      {/* ── Left branding panel ── */}
      <div className="hidden lg:flex flex-col justify-between w-[400px] shrink-0 bg-[#1a3355] p-10">
        {/* Logo on white pill */}
        <div>
          <div className="inline-flex items-center bg-white rounded-xl px-3 py-2 shadow-sm">
            <img src={logoSrc} alt="Cybaem Tech" className="h-7 w-auto object-contain" />
          </div>

          <div className="mt-12 space-y-4">
            <h1 className="text-3xl font-bold text-white leading-snug">
              Enterprise Print<br />Management
            </h1>
            <p className="text-blue-200/80 text-sm leading-relaxed">
              Centralised, secure, multi-branch printing for the modern enterprise. Every job tracked, every page accounted for.
            </p>
          </div>

          <div className="mt-10 space-y-3.5">
            {[
              { icon: Shield, text: "RFID card authentication" },
              { icon: Wifi,   text: "Network & Bluetooth discovery" },
              { icon: Usb,    text: "USB & local printer support" },
              { icon: MapPin, text: "Multi-branch access control" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-blue-100/80">
                <div className="h-8 w-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                  <Icon className="h-3.5 w-3.5 text-blue-300" />
                </div>
                {text}
              </div>
            ))}
          </div>
        </div>

        <div className="text-[11px] text-blue-300/40">© 2026 Cybaem Tech · Praj Print System</div>
      </div>

      {/* ── Right login panel ── */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5">

          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-4">
            <div className="inline-flex items-center bg-white rounded-xl px-3 py-2 shadow-sm border border-gray-100">
              <img src={logoSrc} alt="Cybaem Tech" className="h-7 w-auto object-contain" />
            </div>
          </div>

          <div className="mb-1">
            <h2 className="text-xl font-bold text-gray-900">Sign in to PrintGuard</h2>
            <p className="text-sm text-gray-500 mt-0.5">Tap your RFID card or select your profile</p>
          </div>

          {/* RFID card reader */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className={`h-24 w-24 rounded-2xl border-2 flex items-center justify-center transition-all duration-300
                  ${scanning
                    ? "border-blue-500 bg-blue-50 shadow-[0_0_20px_rgba(59,130,246,0.2)]"
                    : "border-dashed border-gray-200 bg-gray-50"}`}>
                  <CreditCard className={`h-11 w-11 transition-colors duration-300 ${scanning ? "text-blue-500" : "text-gray-300"}`} />
                </div>
                {scanning && (
                  <div className="absolute inset-0 rounded-2xl border-2 border-blue-400 animate-ping opacity-25" />
                )}
              </div>

              <div className="text-center">
                <p className="text-sm font-semibold text-gray-800">
                  {scanning ? `Scanning${".".repeat(dots)}` : "Ready to scan"}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {scanning ? "Hold your RFID card near the reader" : "Tap your employee card to authenticate"}
                </p>
              </div>

              <Button
                onClick={handleTapCard}
                disabled={scanning}
                className="w-full h-11 text-sm font-semibold bg-[#1a3355] hover:bg-[#1e3d66] text-white border-0 shadow-md transition-all"
                data-testid="button-tap-card"
              >
                {scanning ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Scanning…</>
                ) : (
                  <><CreditCard className="mr-2 h-4 w-4" /> Tap Card to Scanner</>
                )}
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div className="relative flex items-center">
            <div className="flex-1 border-t border-gray-200" />
            <span className="px-3 text-[10px] text-gray-400 uppercase tracking-widest">or select manually</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>

          {/* Employee grid */}
          <div className="grid grid-cols-2 gap-2">
            {MOCK_EMPLOYEES.map(emp => (
              <button
                key={emp.id}
                onClick={() => loginAs(emp)}
                disabled={scanning}
                data-testid={`button-login-${emp.id}`}
                className="group p-3.5 rounded-xl border border-gray-200 bg-white hover:border-blue-400 hover:bg-blue-50/40 hover:shadow-sm text-left transition-all duration-150 disabled:opacity-40"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="h-8 w-8 rounded-full bg-[#1a3355]/10 border border-[#1a3355]/15 flex items-center justify-center text-[10px] font-bold text-[#1a3355]">
                    {emp.name.split(" ").map(w => w[0]).join("").slice(0,2)}
                  </div>
                  <Badge
                    variant={emp.role === "admin" ? "default" : "secondary"}
                    className="text-[10px] h-4 px-1.5 capitalize"
                  >
                    {emp.role}
                  </Badge>
                </div>
                <div className="font-semibold text-xs text-gray-800 leading-tight">{emp.name}</div>
                <div className="flex items-center gap-1 mt-1">
                  <MapPin className="h-2.5 w-2.5 text-gray-400" />
                  <span className="text-[10px] text-gray-400">{emp.branch}</span>
                </div>
              </button>
            ))}
          </div>

          <p className="text-center text-[10px] text-gray-400">
            Secured by Cybaem Tech PrintGuard · RFID Authentication
          </p>
        </div>
      </div>
    </div>
  );
};

export default BiometricLogin;
