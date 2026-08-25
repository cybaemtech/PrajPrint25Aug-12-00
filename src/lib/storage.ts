import { v4 as uuidv4 } from 'uuid';

export interface User {
  id: string;
  employee_id: string;
  name: string;
  email?: string;
  department: string;
  branch: string;
  pin: string;
  rfid?: string;
  role: 'admin' | 'employee';
  status?: 'active' | 'inactive';
  monthlyQuota?: number;
  usedPages?: number;
  authMethod?: string;
  totalCost?: number;
  lastPrint?: string;
}

export interface PrintJob {
  id: string;
  user_id: string;
  userName: string;
  document_name: string;
  pages: number;
  copies: number;
  color_mode: 'bw' | 'color';
  duplex: boolean;
  status: 'queued' | 'printing' | 'completed' | 'cancelled' | 'failed';
  submitted_at: string;
  released_at?: string;
  cancelled_at?: string;
  auto_cancel_timeout_minutes?: number;
  cost: number;
  department: string;
  branch: string;
  printer_name?: string;
  printer_ip?: string;
  queue_position?: number;
  employee_id?: string;
}

export interface ScanJob {
  id: string;
  user_id: string;
  userName: string;
  document_name: string;
  pages: number;
  color_mode: 'bw' | 'color';
  duplex: boolean;
  resolution: number;
  scanner_name: string;
  scanner_ip?: string;
  destination: 'email' | 'folder' | 'app';
  status: 'completed' | 'failed';
  branch: string;
  department: string;
  scanned_at: string;
  file_size?: number;
}

export interface InkLevels {
  black: number;
  cyan?: number;
  magenta?: number;
  yellow?: number;
}

export interface Printer {
  id: string;
  name: string;
  location: string;
  branch: string;
  status: 'online' | 'offline' | 'warning' | 'error';
  type: 'color' | 'bw';
  tonerLevel: number;
  paperLevel: number;
  jobCount: number;
  ip?: string;
  model?: string;
  totalPrints?: number;
  totalScans?: number;
  lastMaintenance?: string;
  canScan?: boolean;
  inkLevels?: InkLevels;
}

