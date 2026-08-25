import express from "express";
import cors from "cors";
import multer from "multer";
import net from "node:net";
import os from "node:os";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
let snmp = null;
try {
  snmp = _require("net-snmp");
} catch {
  console.warn("[snmp] net-snmp module not found — SNMP toner polling disabled. Run: npm install net-snmp");
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fsSync.mkdirSync(UPLOAD_DIR, { recursive: true });

const PRINTERS_FILE = path.join(DATA_DIR, "printers.json");
const HISTORY_FILE = path.join(DATA_DIR, "printHistory.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const CREDENTIALS_FILE = path.join(DATA_DIR, "login-credentials.json");

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch { return fallback; }
}
async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

const app = express();
const PORT = Number(process.env.PORT) || 3001;
app.use(cors());
app.use(express.json({ limit: "150mb" }));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// ---------- Helpers ----------

function getLocalSubnets() {
  const ifaces = os.networkInterfaces();
  const subnets = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        const parts = iface.address.split(".");
        subnets.push({ iface: name, address: iface.address, base: `${parts[0]}.${parts[1]}.${parts[2]}` });
      }
    }
  }
  return subnets;
}

function probeHost(ip, port, timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, ip);
  });
}

async function scanSubnet(base, ports = [9100, 631], onProgress) {
  const found = [];
  const ips = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`);
  const concurrency = 64;
  let cursor = 0;
  let done = 0;
  const total = ips.length;

  async function worker() {
    while (cursor < ips.length) {
      const ip = ips[cursor++];
      for (const port of ports) {
        const open = await probeHost(ip, port);
        if (open) {
          found.push({ ip, port });
          break;
        }
      }
      done++;
      if (onProgress && done % 16 === 0) onProgress(done, total);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return found;
}

// ---------- Agent proxy helper ----------

async function agentFetch(settings, method, agentPath, body) {
  const base = (settings.agentUrl || "").replace(/\/$/, "");
  if (!base) throw new Error("Print Server Agent URL not configured. Set it in Settings > Print Server.");
  const url = `${base}${agentPath}`;
  const headers = { "Content-Type": "application/json" };
  if (settings.agentKey) headers["X-API-Key"] = settings.agentKey;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: { error: text } }; }
}

// ---------- Routes ----------

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Auth
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "Username and password are required" });
  const credentials = await readJson(CREDENTIALS_FILE, []);
  const user = credentials.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: "Invalid username or password" });
  const { password: _pw, ...safeUser } = user;
  res.json({ ok: true, user: safeUser });
});

// Settings
app.get("/api/settings", async (_req, res) => {
  const settings = await readJson(SETTINGS_FILE, {});
  res.json(settings);
});
app.post("/api/settings", async (req, res) => {
  const existing = await readJson(SETTINGS_FILE, {});
  const updated = { ...existing, ...req.body };
  await writeJson(SETTINGS_FILE, updated);
  res.json(updated);
});

// ───── Print Server Agent proxy routes ─────

app.get("/api/agent/health", async (req, res) => {
  try {
    const saved = await readJson(SETTINGS_FILE, {});
    // Allow caller to override URL/key via query params (used by Settings "Test Connection")
    const settings = {
      agentUrl: req.query.url || saved.agentUrl,
      agentKey: req.query.key || saved.agentKey,
    };
    const { status, data } = await agentFetch(settings, "GET", "/health");
    res.status(status).json(data);
  } catch (e) {
    const agentUrl = req.query.url || (await readJson(SETTINGS_FILE, {})).agentUrl || "(not set)";
    const hint = /ECONNREFUSED|fetch failed/i.test(e.message)
      ? `Connection refused — if the app and agent are on the same machine, try using http://localhost:7171 instead of the LAN IP. Also check Windows Firewall allows port 7171.`
      : /ECONNRESET/i.test(e.message)
      ? "Connection was reset — the agent may have crashed. Restart it with: node agent.js"
      : /timeout|abort/i.test(e.message)
      ? "Connection timed out — check that the agent IP/port is correct and reachable."
      : e.message;
    res.status(503).json({ ok: false, error: hint, detail: e.message, agentUrl });
  }
});

app.get("/api/agent/printers", async (_req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, {});
    const { status, data } = await agentFetch(settings, "GET", "/printers");
    res.status(status).json(data);
  } catch (e) {
    res.json({ ok: false, error: e.message, items: [] });
  }
});

