import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Shield, Wifi, Usb, MapPin, Loader2, LogIn } from "lucide-react";
import logoSrc from "@/assets/cybaem-logo.png";

interface LoginUser {
  id: string;
  username: string;
  name: string;
  branch: string;
  role: "admin" | "employee";
  employee_id: string;
}

interface LoginProps {
  onLoginSuccess: (user: LoginUser) => void;
}

export const Login = ({ onLoginSuccess }: LoginProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed. Please try again.");
      } else {
        onLoginSuccess(data.user);
      }
    } catch {
      setError("Unable to connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30">

      {/* Left branding panel */}
      <div className="hidden lg:flex flex-col justify-between w-[400px] shrink-0 bg-[#1a3355] p-10">
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
              { icon: Shield, text: "Secure login authentication" },
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

        <div className="text-[11px] text-blue-300/40">© 2026 Cybaem Tech · PrintGuard System</div>
      </div>

      {/* Right login panel */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">

          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-4">
            <div className="inline-flex items-center bg-white rounded-xl px-3 py-2 shadow-sm border border-gray-100">
              <img src={logoSrc} alt="Cybaem Tech" className="h-7 w-auto object-contain" />
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-900">Sign in to PrintGuard</h2>
            <p className="text-sm text-gray-500 mt-0.5">Enter your credentials to access the system</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm font-medium text-gray-700">Username</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="Enter your username"
                value={username}
                onChange={e => { setUsername(e.target.value); setError(""); }}
                disabled={loading}
                data-testid="input-username"
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  disabled={loading}
                  data-testid="input-password"
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600" data-testid="text-login-error">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-sm font-semibold bg-[#1a3355] hover:bg-[#1e3d66] text-white border-0 shadow-md transition-all"
              data-testid="button-login-submit"
            >
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</>
              ) : (
                <><LogIn className="mr-2 h-4 w-4" /> Sign In</>
              )}
            </Button>
          </form>

          <p className="text-center text-[10px] text-gray-400">
            Secured by Cybaem Tech PrintGuard · Username/Password Authentication
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