export interface Policy {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

const getStoredData = <T>(key: string, initial: T): T => {
  const stored = localStorage.getItem(key);
  try {
    return stored ? JSON.parse(stored) : initial;
  } catch (e) {
    return initial;
  }
};

const setStoredData = (key: string, data: any) => {
  localStorage.setItem(key, JSON.stringify(data));
};

export const storage = {
  // Users
  getUsers: () => getStoredData<User[]>('users', []),
  setUsers: (users: User[]) => setStoredData('users', users),

  verifyEmployee: (employeeId: string, pin: string): User | null => {
    if (!pin || pin.trim() === '') return null;
    const users = storage.getUsers();
    const user = users.find(
      u => u.employee_id.toLowerCase() === employeeId.toLowerCase() && u.pin && u.pin === pin && u.status !== 'inactive'
    );
    return user || null;
  },

  // Printers
  getPrinters: () => getStoredData<Printer[]>('printers', []),
  setPrinters: (printers: Printer[]) => setStoredData('printers', printers),

  // Policies
  getPolicies: () => getStoredData<Policy[]>('policies', [
    { id: 'pol1', name: 'Enforce B&W', description: 'Default all jobs to B&W', enabled: true },
    { id: 'pol2', name: 'Duplex Only', description: 'Enforce double-sided printing', enabled: false },
  ]),

  // Print Jobs
  getJobs: () => getStoredData<PrintJob[]>('print_jobs', []),
  setJobs: (jobs: PrintJob[]) => setStoredData('print_jobs', jobs),

  // Scan Jobs
  getScanJobs: () => getStoredData<ScanJob[]>('scan_jobs', []),
  setScanJobs: (jobs: ScanJob[]) => setStoredData('scan_jobs', jobs),

  addScanJob: (jobData: Partial<ScanJob>): ScanJob => {
    const jobs = storage.getScanJobs();
    const users = storage.getUsers();
    const user = users.find(u => u.id === jobData.user_id);
    const newJob: ScanJob = {
      id: uuidv4(),
      user_id: jobData.user_id || 'u1',
      userName: user?.name || jobData.userName || 'Unknown',
      document_name: jobData.document_name || 'Scanned Document',
      pages: jobData.pages || 1,
      color_mode: jobData.color_mode || 'bw',
      duplex: jobData.duplex || false,
      resolution: jobData.resolution || 300,
      scanner_name: jobData.scanner_name || 'Unknown Scanner',
      scanner_ip: jobData.scanner_ip,
      destination: jobData.destination || 'app',
      status: jobData.status || 'completed',
      branch: user?.branch || jobData.branch || 'Hinjewadi',
      department: user?.department || jobData.department || 'IT',
      scanned_at: jobData.scanned_at || new Date().toISOString(),
      file_size: jobData.file_size,
    };
    setStoredData('scan_jobs', [newJob, ...jobs]);

    // Update scanner stats on the printer
    const printers = storage.getPrinters();
    const updated = printers.map(p => {
      if (p.name === newJob.scanner_name) {
        return { ...p, totalScans: (p.totalScans || 0) + newJob.pages };
      }
      return p;
    });
    storage.setPrinters(updated);

    return newJob;
  },

  // Queue
  getQueue: () => {
    const jobs = storage.getJobs();
    return jobs
      .filter(j => j.status === 'queued' || j.status === 'printing')
      .sort((a, b) => (a.queue_position ?? 9999) - (b.queue_position ?? 9999));
  },

  nextQueuePosition: () => {
    const jobs = storage.getJobs();
    const activeQueue = jobs.filter(j => j.status === 'queued' || j.status === 'printing');
    if (activeQueue.length === 0) return 1;
    return Math.max(...activeQueue.map(j => j.queue_position ?? 0)) + 1;
  },

  addJob: (jobData: Partial<PrintJob>) => {
    const jobs = storage.getJobs();
    const users = storage.getUsers();
    const user = users.find(u => u.id === jobData.user_id);

    const isQueued = jobData.status === undefined || jobData.status === 'queued';
    const queuePos = isQueued ? storage.nextQueuePosition() : undefined;

    const newJob: PrintJob = {
      id: uuidv4(),
      user_id: jobData.user_id || 'u1',
      userName: user?.name || 'Admin User',
      department: user?.department || 'IT',
      branch: user?.branch || 'Hinjewadi',
      employee_id: user?.employee_id,
      document_name: jobData.document_name || 'Untitled',
      pages: jobData.pages || 1,
      copies: jobData.copies || 1,
      color_mode: jobData.color_mode || 'bw',
      duplex: jobData.duplex || false,
      status: 'queued',
      submitted_at: new Date().toISOString(),
      cost: (jobData.pages || 1) * (jobData.color_mode === 'color' ? 0.50 : 0.10),
      queue_position: queuePos,
      ...jobData,
    } as PrintJob;

    setStoredData('print_jobs', [newJob, ...jobs]);

    if (newJob.status === 'completed' && newJob.printer_name) {
      const printers = storage.getPrinters();
      const updatedPrinters = printers.map(p => {
        if (p.name === newJob.printer_name) {
          return {
            ...p,
            jobCount: (p.jobCount || 0) + 1,
            totalPrints: (p.totalPrints || 0) + newJob.pages,
          };
        }
        return p;
      });
      storage.setPrinters(updatedPrinters);
    }

    return newJob;
  },

  startJob: (jobId: string) => {
    const jobs = storage.getJobs();
    const updated = jobs.map(j =>
      j.id === jobId ? { ...j, status: 'printing' as const } : j
    );
    setStoredData('print_jobs', updated);
  },

  completeJob: (jobId: string) => {
    const jobs = storage.getJobs();
    const job = jobs.find(j => j.id === jobId);
    if (!job) return false;

    const updatedJobs = jobs.map(j =>
      j.id === jobId
        ? { ...j, status: 'completed' as const, released_at: new Date().toISOString() }
        : j
    );
    setStoredData('print_jobs', updatedJobs);

    if (job.printer_name) {
      const printers = storage.getPrinters();
      const updatedPrinters = printers.map(p => {
        if (p.name === job.printer_name) {
          return { ...p, jobCount: (p.jobCount || 0) + 1, totalPrints: (p.totalPrints || 0) + job.pages };
        }
        return p;
      });
      storage.setPrinters(updatedPrinters);
    }
    return true;
  },

  cancelJob: (jobId: string) => {
    const jobs = storage.getJobs();
    const updatedJobs = jobs.map(j =>
      j.id === jobId ? { ...j, status: 'cancelled' as const, queue_position: undefined } : j
    );
    let pos = 1;
    const final = updatedJobs.map(j => {
      if ((j.status === 'queued' || j.status === 'printing') && j.id !== jobId) {
        return { ...j, queue_position: pos++ };
      }
      return j;
    });
    setStoredData('print_jobs', final);
    return true;
  },

  releaseJob: (jobId: string, pin: string) => {
    if (!pin || pin.trim() === '') throw new Error('PIN is required');
    const jobs = storage.getJobs();
    const users = storage.getUsers();
    const job = jobs.find(j => j.id === jobId);

    if (!job) throw new Error('Job not found');

    const user = users.find(u => u.id === job.user_id && u.pin && u.pin === pin);
    if (users.length > 0 && !user) throw new Error('Invalid PIN');

    const updatedJobs = jobs.map(j =>
      j.id === jobId
        ? { ...j, status: 'completed' as const, released_at: new Date().toISOString() }
        : j
    );

    setStoredData('print_jobs', updatedJobs);
    return true;
  },

  autoCancelExpiredJobs: (timeoutMinutes: number = 120) => {
    const jobs = storage.getJobs();
    const now = new Date();

    const updated = jobs.map(j => {
      if (j.status === 'queued' || j.status === 'printing') {
        const submittedTime = new Date(j.submitted_at);
        const elapsedMinutes = (now.getTime() - submittedTime.getTime()) / (1000 * 60);

        if (elapsedMinutes > timeoutMinutes && !j.released_at) {
          return {
            ...j,
            status: 'cancelled' as const,
            cancelled_at: now.toISOString(),
            auto_cancel_timeout_minutes: timeoutMinutes,
            queue_position: undefined,
          };
        }
      }
      return j;
    });

    let pos = 1;
    const reordered = updated.map(j => {
      if (j.status === 'queued' || j.status === 'printing') {
        return { ...j, queue_position: pos++ };
      }
      return j;
    });

    setStoredData('print_jobs', reordered);
    return true;
  },

  getPagesByUser: (): Record<string, { totalPages: number; bwPages: number; colorPages: number; jobs: number; pending: number; cancelled: number }> => {
    const allJobs = storage.getJobs();
    const result: Record<string, { totalPages: number; bwPages: number; colorPages: number; jobs: number; pending: number; cancelled: number }> = {};
    allJobs.forEach(j => {
      if (!result[j.user_id]) result[j.user_id] = { totalPages: 0, bwPages: 0, colorPages: 0, jobs: 0, pending: 0, cancelled: 0 };
      result[j.user_id].jobs += 1;
      if (j.status === 'queued' || j.status === 'printing') {
        result[j.user_id].pending += 1;
      } else if (j.status === 'cancelled') {
        result[j.user_id].cancelled += 1;
      } else if (j.status === 'completed') {
        result[j.user_id].totalPages += j.pages * j.copies;
        if (j.color_mode === 'color') result[j.user_id].colorPages += j.pages * j.copies;
        else result[j.user_id].bwPages += j.pages * j.copies;
      }
    });
    return result;
  },

  getStats: () => {
    const jobs = storage.getJobs();
    const scanJobs = storage.getScanJobs();
    const printers = storage.getPrinters();
    const completedJobs = jobs.filter(j => j.status === 'completed');

    const today = new Date().toISOString().split('T')[0];
    const jobsToday = jobs.filter(j => j.submitted_at.startsWith(today));
    const scansToday = scanJobs.filter(j => j.scanned_at.startsWith(today));

    const totalCost = completedJobs.reduce((sum, j) => sum + j.cost, 0);
    const totalPages = completedJobs.reduce((sum, j) => sum + j.pages, 0);
    const colorPages = completedJobs.filter(j => j.color_mode === 'color').reduce((sum, j) => sum + j.pages, 0);
    const bwPages = totalPages - colorPages;

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
        value: dayJobs.reduce((sum, j) => sum + j.pages, 0),
        bw: dayJobs.filter(j => j.color_mode === 'bw').reduce((sum, j) => sum + j.pages, 0),
        color: dayJobs.filter(j => j.color_mode === 'color').reduce((sum, j) => sum + j.pages, 0),
        scans: dayScans.reduce((sum, j) => sum + j.pages, 0),
      };
    });

    return {
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
  }
};