app.get("/api/agent/toner", async (req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, {});
    const ip = req.query.ip;
    const community = req.query.community || "";
    if (!ip) return res.status(400).json({ error: "ip required" });
    const qs = community ? `?ip=${encodeURIComponent(ip)}&community=${encodeURIComponent(community)}` : `?ip=${encodeURIComponent(ip)}`;
    const { status, data } = await agentFetch(settings, "GET", `/toner${qs}`);
    res.status(status).json(data);
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

app.get("/api/agent/users", async (_req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, {});
    const { status, data } = await agentFetch(settings, "GET", "/users");
    res.status(status).json(data);
  } catch (e) {
    res.json({ ok: false, error: e.message, items: [] });
  }
});

app.get("/api/agent/queue", async (req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, {});
    const printer = req.query.printer || "*";
    const { status, data } = await agentFetch(settings, "GET", `/queue?printer=${encodeURIComponent(printer)}`);
    res.status(status).json(data);
  } catch (e) {
    res.json({ ok: false, error: e.message, items: [] });
  }
});

app.delete("/api/agent/queue", async (req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, {});
    const { printer, jobId } = req.query;
    const { status, data } = await agentFetch(settings, "DELETE", `/queue?printer=${encodeURIComponent(printer)}&jobId=${encodeURIComponent(jobId)}`);
    res.status(status).json(data);
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

app.post("/api/agent/printer/allow", async (req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, {});
    const { status, data } = await agentFetch(settings, "POST", "/printer/allow", req.body);
    res.status(status).json(data);
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

// ───── Direct SNMP toner polling ─────

function walkOid(session, baseOid) {
  if (!snmp) return Promise.reject(new Error("net-snmp not installed"));

  return new Promise((resolve, reject) => {
    const results = {};
    session.subtree(
      baseOid,
      20,
      (varbinds) => {
        for (const vb of varbinds) {
          if (snmp.isVarbindError(vb)) continue;
          const val = Buffer.isBuffer(vb.value)
            ? vb.value.toString("utf8").replace(/\0/g, "").trim()
            : vb.value;
          results[vb.oid] = val;
        }
      },
      (error) => { if (error) reject(error); else resolve(results); }
    );
  });
}

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

app.get("/api/snmp/toner", async (req, res) => {
  if (!snmp) return res.status(503).json({ ok: false, error: "SNMP unavailable: run 'npm install net-snmp' on the print server machine" });

  const ip = (req.query.ip || "").trim();
  const community = req.query.community || "public";

  if (!ip) return res.status(400).json({ ok: false, error: "ip required" });
  if (!IPV4_RE.test(ip)) return res.status(400).json({ ok: false, error: `Invalid IP address: "${ip}"` });

  let session;
  try {
    session = snmp.createSession(ip, community, {
      version: snmp.Version2c,
      timeout: 5000,
      retries: 1,
    });

    // Absorb session-level errors so they don't crash the Node process
    session.on("error", (err) => {
      console.warn(`[snmp] session error for ${ip}: ${err.message}`);
    });

    // Walk OIDs sequentially on the same session to avoid concurrent UDP conflicts
    const levels        = await walkOid(session, "1.3.6.1.2.1.43.11.1.1.9");
    const maxCaps       = await walkOid(session, "1.3.6.1.2.1.43.11.1.1.8");
    const colorantIdxs  = await walkOid(session, "1.3.6.1.2.1.43.11.1.1.6");
    const colorantNames = await walkOid(session, "1.3.6.1.2.1.43.12.1.1.4");

    const supplies = [];
    for (const [oid, level] of Object.entries(levels)) {
      const parts = oid.split(".");
      const supplyIdx = parts[parts.length - 1];
      const devIdx   = parts[parts.length - 2];

      const maxCap     = maxCaps[`1.3.6.1.2.1.43.11.1.1.8.${devIdx}.${supplyIdx}`];
      const colorantIdx = colorantIdxs[`1.3.6.1.2.1.43.11.1.1.6.${devIdx}.${supplyIdx}`];

      const lvl = Number(level);
      const max = Number(maxCap);

      let pct = -1;
      if (lvl === -3 || lvl === -2) pct = -1;
      else if (max > 0 && lvl >= 0) pct = Math.min(100, Math.round((lvl / max) * 100));
      else if (lvl >= 0 && lvl <= 100 && max <= 0) pct = lvl;

      let colorName = "";
      if (colorantIdx && Number(colorantIdx) > 0) {
        const nameOid = `1.3.6.1.2.1.43.12.1.1.4.${devIdx}.${colorantIdx}`;
        colorName = (colorantNames[nameOid] || "").toLowerCase().trim();
      }
      supplies.push({ devIdx, supplyIdx, level: lvl, maxCap: max, pct, colorName });
    }

    const inkLevels = {};
    for (const s of supplies) {
      if (s.pct < 0) continue;
      const name = s.colorName;
      if (name.includes("black") || name === "k" || name.includes("blk") || name === "bk") {
        if (inkLevels.black === undefined || s.pct > inkLevels.black) inkLevels.black = s.pct;
      } else if (name.includes("cyan")    || name === "c") { inkLevels.cyan    = s.pct; }
        else if (name.includes("magenta") || name === "m") { inkLevels.magenta = s.pct; }
        else if (name.includes("yellow")  || name === "y") { inkLevels.yellow  = s.pct; }
    }

    if (Object.keys(inkLevels).length === 0 && supplies.length > 0) {
      const order = ["black", "cyan", "magenta", "yellow"];
      supplies.filter(s => s.pct >= 0).slice(0, 4).forEach((s, i) => { inkLevels[order[i]] = s.pct; });
    }

    session.close();
    res.json({ ok: true, inkLevels, supplies });
  } catch (e) {
    try { session && session.close(); } catch {}
    res.status(503).json({ ok: false, error: e.message });
  }
});

app.post("/api/agent/printer/deny", async (req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, {});
    const { status, data } = await agentFetch(settings, "POST", "/printer/deny", req.body);
    res.status(status).json(data);
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

// Print via agent (sends file as base64 JSON to agent, agent submits to Windows queue)
app.post("/api/agent/print", upload.single("file"), async (req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, {});
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const { printerName, copies = 1, username = "anonymous" } = req.body;
    if (!printerName) return res.status(400).json({ error: "printerName required" });

    const fileBuffer = await fs.readFile(req.file.path);
    const fileBase64 = fileBuffer.toString("base64");

    const { status, data } = await agentFetch(settings, "POST", "/print", {
      printerName,
      fileBase64,
      fileName: req.file.originalname,
      copies: Number(copies),
      username,
    });

    // Log to history
    const job = {
      id: randomUUID(),
      userId: req.body.userId || "anonymous",
      username,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      printerName,
      copies: Number(copies),
      colorMode: req.body.colorMode || "bw",
      pageSize: req.body.pageSize || "A4",
      duplex: req.body.duplex === "true",
      status: data.ok ? "completed" : "failed",
      error: data.error,
      via: "print-server-agent",
      createdAt: new Date().toISOString(),
    };
    const history = await readJson(HISTORY_FILE, []);
    await writeJson(HISTORY_FILE, [job, ...history]);

    res.status(status).json(data);
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

// ───── Spooler job monitoring routes ─────

app.get("/api/agent/jobs/held", async (_req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, {});
    const { status, data } = await agentFetch(settings, "GET", "/jobs/held");
    res.status(status).json(data);
  } catch (e) {
    res.json({ ok: false, error: e.message, items: [] });
  }
});

app.get("/api/agent/jobs/all", async (_req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, {});
    const { status, data } = await agentFetch(settings, "GET", "/jobs/all");
    res.status(status).json(data);
  } catch (e) {
    res.json({ ok: false, error: e.message, items: [] });
  }
});

