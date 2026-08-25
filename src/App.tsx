import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RoleProvider, useRole } from "@/contexts/RoleContext";
import Login from "@/pages/Login";
import { Layout } from "@/components/Layout";
import Dashboard from "./pages/Dashboard";
import QuickPrint from "./pages/QuickPrint";
import PrintQueue from "./pages/PrintQueue";
import Printers from "./pages/Printers";
import PrintJobs from "./pages/PrintJobs";
import Users from "./pages/Users";
import CostControl from "./pages/CostControl";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import ReleaseJobs from "./pages/ReleaseJobs";
import Branches from "./pages/Branches";
import PrintServerManager from "./pages/PrintServerManager";
import ScanJobs from "./pages/ScanJobs";
import Kiosk from "./pages/Kiosk";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

interface LoginUser {
  id: string;
  employee_id: string;
  name: string;
  branch: string;
  role: "admin" | "employee";
}

const AppContent = ({ user, setUser, onLogout }: { user: LoginUser | null; setUser: (user: LoginUser | null) => void; onLogout: () => void }) => {
  const { setCurrentUser, setRole } = useRole();

  if (!user) {
    return <Login onLoginSuccess={(emp) => {
      const loginUser: LoginUser = {
        id: emp.id,
        employee_id: emp.employee_id,
        name: emp.name,
        branch: emp.branch,
        role: emp.role,
      };
      setUser(loginUser);
      setCurrentUser({
        id: emp.id,
        employee_id: emp.employee_id,
        name: emp.name,
        branch: emp.branch,
        role: emp.role,
        department: emp.role === "admin" ? "IT" : "Operations"
      });
      setRole(emp.role);
    }} />;
  }

  return (
    <Layout onLogout={onLogout}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/quick-print" element={<QuickPrint />} />
        <Route path="/queue" element={<PrintQueue />} />
        <Route path="/printers" element={<Printers />} />
        <Route path="/print-jobs" element={<PrintJobs />} />
        <Route path="/users" element={<Users />} />
        <Route path="/branches" element={<Branches />} />
        <Route path="/cost-control" element={<CostControl />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/release" element={<ReleaseJobs />} />
        <Route path="/scan-jobs" element={<ScanJobs />} />
        <Route path="/print-server" element={<PrintServerManager />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
};

const App = () => {
  const [user, setUser] = useState<LoginUser | null>(null);

  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <RoleProvider>
            <Routes>
              {/* Kiosk: standalone fullscreen page — no auth, no sidebar */}
              <Route path="/kiosk" element={<Kiosk />} />
              {/* All other routes go through auth + layout */}
              <Route path="*" element={
                <AppContent user={user} setUser={setUser} onLogout={() => setUser(null)} />
              } />
            </Routes>
          </RoleProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
};

export default App;
