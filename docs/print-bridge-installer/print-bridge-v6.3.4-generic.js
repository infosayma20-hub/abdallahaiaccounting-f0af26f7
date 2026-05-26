/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AMWALI Print Bridge v6.3.4-generic
 *
 *  Based on v6.3.3 (kitchen-delivery fix + /print + /print-routed +
 *  logo composite + duplicate guard + drawer + shift print) with all
 *  Malaki-specific hardcoded values removed.
 *
 *  ── What's new vs v6.3.3 ───────────────────────────────────────────
 *   1) Generic: no hardcoded customer IPs, no Malaki station UUIDs,
 *      no "مطعم الملكي" default name, no C:\malaki-print logo path.
 *   2) Printers are loaded from c:\print-bridge\device.json via the
 *      device-config-addon. If the file is missing/empty, the bridge
 *      falls back to neutral DEFAULT_PRINTERS. Once device.json has
 *      printers, it becomes the source of truth — no stale default IPs.
 *   3) Adds network-printer auto-discovery via discover-printers-addon
 *      (POST /discover-network-printers).
 *   4) /health now reports `status, version, device, printers_source,
 *      printers[]`.
 *
 *  ── Files in c:\print-bridge\ ──────────────────────────────────────
 *    print-bridge-v6.3.4-generic.js    (this file)
 *    device-config-addon.js            (device.json persistence)
 *    discover-printers-addon.js        (network printer discovery)
 *    logo.png                          (optional, 240px target width)
 *    device.json                       (auto-created on first POS save)
 *
 *  Run:     node print-bridge-v6.3.4-generic.js
 *  Health:  GET http://127.0.0.1:3001/health
 * ═══════════════════════════════════════════════════════════════════════
 */

const express     = require('express');
const cors        = require('cors');
const bodyParser  = require('body-parser');
const net         = require('net');
const sharp       = require('sharp');
const fs          = require('fs');
const path        = require('path');
const os          = require('os');
const { spawn, execFile } = require('child_process');

// ────────────────────────────────────────────────────────────────────────
//  WINDOWS PRINTER SUPPORT
//  - listWindowsPrinters() uses PowerShell Get-Printer
//  - sendToWindowsPrinter() sends RAW ESC/POS bytes to a Windows printer
//    using the WinSpool API exposed through Add-Type in PowerShell.
// ────────────────────────────────────────────────────────────────────────
const IS_WINDOWS = process.platform === 'win32';

function runPowerShell(script, { input, timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    if (!IS_WINDOWS) return resolve({ ok: false, err: 'not_windows', stdout: '', stderr: '' });
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script];
    let child;
    try {
      child = spawn('powershell.exe', args, { windowsHide: true });
    } catch (e) {
      return resolve({ ok: false, err: e.message, stdout: '', stderr: '' });
    }
    let stdout = ''; let stderr = '';
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, timeoutMs);
    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    child.on('error', (e) => { clearTimeout(timer); resolve({ ok: false, err: e.message, stdout, stderr }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr, err: code === 0 ? null : `exit_${code}` });
    });
    if (input) { try { child.stdin.write(input); } catch {} }
    try { child.stdin.end(); } catch {}
  });
}

async function listWindowsPrinters() {
  if (!IS_WINDOWS) return { ok: false, err: 'not_windows', printers: [] };
  const script = `
    try {
      $p = Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus,WorkOffline,Shared,Default
      $p | ConvertTo-Json -Compress -Depth 3
    } catch {
      Write-Output "[]"
    }
  `;
  const r = await runPowerShell(script);
  if (!r.ok) return { ok: false, err: r.err || 'powershell_failed', printers: [] };
  let raw = (r.stdout || '').trim();
  if (!raw) return { ok: true, printers: [] };
  try {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const printers = arr.map((p) => ({
      name:          p.Name || '',
      driverName:    p.DriverName || '',
      portName:      p.PortName || '',
      printerStatus: (typeof p.PrinterStatus === 'object' && p.PrinterStatus !== null) ? (p.PrinterStatus.Value || String(p.PrinterStatus)) : (p.PrinterStatus ?? null),
      workOffline:   !!p.WorkOffline,
      shared:        !!p.Shared,
      default:       !!p.Default,
    })).filter((p) => p.name);
    return { ok: true, printers };
  } catch (e) {
    return { ok: false, err: 'parse_error: ' + e.message, printers: [], raw };
  }
}

// Send raw bytes to a Windows printer via WinSpool RAW datatype.
// Writes payload to a temp file, then runs a PowerShell script that
// P/Invokes OpenPrinter / StartDocPrinter / WritePrinter / EndDocPrinter.
async function sendToWindowsPrinter(printerName, payload, label) {
  if (!IS_WINDOWS) return { ok: false, err: 'not_windows' };
  if (!printerName) return { ok: false, err: 'missing_windowsPrinterName' };
  const tmp = path.join(os.tmpdir(), `amwali-print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.bin`);
  try {
    fs.writeFileSync(tmp, payload);
  } catch (e) {
    return { ok: false, err: 'tmp_write_failed: ' + e.message };
  }
  const psPrinter = String(printerName).replace(/'/g, "''");
  const psFile    = tmp.replace(/'/g, "''");
  const script = `
$ErrorActionPreference = 'Stop'
$code = @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct DOCINFOW { public string pDocName; public string pOutputFile; public string pDatatype; }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern int StartDocPrinter(IntPtr hPrinter, int level, [In] ref DOCINFOW pDI);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

  public static string SendBytesToPrinter(string printerName, byte[] bytes) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return "OpenPrinter_failed:" + Marshal.GetLastWin32Error();
    try {
      DOCINFOW di = new DOCINFOW();
      di.pDocName = "AMWALI Receipt";
      di.pDatatype = "RAW";
      if (StartDocPrinter(hPrinter, 1, ref di) == 0) return "StartDocPrinter_failed:" + Marshal.GetLastWin32Error();
      try {
        if (!StartPagePrinter(hPrinter)) return "StartPagePrinter_failed:" + Marshal.GetLastWin32Error();
        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
        try {
          Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
          Int32 written = 0;
          if (!WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out written)) return "WritePrinter_failed:" + Marshal.GetLastWin32Error();
          if (written != bytes.Length) return "WritePrinter_short:" + written + "/" + bytes.Length;
        } finally {
          Marshal.FreeCoTaskMem(pUnmanagedBytes);
        }
        EndPagePrinter(hPrinter);
      } finally { EndDocPrinter(hPrinter); }
    } finally { ClosePrinter(hPrinter); }
    return "OK";
  }
}
"@
Add-Type -TypeDefinition $code -Language CSharp | Out-Null
$bytes = [System.IO.File]::ReadAllBytes('${psFile}')
$result = [RawPrinter]::SendBytesToPrinter('${psPrinter}', $bytes)
Write-Output $result
if ($result -ne 'OK') { exit 1 }
`;
  const r = await runPowerShell(script, { timeoutMs: 20000 });
  try { fs.unlinkSync(tmp); } catch {}
  if (!r.ok) {
    const msg = (r.stdout || '').trim() || (r.stderr || '').trim() || r.err || 'powershell_failed';
    console.error(`[printer-error] ${label} → windows "${printerName}" → ${msg}`);
    return { ok: false, err: msg };
  }
  return { ok: true };
}

// ─── Logo loading — load as raw PNG buffer (NOT base64) ─────────────────
// sharp cannot reliably rasterize <image href="data:..."> inside SVG,
// so we keep the PNG bytes and composite them after svgToPng().
function loadLogoBuffer() {
  const candidates = [
    'C:\\print-bridge\\logo.png',
    path.join(__dirname, 'logo.png'),
    path.join(__dirname, 'assets', 'logo.png'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const b = fs.readFileSync(p);
        console.log(`[logo] loaded from ${p} (${b.length} bytes)`);
        return b;
      }
    } catch { /* ignore */ }
  }
  console.log('[logo] not found — receipts/shift will print without logo');
  return null;
}
const LOGO_BUF = loadLogoBuffer();

const LOGO_RECEIPT_WIDTH = 240;
let LOGO_RECEIPT_RESIZED = null;

async function getResizedLogo(targetWidth) {
  if (!LOGO_BUF) return null;
  if (LOGO_RECEIPT_RESIZED && LOGO_RECEIPT_RESIZED.width === targetWidth) {
    return LOGO_RECEIPT_RESIZED;
  }
  const { data, info } = await sharp(LOGO_BUF)
    .resize({ width: targetWidth, withoutEnlargement: false })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer({ resolveWithObject: true });
  LOGO_RECEIPT_RESIZED = { buffer: data, width: info.width, height: info.height };
  return LOGO_RECEIPT_RESIZED;
}

const app  = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json({ limit: '8mb' }));