// Auto-seed admin user if none exists
if (storage.getUsers().length === 0) {
  storage.setUsers([
    {
      id: 'u1', employee_id: 'EMP001', name: 'Rajesh Kumar', department: 'IT', branch: 'Hinjewadi',
      pin: '1234', rfid: 'RFID001A2B3C', role: 'admin', email: 'rajesh@praj.com', status: 'active', monthlyQuota: 500,
      usedPages: 120, authMethod: 'RFID', totalCost: 25.50, lastPrint: new Date().toISOString()
    },
    {
      id: 'u2', employee_id: 'EMP002', name: 'Priya Sharma', department: 'Design', branch: 'Wakad',
      pin: '5678', rfid: 'RFID002D4E5F', role: 'employee', email: 'priya@praj.com', status: 'active', monthlyQuota: 300,
      usedPages: 245, authMethod: 'RFID', totalCost: 48.20, lastPrint: new Date().toISOString()
    },
    {
      id: 'u3', employee_id: 'EMP003', name: 'Arjun Singh', department: 'Operations', branch: 'Urawade',
      pin: '9012', rfid: 'RFID003G6H7I', role: 'employee', email: 'arjun@praj.com', status: 'active', monthlyQuota: 250,
      usedPages: 189, authMethod: 'RFID', totalCost: 37.80, lastPrint: new Date().toISOString()
    },
    {
      id: 'u4', employee_id: 'EMP004', name: 'Neha Gupta', department: 'Accounts', branch: 'Wakad',
      pin: '3456', rfid: 'RFID004J8K9L', role: 'employee', email: 'neha@praj.com', status: 'active', monthlyQuota: 200,
      usedPages: 156, authMethod: 'RFID', totalCost: 31.20, lastPrint: new Date().toISOString()
    },
    {
      id: 'u5', employee_id: 'EMP005', name: 'Amit Patel', department: 'Finance', branch: 'Hinjewadi',
      pin: '7890', rfid: 'RFID005M0N1O', role: 'admin', email: 'amit@praj.com', status: 'active', monthlyQuota: 400,
      usedPages: 198, authMethod: 'RFID', totalCost: 39.60, lastPrint: new Date().toISOString()
    },
  ]);
}

