/**
 * AMWALI Print Bridge — Network Printer Discovery Add-on
 * ──────────────────────────────────────────────────────
 * Adds POST /discover-network-printers to the existing
 * print-bridge-v6.3.2.js. Safely scans the local subnet for
 * devices with TCP port 9100 open (typical thermal printers).
 *
 * ── Install ────────────────────────────────────────
 *   1) Save this file as c:\print-bridge\discover-printers-addon.js
 *   2) In print-bridge-v6.3.2.js, anywhere AFTER `const app = express();`
 *      and BEFORE `app.listen(...)`, add ONE line:
 *
 *        require('./discover-printers-addon')(app);
 *
 *   3) Restart the bridge service.
 *
 * ── API ────────────────────────────────────────────
 *   POST /discover-network-printers
 *     Optional body: {
 *       "subnet":    "192.168.1",    // /24 prefix; auto-detected from
 *                                    //   local interfaces when omitted
 *       "port":      9100,           // default 9100
 *       "timeoutMs": 300,            // 100..1500
 *       "from":      1,              // 1..254
 *       "to":        254,            // from..254 (max 254 hosts)
 *       "concurrency": 30            // 1..64
 *     }
 *     Returns: {
 *       ok: true,
 *       subnet: "192.168.1",
 *       port:   9100,
 *       scanned: 254,
 *       elapsedMs: 1234,
 *       found: [ { ip, port, status:"open", label } ]
 *     }
 *
 * ── Safety ─────────────────────────────────────────
 *   - Only RFC1918 private subnets allowed:
 *       10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
 *   - 127.x.x.x is rejected (no localhost-wide scan)
 *   - Max 254 hosts per request
 *   - Endpoint refuses requests not originating from 127.0.0.1 / ::1
 *   - No data is written to printers; only a TCP connect() probe
 */

const net = require('net');
const os  = require('os');

function isPrivatePrefix(prefix) {
  const parts = prefix.split('.').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function detectLocalPrefix() {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const ni of (list || [])) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      const parts = ni.address.split('.');
      if (parts.length !== 4) continue;
      const pref = parts.slice(0, 3).join('.');
      if (isPrivatePrefix(pref)) return pref;
    }
  }
  return null;
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
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function readJsonBody(req, limit = 8 * 1024) {
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

    // subnet
    let subnet = typeof body.subnet === 'string' ? body.subnet.trim() : '';
    if (subnet && !isPrivatePrefix(subnet)) {
      return res.status(400).json({ ok: false, error: 'subnet_not_private', subnet });
    }
    if (!subnet) {
      subnet = detectLocalPrefix();
      if (!subnet) return res.status(400).json({ ok: false, error: 'no_private_interface_found' });
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
      const found = await runScan({ subnet, port, timeoutMs, from, to, concurrency });
      const elapsedMs = Date.now() - t0;
      console.log(`[discover-printers] ${subnet}.${from}-${to} port ${port} → ${found.length} hits in ${elapsedMs}ms`);
      res.json({ ok: true, subnet, port, scanned: to - from + 1, elapsedMs, found });
    } catch (e) {
      res.status(500).json({ ok: false, error: 'scan_failed', detail: String(e?.message || e) });
    }
  });

  console.log('[discover-printers] add-on loaded — POST /discover-network-printers');
};