app.post("/api/agent/jobs/release", async (req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, {});
    const { printerName, jobId, username, pages, documentName } = req.body;
    const { status, data } = await agentFetch(settings, "POST", "/jobs/release", { printerName, jobId });

    // Log the release to print history
    if (data.ok) {
      const job = {
        id: randomUUID(),
        userId: req.body.userId || "unknown",
        username: username || "unknown",
        fileName: documentName || "Unknown Document",
        fileSize: 0,
        printerName,
        copies: 1,
        colorMode: "bw",
        pageSize: "A4",
        duplex: false,
        pages: pages || 0,
        status: "completed",
        via: "secured-print-release",
        createdAt: new Date().toISOString(),
      };
      const history = await readJson(HISTORY_FILE, []);
      await writeJson(HISTORY_FILE, [job, ...history]);
    }

    res.status(status).json(data);
  } catch (e) {
    res.status(503).json({ ok: false, error: e.message });
  }
});

app.get("/api/agent/jobs/eventlog", async (req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, {});
    const limit = req.query.limit || 200;
    const { status, data } = await agentFetch(settings, "GET", `/jobs/eventlog?limit=${limit}`);

    // Sync completed/failed event-log jobs into print history (deduplicated by timestamp+user+doc)
    if (data.ok && Array.isArray(data.items) && data.items.length > 0) {
      const history = await readJson(HISTORY_FILE, []);
      const existingKeys = new Set(history.map(h => `${h.createdAt}|${h.username}|${h.fileName}`));
      const newJobs = data.items
        .filter(item => {
          const key = `${item.TimeCreated}|${item.UserName}|${item.DocumentName}`;
          return !existingKeys.has(key);
        })
        .map(item => ({
          id: randomUUID(),
          userId: "spooler",
          username: item.UserName || "unknown",
          fileName: item.DocumentName || "Unknown",
          fileSize: item.Bytes || 0,
          printerName: item.PrinterName || "Unknown",
          copies: 1,
          colorMode: "bw",
          pageSize: "A4",
          duplex: false,
          pages: item.Pages || 0,
          status: item.JobStatus || "completed",
          via: "windows-event-log",
          createdAt: item.TimeCreated || new Date().toISOString(),
        }));
      if (newJobs.length > 0) {
        await writeJson(HISTORY_FILE, [...newJobs, ...history]);
      }
    }

    res.status(status).json(data);
  } catch (e) {
    res.json({ ok: false, error: e.message, items: [] });
  }
});

