/**
 * PrintGuard Windows Agent — agent.js
 *
 * Install on your Windows Print Server (DenasaDC / 192.168.0.90).
 * Requires: Node.js 16+, Windows Print Management role, Active Directory (for user sync).
 *
 * Usage:
 *   node agent.js
 *
 * Environment variables (optional):
 *   PORT=7171                       HTTP port to listen on (default 7171)
 *   PRINTGUARD_API_KEY=mysecret     Shared secret — add same key in PrintGuard Settings
 *
 * The agent exposes a REST API that PrintGuard's backend calls via proxy.
 * All PowerShell commands run locally on the Windows Print Server.
 */

import http from "http";
import dgram from "dgram";
import { exec } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 7171;
const API_KEY = process.env.PRINTGUARD_API_KEY || "";
const ACCESS_FILE = path.join(__dirname, "printer_access.json");
const TEMP_DIR = os.tmpdir();
const SNMP_COMMUNITY = process.env.SNMP_COMMUNITY || "public";
const SNMP_TIMEOUT = Number(process.env.SNMP_TIMEOUT_MS) || 3000;

// ─── SNMP Toner (no external deps — pure UDP/BER) ────────────────────────────

// Minimal BER encoder for SNMP v2c GET request
function encodeBer(tag, content) {
  const len = content.length;
  const lenBytes = len < 128 ? [len] : [0x81, len];
  return Buffer.from([tag, ...lenBytes, ...content]);
}
function encodeInt(val) {
  let hex = val.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const bytes = hex.match(/.{2}/g).map(h => parseInt(h, 16));
  if (bytes[0] & 0x80) bytes.unshift(0);
  return encodeBer(0x02, bytes);
}
function encodeNull() { return Buffer.from([0x05, 0x00]); }
function encodeOid(oid) {
  const parts = oid.split(".").map(Number);
  const body = [40 * parts[0] + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    const v = parts[i];
    if (v < 128) { body.push(v); continue; }
    const enc = [];
    let n = v;
    while (n > 0) { enc.unshift(n & 0x7f); n >>= 7; }
    for (let j = 0; j < enc.length - 1; j++) enc[j] |= 0x80;
    body.push(...enc);
  }
  return encodeBer(0x06, body);
}
function buildSnmpGetRequest(community, oids, reqId) {
  const varbinds = oids.map(o => encodeBer(0x30, [...encodeOid(o), ...encodeNull()]));
  const varbindList = encodeBer(0x30, Buffer.concat(varbinds));
  const pdu = encodeBer(0xa0, Buffer.concat([
    encodeInt(reqId), encodeInt(0), encodeInt(0), varbindList,
  ]));
  const commBuf = Buffer.from(community, "ascii");
  const msg = encodeBer(0x30, Buffer.concat([
    encodeInt(1), // version 2c = 1
    encodeBer(0x04, commBuf),
    pdu,
  ]));
  return msg;
}
function parseSnmpResponse(buf) {
  const results = {};
  try {
    let pos = 2; // skip outer sequence tag+len
    if (buf[1] & 0x80) pos += buf[1] & 0x7f;
    // skip version
    const verLen = buf[pos + 1]; pos += 2 + verLen;
    // skip community
    const commLen = buf[pos + 1]; pos += 2 + commLen;
    // PDU
    pos += 2; // PDU tag+len
    if (buf[pos + 1] & 0x80) pos += buf[pos + 1] & 0x7f;
    // skip reqId, error, errorIdx (3 integers)
    for (let k = 0; k < 3; k++) { pos += 2 + buf[pos + 1]; }
    // varbind list
    const vblLen = buf[pos + 1]; pos += 2;
    const end = pos + vblLen;
    while (pos < end) {
      const seqLen = buf[pos + 1]; pos += 2;
      // OID
      const oidLen = buf[pos + 1]; pos += 2;
      const oidBytes = buf.slice(pos, pos + oidLen); pos += oidLen;
      // decode OID
      const parts = [Math.floor(oidBytes[0] / 40), oidBytes[0] % 40];
      let i = 1;
      while (i < oidBytes.length) {
        let val = 0;
        while (i < oidBytes.length && oidBytes[i] & 0x80) { val = (val << 7) | (oidBytes[i] & 0x7f); i++; }
        val = (val << 7) | oidBytes[i]; i++;
        parts.push(val);
      }
      const oidStr = parts.join(".");
      // Value
      const valTag = buf[pos]; const valLen = buf[pos + 1]; pos += 2;
      let value = null;
      if (valTag === 0x02 || valTag === 0x41 || valTag === 0x42 || valTag === 0x43) {
        // Integer or Counter
        let n = 0;
        for (let j = 0; j < valLen; j++) n = (n << 8) | buf[pos + j];
        if (valTag === 0x02 && buf[pos] & 0x80) n -= (1 << (valLen * 8));
        value = n;
      }
      results[oidStr] = value;
      pos += valLen;
    }
  } catch { /* ignore parse errors */ }
  return results;
}