// Allow private-network preflight from POS (Chrome PNA)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin',  req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.sendStatus(204);
  }
  next();
});

// ────────────────────────────────────────────────────────────────────────
//  Add-ons:
//   • device-config-addon → GET/POST /device-config, /reload-config,
//     /printers-active. Persists c:\print-bridge\device.json.
//   • discover-printers-addon → POST /discover-network-printers.
// ────────────────────────────────────────────────────────────────────────
let deviceCfg = { getConfig: () => ({}), getPrinters: () => null, getSource: () => 'fallback', reload: () => ({}) };
try {
  deviceCfg = require('./device-config-addon')(app) || deviceCfg;
} catch (e) {
  console.warn('[bridge] device-config-addon not loaded:', e.message);
}
try {
  require('./discover-printers-addon')(app);
} catch (e) {
  console.warn('[bridge] discover-printers-addon not loaded:', e.message);
}

// ────────────────────────────────────────────────────────────────────────
//  PRINTER REGISTRY
//   These are NEUTRAL defaults used only when device.json has no printers.
//   The POS pushes the real customer printers via POST /device-config,
//   and getActivePrinters() merges them on top of these defaults.
// ────────────────────────────────────────────────────────────────────────
const DEFAULT_PRINTERS = {
  receipt: { type: 'network', ip: '192.168.1.50', port: 9100, name: 'طابعة الفاتورة', width: 576 },
  kitchen: { type: 'network', ip: '192.168.1.51', port: 9100, name: 'طابعة المطبخ',  width: 576 },
  grill:   { type: 'network', ip: '192.168.1.52', port: 9100, name: 'طابعة الشواية', width: 576 },
  pizza:   { type: 'network', ip: '192.168.1.53', port: 9100, name: 'طابعة البيتزا', width: 576 },
};

// ────────────────────────────────────────────────────────────────────────
//  SUBNET-MISMATCH DETECTION
//   Detects when a configured printer IP is on a different subnet than
//   any of this host's network interfaces. Common cause: printer arrived
//   from factory with default 192.168.1.x while the branch LAN is 10.x.
// ────────────────────────────────────────────────────────────────────────
function ipToInt(ip) {
  const p = String(ip || '').split('.').map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
function maskToBits(mask) {
  const n = ipToInt(mask);
  if (n === null) return null;
  // count leading 1s
  let bits = 0;
  for (let i = 31; i >= 0; i--) {
    if ((n >>> i) & 1) bits++; else break;
  }
  return bits;
}
function getLocalSubnets() {
  const out = [];
  try {
    const ifs = os.networkInterfaces();
    for (const [name, addrs] of Object.entries(ifs || {})) {
      for (const a of addrs || []) {
        if (a.family !== 'IPv4' || a.internal) continue;
        const ipInt = ipToInt(a.address);
        const maskInt = ipToInt(a.netmask);
        if (ipInt === null || maskInt === null) continue;
        const networkInt = (ipInt & maskInt) >>> 0;
        out.push({
          iface: name,
          ip: a.address,
          netmask: a.netmask,
          cidr: a.cidr || `${a.address}/${maskToBits(a.netmask) ?? '?'}`,
          networkInt,
          maskInt,
        });
      }
    }
  } catch {}
  return out;
}
function checkSubnetMismatch(printerIp) {
  const ipInt = ipToInt(printerIp);
  if (ipInt === null) return { mismatch: false, reason: 'invalid_ip' };
  const subs = getLocalSubnets();
  if (!subs.length) return { mismatch: false, reason: 'no_local_ipv4' };
  const matching = subs.find((s) => ((ipInt & s.maskInt) >>> 0) === s.networkInt);
  if (matching) {
    return { mismatch: false, matchedInterface: matching.iface, matchedCidr: matching.cidr };
  }
  return {
    mismatch: true,
    reason: 'different_subnet',
    localSubnets: subs.map((s) => ({ iface: s.iface, cidr: s.cidr })),
  };
}
async function tcpProbe(ip, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const finish = (ok, err) => {
      if (done) return;
      done = true;
      try { s.destroy(); } catch {}
      resolve({ ok, err: err || null });
    };
    s.setTimeout(timeoutMs);
    s.once('connect', () => finish(true));
    s.once('timeout', () => finish(false, 'timeout'));
    s.once('error',   (e) => finish(false, e.code || e.message || 'error'));
    try { s.connect(port || 9100, ip); } catch (e) { finish(false, e.message); }
  });
}

function getActivePrinters() {
  const fromFile = deviceCfg.getPrinters();
  if (fromFile && typeof fromFile === 'object' && Object.keys(fromFile).length) {
    // Important: do NOT merge missing keys with defaults here.
    // If a branch uses only receipt + unified kitchen, fallback grill/pizza
    // IPs (192.168.1.50-53) must not reappear in /health or actual routing.
    const merged = {};
    for (const [k, v] of Object.entries(fromFile)) {
      if (!v) continue;
      merged[k] = {
        ...DEFAULT_PRINTERS[k],
        ...v,
        width: Number(v.width || (DEFAULT_PRINTERS[k] && DEFAULT_PRINTERS[k].width) || 576),
      };
    }
    return merged;
  }
  return DEFAULT_PRINTERS;
}

// ────────────────────────────────────────────────────────────────────────
//  ESC/POS CONSTANTS + CHUNKING
// ────────────────────────────────────────────────────────────────────────
const CMD = {
  INIT:        Buffer.from([0x1B, 0x40]),
  FEED_LINES:  (n) => Buffer.from([0x1B, 0x64, n]),
  CUT:         Buffer.from([0x1D, 0x56, 0x42, 0x00]),
  DRAWER:      Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]),
};

