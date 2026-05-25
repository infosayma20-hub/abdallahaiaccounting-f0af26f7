/**
 * AMWALI Print Bridge — Device Config Add-on
 * ─────────────────────────────────────────────
 * Drop-in module that adds GET/POST /device-config endpoints to the
 * existing print-bridge-v6.3.2.js. Stores config on disk in
 * c:\print-bridge\device.json so POS settings (branch / terminal /
 * bridge URL / label) survive any browser "Clear browsing data" wipe.
 *
 * ── Install ───────────────────────────────────
 * 1) Save this file as:  c:\print-bridge\device-config-addon.js
 * 2) Open print-bridge-v6.3.2.js and add ONE line, anywhere AFTER
 *    `const app = express();` and BEFORE `app.listen(...)`:
 *
 *        const deviceCfg = require('./device-config-addon')(app);
 *
 * 3) (Optional but recommended) Replace your hard-coded PRINTERS with:
 *
 *        let PRINTERS = { receipt: {...}, kitchen: {...}, grill: {...}, pizza: {...} };
 *        const DEFAULT_PRINTERS = { ...PRINTERS };
 *
 *        function getActivePrinters() {
 *          const fromFile = deviceCfg.getPrinters();
 *          return (fromFile && Object.keys(fromFile).length) ? fromFile : DEFAULT_PRINTERS;
 *        }
 *
 *    Then use `getActivePrinters()` instead of `PRINTERS` everywhere
 *    (`/print-image`, `/test`, `/health`, `STATION_TO_PRINTER`, …).
 *
 * 4) Restart the bridge:
 *        cd c:\print-bridge
 *        node print-bridge-v6.3.2.js
 *
 * You should see:
 *        [device-config] add-on loaded — file: c:\print-bridge\device.json
 *
 * The add-on also exposes:
 *   GET  /device-config          → full device.json (incl. printers)
 *   POST /device-config          → merges fields (incl. printers map)
 *   POST /reload-config          → re-read device.json from disk
 *   GET  /printers-active        → the printers currently in effect
 *
 * Returned object from `require(...)(app)`:
 *   { getConfig(), getPrinters(), getSource(), reload() }
 */

const fs   = require('fs');
const path = require('path');

