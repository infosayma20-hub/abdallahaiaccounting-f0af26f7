/**
 * scale-addon.js — الموازين الإلكترونية (Rongta RLS1100 وغيرها)
 *
 *   POST /scale/ping      { ip, port }            → فحص اتصال TCP
 *   POST /scale/discover  { port }                → بحث عن موازين على شبكات الكمبيوتر
 *   POST /scale/export    { ip, port, model, items } → تجهيز ملف الأصناف للميزان
 *
 * ملاحظة: بروتوكول الإرسال المباشر لموديل RLS1100 لم يُؤكَّد بعد على الأرض،
 * لذلك التصدير حاليًا يكتب ملف PLU (CSV) في مجلد scale-export بجانب الجسر
 * ليُستورد عبر برنامج الميزان، بعد التأكد أن الميزان متصل.
 * الطلبات مقبولة فقط من نفس الكمبيوتر (127.0.0.1).
 */
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');

const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const validIp = (ip) => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(ip || '')) && String(ip).split('.').every((n) => +n <= 255);

function probe(ip, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const s = new net.Socket();
    let done = false;
    const end = (ok) => { if (done) return; done = true; s.destroy(); resolve(ok ? Date.now() - t0 : -1); };
    s.setTimeout(timeoutMs);
    s.once('connect', () => end(true));
    s.once('timeout', () => end(false));
    s.once('error', () => end(false));
    s.connect(port, ip);
  });
}

function prefixes() {
  const out = new Set();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.add(ni.address.split('.').slice(0, 3).join('.'));
    }
  }
  return [...out];
}

module.exports = function (app) {
  app.post('/scale/ping', async (req, res) => {
    if (!isLocal(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    const { ip, port = 5001 } = req.body || {};
    if (!validIp(ip)) return res.status(400).json({ ok: false, error: 'عنوان غير صالح' });
    const ms = await probe(ip, Number(port), 3000);
    if (ms < 0) return res.json({ ok: false, error: `الميزان ${ip}:${port} لا يستجيب` });
    res.json({ ok: true, elapsedMs: ms });
  });

  app.post('/scale/discover', async (req, res) => {
    if (!isLocal(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    const port = Number((req.body || {}).port) || 5001;
    const found = [];
    for (const p of prefixes()) {
      const hosts = Array.from({ length: 254 }, (_, i) => `${p}.${i + 1}`);
      for (let i = 0; i < hosts.length; i += 64) {
        const batch = hosts.slice(i, i + 64);
        const r = await Promise.all(batch.map((h) => probe(h, port, 600)));
        r.forEach((ms, j) => { if (ms >= 0) found.push({ ip: batch[j], port }); });
      }
    }
    res.json({ ok: true, found });
  });

  app.post('/scale/export', async (req, res) => {
    if (!isLocal(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    const { ip, port = 5001, model = '', items = [] } = req.body || {};
    if (!validIp(ip)) return res.status(400).json({ ok: false, error: 'عنوان غير صالح' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ ok: false, error: 'لا يوجد أصناف' });
    if ((await probe(ip, Number(port), 3000)) < 0) return res.json({ ok: false, error: `الميزان ${ip} لا يستجيب` });
    const dir = path.join(__dirname, 'scale-export');
    fs.mkdirSync(dir, { recursive: true });
    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const lines = ['PLU,Key,Name,Price,Unit,ShelfLife,Barcode'];
    for (const it of items) {
      lines.push([it.plu, it.key_no == null ? '' : it.key_no, esc(it.name), Number(it.price || 0).toFixed(2), esc(it.unit), it.shelf_life_days || 0, esc(it.barcode)].join(','));
    }
    const file = path.join(dir, `${model || 'scale'}_${ip.replace(/\./g, '-')}.csv`);
    fs.writeFileSync(file, '\ufeff' + lines.join('\r\n'), 'utf8');
    res.json({ ok: true, sent: items.length, file, message: `تم تجهيز ${items.length} صنف في ملف الميزان على الكمبيوتر` });
  });
};