const MAX_CHUNK_HEIGHT = 48;

// ─── Anti-duplicate guard ───────────────────────────────────────────────
const recentJobs = new Map();
const DEDUPE_WINDOW_MS = 60_000;
function shouldBlockDuplicate(key) {
  const now = Date.now();
  for (const [k, t] of recentJobs) if (now - t > DEDUPE_WINDOW_MS) recentJobs.delete(k);
  const last = recentJobs.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) {
    console.log(`[duplicate-blocked] ${key} (${now - last}ms ago)`);
    return true;
  }
  recentJobs.set(key, now);
  return false;
}

// ─── Image → ESC/POS raster (chunked GS v 0) ────────────────────────────
function imageToEscPosChunks(rasterBytes, widthPx, heightPx) {
  const bytesPerRow = Math.ceil(widthPx / 8);
  const parts = [];
  for (let y = 0; y < heightPx; y += MAX_CHUNK_HEIGHT) {
    const rowsInChunk = Math.min(MAX_CHUNK_HEIGHT, heightPx - y);
    const sliceStart  = y * bytesPerRow;
    const sliceEnd    = sliceStart + rowsInChunk * bytesPerRow;
    const sliced      = rasterBytes.slice(sliceStart, sliceEnd);
    const header = Buffer.from([
      0x1D, 0x76, 0x30, 0x00,
      bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,
      rowsInChunk & 0xFF, (rowsInChunk >> 8) & 0xFF,
    ]);
    parts.push(Buffer.concat([header, sliced]));
  }
  return parts;
}

async function buildPrintJob(pngBuffer, targetWidthPx) {
  const { data, info } = await sharp(pngBuffer)
    .resize({ width: targetWidthPx, withoutEnlargement: false })
    .greyscale()
    .threshold(160)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const widthPx  = info.width;
  const heightPx = info.height;
  const bytesPerRow = Math.ceil(widthPx / 8);
  const packed = Buffer.alloc(bytesPerRow * heightPx, 0x00);
  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < widthPx; x++) {
      const pixel = data[y * widthPx + x];
      if (pixel === 0) {
        const byteIdx = y * bytesPerRow + (x >> 3);
        const bitIdx  = 7 - (x & 7);
        packed[byteIdx] |= (1 << bitIdx);
      }
    }
  }

  const chunks = imageToEscPosChunks(packed, widthPx, heightPx);
  console.log(`[chunk-send] ${chunks.length} chunks × ${MAX_CHUNK_HEIGHT} rows (${heightPx}px total)`);
  return Buffer.concat([
    CMD.INIT,
    ...chunks,
    CMD.FEED_LINES(4),
    CMD.CUT,
  ]);
}

// ────────────────────────────────────────────────────────────────────────
//  TCP TRANSMIT
// ────────────────────────────────────────────────────────────────────────
function sendToPrinter(ip, port, payload, label) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok, err) => { if (done) return; done = true; try { socket.destroy(); } catch {} resolve({ ok, err }); };
    socket.setTimeout(8000);
    socket.on('timeout', () => finish(false, 'timeout'));
    socket.on('error',   (e) => { console.error(`[printer-error] ${label} ${ip}:${port} → ${e.message}`); finish(false, e.message); });
    socket.connect(port, ip, () => {
      socket.write(payload, (err) => {
        if (err) return finish(false, err.message);
        setTimeout(() => finish(true, null), 300);
      });
    });
  });
}

// Send a raw payload to a configured printer (network OR windows).
// For "windows" type we don't have a built-in spooler path — log + fail
// gracefully so the POS can show a clear error to the cashier.
async function sendToPrinterDef(printer, payload, label) {
  if (!printer) return { ok: false, err: 'no_printer' };
  const type = (printer.type || 'network').toLowerCase();
  if (type === 'network') {
    if (!printer.ip) return { ok: false, err: 'missing_ip' };
    return await sendToPrinter(printer.ip, printer.port || 9100, payload, label);
  }
  if (type === 'windows' || type === 'usb') {
    const name = printer.windowsPrinterName || printer.name;
    if (!name) return { ok: false, err: 'missing_windowsPrinterName' };
    console.log(`[printer] ${label} → windows "${name}" (${payload.length} bytes RAW)`);
    return await sendToWindowsPrinter(name, payload, label);
  }
  return { ok: false, err: `unsupported_type:${type}` };
}

// ────────────────────────────────────────────────────────────────────────
//  RAW TEXT → ESC/POS
// ────────────────────────────────────────────────────────────────────────
function buildRawTextPayload(text) {
  const body = Buffer.from(String(text || ''), 'utf8');
  return Buffer.concat([
    CMD.INIT,
    body,
    CMD.FEED_LINES(4),
    CMD.CUT,
  ]);
}

// ────────────────────────────────────────────────────────────────────────
//  SVG TEMPLATES
// ────────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wrapTextForSvg(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

