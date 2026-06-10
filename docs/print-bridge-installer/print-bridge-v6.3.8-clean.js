/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AMWALI Print Bridge v6.3.7-clean
 *
 *  Based on v6.3.6-clean with focused ticket-readability fixes:
 *   - Kitchen ticket: removed the divider line directly above the
 *     الصنف/الكمية header row (cleaner separation).
 *   - Kitchen ticket: ALWAYS renders the customer order note in its own
 *     wrapped, downward-growing box (replacement banner + customer note
 *     are stacked separately).
 *   - Both tickets: items are prefixed with a bold bullet (●) on the
 *     name line so the line-item is visually distinct from its sub-notes
 *     (which still use "+ ").
 *   - All other v6.3.6 behaviours preserved (note-downward, dedupe, etc.)
 *
 *  Run:     node print-bridge-v6.3.7-clean.js
 *  Health:  GET http://127.0.0.1:3001/health
 * ═══════════════════════════════════════════════════════════════════════
 */

const express     = require('express');
const cors        = require('cors');
const bodyParser  = require('body-parser');

// v6.3.6-clean version + buildHash. buildHash is a sha1 of THIS file
// computed at startup, so operators can verify what's actually deployed.
const BRIDGE_VERSION = '6.3.7-clean';
const BRIDGE_FEATURES = [
  'note-downward',
  'dedupe-on-success',
  'clean-kitchen-ticket',
  'split-notes',
  'kitchen-note-stacked',
  'item-bullet-prefix',
  'no-line-above-items-header',
];
let BRIDGE_BUILD_HASH = 'unknown';
try {
  const _crypto = require('crypto');
  const _fs = require('fs');
  BRIDGE_BUILD_HASH = _crypto.createHash('sha1')
    .update(_fs.readFileSync(__filename))
    .digest('hex')
    .slice(0, 12);
} catch (_e) { /* ignore */ }
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
        LOGO_PATH_USED = p;
        return b;
      }
    } catch { /* ignore */ }
  }
  console.log('[logo] not found — receipts/shift will print without logo');
  LOGO_PATH_USED = null;
  LOGO_PATH_CANDIDATES = candidates;
  return null;
}
let LOGO_PATH_USED = null;
let LOGO_PATH_CANDIDATES = [];
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

// Allow private-network preflight from POS (Chrome PNA) BEFORE cors().
// The cors package answers OPTIONS immediately, so this must run first;
// otherwise hosted amwali.app can open /health directly but fetch() reports
// "غير متصل" because Chrome blocks the local-network preflight.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin',  req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, Authorization');
    return res.sendStatus(204);
  }
  next();
});

