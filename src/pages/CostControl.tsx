import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { MapPin } from "lucide-react";
import { storage } from "@/lib/storage";
import { useState, useMemo } from "react";
import { useRole } from "@/contexts/RoleContext";

export default function CostControl() {
  const [pols, setPols] = useState(storage.getPolicies());
  const { role, currentBranch } = useRole();
  const allUsers = storage.getUsers();
  
  // Filter users by branch for employees, show all for admins
  const users = role === "admin" ? allUsers : allUsers.filter(u => u.branch === currentBranch);

  const togglePolicy = (id: string) => {
    setPols(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p));
  };

  const deptQuotas = useMemo(() => {
    const departments = ["Engineering", "Marketing", "Finance", "HR", "Operations", "IT", "Design", "Accounts"];
    return departments.map(dept => {
      const deptUsers = users.filter(u => u.department === dept);
      const totalUsed = deptUsers.reduce((s, u) => s + (u.usedPages || 0), 0);
      const totalQuota = deptUsers.reduce((s, u) => s + (u.monthlyQuota || 500), 0);
      const totalCost = deptUsers.reduce((s, u) => s + (u.totalCost || 0), 0);
      return { dept, totalUsed, totalQuota, totalCost, users: deptUsers.length };
    }).filter(d => d.users > 0); // Only show departments with users in this branch
  }, [users]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Cost Control & Policies</h1>
        {role === "employee" && (
          <Badge variant="outline" className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {currentBranch}
          </Badge>
        )}
        {role === "admin" && (
          <Badge variant="secondary" className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            All Branches
          </Badge>
        )}
      </div>

      {/* Department Budgets */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="shadow-none">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm font-semibold">Department Usage</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-3">
            {deptQuotas.map(d => {
              const pct = Math.round((d.totalUsed / d.totalQuota) * 100);
              return (
                <div key={d.dept} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{d.dept}</span>
                    <span className="text-muted-foreground">{d.totalUsed.toLocaleString()} / {d.totalQuota.toLocaleString()} pages • ₹{d.totalCost.toFixed(2)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-primary"}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm font-semibold">Cost Per Page</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="grid grid-cols-2 gap-3">
              <CostCard label="B&W Single-Sided" value="₹0.05" />
              <CostCard label="B&W Duplex" value="₹0.04" />
              <CostCard label="Color Single-Sided" value="₹0.40" />
              <CostCard label="Color Duplex" value="₹0.35" />
            </div>
            <div className="mt-3 pt-3 border-t">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Cost This Month</span>
                <span className="font-bold text-sm">₹{storage.getStats().kpis.costThisMonth.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Policies */}
      <Card className="shadow-none">
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm font-semibold">Print Policies</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-2xs h-8">Policy</TableHead>
                <TableHead className="text-2xs h-8">Description</TableHead>
                <TableHead className="text-2xs h-8">Scope</TableHead>
                <TableHead className="text-2xs h-8">Type</TableHead>
                <TableHead className="text-2xs h-8 text-center">Enabled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pols.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs py-1.5 font-medium">{p.name}</TableCell>
                  <TableCell className="text-xs py-1.5 text-muted-foreground max-w-[300px]">{p.description}</TableCell>
                  <TableCell className="text-xs py-1.5">
                    <Badge variant="outline" className="text-2xs">{(p as any).scope || 'Global'}</Badge>
                  </TableCell>
                  <TableCell className="text-xs py-1.5 capitalize">{(p as any).type || 'Restriction'}</TableCell>
                  <TableCell className="text-xs py-1.5 text-center">
                    <Switch checked={p.enabled} onCheckedChange={() => togglePolicy(p.id)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CostCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-md p-2">
      <div className="text-2xs text-muted-foreground">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}