async function snmpGetToner(ip, community = SNMP_COMMUNITY) {
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return null;
  const BASE = "1.3.6.1.2.1.43.11.1.1";
  const oids = [
    `${BASE}.8.1.1`, `${BASE}.9.1.1`, // black max/cur
    `${BASE}.8.1.2`, `${BASE}.9.1.2`, // cyan max/cur
    `${BASE}.8.1.3`, `${BASE}.9.1.3`, // magenta max/cur
    `${BASE}.8.1.4`, `${BASE}.9.1.4`, // yellow max/cur
  ];
  return new Promise((resolve) => {
    const reqId = Math.floor(Math.random() * 0xffff);
    const pkt = buildSnmpGetRequest(community, oids, reqId);
    const sock = dgram.createSocket("udp4");
    let done = false;
    const finish = (val) => { if (!done) { done = true; sock.close(); resolve(val); } };
    sock.once("error", () => finish(null));
    const timer = setTimeout(() => finish(null), SNMP_TIMEOUT);
    sock.once("message", (msg) => {
      clearTimeout(timer);
      try {
        const vals = parseSnmpResponse(msg);
        const pct = (maxOid, curOid) => {
          const m = vals[maxOid]; const c = vals[curOid];
          if (m == null || c == null || m <= 0 || c < 0) return null;
          return Math.min(100, Math.round((c / m) * 100));
        };
        const black = pct(`${BASE}.8.1.1`, `${BASE}.9.1.1`);
        if (black === null) return finish(null);
        const cyan = pct(`${BASE}.8.1.2`, `${BASE}.9.1.2`);
        const magenta = pct(`${BASE}.8.1.3`, `${BASE}.9.1.3`);
        const yellow = pct(`${BASE}.8.1.4`, `${BASE}.9.1.4`);
        const result = { black };
        if (cyan !== null) { result.cyan = cyan; result.magenta = magenta ?? 0; result.yellow = yellow ?? 0; }
        finish(result);
      } catch { finish(null); }
    });
    sock.bind(0, () => sock.send(pkt, 0, pkt.length, 161, ip));
  });
}

function extractIp(portName) {
  if (!portName) return null;
  const m = String(portName).match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  return m ? m[1] : null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadAccess() {
  try { return JSON.parse(fs.readFileSync(ACCESS_FILE, "utf8")); }
  catch { return {}; }
}

function saveAccess(data) {
  fs.writeFileSync(ACCESS_FILE, JSON.stringify(data, null, 2));
}

function runPS(script) {
  return new Promise((resolve, reject) => {
    const escaped = script.replace(/"/g, '\\"');
    exec(
      `powershell -NoProfile -NonInteractive -Command "${escaped}"`,
      { timeout: 20000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        resolve(stdout.trim());
      }
    );
  });
}

function safeJson(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); }
  catch { return fallback; }
}

function ensureArray(val) {
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(payload);
}