module.exports = function attachDeviceConfig(app) {
  if (!app || typeof app.get !== 'function') {
    console.warn('[device-config] no express app passed — add-on disabled');
    return { getConfig: () => ({}), getPrinters: () => null, getSource: () => 'none', reload: () => ({}) };
  }

  const FILE = path.join(__dirname, 'device.json');

  // ── In-memory cache so the bridge doesn't hit disk on every print ──
  let _cache = null;
  let _source = 'fallback';

  function read() {
    try {
      if (!fs.existsSync(FILE)) return {};
      return JSON.parse(fs.readFileSync(FILE, 'utf8')) || {};
    } catch (e) {
      console.warn('[device-config] read failed:', e.message);
      return {};
    }
  }

  function write(obj) {
    try {
      fs.writeFileSync(FILE, JSON.stringify(obj, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.warn('[device-config] write failed:', e.message);
      return false;
    }
  }

  function loadCache() {
    _cache = read();
    const hasPrinters = _cache && _cache.printers && typeof _cache.printers === 'object'
      && Object.keys(_cache.printers).length > 0;
    _source = hasPrinters ? 'device.json' : 'fallback';
    return _cache;
  }

  // Allowed printer keys (kept loose so future roles still work, but logged).
  const KNOWN_KEYS = new Set(['receipt', 'kitchen', 'grill', 'pizza', 'unified_kitchen']);

  function validatePrinter(key, p) {
    if (!p || typeof p !== 'object') return 'not an object';
    if (!KNOWN_KEYS.has(key)) {
      console.warn('[device-config] unknown printer key:', key, '(accepted, but POS may ignore it)');
    }
    const type = (p.type || 'network').toLowerCase();
    if (type === 'network') {
      if (!p.ip || typeof p.ip !== 'string') return 'network printer requires ip';
      const port = Number(p.port || 9100);
      if (!Number.isFinite(port) || port < 1 || port > 65535) return 'invalid port';
    } else if (type === 'windows' || type === 'usb') {
      if (!p.windowsPrinterName || typeof p.windowsPrinterName !== 'string') {
        return 'windows printer requires windowsPrinterName';
      }
    } else {
      return 'unsupported type: ' + type;
    }
    return null;
  }

  /** Merge incoming printers map into stored map, validating each entry. */
  function mergePrinters(existing, incoming) {
    const out = { ...(existing || {}) };
    const errors = [];
    for (const [key, val] of Object.entries(incoming || {})) {
      // Allow null/false to remove a printer
      if (val === null || val === false) { delete out[key]; continue; }
      const err = validatePrinter(key, val);
      if (err) { errors.push(`${key}: ${err}`); continue; }
      const normalized = {
        type: (val.type || 'network').toLowerCase(),
        name: (val.name && String(val.name).trim()) || key,
      };
      if (normalized.type === 'network') {
        normalized.ip = String(val.ip).trim();
        normalized.port = Number(val.port || 9100);
      } else {
        normalized.windowsPrinterName = String(val.windowsPrinterName).trim();
      }
      if (val.width) normalized.width = Number(val.width) || 576;
      if (val.stationId) normalized.stationId = String(val.stationId);
      out[key] = normalized;
    }
    return { merged: out, errors };
  }

  function cors(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  // Tiny inline JSON body parser (avoids requiring express.json globally)
  function readJsonBody(req, limit = 32 * 1024) {
    // If the main bridge already registered bodyParser.json()/express.json(),
    // the request stream is consumed before this route runs. In that case use
    // req.body directly; otherwise fall back to our tiny parser for older bridges.
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return Promise.resolve(req.body);
    }
    if (req.readableEnded || req.complete) return Promise.resolve({});
    return new Promise((resolve) => {
      let data = '';
      let aborted = false;
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

  app.options('/device-config', (req, res) => { cors(req, res); res.sendStatus(204); });
  app.options('/reload-config', (req, res) => { cors(req, res); res.sendStatus(204); });
  app.options('/printers-active', (req, res) => { cors(req, res); res.sendStatus(204); });

  app.get('/device-config', (req, res) => {
    cors(req, res);
    res.json(loadCache());
  });

  app.post('/device-config', async (req, res) => {
    cors(req, res);
    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'invalid_json' });
    }
    const current = read();
    const merged = { ...current };
    for (const k of ['bridgeUrl', 'branchId', 'terminalId', 'label']) {
      if (typeof body[k] === 'string' && body[k].trim()) {
        merged[k] = body[k].trim();
      }
    }
    if (typeof body.cashBoxId === 'string' && body.cashBoxId.trim()) {
      merged.cashBoxId = body.cashBoxId.trim();
    }
    let printerErrors = [];
    if (body.printers && typeof body.printers === 'object') {
      const basePrinters = body.replacePrinters === true ? {} : current.printers;
      const { merged: mergedPrinters, errors } = mergePrinters(basePrinters, body.printers);
      merged.printers = mergedPrinters;
      printerErrors = errors;
    }
    merged.updated_at = new Date().toISOString();
    if (!write(merged)) return res.status(500).json({ error: 'write_failed' });
    loadCache();
    console.log('[device-config] saved:', { ...merged, printers: merged.printers ? Object.keys(merged.printers) : null });
    res.json({ ...merged, printer_errors: printerErrors });
  });

  // POST /reload-config — re-read device.json from disk. POS hits this after save.
  app.post('/reload-config', (req, res) => {
    cors(req, res);
    loadCache();
    res.json({
      ok: true,
      source: _source,
      printer_keys: _cache && _cache.printers ? Object.keys(_cache.printers) : [],
    });
  });

  // GET /printers-active — debug helper for the POS UI
  app.get('/printers-active', (req, res) => {
    cors(req, res);
    if (!_cache) loadCache();
    res.json({ source: _source, printers: (_cache && _cache.printers) || null });
  });

  // Initial load
  loadCache();
  console.log('[device-config] add-on loaded — file:', FILE);
  console.log('[device-config] printers source:', _source,
    _cache && _cache.printers ? `(${Object.keys(_cache.printers).join(', ')})` : '');

  return {
    getConfig:   () => _cache || loadCache(),
    getPrinters: () => (_cache && _cache.printers) || null,
    getSource:   () => _source,
    reload:      () => loadCache(),
  };
};