// Seed initial print jobs if none exist
if (storage.getJobs().length === 0) {
  const now = new Date();
  const d = (daysAgo: number) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - daysAgo);
    return dt.toISOString();
  };
  [
    { user_id: 'u2', userName: 'Priya Sharma', document_name: 'Q1_Report.pdf', printer_name: 'Xerox Workcentre 5335', pages: 12, color_mode: 'color', status: 'completed', submitted_at: d(0), cost: 6.00 },
    { user_id: 'u1', userName: 'Rajesh Kumar', document_name: 'Network_Diagram.docx', printer_name: 'HP LaserJet Pro M404', pages: 3, color_mode: 'bw', status: 'completed', submitted_at: d(0), cost: 0.30 },
    { user_id: 'u4', userName: 'Neha Gupta', document_name: 'Invoice_April.xlsx', printer_name: 'Xerox Workcentre 5335', pages: 4, color_mode: 'bw', status: 'completed', submitted_at: d(1), cost: 0.40 },
    { user_id: 'u3', userName: 'Arjun Singh', document_name: 'SOP_Document.pdf', printer_name: 'Ricoh MP C3003', pages: 20, color_mode: 'bw', status: 'completed', submitted_at: d(1), cost: 2.00 },
    { user_id: 'u5', userName: 'Amit Patel', document_name: 'Budget_FY26.xlsx', printer_name: 'HP LaserJet Pro M404', pages: 8, color_mode: 'color', status: 'completed', submitted_at: d(2), cost: 4.00 },
    { user_id: 'u2', userName: 'Priya Sharma', document_name: 'Brand_Guidelines.pdf', printer_name: 'Brother HL-L8360CDW', pages: 16, color_mode: 'color', status: 'completed', submitted_at: d(2), cost: 8.00 },
    { user_id: 'u1', userName: 'Rajesh Kumar', document_name: 'IT_Policy_2026.pdf', printer_name: 'Canon LBP2900', pages: 6, color_mode: 'bw', status: 'completed', submitted_at: d(3), cost: 0.60 },
    { user_id: 'u3', userName: 'Arjun Singh', document_name: 'Maintenance_Log.docx', printer_name: 'Kyocera ECOSYS', pages: 2, color_mode: 'bw', status: 'completed', submitted_at: d(3), cost: 0.20 },
    { user_id: 'u4', userName: 'Neha Gupta', document_name: 'Salary_Slips_April.pdf', printer_name: 'Xerox Workcentre 5335', pages: 30, color_mode: 'bw', status: 'completed', submitted_at: d(4), cost: 3.00 },
    { user_id: 'u5', userName: 'Amit Patel', document_name: 'Tax_Declaration.pdf', printer_name: 'HP LaserJet Pro M404', pages: 5, color_mode: 'bw', status: 'completed', submitted_at: d(5), cost: 0.50 },
  ].forEach(job => storage.addJob(job as any));
}