// ─── Route handlers ───────────────────────────────────────────────────────────

async function getHealth() {
  return { ok: true, server: "PrintGuard Agent", version: "1.0.0", host: os.hostname() };
}

async function getUsers() {
  try {
    const out = await runPS(
      "Get-ADUser -Filter * -Properties DisplayName,Department,EmailAddress,Enabled,Title " +
      "| Select-Object SamAccountName,Name,DisplayName,Department,EmailAddress,Enabled,Title " +
      "| ConvertTo-Json -Depth 2"
    );
    return ensureArray(safeJson(out, []));
  } catch (e) {
    return { error: String(e), hint: "Ensure this machine is a Domain Controller or has RSAT AD tools installed." };
  }
}

async function getPrinters() {
  try {
    const out = await runPS(
      "Get-Printer | Select-Object Name,PortName,DriverName,PrinterStatus,Shared,ShareName,JobCount " +
      "| ConvertTo-Json -Depth 2"
    );
    const printers = ensureArray(safeJson(out, []));
    const access = loadAccess();

    // Fetch SNMP toner for all printers in parallel (3s timeout each, best-effort)
    const tonerResults = await Promise.all(
      printers.map(p => snmpGetToner(extractIp(p.PortName)).catch(() => null))
    );

    return printers.map((p, i) => ({
      ...p,
      ip: extractIp(p.PortName),
      toner: tonerResults[i] || null,
      allowedUsers: access[p.Name] || [],
      accessMode: access[p.Name] ? "restricted" : "open",
    }));
  } catch (e) {
    return { error: String(e) };
  }
}

// Get toner for a single printer by IP
async function getTonerByIp(ip) {
  const toner = await snmpGetToner(ip);
  if (!toner) return { ok: false, ip, message: "No SNMP response — check SNMP is enabled on the printer and community string is correct" };
  return { ok: true, ip, toner };
}

async function getQueue(printerName) {
  try {
    let script;
    if (printerName && printerName !== "*") {
      script =
        `Get-PrintJob -PrinterName "${printerName}" -ErrorAction SilentlyContinue ` +
        "| Select-Object Id,PrinterName,UserName,DocumentName," +
        "@{N='JobStatus';E={[string]$_.JobStatus}},TotalPages," +
        "@{N='SubmittedTime';E={if($_.SubmittedTime){$_.SubmittedTime.ToString('o')}}} " +
        "| ConvertTo-Json -Depth 2";
    } else {
      script =
        "Get-Printer | ForEach-Object { " +
        "  Get-PrintJob -PrinterName $_.Name -ErrorAction SilentlyContinue " +
        "} | Select-Object Id,PrinterName,UserName,DocumentName," +
        "@{N='JobStatus';E={[string]$_.JobStatus}},TotalPages," +
        "@{N='SubmittedTime';E={if($_.SubmittedTime){$_.SubmittedTime.ToString('o')}}} " +
        "| ConvertTo-Json -Depth 2";
    }
    const out = await runPS(script);
    return ensureArray(safeJson(out, []));
  } catch (e) {
    return { error: String(e) };
  }
}