app.use(cors());
app.use(bodyParser.json({ limit: '8mb' }));

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
// v6.3.6-clean: dedupe-on-success.
// shouldBlockDuplicate() ONLY checks — it does NOT stamp. The caller must
// call stampJobSuccess(key) after the printer reports OK. This way a failed
// print (offline printer, network glitch) does NOT block the immediate
// retry the user triggers from the UI.
function shouldBlockDuplicate(key) {
  const now = Date.now();
  for (const [k, t] of recentJobs) if (now - t > DEDUPE_WINDOW_MS) recentJobs.delete(k);
  const last = recentJobs.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) {
    console.log(`[duplicate-blocked] ${key} (${now - last}ms ago)`);
    return true;
  }
  return false;
}
function stampJobSuccess(key) {
  recentJobs.set(key, Date.now());
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
  const max = Math.max(1, Number(maxChars) || 1);
  // First split on whitespace, then HARD-break any token longer than max.
  // This guarantees notes like "اختباراختباراختبار..." (no spaces) wrap
  // downward instead of overflowing the receipt / kitchen ticket box.
  const rawTokens = String(text ?? '').split(/\s+/).filter(Boolean);
  const tokens = [];
  for (const t of rawTokens) {
    if (t.length <= max) { tokens.push(t); continue; }
    for (let i = 0; i < t.length; i += max) tokens.push(t.slice(i, i + max));
  }
  const lines = [];
  let cur = '';
  for (const w of tokens) {
    const candidate = cur ? cur + ' ' + w : w;
    if (candidate.length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = candidate;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Normalize a counter/order number for display:
//  - "000005"            -> "5"
//  - "#000005"           -> "#5"
//  - "POS-20260602-0005" -> "5"  (strip zeros from last segment)
//  - "5"                 -> "5"
function normalizeCounter(v) {
  const raw = String(v ?? '').trim();
  if (!raw) return '---';
  const hash = raw.startsWith('#') ? '#' : '';
  const body = hash ? raw.slice(1).trim() : raw;
  if (/[-_/\s]/.test(body)) {
    const parts = body.split(/[-_/\s]+/);
    const last = parts[parts.length - 1] || '';
    if (/^\d+$/.test(last)) {
      const stripped = last.replace(/^0+(?=\d)/, '');
      return hash + (stripped || last);
    }
    return hash + body;
  }
  if (/^\d+$/.test(body)) {
    const stripped = body.replace(/^0+(?=\d)/, '');
    return hash + (stripped || body);
  }
  return hash + body;
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
    <text x="${padX}" y="${cy}" text-anchor="start" font-size="34" font-weight="900" font-family="Tahoma">${esc(normalizeCounter(order.queueNumber || order.orderNumber || '---'))}</text>`);
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

  // ── ITEMS GRID (v6.3.7-clean items-table) ────────────────────────────
  // Clean RTL table: [الصنف+ملاحظة] | [الكمية] | [السعر] | [المجموع]
  // Name + per-item note live in the SAME cell and wrap downward; qty/price/
  // total are vertically centered against the first text baseline. Row
  // height is dynamic; only thin horizontal separators are drawn (no
  // heavy borders) so the receipt stays light and readable.
  const colNameRight = W - padX;        // 552 — right edge of name cell
  const colNameLeft  = padX + 240;      // 264 — left edge of name cell
  const colQtyLeft   = padX + 180;      // 204
  const colQtyMid    = padX + 210;      // 234
  const colPriceLeft = padX + 90;       // 114
  const colPriceMid  = padX + 135;      // 159
  const colTotalMid  = padX + 45;       // 69
  const headerTopOffset = 26;           // text baseline above top border
  const rowTopOffset = 22;              // baseline above top of row box

  // Header band (top border + labels + bottom border)
  push(40, (cy) => `
    <text x="${(colNameLeft + colNameRight) / 2}" y="${cy}" text-anchor="middle" font-size="22" font-weight="800" font-family="Tahoma">الصنف</text>
    <text x="${colQtyMid}" y="${cy}" text-anchor="middle" font-size="22" font-weight="800" font-family="Tahoma">الكمية</text>
    <text x="${colPriceMid}" y="${cy}" text-anchor="middle" font-size="22" font-weight="800" font-family="Tahoma">السعر</text>
    <text x="${colTotalMid}" y="${cy}" text-anchor="middle" font-size="22" font-weight="800" font-family="Tahoma">المجموع</text>
    <line x1="${padX}" y1="${cy + 12}" x2="${W - padX}" y2="${cy + 12}" stroke="#000" stroke-width="1"/>`);

  for (const it of (order.items || [])) {
    const qty   = it.quantity || 1;
    const price = Number(it.unitPrice || 0).toFixed(2);
    const total = (qty * Number(it.unitPrice || 0)).toFixed(2);
    const nameLines = wrapTextForSvg(String(it.name || ''), 18);
    const noteLinesArr = it.notes ? wrapTextForSvg(String(it.notes), 22) : [];
    const nameLineH = 28;
    const noteLineH = 24;
    const contentH = nameLines.length * nameLineH
      + (noteLinesArr.length ? noteLinesArr.length * noteLineH + 4 : 0);
    const rowH = Math.max(40, contentH + 16);
    push(rowH, (cy) => {
      const nameY0 = cy;
      const nameSvg = nameLines.map((ln, i) =>
        `<text x="${colNameRight - 6}" y="${nameY0 + i * nameLineH}" text-anchor="end" font-size="22" font-weight="800" font-family="Tahoma">${esc(ln)}</text>`).join('');
      const noteY0 = nameY0 + nameLines.length * nameLineH + 2;
      const noteSvg = noteLinesArr.map((ln, i) =>
        `<text x="${colNameRight - 14}" y="${noteY0 + i * noteLineH}" text-anchor="end" font-size="18" font-weight="600" font-family="Tahoma">${i === 0 ? '+ ' : ''}${esc(ln)}</text>`).join('');
      const qtySvg   = `<text x="${colQtyMid}"   y="${nameY0}" text-anchor="middle" font-size="22" font-weight="800" font-family="Tahoma">${qty}</text>`;
      const priceSvg = `<text x="${colPriceMid}" y="${nameY0}" text-anchor="middle" font-size="20" font-weight="700" font-family="Tahoma">₪${price}</text>`;
      const totalSvg = `<text x="${colTotalMid}" y="${nameY0}" text-anchor="middle" font-size="20" font-weight="800" font-family="Tahoma">₪${total}</text>`;
      const bottomY = cy + rowH - rowTopOffset;
      const sepLine = `<line x1="${padX}" y1="${bottomY}" x2="${W - padX}" y2="${bottomY}" stroke="#000" stroke-width="0.7"/>`;
      return `${nameSvg}${noteSvg}${qtySvg}${priceSvg}${totalSvg}${sepLine}`;
    });
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
  // ── المبلغ المستلم: use the currency symbol that matches the tender ──
  // v6.3.7-clean cosmetic-only: read order.tenderedCurrency / paymentCurrency
  // / currency and pick the right symbol (₪ / $ / د.ا / €). Falls back to ₪
  // when no currency is sent. Amount itself is NOT changed.
  if (order.cashReceived) push(32, (cy) => {
    const code = String(order.tenderedCurrency || order.paymentCurrency || order.currency || 'ILS').toUpperCase();
    const sym = code === 'USD' ? '$'
              : code === 'EUR' ? '€'
              : code === 'JOD' ? 'د.ا'
              : '₪';
    return `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">المبلغ المستلم</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="22" font-weight="800" font-family="Tahoma">${sym}${Number(order.cashReceived).toFixed(2)}</text>`;
  });
  if (order.change) push(34, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="24" font-weight="900" font-family="Tahoma">الباقي</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="900" font-family="Tahoma">₪${Number(order.change).toFixed(2)}</text>`);

  // ── NOTES (customer receipt) ─────────────────────────────────────────
  // v6.3.6-clean: render notes in a clear box that ALWAYS grows downward.
  // Order of preference per source:
  //   1) order.customerNote        — explicit customer note (new)
  //   2) order.orderNote           — legacy single field (back-compat)
  // Delivery line is rendered as a SECOND box right below, so it is
  // visually separated from "شكراً لتعاملكم معنا".
  const customerNoteText = String(order.customerNote || order.orderNote || '').trim();
  const deliveryNoteText = String(order.deliveryNote || '').trim();
  const renderNoteBox = (text, label) => {
    if (!text) return;
    push(10, () => '');
    const lines = wrapTextForSvg(text, 36);
    const boxH = 16 + lines.length * 28;
    push(boxH + 12, (cy) => `
      <rect x="${padX}" y="${cy + 2}" width="${W - padX*2}" height="${boxH}" fill="none" stroke="#000" stroke-width="2"/>
      ${lines.map((ln, i) => `<text x="${W - padX - 8}" y="${cy + 28 + i*28}" text-anchor="end" font-size="20" font-weight="700" font-family="Tahoma">${i === 0 ? label + ' ' : ''}${esc(ln)}</text>`).join('')}`);
  };
  renderNoteBox(customerNoteText, 'ملاحظة:');
  renderNoteBox(deliveryNoteText, 'توصيل:');

  push(14, () => '');
  push(24, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="22" font-weight="700" font-family="Tahoma">شكراً لتعاملكم معنا</text>`);
  // ── AMWALI signature (customer receipt ONLY — never on kitchen tickets) ──
  push(10, () => '');
  push(34, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="28" font-weight="900" font-family="Tahoma" fill="#000">Powered by AMWALI ERP</text>`);
  push(24, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="16" font-weight="700" font-family="Tahoma" fill="#000">مشغّل بواسطة نظام أموالي ERP</text>`);

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
  const normalizedKitchenType = order.orderType === 'delivery'
    ? 'delivery'
    : order.orderType === 'dine_in' ? 'dine_in' : 'takeaway';

  // Daily counter — always strip leading zeros so "000005" prints as "5".
  const counterStr = normalizeCounter(
    order.dailyCounter || order.queueNumber || order.orderNumber || '---'
  );

  // Total quantity — POS sends it; recompute defensively if missing.
  const totalQty = (typeof order.totalQty === 'number')
    ? order.totalQty
    : (order.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0);

  // Order-info rows: kitchen tickets stay minimal.
  // v6.3.6-clean: drop customer phone (kitchen does not need it) and any
  // payment / source / delivery-fee fields. Customer name shown ONLY for
  // delivery / takeaway pickup so the kitchen knows whose order it is.
  const showCustomerLine =
    !!order.customerName && (normalizedKitchenType === 'delivery' || normalizedKitchenType === 'takeaway' || !!order.pickupBy);
  const infoRows = [
    { label: 'الوقت', value: `${timeStr} - ${dateStr}`, ltrValue: true },
    showCustomerLine ? { label: 'الزبون', value: String(order.customerName) } : null,
    order.pickupBy ? { label: 'استلام', value: String(order.pickupBy) } : null,
    { label: 'الكميات', value: String(totalQty) },
  ].filter(Boolean);

  const rows = [];
  let y = topPad;
  const push = (h, fn) => { rows.push(fn(y)); y += h; };

  // ── HERO BLOCK (v6.3.7-clean kitchen-header) ─────────────────────────
  // Order: station name → order type → order # → divider line.
  // Order number is moderate-sized (not huge) and ALWAYS without leading
  // zeros (normalizeCounter handles "000011" → "11").
  if (stationLabel) push(40, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="28" font-weight="800" font-family="Tahoma">${esc(stationLabel)}</text>`);
  push(34, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="24" font-weight="700" font-family="Tahoma">${esc(typeLabel)}</text>`);
  if (order.tableNumber) push(28, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="20" font-weight="700" font-family="Tahoma">طاولة: ${esc(order.tableNumber)}</text>`);
  push(38, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="34" font-weight="900" font-family="Tahoma"># ${esc(counterStr)}</text>`);
  push(10, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="2"/>`);

  // ── ORDER INFO BLOCK — two-column table (label right, value left), wrapped values ──
  const infoFont = 20;
  const infoLineH = 28;
  const valueWrap = 16; // chars per line for the value column
  for (const row of infoRows) {
    const valueLines = wrapTextForSvg(String(row.value), valueWrap);
    const rowH = Math.max(infoLineH, valueLines.length * infoLineH) + 4;
    push(rowH, (cy) => {
      const baseY = cy + infoFont - 4;
      const labelSvg = row.label
        ? `<text x="${W - padX}" y="${baseY}" text-anchor="end" font-size="${infoFont}" font-weight="700" font-family="Tahoma">${esc(row.label)}</text>`
        : '';
      const valueX = W / 2 - 8;
      const dirAttr = row.ltrValue ? ' direction="ltr"' : '';
      const valueSvg = valueLines.map((ln, i) =>
        `<text x="${valueX}" y="${baseY + i * infoLineH}" text-anchor="end" font-size="${infoFont}" font-weight="700" font-family="Tahoma"${dirAttr}>${esc(ln)}</text>`
      ).join('');
      return `${labelSvg}${valueSvg}`;
    });
  }
  // v6.3.7-clean: removed the divider line that used to sit directly above
  // the الصنف/الكمية header (it was visually noisy). The header itself
  // already provides enough separation.
  push(10, () => '');

  // ── ITEMS GRID (v6.3.7-clean items-table, kitchen) ───────────────────
  // Two columns RTL: [الصنف+ملاحظة] | [الكمية]. Same font-family + size
  // family as the customer receipt so kitchen tickets feel consistent.
  // No bullet/black-circle markers. Per-item note lives in the same cell
  // as the name and wraps inside the cell boundary.
  const kColNameRight = W - padX;
  const kColNameLeft  = padX + 72;     // left edge of name cell (cell width ≈ 276)
  const kColQtyLeft   = padX;
  const kColQtyMid    = padX + 36;
  const kHeaderTopOff = 22;
  const kRowTopOff    = 22;

  push(36, (cy) => `
    <line x1="${padX}" y1="${cy - kHeaderTopOff}" x2="${W - padX}" y2="${cy - kHeaderTopOff}" stroke="#000" stroke-width="1"/>
    <text x="${(kColNameLeft + kColNameRight) / 2}" y="${cy}" text-anchor="middle" font-size="22" font-weight="800" font-family="Tahoma">الصنف</text>
    <text x="${kColQtyMid}" y="${cy}" text-anchor="middle" font-size="22" font-weight="800" font-family="Tahoma">الكمية</text>
    <line x1="${padX}" y1="${cy + 10}" x2="${W - padX}" y2="${cy + 10}" stroke="#000" stroke-width="1"/>`);

  for (const it of (order.items || [])) {
    const qty = it.quantity || 1;
    const nameLines = wrapTextForSvg(String(it.name || ''), 18);
    const noteLinesArr = it.notes ? wrapTextForSvg(String(it.notes), 22) : [];
    const nameLineH = 28;
    const noteLineH = 24;
    const contentH = nameLines.length * nameLineH
      + (noteLinesArr.length ? noteLinesArr.length * noteLineH + 4 : 0);
    const rowH = Math.max(40, contentH + 16);
    push(rowH, (cy) => {
      const nameY0 = cy;
      const nameSvg = nameLines.map((ln, i) =>
        `<text x="${kColNameRight - 6}" y="${nameY0 + i * nameLineH}" text-anchor="end" font-size="22" font-weight="800" font-family="Tahoma">${esc(ln)}</text>`).join('');
      const noteY0 = nameY0 + nameLines.length * nameLineH + 2;
      const noteSvg = noteLinesArr.map((ln, i) =>
        `<text x="${kColNameRight - 14}" y="${noteY0 + i * noteLineH}" text-anchor="end" font-size="18" font-weight="600" font-family="Tahoma">${i === 0 ? '+ ' : ''}${esc(ln)}</text>`).join('');
      const qtySvg = `<text x="${kColQtyMid}" y="${nameY0}" text-anchor="middle" font-size="22" font-weight="900" font-family="Tahoma">${qty}</text>`;
      const bottomY = cy + rowH - kRowTopOff;
      const sepLine = `<line x1="${padX}" y1="${bottomY}" x2="${W - padX}" y2="${bottomY}" stroke="#000" stroke-width="0.7"/>`;
      return `${nameSvg}${noteSvg}${qtySvg}${sepLine}`;
    });
  }

  // ── KITCHEN NOTE BOXES (kitchen tickets only) ────────────────────────
  // v6.3.7-clean: BOTH the internal kitchenNote (e.g. "طلب معدل" banner)
  // AND the customer-facing orderNote are printed, each in its own
  // wrapped box that grows downward. They are stacked AFTER the items
  // table so the kitchen sees items first, notes second. Each note is
  // wrapped at 24 chars/line so it never overflows the 384px ticket.
  const noteFont = 20;
  const noteLineH = 26;
  const drawNoteBox = (text, label) => {
    if (!text) return;
    const lines = wrapTextForSvg(text, 24);
    const boxH = 14 + lines.length * noteLineH;
    push(10, () => '');
    push(boxH + 6, (cy) => `
      <rect x="${padX}" y="${cy + 2}" width="${W - padX*2}" height="${boxH}" fill="none" stroke="#000" stroke-width="1"/>
      ${lines.map((ln, i) => `<text x="${W - padX - 8}" y="${cy + 26 + i*noteLineH}" text-anchor="end" font-size="${noteFont}" font-weight="700" font-family="Tahoma">${i === 0 ? label + ' ' : ''}${esc(ln)}</text>`).join('')}`);
  };
  // Internal banner (replacement / cancellation) — printed FIRST so the
  // kitchen notices the operational change before reading the customer note.
  drawNoteBox(String(order.kitchenNote || '').trim(), 'تنبيه:');
  // Customer / invoice note — always shown on the ticket so the kitchen
  // sees special requests ("بدون بصل", "إضافة جبنة", …).
  drawNoteBox(String(order.orderNote || '').trim(), 'ملاحظة:');

  const H = y + topPad;
  return `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fff"/>
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

  push(58, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="42" font-weight="900" font-family="Tahoma">تسليم العهدة</text>`);
  if (branchName) push(38, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="26" font-weight="800" font-family="Tahoma">${esc(branchName)}</text>`);
  if (session.terminalName) push(32, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="23" font-weight="700" font-family="Tahoma">${esc(session.terminalName)}</text>`);
  push(14, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="3"/>`);

  if (session.cashierName) push(32, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">الكاشير</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="26" font-weight="800" font-family="Tahoma">${esc(session.cashierName)}</text>`);
  push(36, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">فتح الوردية</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="23" font-weight="800" font-family="Tahoma">${esc(fmtDT(openedAt))}</text>`);
  push(36, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">إغلاق الوردية</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="23" font-weight="800" font-family="Tahoma">${esc(fmtDT(closedAt))}</text>`);
  push(14, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="2"/>`);

  push(38, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="28" font-weight="800" font-family="Tahoma">عدد الطلبات</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="28" font-weight="900" font-family="Tahoma">${session.totalOrders || 0}</text>`);
  push(38, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="28" font-weight="800" font-family="Tahoma">إجمالي المبيعات</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="28" font-weight="900" font-family="Tahoma">₪${fmt(session.totalSales)}</text>`);
  if (session.totalExpenses) push(38, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="28" font-weight="800" font-family="Tahoma">إجمالي المصروفات</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="28" font-weight="900" font-family="Tahoma">₪${fmt(session.totalExpenses)}</text>`);
  push(14, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="2"/>`);

  push(34, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="28" font-weight="900" font-family="Tahoma">توزيع المبيعات</text>`);
  push(36, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">نقد</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="26" font-weight="800" font-family="Tahoma">₪${fmt(session.cashSales)}</text>`);
  push(36, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">بطاقة / فيزا</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="26" font-weight="800" font-family="Tahoma">₪${fmt(session.cardSales)}</text>`);
  push(14, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="3"/>`);

  push(34, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="28" font-weight="900" font-family="Tahoma">أرصدة الصندوق</text>`);
  push(36, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">الرصيد الافتتاحي</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="26" font-weight="800" font-family="Tahoma">₪${fmt(session.openingBalance)}</text>`);
  push(36, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">المتوقع (شيكل)</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="26" font-weight="800" font-family="Tahoma">₪${fmt(session.expectedCash)}</text>`);
  push(36, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">الفعلي (شيكل)</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="26" font-weight="800" font-family="Tahoma">₪${fmt(session.closingBalance)}</text>`);

  if (session.expectedCashUSD != null || session.closingCashUSD != null) {
    push(34, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="24" font-weight="700" font-family="Tahoma">المتوقع (دولار)</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="800" font-family="Tahoma">$${fmt(session.expectedCashUSD)}</text>`);
    push(34, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="24" font-weight="700" font-family="Tahoma">الفعلي (دولار)</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="800" font-family="Tahoma">$${fmt(session.closingCashUSD)}</text>`);
  }
  if (session.expectedCashJOD != null || session.closingCashJOD != null) {
    push(34, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="24" font-weight="700" font-family="Tahoma">المتوقع (دينار)</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="800" font-family="Tahoma">${fmt(session.expectedCashJOD)} د.أ</text>`);
    push(34, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="24" font-weight="700" font-family="Tahoma">الفعلي (دينار)</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="800" font-family="Tahoma">${fmt(session.closingCashJOD)} د.أ</text>`);
  }
  push(14, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="3"/>`);

  const diff = Number(session.difference || 0);
  const diffLabel = diff === 0 ? 'مطابق ✓' : diff > 0 ? `زيادة +₪${fmt(diff)}` : `عجز -₪${fmt(Math.abs(diff))}`;
  push(30, () => '');
  push(130, (cy) => {
    const boxH = 116;
    const boxY = cy - 92;
    return `
    <text x="${W/2}" y="${boxY + 44}" text-anchor="middle" font-size="32" font-weight="900" font-family="Tahoma">الفرق</text>
    <text x="${W/2}" y="${boxY + 88}" text-anchor="middle" font-size="38" font-weight="900" font-family="Tahoma">${esc(diffLabel)}</text>`;
  });

  push(34, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="24" font-family="Tahoma">توقيع الكاشير: ________________</text>`);
  push(28, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="24" font-weight="800" font-family="Tahoma">❤️ شكراً</text>`);

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
    version: BRIDGE_VERSION,
    buildHash: BRIDGE_BUILD_HASH,
    features: BRIDGE_FEATURES,
    online: true,
    logo: !!LOGO_BUF,
    logoPath: LOGO_PATH_USED,
    logoCandidates: LOGO_PATH_CANDIDATES,
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
  const jobKey = `receipt|${order.id || ''}|${order.orderNumber || '?'}`;
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
    if (r.ok) stampJobSuccess(jobKey);
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

  const jobKey = `kitchen|${printerKey}|${order.id || ''}|${order.orderNumber || '?'}`;
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
    if (r.ok) stampJobSuccess(jobKey);
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
    if (r.ok) stampJobSuccess(jobKey);
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
    const jobKey = `kitchen|${key}|${order.id || ''}|${order.orderNumber || '?'}`;
    if (shouldBlockDuplicate(jobKey)) {
      console.log(`[duplicate-blocked] kitchen/${key} #${order.orderNumber}`);
      results.push({ name: key, success: true, duplicate: true });
      continue;
    }
    console.log(`[print-start] kitchen/${key} #${order.orderNumber} (${items.length} items)`);
    const r = await printKitchenInternal(subOrder, key);
    if (r.success) stampJobSuccess(jobKey);
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
      const jobKey = `receipt|${order.id || ''}|${order.orderNumber || '?'}`;
      if (!shouldBlockDuplicate(jobKey)) {
        const r = await printReceiptInternal(order);
        if (r.success) stampJobSuccess(jobKey);
        results.push(r);
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
  console.log(`  AMWALI Print Bridge v${BRIDGE_VERSION}  build=${BRIDGE_BUILD_HASH}`);
  console.log(`  Features: ${BRIDGE_FEATURES.join(', ')}`);
  console.log(`  Printers source: ${deviceCfg.getSource()}`);
  console.log(`  Receipt: ${fmt(A.receipt)}`);
  console.log(`  Kitchen: ${fmt(A.kitchen)}`);
  console.log(`  Grill:   ${fmt(A.grill)}`);
  console.log(`  Pizza:   ${fmt(A.pizza)}`);
  console.log(`  Logo:    ${LOGO_BUF ? 'YES (' + LOGO_BUF.length + ' bytes)' : 'NO'}`);
  console.log(`  Listening on http://0.0.0.0:${PORT}`);
  console.log('═══════════════════════════════════════════════════════════');
});