// ───── Direct printer routes (existing) ─────

app.get("/api/printers/network", async (req, res) => {
  const subnetParam = req.query.subnet;
  const subnets = subnetParam
    ? [{ base: subnetParam, iface: "manual", address: `${subnetParam}.x` }]
    : getLocalSubnets();

  if (subnets.length === 0) {
    return res.json({ subnets: [], printers: [] });
  }

  try {
    const all = [];
    for (const s of subnets) {
      const hits = await scanSubnet(s.base);
      hits.forEach(({ ip, port }) => {
        all.push({
          id: `net-${ip}`,
          name: `Network Printer ${ip}`,
          ip,
          port,
          location: `Subnet ${s.base}.0/24`,
          status: "online",
          type: "bw",
          discoveredVia: port === 631 ? "IPP" : "RAW/9100",
        });
      });
    }
    res.json({ subnets, printers: all });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Scan failed", message: String(e) });
  }
});

app.get("/api/printers/probe", async (req, res) => {
  const ip = String(req.query.ip || "");
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return res.status(400).json({ error: "Invalid IP" });
  const ports = [9100, 631, 515];
  for (const port of ports) {
    const open = await probeHost(ip, port, 800);
    if (open) return res.json({ ip, port, online: true, protocol: port === 631 ? "IPP" : port === 515 ? "LPD" : "RAW" });
  }
  res.json({ ip, online: false });
});

app.get("/api/printers", async (_req, res) => {
  const printers = await readJson(PRINTERS_FILE, []);
  res.json(printers);
});

app.post("/api/printers", async (req, res) => {
  const printers = await readJson(PRINTERS_FILE, []);
  const printer = { id: req.body.id || `p-${randomUUID().slice(0, 8)}`, ...req.body };
  const next = [printer, ...printers.filter(p => p.id !== printer.id)];
  await writeJson(PRINTERS_FILE, next);
  res.json(printer);
});

app.delete("/api/printers/:id", async (req, res) => {
  const printers = await readJson(PRINTERS_FILE, []);
  await writeJson(PRINTERS_FILE, printers.filter(p => p.id !== req.params.id));
  res.json({ ok: true });
});

