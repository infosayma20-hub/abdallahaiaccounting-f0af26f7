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
 *        require('./device-config-addon')(app);
 *
 * 3) Restart the bridge:
 *        cd c:\print-bridge
 *        node print-bridge-v6.3.2.js
 *
 * You should see:
 *        [device-config] add-on loaded — file: c:\print-bridge\device.json
 */

const fs   = require('fs');
const path = require('path');

module.exports = function attachDeviceConfig(app) {
  if (!app || typeof app.get !== 'function') {
    console.warn('[device-config] no express app passed — add-on disabled');
    return;
  }

  const FILE = path.join(__dirname, 'device.json');

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

  function cors(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }

  // Tiny inline JSON body parser (avoids requiring express.json globally)
  function readJsonBody(req, limit = 32 * 1024) {
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

  app.get('/device-config', (req, res) => {
    cors(req, res);
    res.json(read());
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
    merged.updated_at = new Date().toISOString();
    if (!write(merged)) return res.status(500).json({ error: 'write_failed' });
    console.log('[device-config] saved:', merged);
    res.json(merged);
  });

  console.log('[device-config] add-on loaded — file:', FILE);
};