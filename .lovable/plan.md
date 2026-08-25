

## Smart Print Management Solution — Admin Dashboard MVP

A data-dense enterprise dashboard with mock data, serving both **IT Admins** and **End Users** with role-based views.

### Layout
- **Sidebar navigation** (collapsible) with sections: Dashboard, Printers, Print Jobs, Users, Cost Control, Reports, Settings
- **Dense data tables** with filters, sorting, and inline actions
- **Top header bar** with user role switcher (Admin/Employee toggle for demo), notifications bell, and search

### Pages & Features

#### 1. Dashboard (Home)
- KPI cards: Total prints today, active printers, cost this month, paper saved (duplex), pending jobs
- Charts: Print volume over time (line), department cost breakdown (bar), color vs B&W ratio (donut)
- Recent activity feed (last 10 print jobs)
- Printer health status overview (online/offline/warning counts)

#### 2. Printer Management
- Table of all printers: name, location, status (online/offline/error), type (color/B&W), IP, job count
- Inline status indicators (green/yellow/red dots)
- Detail panel: printer info, current queue, supply levels (toner, paper), maintenance log
- Add/edit printer form

#### 3. Print Jobs (Pull Printing Queue)
- **Admin view**: All jobs across all users with filters (user, printer, status, date range)
- **Employee view**: "My Print Jobs" — personal queue with ability to release/cancel jobs
- Job details: document name (metadata only), pages, color/B&W, duplex, status (queued/printing/completed/cancelled), cost
- Simulated "Release at Printer" button for pull-printing concept

#### 4. User Management
- User table: name, department, role, monthly quota, usage, status
- Per-user print history and cost summary
- Quota management: set/edit monthly page limits per user or department
- Authentication method indicator (PIN/RFID/SSO — displayed as mock badges)

#### 5. Cost Control & Policies
- Policy rules table: default B&W, duplex enforcement, color restrictions by role, max pages per job
- Department budget allocation and usage meters
- Cost-per-page configuration
- Monthly quota settings with visual progress bars

#### 6. Reports & Audit
- Filterable audit log: who, what, when, which printer, pages, cost
- Pre-built report views: Monthly usage summary, department comparison, cost trends
- Export buttons (CSV format simulation)
- Compliance status indicators

#### 7. Settings
- System configuration panel
- Notification preferences
- Role/permission overview

### Design
- Data-dense enterprise style with compact tables, small typography, multi-column layouts
- Neutral color palette with blue accent for primary actions
- Status colors: green (online/ok), amber (warning), red (error/offline)
- Cards with subtle borders, minimal shadows
- Charts using recharts library

### Mock Data
- 15-20 printers across 3 office locations
- 50+ users across 5 departments
- 200+ historical print jobs with realistic metadata
- Pre-calculated cost and usage statistics