// Direct TCP RAW print (non-agent path)
app.post("/api/print", upload.single("file"), async (req, res) => {
  try {
    const { printerIp, printerName, copies = 1, colorMode = "bw", pageSize = "A4", duplex = "false", userId = "anonymous", username = "anonymous" } = req.body;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    if (!printerIp) return res.status(400).json({ error: "printerIp required" });

    const filePath = req.file.path;
    const fileBuffer = await fs.readFile(filePath);

    const sent = await new Promise((resolve, reject) => {
      const socket = new net.Socket();
      socket.setTimeout(8000);
      socket.once("error", reject);
      socket.once("timeout", () => { socket.destroy(); reject(new Error("Connection timeout")); });
      socket.connect(9100, printerIp, () => {
        for (let i = 0; i < Number(copies); i++) socket.write(fileBuffer);
        socket.end();
      });
      socket.once("close", () => resolve(true));
    }).catch(err => ({ error: err.message }));

    const job = {
      id: randomUUID(),
      userId,
      username,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      printerName: printerName || `Printer @ ${printerIp}`,
      printerIP: printerIp,
      copies: Number(copies),
      colorMode,
      pageSize,
      duplex: duplex === "true" || duplex === true,
      status: sent === true ? "completed" : "failed",
      error: sent && sent.error ? sent.error : undefined,
      createdAt: new Date().toISOString(),
    };

    const history = await readJson(HISTORY_FILE, []);
    await writeJson(HISTORY_FILE, [job, ...history]);

    if (job.status === "completed") res.json({ ok: true, job });
    else res.status(502).json({ ok: false, job, error: job.error });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/history", async (req, res) => {
  const history = await readJson(HISTORY_FILE, []);
  const { userId, printer, from, to } = req.query;
  let filtered = history;
  if (userId) filtered = filtered.filter(h => h.userId === userId);
  if (printer) filtered = filtered.filter(h => (h.printerName || "").toLowerCase().includes(String(printer).toLowerCase()));
  if (from) filtered = filtered.filter(h => h.createdAt >= from);
  if (to) filtered = filtered.filter(h => h.createdAt <= to);
  res.json(filtered);
});

app.get("/api/stats", async (_req, res) => {
  const history = await readJson(HISTORY_FILE, []);
  const printerCount = {};
  history.forEach(h => { printerCount[h.printerName] = (printerCount[h.printerName] || 0) + 1; });
  const mostUsed = Object.entries(printerCount).sort((a, b) => b[1] - a[1])[0];
  res.json({
    totalPrints: history.length,
    activeUsers: new Set(history.map(h => h.userId)).size,
    mostUsedPrinter: mostUsed ? { name: mostUsed[0], count: mostUsed[1] } : null,
    byStatus: history.reduce((acc, h) => { acc[h.status] = (acc[h.status] || 0) + 1; return acc; }, {}),
  });
});

app.get("/api/users", async (_req, res) => res.json(await readJson(USERS_FILE, [])));
app.post("/api/users", async (req, res) => {
  const users = await readJson(USERS_FILE, []);
  const user = { id: req.body.id || `u-${randomUUID().slice(0, 8)}`, ...req.body };
  await writeJson(USERS_FILE, [user, ...users.filter(u => u.id !== user.id)]);
  res.json(user);
});

const DIST_DIR = path.join(__dirname, "..", "dist");
const DIST_INDEX = path.join(DIST_DIR, "index.html");
if (fsSync.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(DIST_INDEX);
  });
} else {
  app.get("/", (_req, res) => {
    res.status(200).json({ ok: true, message: "API server is running. Frontend build not found." });
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Print API running at http://0.0.0.0:${PORT}`);
  const subs = getLocalSubnets();
  console.log(`Detected local subnets: ${subs.map(s => s.base + ".0/24").join(", ") || "(none)"}`);
});

// ───── Auto-sync event log every 30 seconds ─────
async function autoSyncEventLog() {
  try {
    const settings = await readJson(SETTINGS_FILE, {});
    if (!settings.agentUrl) return;
    const { data } = await agentFetch(settings, "GET", "/jobs/eventlog?limit=50");
    if (!data.ok || !Array.isArray(data.items) || data.items.length === 0) return;
    const history = await readJson(HISTORY_FILE, []);
    const existingKeys = new Set(history.map(h => `${h.createdAt}|${h.username}|${h.fileName}`));
    const newJobs = data.items
      .filter(item => !existingKeys.has(`${item.TimeCreated}|${item.UserName}|${item.DocumentName}`))
      .map(item => ({
        id: randomUUID(),
        userId: "spooler",
        username: item.UserName || "unknown",
        fileName: item.DocumentName || "Unknown",
        fileSize: item.Bytes || 0,
        printerName: item.PrinterName || "Unknown",
        copies: 1,
        colorMode: "bw",
        pageSize: "A4",
        duplex: false,
        pages: item.Pages || 0,
        status: item.JobStatus || "completed",
        via: "windows-event-log",
        createdAt: item.TimeCreated || new Date().toISOString(),
      }));
    if (newJobs.length > 0) {
      await writeJson(HISTORY_FILE, [...newJobs, ...history]);
      console.log(`[auto-sync] Captured ${newJobs.length} new print job(s) from event log`);
    }
  } catch {
    // Silent — agent may be unreachable
  }
}

setInterval(autoSyncEventLog, 30_000);