async function cancelJob(printerName, jobId) {
  try {
    await runPS(`Remove-PrintJob -PrinterName "${printerName}" -ID ${jobId} -ErrorAction Stop`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// All held/retained jobs across every printer (Secured Print waiting at printer)
async function getHeldJobs() {
  try {
    const script =
      "Get-Printer | ForEach-Object { " +
      "  Get-PrintJob -PrinterName $_.Name -ErrorAction SilentlyContinue | " +
      "  Where-Object { ($_.JobStatus -band 0x2000) -or ($_.JobStatus -band 0x0001) } " +
      "} | Select-Object Id,PrinterName,UserName,DocumentName," +
      "@{N='JobStatus';E={[string]$_.JobStatus}},TotalPages," +
      "@{N='SubmittedTime';E={if($_.SubmittedTime){$_.SubmittedTime.ToString('o')}}} " +
      "| ConvertTo-Json -Depth 2";
    const out = await runPS(script);
    return { ok: true, items: ensureArray(safeJson(out, [])) };
  } catch (e) {
    return { ok: false, error: String(e), items: [] };
  }
}

// All active jobs across every printer (queued + printing + held)
async function getAllSpoolerJobs() {
  try {
    const script =
      "Get-Printer | ForEach-Object { " +
      "  Get-PrintJob -PrinterName $_.Name -ErrorAction SilentlyContinue " +
      "} | Select-Object Id,PrinterName,UserName,DocumentName," +
      "@{N='JobStatus';E={[string]$_.JobStatus}},TotalPages," +
      "@{N='SubmittedTime';E={if($_.SubmittedTime){$_.SubmittedTime.ToString('o')}}} " +
      "| ConvertTo-Json -Depth 2";
    const out = await runPS(script);
    return { ok: true, items: ensureArray(safeJson(out, [])) };
  } catch (e) {
    return { ok: false, error: String(e), items: [] };
  }
}

// Release (resume) a held/retained print job — user entered PIN at printer panel
async function releaseSpoolerJob(printerName, jobId) {
  try {
    await runPS(`Resume-PrintJob -PrinterName "${printerName}" -ID ${jobId} -ErrorAction Stop`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Completed AND failed jobs from Windows Print Service Event Log
// Event 307 = printed successfully, Event 372 = job deleted/failed/cancelled
// Enable log first: wevtutil sl Microsoft-Windows-PrintService/Operational /e:true
async function getEventLogJobs(limit = 200) {
  try {
    const script =
      `Get-WinEvent -LogName 'Microsoft-Windows-PrintService/Operational' -MaxEvents ${limit} -ErrorAction SilentlyContinue | ` +
      "Where-Object { $_.Id -eq 307 -or $_.Id -eq 372 } | " +
      "ForEach-Object { " +
      "  $msg = $_.Message; " +
      "  $evtId = $_.Id; " +
      "  [PSCustomObject]@{ " +
      "    TimeCreated  = $_.TimeCreated.ToString('o'); " +
      "    EventId      = $evtId; " +
      "    JobStatus    = if ($evtId -eq 307) { 'completed' } else { 'failed' }; " +
      "    DocumentName = if ($msg -match 'Document (.+?),') { $Matches[1] } elseif ($msg -match 'document (.+?) owned') { $Matches[1] } else { 'Unknown' }; " +
      "    UserName     = if ($msg -match 'owned by (.+?) was') { $Matches[1] } elseif ($msg -match 'User (.+?) deleted') { $Matches[1] } else { [string]$_.UserId }; " +
      "    PrinterName  = if ($msg -match 'printed on (.+?) through') { $Matches[1] } elseif ($msg -match 'on printer (.+?)[,.]') { $Matches[1] } else { 'Unknown' }; " +
      "    Pages        = if ($msg -match '(\\d+) page') { [int]$Matches[1] } else { 0 }; " +
      "    Bytes        = if ($msg -match '(\\d+) bytes') { [int]$Matches[1] } else { 0 } " +
      "  } " +
      "} | ConvertTo-Json -Depth 2";
    const out = await runPS(script);
    return { ok: true, items: ensureArray(safeJson(out, [])) };
  } catch (e) {
    return {
      ok: false, error: String(e), items: [],
      hint: "Enable the Print Service log on this server: wevtutil sl Microsoft-Windows-PrintService/Operational /e:true"
    };
  }
}

async function allowUser(printerName, username) {
  const access = loadAccess();
  if (!access[printerName]) access[printerName] = [];
  if (!access[printerName].includes(username)) access[printerName].push(username);
  saveAccess(access);
  return { ok: true, printer: printerName, user: username, action: "allowed" };
}

async function denyUser(printerName, username) {
  const access = loadAccess();
  if (access[printerName]) {
    access[printerName] = access[printerName].filter((u) => u !== username);
    if (access[printerName].length === 0) delete access[printerName];
  }
  saveAccess(access);
  return { ok: true, printer: printerName, user: username, action: "denied" };
}

async function printJob(body) {
  const { printerName, fileBase64, fileName, copies = 1, username } = body;
  if (!printerName || !fileBase64 || !fileName) {
    return { ok: false, error: "printerName, fileBase64, fileName required" };
  }

  // Check access rules
  const access = loadAccess();
  if (access[printerName] && access[printerName].length > 0) {
    const sam = (username || "").split("\\").pop().toLowerCase();
    const allowed = access[printerName].map((u) => u.toLowerCase());
    if (!allowed.includes(sam)) {
      return { ok: false, error: `User '${username}' does not have access to '${printerName}'.` };
    }
  }

  // Write file to temp dir
  const tmpFile = path.join(TEMP_DIR, `pg_${randomUUID()}_${fileName}`);
  try {
    fs.writeFileSync(tmpFile, Buffer.from(fileBase64, "base64"));
  } catch (e) {
    return { ok: false, error: `Could not save temp file: ${e.message}` };
  }

  try {
    // Use PrintTo verb — supported by PDF readers, Office, image viewers
    const script =
      `$copies = ${Number(copies)}; ` +
      `$file = "${tmpFile.replace(/\\/g, "\\\\")}"; ` +
      `$printer = "${printerName}"; ` +
      `for ($i = 0; $i -lt $copies; $i++) { ` +
      `  Start-Process -FilePath $file -Verb PrintTo -ArgumentList $printer -Wait -ErrorAction Stop ` +
      `}`;
    await runPS(script);
    return { ok: true, printer: printerName, file: fileName, copies };
  } catch (e) {
    // Fallback: use lpr (Line Printer Remote) — works for LPD-enabled printers
    try {
      await runPS(`lpr -S localhost -P "${printerName}" "${tmpFile.replace(/\\/g, "\\\\")}"`);
      return { ok: true, printer: printerName, file: fileName, copies, method: "lpr" };
    } catch (e2) {
      return { ok: false, error: `PrintTo failed: ${e.message}. LPR fallback failed: ${e2.message}` };
    }
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,X-API-Key" });
    return res.end();
  }

  // API Key check
  if (API_KEY && req.headers["x-api-key"] !== API_KEY) {
    return send(res, 401, { error: "Unauthorized — invalid or missing X-API-Key header" });
  }

  const url = new URL(req.url, `http://localhost`);
  const pathname = url.pathname.replace(/\/$/, "") || "/";

  try {
    // GET /health
    if (req.method === "GET" && pathname === "/health") {
      return send(res, 200, await getHealth());
    }

    // GET /users
    if (req.method === "GET" && pathname === "/users") {
      return send(res, 200, await getUsers());
    }

    // GET /printers
    if (req.method === "GET" && pathname === "/printers") {
      return send(res, 200, await getPrinters());
    }

    // GET /queue?printer=NAME
    if (req.method === "GET" && pathname === "/queue") {
      return send(res, 200, await getQueue(url.searchParams.get("printer") || "*"));
    }

    // DELETE /queue?printer=NAME&jobId=ID
    if (req.method === "DELETE" && pathname === "/queue") {
      const printer = url.searchParams.get("printer");
      const jobId = url.searchParams.get("jobId");
      if (!printer || !jobId) return send(res, 400, { error: "printer and jobId required" });
      return send(res, 200, await cancelJob(printer, jobId));
    }

    // POST /printer/allow  { printer, username }
    if (req.method === "POST" && pathname === "/printer/allow") {
      const body = await readBody(req);
      if (!body.printer || !body.username) return send(res, 400, { error: "printer and username required" });
      return send(res, 200, await allowUser(body.printer, body.username));
    }

    // POST /printer/deny  { printer, username }
    if (req.method === "POST" && pathname === "/printer/deny") {
      const body = await readBody(req);
      if (!body.printer || !body.username) return send(res, 400, { error: "printer and username required" });
      return send(res, 200, await denyUser(body.printer, body.username));
    }

    // POST /print  { printerName, fileBase64, fileName, copies, username }
    if (req.method === "POST" && pathname === "/print") {
      const body = await readBody(req);
      return send(res, 200, await printJob(body));
    }

    // GET /jobs/held — Secured Print jobs waiting at printer (Retained status)
    if (req.method === "GET" && pathname === "/jobs/held") {
      return send(res, 200, await getHeldJobs());
    }

    // GET /jobs/all — all active spooler jobs across all printers
    if (req.method === "GET" && pathname === "/jobs/all") {
      return send(res, 200, await getAllSpoolerJobs());
    }

    // POST /jobs/release  { printerName, jobId }
    if (req.method === "POST" && pathname === "/jobs/release") {
      const body = await readBody(req);
      if (!body.printerName || body.jobId === undefined) {
        return send(res, 400, { error: "printerName and jobId required" });
      }
      return send(res, 200, await releaseSpoolerJob(body.printerName, body.jobId));
    }

    // GET /jobs/eventlog?limit=200 — completed jobs from Windows Event Log
    if (req.method === "GET" && pathname === "/jobs/eventlog") {
      const limit = parseInt(url.searchParams.get("limit") || "200", 10);
      return send(res, 200, await getEventLogJobs(limit));
    }

    // GET /toner?ip=192.168.1.50&community=public — live toner via SNMP
    if (req.method === "GET" && pathname === "/toner") {
      const ip = url.searchParams.get("ip");
      const community = url.searchParams.get("community") || SNMP_COMMUNITY;
      if (!ip) return send(res, 400, { error: "ip query param required" });
      return send(res, 200, await getTonerByIp(ip, community));
    }

    send(res, 404, { error: `No route: ${req.method} ${pathname}` });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: String(err) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`PrintGuard Agent listening on http://0.0.0.0:${PORT}`);
  console.log(`Host: ${os.hostname()}`);
  console.log(`API Key: ${API_KEY ? "set (protected)" : "NOT SET (open — set PRINTGUARD_API_KEY env var)"}`);
  console.log(`Access file: ${ACCESS_FILE}`);
  console.log(`Auto-hold: ${process.env.PRINTGUARD_AUTO_HOLD === "true" ? "ENABLED — new jobs will be suspended automatically" : "disabled (set PRINTGUARD_AUTO_HOLD=true to enable)"}`);
});

// ─── Auto-Hold: suspend every new non-paused print job ───────────────────────
// Enable by setting env var: PRINTGUARD_AUTO_HOLD=true
// This is what makes Secure Print work without touching individual PCs.
// All jobs that arrive at ANY printer queue are immediately paused and held
// until the user enters their PIN at the kiosk.
if (process.env.PRINTGUARD_AUTO_HOLD === "true") {
  const AUTO_HOLD_INTERVAL = Number(process.env.AUTO_HOLD_INTERVAL_MS) || 4000;
  const suspendScript =
    `Get-Printer | ForEach-Object { ` +
    `  $pn = $_.Name; ` +
    `  Get-PrintJob -PrinterName $pn -ErrorAction SilentlyContinue ` +
    `} | Where-Object { ` +
    `  ($_.JobStatus -band 0x0001) -eq 0 -AND ` + // not already Paused
    `  ($_.JobStatus -band 0x2000) -eq 0 -AND ` + // not Retained
    `  ($_.JobStatus -band 0x0010) -eq 0    ` +   // not Deleting
    `} | ForEach-Object { ` +
    `  Suspend-PrintJob -PrinterName $_.PrinterName -ID $_.ID -ErrorAction SilentlyContinue ` +
    `}`;

  setInterval(async () => {
    try { await runPS(suspendScript); } catch { /* ignore */ }
  }, AUTO_HOLD_INTERVAL);

  console.log(`Auto-hold loop started (every ${AUTO_HOLD_INTERVAL}ms)`);
}
