import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { storage } from "@/lib/storage";
import type { User } from "@/lib/storage";
import { Search, MapPin, UserPlus, Pencil, Eye, EyeOff, RefreshCw, Key, Info, Wand2, Download } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";

const BRANCHES = ["Hinjewadi", "Wakad", "Urawade"];
const DEPARTMENTS = ["IT", "Design", "Operations", "Accounts", "Finance", "HR", "Admin", "Management"];

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

const EMPTY_FORM = {
  name: "",
  employee_id: "",
  email: "",
  department: "IT",
  branch: "Hinjewadi",
  role: "employee" as "admin" | "employee",
  pin: "",
  monthlyQuota: 300,
  status: "active" as "active" | "inactive",
};

export default function Users() {
  const [search, setSearch] = useState("");
  const { role, currentBranch } = useRole();
  const [users, setUsers] = useState<User[]>(() => storage.getUsers());
  const pagesByUser = storage.getPagesByUser();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPin, setShowPin] = useState(false);
  const [revealPins, setRevealPins] = useState<Record<string, boolean>>({});

  const visibleUsers = role === "admin" ? users : users.filter(u => u.branch === currentBranch);
  const filtered = visibleUsers.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    (u.department || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
    u.employee_id.toLowerCase().includes(search.toLowerCase())
  );

  function openAdd() {
    setEditingUser(null);
    setForm({ ...EMPTY_FORM, pin: generatePin() });
    setShowPin(true);
    setDialogOpen(true);
  }

  function openEdit(user: User) {
    setEditingUser(user);
    setForm({
      name: user.name,
      employee_id: user.employee_id,
      email: user.email || "",
      department: user.department || "IT",
      branch: user.branch,
      role: user.role,
      pin: user.pin,
      monthlyQuota: user.monthlyQuota || 300,
      status: user.status || "active",
    });
    setShowPin(false);
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.employee_id.trim()) { toast.error("Employee ID is required"); return; }
    if (!form.pin || form.pin.length < 4) { toast.error("PIN must be at least 4 digits"); return; }
    if (!/^\d+$/.test(form.pin)) { toast.error("PIN must contain only numbers"); return; }

    const currentUsers = storage.getUsers();

    // Check duplicate employee_id
    const dupId = currentUsers.find(u => u.employee_id === form.employee_id && u.id !== editingUser?.id);
    if (dupId) { toast.error(`Employee ID "${form.employee_id}" is already taken`); return; }

    if (editingUser) {
      const updated = currentUsers.map(u =>
        u.id === editingUser.id ? { ...u, ...form } : u
      );
      storage.setUsers(updated);
      setUsers(updated);
      toast.success(`${form.name}'s profile updated`);
    } else {
      const newUser: User = {
        id: `u-${uuidv4().slice(0, 8)}`,
        ...form,
        authMethod: "PIN",
        usedPages: 0,
        totalCost: 0,
      };
      const updated = [...currentUsers, newUser];
      storage.setUsers(updated);
      setUsers(updated);
      toast.success(`${form.name} added — PIN: ${form.pin}`);
    }

    setDialogOpen(false);
  }

  function toggleRevealPin(userId: string) {
    setRevealPins(prev => ({ ...prev, [userId]: !prev[userId] }));
  }

  function handleAutoGeneratePins() {
    const currentUsers = storage.getUsers();
    const usedPins = new Set(currentUsers.map(u => u.pin).filter(Boolean));
    const updated = currentUsers.map(u => {
      if (u.pin) return u;
      let pin: string;
      do { pin = generatePin(); } while (usedPins.has(pin));
      usedPins.add(pin);
      return { ...u, pin };
    });
    const withoutPins = currentUsers.filter(u => !u.pin).length;
    if (withoutPins === 0) {
      // Regenerate ALL — give every user a fresh unique PIN
      const allPins = new Set<string>();
      const regenerated = currentUsers.map(u => {
        let pin: string;
        do { pin = generatePin(); } while (allPins.has(pin));
        allPins.add(pin);
        return { ...u, pin };
      });
      storage.setUsers(regenerated);
      setUsers(regenerated);
      toast.success(`${regenerated.length} users given new unique PINs`);
    } else {
      storage.setUsers(updated);
      setUsers(updated);
      toast.success(`${withoutPins} users assigned unique PINs`);
    }
  }

  function handleExportCsv() {
    const currentUsers = storage.getUsers();
    // Canon iR series Authentication Management import format (UTF-8 BOM required)
    const header = "uid,password,pin,cn,cn;lang-ja;phonetic,mail,avatorImgPath,dept_id,dept_pin,roleName,cardId1,issueNumber1,cardId2,issueNumber2,accountExpires,accountDisabled,group,createDate,lastLoginDate,dc,uuid,sdl_digest,uac_advbox_digest1,uac_advbox_digest2,pin_digest,server_user_flg,server_user_gp_key,server_user_gp_value,non_expire_password,next_password_change_required,second_factor,CharSet:UTF-8";
    const rows = currentUsers.map(u => {
      const pin = u.pin || "";
      const roleName = u.role === "admin" ? "Administrator" : "";
      // No quoted fields — Canon parser rejects them
      const displayName = u.name.replace(/,/g, " ");
      // Exact 32-column format matching Canon iR series Authentication Management export
      return [
        u.employee_id,   // 1  uid
        "",              // 2  password (blank)
        pin,             // 3  pin
        displayName,     // 4  cn (no quotes)
        "",              // 5  cn;lang-ja;phonetic
        u.email || "",   // 6  mail
        "default@0000.png", // 7 avatorImgPath
        "",              // 8  dept_id (must be numeric or blank; leave blank for user-auth mode)
        "",              // 9  dept_pin
        roleName,        // 10 roleName
        "",              // 11 cardId1
        "",              // 12 issueNumber1
        "",              // 13 cardId2
        "",              // 14 issueNumber2
        "",              // 15 accountExpires (blank = never, NOT "0")
        "0",             // 16 accountDisabled (0 = enabled)
        "",              // 17 group
        "",              // 18 createDate
        "",              // 19 lastLoginDate
        "",              // 20 dc
        "",              // 21 uuid
        "",              // 22 sdl_digest
        "",              // 23 uac_advbox_digest1
        "",              // 24 uac_advbox_digest2
        "",              // 25 pin_digest
        "0",             // 26 server_user_flg
        "",              // 27 server_user_gp_key
        "",              // 28 server_user_gp_value
        "1",             // 29 non_expire_password
        "0",             // 30 next_password_change_required
        "",              // 31 second_factor
        "",              // 32 CharSet:UTF-8 (value blank)
      ].join(",");
    });
    // BOM (\uFEFF) required by Canon for UTF-8 CSV
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "canon-users-import.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${currentUsers.length} users — ready for Canon import`);
  }

  const authColors: Record<string, string> = {
    PIN: "bg-primary/10 text-primary border-primary/20",
    RFID: "bg-success/10 text-success border-success/20",
    SSO: "bg-warning/10 text-warning border-warning/20",
    QR: "bg-accent text-accent-foreground border-border",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">User Management</h1>
          {role === "employee" && (
            <Badge variant="outline" className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {currentBranch}
            </Badge>
          )}
          {role === "admin" && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> All Branches
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{visibleUsers.length} users</span>
          {role === "admin" && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={handleAutoGeneratePins}
                data-testid="button-auto-generate-pins"
                title="Auto-assign a unique PIN to every user who doesn't have one"
              >
                <Wand2 className="h-3.5 w-3.5" /> Auto-generate PINs
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={handleExportCsv}
                data-testid="button-export-csv"
                title="Download all users + PINs as CSV"
              >
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={openAdd} data-testid="button-add-user">
                <UserPlus className="h-3.5 w-3.5" /> Add User
              </Button>
            </>
          )}
        </div>
      </div>

      {/* PIN info banner for admins */}
      {role === "admin" && (
        <div className="flex items-start gap-2 bg-primary/5 border border-primary/15 rounded-lg px-3 py-2.5">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">How PINs work:</span> Each user's PIN is their identity at the printer. When they print from Word/Excel/any app, they select <em>Secured Print</em> and enter this PIN. The same PIN unlocks their jobs on the <strong>Release Jobs</strong> screen. Set each user's PIN here and share it with them — they use it forever.
          </p>
        </div>
      )}

      <div className="relative max-w-xs">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 pl-7 text-xs"
          data-testid="input-search-users"
        />
      </div>

      <Card className="shadow-none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-2xs h-8">Name / ID</TableHead>
              <TableHead className="text-2xs h-8">Email</TableHead>
              {role === "admin" && <TableHead className="text-2xs h-8">Branch</TableHead>}
              <TableHead className="text-2xs h-8">Department</TableHead>
              <TableHead className="text-2xs h-8">Role</TableHead>
              {role === "admin" && <TableHead className="text-2xs h-8"><span className="flex items-center gap-1"><Key className="h-3 w-3" />Secured Print PIN</span></TableHead>}
              <TableHead className="text-2xs h-8">Auth</TableHead>
              <TableHead className="text-2xs h-8 text-right">Pages</TableHead>
              <TableHead className="text-2xs h-8">Quota</TableHead>
              <TableHead className="text-2xs h-8">Status</TableHead>
              {role === "admin" && <TableHead className="text-2xs h-8"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(u => {
              const jobPages = pagesByUser[u.id]?.totalPages ?? 0;
              const used = Math.max(u.usedPages || 0, jobPages);
              const quota = u.monthlyQuota || 500;
              const quotaPct = Math.min(Math.round((used / quota) * 100), 100);
              const userStats = pagesByUser[u.id];
              const pinRevealed = revealPins[u.id];
              return (
                <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                  <TableCell className="text-xs py-1.5">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-2xs text-muted-foreground">{u.employee_id}</div>
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-muted-foreground">{u.email || "N/A"}</TableCell>
                  {role === "admin" && <TableCell className="text-xs py-1.5">{u.branch}</TableCell>}
                  <TableCell className="text-xs py-1.5">{u.department}</TableCell>
                  <TableCell className="text-xs py-1.5">
                    <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-2xs capitalize">
                      {u.role}
                    </Badge>
                  </TableCell>
                  {role === "admin" && (
                    <TableCell className="text-xs py-1.5">
                      {u.pin ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold tracking-widest text-sm text-primary">
                            {pinRevealed ? u.pin : "••••"}
                          </span>
                          <button
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => toggleRevealPin(u.id)}
                            data-testid={`button-reveal-pin-${u.id}`}
                            title={pinRevealed ? "Hide PIN" : "Reveal PIN"}
                          >
                            {pinRevealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      ) : (
                        <button
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100 cursor-pointer"
                          onClick={() => openEdit(u)}
                          title="No PIN set — click to assign a PIN so this user can release secure print jobs"
                          data-testid={`button-no-pin-${u.id}`}
                        >
                          <Key className="h-3 w-3" /> Set PIN
                        </button>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-xs py-1.5">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium border ${authColors[u.authMethod || "PIN"]}`}>
                      {u.authMethod || "PIN"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="font-medium">{userStats ? userStats.totalPages : 0}</span>
                      {userStats && (
                        <span className="text-2xs text-muted-foreground">{userStats.bwPages}B&W / {userStats.colorPages}C</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs py-1.5">
                    <div className="flex items-center gap-2">
                      <Progress value={quotaPct} className="h-1.5 w-16" />
                      <span className="text-2xs text-muted-foreground whitespace-nowrap">{used}/{quota}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs py-1.5">
                    <span className={`h-2 w-2 rounded-full inline-block ${u.status === "active" ? "bg-success" : "bg-muted-foreground"}`} />
                  </TableCell>
                  {role === "admin" && (
                    <TableCell className="text-xs py-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => openEdit(u)}
                        data-testid={`button-edit-user-${u.id}`}
                        title="Edit user / change PIN"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-xs text-muted-foreground py-8">
                  No users found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add / Edit User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingUser ? <Pencil className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {editingUser ? "Edit User" : "Add New User"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Full Name *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Rahul Verma"
                  className="h-9 text-xs"
                  data-testid="input-user-name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Employee ID *</Label>
                <Input
                  value={form.employee_id}
                  onChange={e => setForm(f => ({ ...f, employee_id: e.target.value.toUpperCase() }))}
                  placeholder="e.g. EMP006"
                  className="h-9 text-xs font-mono"
                  data-testid="input-employee-id"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="rahul@company.com"
                className="h-9 text-xs"
                type="email"
                data-testid="input-user-email"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Branch *</Label>
                <Select value={form.branch} onValueChange={v => setForm(f => ({ ...f, branch: v }))}>
                  <SelectTrigger className="h-9 text-xs" data-testid="select-branch">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BRANCHES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Department *</Label>
                <Select value={form.department} onValueChange={v => setForm(f => ({ ...f, department: v }))}>
                  <SelectTrigger className="h-9 text-xs" data-testid="select-department">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Role *</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v as "admin" | "employee" }))}>
                  <SelectTrigger className="h-9 text-xs" data-testid="select-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as "active" | "inactive" }))}>
                  <SelectTrigger className="h-9 text-xs" data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* PIN Section — most important */}
            <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <Key className="h-3.5 w-3.5 text-primary" />
                Secured Print PIN *
              </Label>
              <p className="text-2xs text-muted-foreground mb-2">
                This 4-digit PIN is what the user enters on the printer panel to release their jobs. Share this PIN with the user after saving.
              </p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showPin ? "text" : "password"}
                    value={form.pin}
                    onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, "").slice(0, 8) }))}
                    placeholder="4-digit PIN"
                    className="h-9 text-sm font-mono tracking-widest pr-10"
                    maxLength={8}
                    data-testid="input-pin"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPin(v => !v)}
                  >
                    {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs gap-1.5 whitespace-nowrap"
                  onClick={() => { const p = generatePin(); setForm(f => ({ ...f, pin: p })); setShowPin(true); }}
                  data-testid="button-generate-pin"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Generate
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Monthly Page Quota</Label>
              <Input
                type="number"
                value={form.monthlyQuota}
                onChange={e => setForm(f => ({ ...f, monthlyQuota: Number(e.target.value) }))}
                min={0}
                className="h-9 text-xs"
                data-testid="input-quota"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} data-testid="button-save-user">
              {editingUser ? "Save Changes" : "Add User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