function renderReceiptSVG(order, logoTopMargin) {
  const W = 576;
  const padX = 24;
  const dateStr = new Date(order.createdAt || Date.now()).toLocaleDateString('en-GB');
  const timeStr = new Date(order.createdAt || Date.now()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const cfg = deviceCfg.getConfig() || {};
  const companyName = order.companyName || cfg.label || '';

  const rows = [];
  let y = 40 + (logoTopMargin || 0);
  const push = (h, fn) => { rows.push(fn(y)); y += h; };

  if (companyName) push(50, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="32" font-weight="900" font-family="Tahoma">${esc(companyName)}</text>`);
  if (order.terminalName) push(34, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="22" font-weight="800" font-family="Tahoma">${esc(order.terminalName)}</text>`);
  push(28, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="20" font-family="Tahoma">${dateStr} • ${timeStr}</text>`);
  push(16, () => '');
  push(54, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="34" font-weight="900" font-family="Tahoma">رقم الطلب</text>
    <text x="${padX}" y="${cy}" text-anchor="start" font-size="34" font-weight="900" font-family="Tahoma">${esc(order.queueNumber || order.orderNumber || '---')}</text>`);
  if (order.cashierName) push(30, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">الكاشير</text>
    <text x="${padX}" y="${cy}" text-anchor="start" font-size="22" font-weight="700" font-family="Tahoma">${esc(order.cashierName)}</text>`);
  push(30, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">نوع الطلب</text>
    <text x="${padX}" y="${cy}" text-anchor="start" font-size="22" font-weight="800" font-family="Tahoma">${esc(order.orderTypeLabel || 'محلي')}</text>`);
  if (order.tableNumber) push(30, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">الطاولة</text>
    <text x="${padX}" y="${cy}" text-anchor="start" font-size="22" font-weight="800" font-family="Tahoma">${esc(order.tableNumber)}</text>`);
  push(14, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="2"/>`);

  push(32, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end"    font-size="20" font-weight="800" font-family="Tahoma">الصنف</text>
    <text x="${W * 0.48}" y="${cy}" text-anchor="middle" font-size="20" font-weight="800" font-family="Tahoma">الكمية</text>
    <text x="${W * 0.30}" y="${cy}" text-anchor="middle" font-size="20" font-weight="800" font-family="Tahoma">السعر</text>
    <text x="${padX}" y="${cy}" text-anchor="start"      font-size="20" font-weight="800" font-family="Tahoma">المجموع</text>`);
  push(8, () => '');

  for (const it of (order.items || [])) {
    const qty   = it.quantity || 1;
    const price = Number(it.unitPrice || 0).toFixed(2);
    const total = (qty * Number(it.unitPrice || 0)).toFixed(2);
    const nameLines = wrapTextForSvg(String(it.name || ''), 22);
    const rowH = 42 + Math.max(0, nameLines.length - 1) * 32;
    push(rowH, (cy) => {
      const firstY = cy;
      const nameSvg = nameLines.map((ln, i) =>
        `<text x="${W - padX}" y="${firstY + i * 32}" text-anchor="end" font-size="24" font-weight="900" font-family="Tahoma">${esc(ln)}</text>`).join('');
      return `${nameSvg}
      <text x="${W * 0.48}" y="${firstY}" text-anchor="middle" font-size="24" font-weight="900" font-family="Tahoma">${qty}</text>
      <text x="${W * 0.30}" y="${firstY}" text-anchor="middle" font-size="22" font-weight="700" font-family="Tahoma">₪${price}</text>
      <text x="${padX}" y="${firstY}" text-anchor="start"      font-size="22" font-weight="800" font-family="Tahoma">₪${total}</text>`;
    });
    if (it.notes) {
      const noteLines = wrapTextForSvg(String(it.notes), 34);
      const noteH = 26 + Math.max(0, noteLines.length - 1) * 24;
      push(noteH, (cy) => noteLines.map((ln, i) =>
        `<text x="${W - padX - 12}" y="${cy + i * 24}" text-anchor="end" font-size="18" font-family="Tahoma">${i === 0 ? '+ ' : ''}${esc(ln)}</text>`).join(''));
    }
  }

  push(10, () => '');
  if (order.discount) push(28, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="20" font-weight="700" font-family="Tahoma">الخصم</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="20" font-weight="800" font-family="Tahoma">-₪${Number(order.discount).toFixed(2)}</text>`);

  push(12, () => '');
  push(70, (cy) => `
    <rect x="${padX}" y="${cy - 44}" width="${W - padX*2}" height="58" fill="none" stroke="#000" stroke-width="3"/>
    <text x="${W - padX - 10}" y="${cy}" text-anchor="end"   font-size="40" font-weight="900" font-family="Tahoma">الإجمالي</text>
    <text x="${padX + 10}" y="${cy}" text-anchor="start"     font-size="40" font-weight="900" font-family="Tahoma">₪${Number(order.total || 0).toFixed(2)}</text>`);

  push(32, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">طريقة الدفع</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="22" font-weight="800" font-family="Tahoma">${esc(order.paymentMethod || 'نقد')}</text>`);
  if (order.cashReceived) push(32, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">المبلغ المستلم</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="22" font-weight="800" font-family="Tahoma">₪${Number(order.cashReceived).toFixed(2)}</text>`);
  if (order.change) push(34, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="24" font-weight="900" font-family="Tahoma">الباقي</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="900" font-family="Tahoma">₪${Number(order.change).toFixed(2)}</text>`);

  if (order.orderNote) {
    push(10, () => '');
    const lines = wrapTextForSvg(esc(order.orderNote), 36);
    const boxH = 16 + lines.length * 28;
    push(boxH + 6, (cy) => `
      <rect x="${padX}" y="${cy - boxH + 4}" width="${W - padX*2}" height="${boxH}" fill="none" stroke="#000" stroke-width="2"/>
      ${lines.map((ln, i) => `<text x="${W - padX - 8}" y="${cy - boxH + 32 + i*28}" text-anchor="end" font-size="20" font-weight="800" font-family="Tahoma">${i === 0 ? '📝 ملاحظة: ' : ''}${ln}</text>`).join('')}`);
  }

  push(24, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="22" font-weight="800" font-family="Tahoma">❤️ شكراً لتعاملكم معنا</text>`);

  const H = y + 30;
  return { svg: `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fff"/>
  ${rows.join('\n')}
</svg>`, width: W, height: H };
}

function renderKitchenSVG(order, stationLabel) {
  const W = 384;
  const padX = 18;
  const topPad = 56;
  const now = new Date(order.createdAt || Date.now());
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-GB');
  const typeLabel = order.orderTypeLabel
    || (order.orderType === 'delivery' ? 'توصيل' : order.orderType === 'dine_in' ? 'محلي' : 'استلام');

  // Daily counter — POS sends padded value; fall back to queue/order number locally.
  const counterStr = order.dailyCounter
    || String(order.queueNumber || order.orderNumber || '---').replace(/\D/g, '').padStart(6, '0').slice(-6)
    || String(order.queueNumber || order.orderNumber || '---');

  // Total quantity — POS sends it; recompute defensively if missing.
  const totalQty = (typeof order.totalQty === 'number')
    ? order.totalQty
    : (order.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);

  // Order-info rows: only render rows whose value is non-empty.
  // Compact layout — counter and type are already shown big at the top,
  // so do NOT duplicate them here. Date + time merged into one row.
  const infoRows = [
    { label: 'التاريخ', value: `${timeStr} - ${dateStr}`, ltrValue: true },
    order.customerName ? { label: 'الزبون', value: String(order.customerName) } : null,
    order.customerPhone ? { label: 'الجوال', value: String(order.customerPhone), ltrValue: true } : null,
    order.pickupBy ? { label: 'ملاحظة', value: `استلام من ${order.pickupBy}` } : null,
    { label: 'مجموع الكميات', value: String(totalQty) },
  ].filter(Boolean);

  const rows = [];
  let y = topPad;
  const push = (h, fn) => { rows.push(fn(y)); y += h; };

  if (stationLabel) push(46, (cy) => `
    <text x="${W/2}" y="${cy}" text-anchor="middle" font-size="30" font-weight="900" font-family="Tahoma">${esc(stationLabel)}</text>
    <line x1="${padX}" y1="${cy + 8}" x2="${W - padX}" y2="${cy + 8}" stroke="#000" stroke-width="2"/>`);

  // ── HERO BLOCK: huge daily counter + type ──
  push(62, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="52" font-weight="900" font-family="Tahoma"># ${esc(counterStr)}</text>`);
  push(52, (cy) => `
    <rect x="${padX}" y="${cy - 38}" width="${W - padX*2}" height="48" fill="none" stroke="#000" stroke-width="3"/>
    <text x="${W/2}" y="${cy}" text-anchor="middle" font-size="28" font-weight="900" font-family="Tahoma">${esc(typeLabel)}</text>`);
  if (order.tableNumber) push(32, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="22" font-weight="900" font-family="Tahoma">طاولة: ${esc(order.tableNumber)}</text>`);

  // ── ORDER INFO BLOCK — two-column table (label right, value left), wrapped values ──
  push(10, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="2"/>`);
  const infoFont = 20;
  const infoLineH = 28;
  const valueWrap = 16; // chars per line for the value column
  for (const row of infoRows) {
    const valueLines = wrapTextForSvg(String(row.value), valueWrap);
    const rowH = Math.max(infoLineH, valueLines.length * infoLineH) + 4;
    push(rowH, (cy) => {
      const baseY = cy + infoFont - 4;
      const labelSvg = row.label
        ? `<text x="${W - padX}" y="${baseY}" text-anchor="end" font-size="${infoFont}" font-weight="900" font-family="Tahoma">${esc(row.label)}</text>`
        : '';
      const valueX = W / 2 - 8;
      const dirAttr = row.ltrValue ? ' direction="ltr"' : '';
      const valueSvg = valueLines.map((ln, i) =>
        `<text x="${valueX}" y="${baseY + i * infoLineH}" text-anchor="end" font-size="${infoFont}" font-weight="900" font-family="Tahoma"${dirAttr}>${esc(ln)}</text>`
      ).join('');
      const sep = `<line x1="${W/2 - 4}" y1="${cy}" x2="${W/2 - 4}" y2="${cy + rowH - 2}" stroke="#000" stroke-width="1"/>`;
      return `${sep}${labelSvg}${valueSvg}`;
    });
  }
  push(10, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="2"/>`);

  // ── ITEMS TABLE HEADER ──
  push(34, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="900" font-family="Tahoma">الاسم</text>
    <text x="${padX + 30}" y="${cy}" text-anchor="middle" font-size="22" font-weight="900" font-family="Tahoma">الكمية</text>
    <line x1="${padX}" y1="${cy + 8}" x2="${W - padX}" y2="${cy + 8}" stroke="#000" stroke-width="2"/>`);

  for (const it of (order.items || [])) {
    const qty = it.quantity || 1;
    const nameLines = wrapTextForSvg(String(it.name || ''), 18);
    const noteLinesArr = it.notes ? wrapTextForSvg(String(it.notes), 22) : [];
    const noteBlockH = noteLinesArr.length ? (noteLinesArr.length * 26 + 4) : 0;
    const rowH = 34 + Math.max(0, nameLines.length - 1) * 30 + noteBlockH + 8; // +8 for separator breathing
    push(rowH, (cy) => {
      const firstY = cy;
      const nameSvg = nameLines.map((ln, i) =>
        `<text x="${W - padX}" y="${firstY + i * 30}" text-anchor="end" font-size="26" font-weight="900" font-family="Tahoma">${esc(ln)}</text>`).join('');
      const qtySvg = `<text x="${padX + 30}" y="${firstY}" text-anchor="middle" font-size="26" font-weight="900" font-family="Tahoma">${qty}</text>`;
      const noteY0 = firstY + nameLines.length * 30 + 2;
      const notesSvg = noteLinesArr.map((ln, i) =>
        `<text x="${W - padX - 12}" y="${noteY0 + i * 26}" text-anchor="end" font-size="20" font-weight="700" font-family="Tahoma">${esc(ln)}</text>`).join('');
      // dashed separator between items
      const sepY = cy + rowH - 4;
      const sep = `<line x1="${padX}" y1="${sepY}" x2="${W - padX}" y2="${sepY}" stroke="#000" stroke-width="1" stroke-dasharray="4,4"/>`;
      return `${nameSvg}${qtySvg}${notesSvg}${sep}`;
    });
  }

  if (order.orderNote) {
    push(14, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="3"/>`);
    const noteLines = wrapTextForSvg(String(order.orderNote), 22);
    const boxH = 16 + noteLines.length * 28;
    push(boxH + 6, (cy) => `
      <rect x="${padX}" y="${cy - boxH + 4}" width="${W - padX*2}" height="${boxH}" fill="none" stroke="#000" stroke-width="2"/>
      ${noteLines.map((ln, i) => `<text x="${W - padX - 6}" y="${cy - boxH + 30 + i*28}" text-anchor="end" font-size="22" font-weight="900" font-family="Tahoma">${i === 0 ? '📝 ' : ''}${esc(ln)}</text>`).join('')}`);
  }

  const H = y + topPad;
  return `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fff"/>
  <rect x="2" y="2" width="${W-4}" height="${H-4}" fill="none" stroke="#000" stroke-width="4" rx="4"/>
  ${rows.join('\n')}
</svg>`;
}

function renderShiftSVG(session, logoTopMargin) {
  const W = 576;
  const padX = 24;
  const fmt = (n) => Number(n || 0).toFixed(2);
  const openedAt = session.sessionStart ? new Date(session.sessionStart) : null;
  const closedAt = session.sessionEnd   ? new Date(session.sessionEnd)   : new Date();
  const fmtDT = (d) => {
    if (!d) return '—';
    return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  };

  const cfg = deviceCfg.getConfig() || {};
  const branchName = session.branchName || cfg.label || '';

  const rows = [];
  let y = 40 + (logoTopMargin || 0);
  const push = (h, fn) => { rows.push(fn(y)); y += h; };

  push(50, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="34" font-weight="900" font-family="Tahoma">تسليم العهدة</text>`);
  if (branchName) push(34, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="22" font-weight="800" font-family="Tahoma">${esc(branchName)}</text>`);
  if (session.terminalName) push(28, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="20" font-family="Tahoma">${esc(session.terminalName)}</text>`);
  push(14, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="3"/>`);

  if (session.cashierName) push(32, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">الكاشير</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="22" font-weight="800" font-family="Tahoma">${esc(session.cashierName)}</text>`);
  push(32, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">فتح الوردية</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="20" font-weight="800" font-family="Tahoma">${esc(fmtDT(openedAt))}</text>`);
  push(32, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">إغلاق الوردية</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="20" font-weight="800" font-family="Tahoma">${esc(fmtDT(closedAt))}</text>`);
  push(14, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="2"/>`);

  push(34, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="24" font-weight="800" font-family="Tahoma">عدد الطلبات</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="900" font-family="Tahoma">${session.totalOrders || 0}</text>`);
  push(34, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="24" font-weight="800" font-family="Tahoma">إجمالي المبيعات</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="900" font-family="Tahoma">₪${fmt(session.totalSales)}</text>`);
  if (session.totalExpenses) push(34, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="24" font-weight="800" font-family="Tahoma">إجمالي المصروفات</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="900" font-family="Tahoma">₪${fmt(session.totalExpenses)}</text>`);
  push(14, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="2"/>`);

  push(30, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="24" font-weight="900" font-family="Tahoma">توزيع المبيعات</text>`);
  push(32, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">نقد</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="22" font-weight="800" font-family="Tahoma">₪${fmt(session.cashSales)}</text>`);
  push(32, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">بطاقة / فيزا</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="22" font-weight="800" font-family="Tahoma">₪${fmt(session.cardSales)}</text>`);
  push(14, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="3"/>`);

  push(30, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="24" font-weight="900" font-family="Tahoma">أرصدة الصندوق</text>`);
  push(32, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">الرصيد الافتتاحي</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="22" font-weight="800" font-family="Tahoma">₪${fmt(session.openingBalance)}</text>`);
  push(32, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">المتوقع (شيكل)</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="22" font-weight="800" font-family="Tahoma">₪${fmt(session.expectedCash)}</text>`);
  push(32, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">الفعلي (شيكل)</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="22" font-weight="800" font-family="Tahoma">₪${fmt(session.closingBalance)}</text>`);

  if (session.expectedCashUSD != null || session.closingCashUSD != null) {
    push(30, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="20" font-weight="700" font-family="Tahoma">المتوقع (دولار)</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="20" font-weight="800" font-family="Tahoma">$${fmt(session.expectedCashUSD)}</text>`);
    push(30, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="20" font-weight="700" font-family="Tahoma">الفعلي (دولار)</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="20" font-weight="800" font-family="Tahoma">$${fmt(session.closingCashUSD)}</text>`);
  }
  if (session.expectedCashJOD != null || session.closingCashJOD != null) {
    push(30, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="20" font-weight="700" font-family="Tahoma">المتوقع (دينار)</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="20" font-weight="800" font-family="Tahoma">${fmt(session.expectedCashJOD)} د.أ</text>`);
    push(30, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="20" font-weight="700" font-family="Tahoma">الفعلي (دينار)</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="20" font-weight="800" font-family="Tahoma">${fmt(session.closingCashJOD)} د.أ</text>`);
  }
  push(14, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="3"/>`);

  const diff = Number(session.difference || 0);
  const diffLabel = diff === 0 ? 'مطابق ✓' : diff > 0 ? `زيادة +₪${fmt(diff)}` : `عجز -₪${fmt(Math.abs(diff))}`;
  push(110, (cy) => `
    <rect x="${padX}" y="${cy - 78}" width="${W - padX*2}" height="96" fill="none" stroke="#000" stroke-width="3"/>
    <text x="${W/2}" y="${cy - 42}" text-anchor="middle" font-size="28" font-weight="900" font-family="Tahoma">الفرق</text>
    <text x="${W/2}" y="${cy - 4}"  text-anchor="middle" font-size="32" font-weight="900" font-family="Tahoma">${esc(diffLabel)}</text>`);

  push(30, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="20" font-family="Tahoma">توقيع الكاشير: ________________</text>`);
  push(24, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="20" font-weight="800" font-family="Tahoma">❤️ شكراً</text>`);

  const H = y + 30;
  return { svg: `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fff"/>
  ${rows.join('\n')}
</svg>`, width: W, height: H };
}

// ────────────────────────────────────────────────────────────────────────
//  SVG → PNG (with optional logo composite)
// ────────────────────────────────────────────────────────────────────────
async function svgToPngWithLogo(svgString, canvasW) {
  const basePng = await sharp(Buffer.from(svgString)).png().toBuffer();
  const logo = await getResizedLogo(LOGO_RECEIPT_WIDTH);
  if (!logo) return basePng;
  const left = Math.max(0, Math.floor((canvasW - logo.width) / 2));
  return await sharp(basePng)
    .composite([{ input: logo.buffer, top: 12, left }])
    .png()
    .toBuffer();
}

async function svgToPng(svg) {
  return await sharp(Buffer.from(svg)).png().toBuffer();
}

// ────────────────────────────────────────────────────────────────────────
//  ROUTES
// ────────────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const active = getActivePrinters();
  const cfg = deviceCfg.getConfig() || {};
  const localSubnets = getLocalSubnets().map((s) => ({ iface: s.iface, ip: s.ip, cidr: s.cidr }));
  const printers = await Promise.all(
    Object.entries(active).map(async ([key, p]) => {
      let status = 'n/a';
      let subnetInfo = null;
      if ((p.type || 'network') === 'network' && p.ip) {
        subnetInfo = checkSubnetMismatch(p.ip);
        try {
          const t = await new Promise((resolve) => {
            const s = new net.Socket();
            let done = false;
            const finish = (ok) => { if (done) return; done = true; try { s.destroy(); } catch {} resolve(ok); };
            s.setTimeout(1500);
            s.once('connect', () => finish(true));
            s.once('timeout', () => finish(false));
            s.once('error',   () => finish(false));
            try { s.connect(p.port || 9100, p.ip); } catch { finish(false); }
          });
          status = t ? 'online' : 'offline';
        } catch { status = 'offline'; }
      }
      return {
        key,
        name: p.name || key,
        type: p.type || 'network',
        ip: p.ip || null,
        port: p.port || null,
        windowsPrinterName: p.windowsPrinterName || null,
        width: p.width || 576,
        stationId: p.stationId || null,
        status,
        subnet_mismatch: subnetInfo ? !!subnetInfo.mismatch : false,
        subnet_info: subnetInfo,
      };
    })
  );
  const subnetWarnings = printers
    .filter((p) => p.subnet_mismatch)
    .map((p) => ({
      key: p.key,
      name: p.name,
      ip: p.ip,
      status: p.status,
      message: `الطابعة ${p.name} (${p.ip}) على Subnet مختلف عن الجهاز. شغّل DHCP عليها أو غيّر IP لنطاق الفرع.`,
    }));
  res.json({
    status: 'ok',
    version: '6.3.4-generic',
    online: true,
    logo: !!LOGO_BUF,
    windows_printers_supported: IS_WINDOWS,
    usb_raw_print_fix: 'intptr-marshaling-v1',
    subnet_check: 'subnet-mismatch-v1',
    host_subnets: localSubnets,
    subnet_warnings: subnetWarnings,
    device: {
      label:      cfg.label      || null,
      branchId:   cfg.branchId   || null,
      terminalId: cfg.terminalId || null,
      cashBoxId:  cfg.cashBoxId  || null,
      bridgeUrl:  cfg.bridgeUrl  || null,
    },
    printers_source: deviceCfg.getSource(),
    printers,
    timestamp: new Date().toISOString(),
  });
});

// ── /probe-printer — probe any IP:port and report subnet mismatch ──────
// GET /probe-printer?ip=192.168.1.87&port=9100
app.get('/probe-printer', async (req, res) => {
  const ip = String(req.query.ip || '').trim();
  const port = Number(req.query.port || 9100);
  if (!ip) return res.status(400).json({ ok: false, error: 'ip_required' });
  const subnet = checkSubnetMismatch(ip);
  const probe = await tcpProbe(ip, port, 2000);
  res.json({
    ok: true,
    ip,
    port,
    reachable: probe.ok,
    probe_error: probe.err,
    subnet_mismatch: !!subnet.mismatch,
    subnet_info: subnet,
    host_subnets: getLocalSubnets().map((s) => ({ iface: s.iface, ip: s.ip, cidr: s.cidr })),
    hint: subnet.mismatch
      ? 'الطابعة على Subnet مختلف. لو الراوتر بمررلها، الـ probe بنجح؛ غير هيك فعّل DHCP أو غيّر IP الطابعة.'
      : null,
  });
});

// ── /add-printer — force-add a printer even if subnet mismatches ───────
// POST { key, name, ip, port, width, stationId, force }
// Persists into device.json via the device-config addon.
app.post('/add-printer', express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    const key = String(body.key || '').trim();
    const ip  = String(body.ip || '').trim();
    if (!key || !ip) return res.status(400).json({ ok: false, error: 'key_and_ip_required' });
    const port = Number(body.port || 9100);
    const subnet = checkSubnetMismatch(ip);
    if (subnet.mismatch && !body.force) {
      return res.status(409).json({
        ok: false,
        error: 'subnet_mismatch',
        subnet_info: subnet,
        hint: 'أعد الطلب مع force:true لإضافتها رغم اختلاف الـ subnet.',
      });
    }
    const probe = await tcpProbe(ip, port, 2000);
    // Build merge payload for the device-config addon
    const printerObj = {
      type: 'network',
      name: body.name || key,
      ip, port,
      width: Number(body.width || 576),
    };
    if (body.stationId) printerObj.stationId = String(body.stationId);
    // Reuse the addon's internal flow by calling its own /device-config route
    // through a local HTTP round-trip would be overkill — instead, write directly:
    const cfg = deviceCfg.getConfig() || {};
    const printers = { ...(cfg.printers || {}), [key]: printerObj };
    const fsLocal = require('fs');
    const pathLocal = require('path');
    const FILE = pathLocal.join(__dirname, 'device.json');
    const next = { ...cfg, printers };
    try { fsLocal.writeFileSync(FILE, JSON.stringify(next, null, 2), 'utf8'); }
    catch (e) { return res.status(500).json({ ok: false, error: 'write_failed', detail: e.message }); }
    deviceCfg.reload();
    res.json({
      ok: true,
      added: { key, ...printerObj },
      reachable: probe.ok,
      probe_error: probe.err,
      subnet_mismatch: !!subnet.mismatch,
      forced: !!body.force && subnet.mismatch,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── /windows-printers — list installed Windows printers via PowerShell ──
app.get('/windows-printers', async (_req, res) => {
  try {
    const r = await listWindowsPrinters();
    if (!r.ok) {
      return res.status(200).json({ ok: false, error: r.err || 'unknown_error', printers: [] });
    }
    res.json({ ok: true, printers: r.printers });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message, printers: [] });
  }
});

app.post('/print-receipt', async (req, res) => {
  const order = req.body?.order || {};
  const jobKey = `receipt|${order.orderNumber || '?'}`;
  if (shouldBlockDuplicate(jobKey)) {
    console.log(`[duplicate-blocked] receipt #${order.orderNumber}`);
    return res.json({ success: true, duplicate: true });
  }
  console.log(`[print-start] receipt #${order.orderNumber}`);
  try {
    const printers = getActivePrinters();
    const receipt = printers.receipt;
    const logo = await getResizedLogo(LOGO_RECEIPT_WIDTH);
    const logoMargin = logo ? logo.height + 16 : 0;
    const { svg, width } = renderReceiptSVG(order, logoMargin);
    const png = await svgToPngWithLogo(svg, width);
    const payload = await buildPrintJob(png, receipt.width || 576);
    const r = await sendToPrinterDef(receipt, payload, 'receipt');
    console.log(`[print-end] receipt #${order.orderNumber} → ${r.ok ? 'OK' : 'FAIL: ' + r.err}`);
    res.json({ success: r.ok, error: r.err });
  } catch (e) {
    console.error('[printer-error] receipt', e);
    res.json({ success: false, error: e.message });
  }
});

app.post('/print-kitchen', async (req, res) => {
  const order      = req.body?.order || {};
  const printerKey = req.body?.printerKey || 'kitchen';
  const printers   = getActivePrinters();
  const printer    = printers[printerKey];
  const stationLbl = req.body?.stationLabel || (printer && printer.name) || '';
  if (!printer) return res.json({ success: false, error: `unknown_printer:${printerKey}` });

  const jobKey = `kitchen|${printerKey}|${order.orderNumber || '?'}`;
  if (shouldBlockDuplicate(jobKey)) {
    console.log(`[duplicate-blocked] kitchen/${printerKey} #${order.orderNumber}`);
    return res.json({ success: true, duplicate: true });
  }
  console.log(`[print-start] kitchen/${printerKey} #${order.orderNumber}`);
  try {
    const svg = renderKitchenSVG(order, stationLbl);
    const png = await svgToPng(svg);
    const payload = await buildPrintJob(png, printer.width || 576);
    const r = await sendToPrinterDef(printer, payload, `kitchen/${printerKey}`);
    console.log(`[print-end] kitchen/${printerKey} #${order.orderNumber} → ${r.ok ? 'OK' : 'FAIL: ' + r.err}`);
    res.json({ success: r.ok, error: r.err });
  } catch (e) {
    console.error('[printer-error] kitchen', e);
    res.json({ success: false, error: e.message });
  }
});

app.post('/print-shift', async (req, res) => {
  const session = req.body?.session || {};
  const jobKey = `shift|${session.sessionEnd || session.sessionStart || Date.now()}`;
  if (shouldBlockDuplicate(jobKey)) {
    console.log('[duplicate-blocked] shift summary');
    return res.json({ success: true, duplicate: true });
  }
  console.log('[print-start] shift summary');
  try {
    const printers = getActivePrinters();
    const receipt = printers.receipt;
    const logo = await getResizedLogo(LOGO_RECEIPT_WIDTH);
    const logoMargin = logo ? logo.height + 16 : 0;
    const { svg, width } = renderShiftSVG(session, logoMargin);
    const png = await svgToPngWithLogo(svg, width);
    const payload = await buildPrintJob(png, receipt.width || 576);
    const r = await sendToPrinterDef(receipt, payload, 'shift');
    console.log(`[print-end] shift → ${r.ok ? 'OK' : 'FAIL: ' + r.err}`);
    res.json({ success: r.ok, error: r.err });
  } catch (e) {
    console.error('[printer-error] shift', e);
    res.json({ success: false, error: e.message });
  }
});

app.post('/drawer', async (_req, res) => {
  const printers = getActivePrinters();
  const receipt = printers.receipt;
  const r = await sendToPrinterDef(receipt, CMD.DRAWER, 'drawer');
  res.json({ success: r.ok, error: r.err });
});

app.post('/test-printer', async (req, res) => {
  const { type, ip, port, windowsPrinterName } = req.body || {};
  const payload = Buffer.concat([
    CMD.INIT,
    Buffer.from('AMWALI TEST\n\n\n', 'utf8'),
    CMD.FEED_LINES(2),
    CMD.CUT,
  ]);
  if (type === 'windows' || windowsPrinterName) {
    const r = await sendToWindowsPrinter(windowsPrinterName, payload, 'test');
    return res.json({ success: r.ok, error: r.err });
  }
  const r = await sendToPrinter(ip, port || 9100, payload, 'test');
  res.json({ success: r.ok, error: r.err });
});

// ────────────────────────────────────────────────────────────────────────
//  ROUTING HELPERS — group items by destination printer
// ────────────────────────────────────────────────────────────────────────
function resolvePrinterKeyForItem(item, printers) {
  if (item.printerKey && printers[item.printerKey]) return item.printerKey;
  const stationIds = Array.isArray(item.print_station_ids)
    ? item.print_station_ids
    : (item.stationId ? [item.stationId] : []);
  for (const sid of stationIds) {
    for (const [key, p] of Object.entries(printers)) {
      if (p.stationId && p.stationId === sid) return key;
    }
  }
  return 'kitchen';
}

function groupItemsByPrinter(items) {
  const printers = getActivePrinters();
  const groups = {};
  for (const it of (items || [])) {
    const key = resolvePrinterKeyForItem(it, printers);
    const target = printers[key];
    console.log(`[route] item="${it.name || '?'}" → ${key} (${target ? (target.ip ? target.ip + ':' + target.port : target.windowsPrinterName) : 'NONE'})`);
    if (key === 'none') continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(it);
  }
  return groups;
}

async function printReceiptInternal(order) {
  try {
    const printers = getActivePrinters();
    const receipt = printers.receipt;
    const logo = await getResizedLogo(LOGO_RECEIPT_WIDTH);
    const logoMargin = logo ? logo.height + 16 : 0;
    const { svg, width } = renderReceiptSVG(order, logoMargin);
    const png = await svgToPngWithLogo(svg, width);
    const payload = await buildPrintJob(png, receipt.width || 576);
    const r = await sendToPrinterDef(receipt, payload, 'receipt');
    return { name: 'receipt', success: r.ok, error: r.err };
  } catch (e) {
    console.error('[printer-error] receipt', e);
    return { name: 'receipt', success: false, error: e.message };
  }
}

async function printKitchenInternal(order, printerKey) {
  const printers = getActivePrinters();
  const printer = printers[printerKey];
  if (!printer) return { name: printerKey, success: false, error: `unknown_printer:${printerKey}` };
  try {
    const stationLbl = printer.name || '';
    const svg = renderKitchenSVG(order, stationLbl);
    const png = await svgToPng(svg);
    const payload = await buildPrintJob(png, printer.width || 576);
    const r = await sendToPrinterDef(printer, payload, `kitchen/${printerKey}`);
    return { name: printer.name, success: r.ok, error: r.err };
  } catch (e) {
    console.error(`[printer-error] kitchen/${printerKey}`, e);
    return { name: printerKey, success: false, error: e.message };
  }
}

async function printRoutedKitchen(order) {
  const groups = groupItemsByPrinter(order.items || []);
  const results = [];
  for (const [key, items] of Object.entries(groups)) {
    const subOrder = { ...order, items };
    const jobKey = `kitchen|${key}|${order.orderNumber || '?'}`;
    if (shouldBlockDuplicate(jobKey)) {
      console.log(`[duplicate-blocked] kitchen/${key} #${order.orderNumber}`);
      results.push({ name: key, success: true, duplicate: true });
      continue;
    }
    console.log(`[print-start] kitchen/${key} #${order.orderNumber} (${items.length} items)`);
    const r = await printKitchenInternal(subOrder, key);
    console.log(`[print-end] kitchen/${key} #${order.orderNumber} → ${r.success ? 'OK' : 'FAIL: ' + r.error}`);
    results.push(r);
  }
  return results;
}

// ────────────────────────────────────────────────────────────────────────
//  /print — generic dispatcher (type: receipt | kitchen | both)
// ────────────────────────────────────────────────────────────────────────
app.post('/print', async (req, res) => {
  const body = req.body || {};

  if (body.ip && body.text != null) {
    const ip   = body.ip;
    const port = body.port || 9100;
    console.log(`[print] /print RAW → ${ip}:${port} (${String(body.text).length} chars)`);
    const payload = buildRawTextPayload(body.text);
    const r = await sendToPrinter(ip, port, payload, `raw/${ip}`);
    console.log(`[print-end] RAW ${ip}:${port} → ${r.ok ? 'OK' : 'FAIL: ' + r.err}`);
    return res.json({ success: r.ok, error: r.err, mode: 'raw', target: `${ip}:${port}` });
  }

  const { type = 'both', order = {} } = body;
  console.log(`[print] /print type=${type} #${order.orderNumber} items=${(order.items || []).length}`);
  const results = [];
  try {
    if (type === 'receipt' || type === 'both') {
      const jobKey = `receipt|${order.orderNumber || '?'}`;
      if (!shouldBlockDuplicate(jobKey)) {
        results.push(await printReceiptInternal(order));
      } else {
        results.push({ name: 'receipt', success: true, duplicate: true });
      }
    }
    if (type === 'kitchen' || type === 'both') {
      const kr = await printRoutedKitchen(order);
      results.push(...kr);
    }
    const success = results.every((r) => r.success);
    res.json({ success, results });
  } catch (e) {
    console.error('[printer-error] /print', e);
    res.json({ success: false, error: e.message, results });
  }
});

// ────────────────────────────────────────────────────────────────────────
//  /print-routed — kitchen-only, station-routed
// ────────────────────────────────────────────────────────────────────────
app.post('/print-routed', async (req, res) => {
  const body = req.body || {};

  if (body.ip && body.text != null) {
    const ip   = body.ip;
    const port = body.port || 9100;
    console.log(`[print] /print-routed RAW → ${ip}:${port} (${String(body.text).length} chars)`);
    const payload = buildRawTextPayload(body.text);
    const r = await sendToPrinter(ip, port, payload, `raw/${ip}`);
    console.log(`[print-end] RAW ${ip}:${port} → ${r.ok ? 'OK' : 'FAIL: ' + r.err}`);
    return res.json({ success: r.ok, error: r.err, mode: 'raw', target: `${ip}:${port}` });
  }

  const order = body.order || {};
  const itemCount = (order.items || []).length;
  console.log(`[print] /print-routed ORDER #${order.orderNumber} items=${itemCount}`);
  if (itemCount === 0) {
    const msg = 'no_items_to_route (expected order.items[] or flat {ip,port,text})';
    console.warn(`[print-warn] /print-routed → ${msg}`);
    return res.json({ success: false, error: msg, results: [] });
  }
  try {
    const results = await printRoutedKitchen(order);
    const success = results.every((r) => r.success);
    res.json({ success, results });
  } catch (e) {
    console.error('[printer-error] /print-routed', e);
    res.json({ success: false, error: e.message });
  }
});

app.listen(PORT, () => {
  const A = getActivePrinters();
  const fmt = (p) => p ? (p.type === 'network' ? `${p.ip}:${p.port}` : `windows:${p.windowsPrinterName}`) : '—';
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  AMWALI Print Bridge v6.3.4-generic');
  console.log(`  Printers source: ${deviceCfg.getSource()}`);
  console.log(`  Receipt: ${fmt(A.receipt)}`);
  console.log(`  Kitchen: ${fmt(A.kitchen)}`);
  console.log(`  Grill:   ${fmt(A.grill)}`);
  console.log(`  Pizza:   ${fmt(A.pizza)}`);
  console.log(`  Logo:    ${LOGO_BUF ? 'YES (' + LOGO_BUF.length + ' bytes)' : 'NO'}`);
  console.log(`  Listening on http://0.0.0.0:${PORT}`);
  console.log('═══════════════════════════════════════════════════════════');
});