// One-time fix: replace any stale "John Doe" userName entries
(function fixStaleUserNames() {
  const users = storage.getUsers();
  const jobs = storage.getJobs();
  let changed = false;
  const fixed = jobs.map(j => {
    if (j.userName === 'John Doe' || !j.userName) {
      const u = users.find(u => u.id === j.user_id);
      if (u) { changed = true; return { ...j, userName: u.name }; }
    }
    return j;
  });
  if (changed) storage.setJobs(fixed);
})();

// Seed Praj printers (force-reset if using old IDs)
const existingPrinters = storage.getPrinters();
if (
  existingPrinters.some(p => p.id === 'p1' || p.id === 'p2' || p.id === 'usb-1') ||
  existingPrinters.length === 0 ||
  !existingPrinters.some(p => p.canScan !== undefined)
) {
  storage.setPrinters([
    {
      id: 'praj-p1',
      name: 'Canon LBP2900',
      location: 'Ground Floor — Lobby',
      branch: 'Hinjewadi',
      status: 'online',
      type: 'bw',
      tonerLevel: 85,
      paperLevel: 95,
      jobCount: 245,
      ip: '192.168.1.10',
      model: 'Canon LBP2900',
      totalPrints: 45230,
      totalScans: 0,
      lastMaintenance: '2026-05-15',
      canScan: false,
      inkLevels: { black: 85 },
    },
    {
      id: 'praj-p2',
      name: 'HP LaserJet Pro M404',
      location: '1st Floor — IT Dept',
      branch: 'Hinjewadi',
      status: 'online',
      type: 'color',
      tonerLevel: 60,
      paperLevel: 72,
      jobCount: 189,
      ip: '192.168.1.11',
      model: 'HP LaserJet Pro M404dn MFP',
      totalPrints: 38590,
      totalScans: 1820,
      lastMaintenance: '2026-05-10',
      canScan: true,
      inkLevels: { black: 60, cyan: 48, magenta: 52, yellow: 67 },
    },
    {
      id: 'praj-p3',
      name: 'Xerox Workcentre 5335',
      location: 'Office Area — 2nd Floor',
      branch: 'Wakad',
      status: 'online',
      type: 'color',
      tonerLevel: 75,
      paperLevel: 88,
      jobCount: 156,
      ip: '192.168.2.10',
      model: 'Xerox WorkCentre 5335',
      totalPrints: 28450,
      totalScans: 3640,
      lastMaintenance: '2026-05-08',
      canScan: true,
      inkLevels: { black: 75, cyan: 63, magenta: 70, yellow: 55 },
    },
    {
      id: 'praj-p4',
      name: 'Brother HL-L8360CDW',
      location: 'Design Dept — 2nd Floor',
      branch: 'Wakad',
      status: 'online',
      type: 'color',
      tonerLevel: 92,
      paperLevel: 100,
      jobCount: 78,
      ip: '192.168.2.11',
      model: 'Brother HL-L8360CDW',
      totalPrints: 15620,
      totalScans: 920,
      lastMaintenance: '2026-05-20',
      canScan: true,
      inkLevels: { black: 92, cyan: 88, magenta: 85, yellow: 90 },
    },
    {
      id: 'praj-p5',
      name: 'Ricoh MP C3003',
      location: 'Main Office — Ground Floor',
      branch: 'Urawade',
      status: 'online',
      type: 'color',
      tonerLevel: 68,
      paperLevel: 90,
      jobCount: 204,
      ip: '192.168.3.10',
      model: 'Ricoh MP C3003 MFP',
      totalPrints: 52340,
      totalScans: 4210,
      lastMaintenance: '2026-05-12',
      canScan: true,
      inkLevels: { black: 68, cyan: 45, magenta: 58, yellow: 72 },
    },
    {
      id: 'praj-p6',
      name: 'Kyocera ECOSYS',
      location: 'Logistics — Ground Floor',
      branch: 'Urawade',
      status: 'warning',
      type: 'bw',
      tonerLevel: 18,
      paperLevel: 35,
      jobCount: 98,
      ip: '192.168.3.11',
      model: 'Kyocera ECOSYS M2540dn',
      totalPrints: 18950,
      totalScans: 0,
      lastMaintenance: '2026-04-28',
      canScan: false,
      inkLevels: { black: 18 },
    },
  ]);
}

