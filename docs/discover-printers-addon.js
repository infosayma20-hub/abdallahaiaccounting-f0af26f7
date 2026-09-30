/**
 * discover-printers-addon.js
 * Adds POST /discover-network-printers to the existing
 * print-bridge-v6.3.7-clean.js. Safely scans the local network for
 * printers listening on port 9100 (RAW/JetDirect).
 *
 *   POST /discover-network-printers
 *     body (all optional): { subnet, port, timeoutMs, from, to, concurrency }
 *     → { ok, subnets, port, scanned, elapsedMs, found: [{ip, port, status, label}] }
 *
 *   - If `subnet` is omitted, the bridge scans AUTOMATICALLY:
 *       1) every IPv4 network the computer is connected to (all interfaces)
 *       2) the /24 networks of printers already saved in device.json
 *     So printers on a different subnet than the PC (e.g. 178.10.1.x)
 *     are still found without typing anything.
 *   - Endpoint refuses requests not originating from 127.0.0.1 / ::1
 *   - Max 254 hosts per subnet per request
 *   - No data is written to printers; only a TCP connect() probe
 */

const net  = require('net');
const os   = require('os');
const fs   = require('fs');
const path = require('path');

function isValidPrefix(prefix) {
  const parts = prefix.split('.').map(Number);
  return parts.length === 3 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255);
}

/** All unique /24 prefixes of every non-internal IPv4 interface. */
function detectLocalPrefixes() {
  const out = new Set();
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const ni of (list || [])) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      const parts = ni.address.split('.');
      if (parts.length !== 4 || parts[0] === '127') continue;
      out.add(parts.slice(0, 3).join('.'));
    }
  }
  return [...out];
}

/** /24 prefixes of printers already saved in device.json (covers printers
 *  on a different subnet than the PC, e.g. 178.10.1.x). */
function configuredPrinterPrefixes() {
  const out = new Set();
  try {
    const file = path.join(__dirname, 'device.json');
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    const printers = Array.isArray(cfg?.printers) ? cfg.printers : [];
    for (const p of printers) {
      const ip = String(p?.ip || '').trim();
      const parts = ip.split('.');
      if (parts.length === 4 && parts.every(n => /^\d+$/.test(n) && Number(n) <= 255)) {
        out.add(parts.slice(0, 3).join('.'));
      }
    }
  } catch { /* no device.json yet — fine */ }
  return [...out];
}

function probe(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (open) => { if (done) return; done = true; try { sock.destroy(); } catch {} resolve(open); };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error',   () => finish(false));
    try { sock.connect(port, ip); } catch { finish(false); }
  });
}

async function runScan({ subnet, port, timeoutMs, from, to, concurrency }) {
  const ips = [];
  for (let i = from; i <= to; i++) ips.push(`${subnet}.${i}`);
  const found = [];
  let cursor = 0;
  async function worker() {
    while (cursor < ips.length) {
      const idx = cursor++;
      const ip = ips[idx];
      const open = await probe(ip, port, timeoutMs);
      if (open) found.push({ ip, port, status: 'open', label: 'طابعة محتملة' });
    }
  }
  const n = Math.max(1, Math.min(concurrency, ips.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  // sort by last octet
  found.sort((a, b) => Number(a.ip.split('.')[3]) - Number(b.ip.split('.')[3]));
  return found;
}

function cors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Private-Network', 'true');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function readJsonBody(req, limit = 8 * 1024) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  if (req.readableEnded || req.complete) return Promise.resolve({});
  return new Promise((resolve) => {
    let data = ''; let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) return;
      data += chunk;
      if (data.length > limit) { aborted = true; resolve(null); }
    });
    req.on('end', () => {
      if (aborted) return;
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

function isLocalRequest(req) {
  const ip = (req.ip || req.connection?.remoteAddress || '').replace('::ffff:', '');
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

module.exports = function attachDiscovery(app) {
  if (!app || typeof app.post !== 'function') {
    console.warn('[discover-printers] no express app passed — add-on disabled');
    return;
  }

  app.options('/discover-network-printers', (req, res) => { cors(req, res); res.sendStatus(204); });

  app.post('/discover-network-printers', async (req, res) => {
    cors(req, res);
    if (!isLocalRequest(req)) {
      return res.status(403).json({ ok: false, error: 'forbidden_remote' });
    }
    const body = (await readJsonBody(req)) || {};

    // subnets to scan
    let subnets = [];
    const manual = typeof body.subnet === 'string' ? body.subnet.trim().replace(/\.+$/, '') : '';
    if (manual) {
      if (!isValidPrefix(manual)) {
        return res.status(400).json({ ok: false, error: 'subnet_invalid', subnet: manual });
      }
      subnets = [manual];
    } else {
      // automatic: every local interface + subnets of already-configured printers
      subnets = [...new Set([...detectLocalPrefixes(), ...configuredPrinterPrefixes()])];
      if (!subnets.length) {
        return res.status(400).json({ ok: false, error: 'no_network_interface_found' });
      }
    }

    // port, timeout, range, concurrency
    const port        = Math.min(65535, Math.max(1, Number(body.port) || 9100));
    const timeoutMs   = Math.min(1500, Math.max(100, Number(body.timeoutMs) || 300));
    const from        = Math.min(254, Math.max(1, Number(body.from) || 1));
    const to          = Math.min(254, Math.max(from, Number(body.to) || 254));
    if (to - from + 1 > 254) {
      return res.status(400).json({ ok: false, error: 'range_too_large' });
    }
    const concurrency = Math.min(64, Math.max(1, Number(body.concurrency) || 30));

    const t0 = Date.now();
    try {
      const found = [];
      for (const subnet of subnets) {
        const hits = await runScan({ subnet, port, timeoutMs, from, to, concurrency });
        found.push(...hits);
        console.log(`[discover-printers] ${subnet}.${from}-${to} port ${port} → ${hits.length} hits`);
      }
      const elapsedMs = Date.now() - t0;
      res.json({
        ok: true,
        subnet: subnets[0],           // backward compat
        subnets,
        port,
        scanned: (to - from + 1) * subnets.length,
        elapsedMs,
        found,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'scan_failed', detail: String(e?.message || e) });
    }
  });

  console.log('[discover-printers] add-on loaded — POST /discover-network-printers (multi-subnet auto)');
};