// Seed demo scan jobs if none exist
if (storage.getScanJobs().length === 0) {
  const now = new Date();
  const d = (daysAgo: number, hour = 10) => {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - daysAgo);
    dt.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
    return dt.toISOString();
  };
  [
    { user_id: 'u2', userName: 'Priya Sharma', document_name: 'Contract_Vendor_April.pdf', pages: 8, color_mode: 'color', resolution: 300, scanner_name: 'Xerox Workcentre 5335', scanner_ip: '192.168.2.10', destination: 'email', branch: 'Wakad', department: 'Design', scanned_at: d(0, 9), file_size: 2457600 },
    { user_id: 'u1', userName: 'Rajesh Kumar', document_name: 'Network_Topology_Diagram.pdf', pages: 2, color_mode: 'color', resolution: 600, scanner_name: 'HP LaserJet Pro M404', scanner_ip: '192.168.1.11', destination: 'app', branch: 'Hinjewadi', department: 'IT', scanned_at: d(0, 11), file_size: 1843200 },
    { user_id: 'u4', userName: 'Neha Gupta', document_name: 'Invoice_March_2026.pdf', pages: 3, color_mode: 'bw', resolution: 300, scanner_name: 'Xerox Workcentre 5335', scanner_ip: '192.168.2.10', destination: 'folder', branch: 'Wakad', department: 'Accounts', scanned_at: d(1, 14), file_size: 614400 },
    { user_id: 'u3', userName: 'Arjun Singh', document_name: 'Safety_Checklist.pdf', pages: 5, color_mode: 'bw', resolution: 300, scanner_name: 'Ricoh MP C3003', scanner_ip: '192.168.3.10', destination: 'email', branch: 'Urawade', department: 'Operations', scanned_at: d(1, 16), file_size: 1024000 },
    { user_id: 'u5', userName: 'Amit Patel', document_name: 'Audit_Report_Q4.pdf', pages: 15, color_mode: 'color', resolution: 300, scanner_name: 'HP LaserJet Pro M404', scanner_ip: '192.168.1.11', destination: 'email', branch: 'Hinjewadi', department: 'Finance', scanned_at: d(2, 10), file_size: 5120000 },
    { user_id: 'u2', userName: 'Priya Sharma', document_name: 'Design_Brief_May.pdf', pages: 4, color_mode: 'color', resolution: 600, scanner_name: 'Brother HL-L8360CDW', scanner_ip: '192.168.2.11', destination: 'app', branch: 'Wakad', department: 'Design', scanned_at: d(2, 15), file_size: 3276800 },
    { user_id: 'u3', userName: 'Arjun Singh', document_name: 'Purchase_Order_PO2045.pdf', pages: 2, color_mode: 'bw', resolution: 200, scanner_name: 'Ricoh MP C3003', scanner_ip: '192.168.3.10', destination: 'folder', branch: 'Urawade', department: 'Operations', scanned_at: d(3, 9), file_size: 409600 },
    { user_id: 'u1', userName: 'Rajesh Kumar', document_name: 'Server_Maintenance_Log.pdf', pages: 6, color_mode: 'bw', resolution: 300, scanner_name: 'HP LaserJet Pro M404', scanner_ip: '192.168.1.11', destination: 'folder', branch: 'Hinjewadi', department: 'IT', scanned_at: d(4, 13), file_size: 1228800 },
    { user_id: 'u4', userName: 'Neha Gupta', document_name: 'GST_Filing_April.pdf', pages: 10, color_mode: 'bw', resolution: 300, scanner_name: 'Xerox Workcentre 5335', scanner_ip: '192.168.2.10', destination: 'email', branch: 'Wakad', department: 'Accounts', scanned_at: d(5, 11), file_size: 2048000 },
    { user_id: 'u5', userName: 'Amit Patel', document_name: 'Board_Meeting_Minutes.pdf', pages: 7, color_mode: 'bw', resolution: 300, scanner_name: 'Ricoh MP C3003', scanner_ip: '192.168.3.10', destination: 'email', branch: 'Urawade', department: 'Finance', scanned_at: d(6, 14), file_size: 1433600 },
  ].forEach(job => storage.addScanJob(job as any));
}
