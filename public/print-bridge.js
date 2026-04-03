/**
 * AMWALI Print Bridge v4.1 — Local Node.js service
 *
 * Fixes: Arabic CP1256 encoding, station UUID routing, Unicode sanitization
 * Added: /print-shift endpoint, /test endpoint by printer key
 *
 * Install: npm install express iconv-lite
 * Run:     node print-bridge.js
 */

const express = require('express');
const net     = require('net');
const iconv   = require('iconv-lite');

const app = express();

// ─── CORS with Private Network Access ───────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());

const PORT = 3001;

// ─── ESC/POS Constants ──────────────────────────────
const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const CMD = {
  INIT:         Buffer.from([ESC, 0x40]),
  CODE_CP1256:  Buffer.from([ESC, 0x74, 0x16]),
  ALIGN_LEFT:   Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_RIGHT:  Buffer.from([ESC, 0x61, 0x02]),
  BOLD_ON:      Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF:     Buffer.from([ESC, 0x45, 0x00]),
  SIZE_NORMAL:  Buffer.from([GS,  0x21, 0x00]),
  SIZE_LARGE:   Buffer.from([GS,  0x21, 0x11]),
  SIZE_XLARGE:  Buffer.from([GS,  0x21, 0x33]),
  CUT:          Buffer.from([GS,  0x56, 0x00]),
  FEED_3:       Buffer.from([ESC, 0x64, 0x03]),
  DRAWER_KICK:  Buffer.from([ESC, 0x70, 0x00, 0x19, 0x78]),
};

// ─── Arabic Text Processing ─────────────────────────

function sanitizeForCP1256(text) {
  return String(text || '')
    .replace(/₪/g, 'NIS')
    .replace(/[━═─│┃┄┅┆┇┈┉┊┋]/g, '-')
    .replace(/[⬆⬇⬅➡▲▼◀▶►◄]/g, '')
    .replace(/[✓✔✗✘✕✖☑☐☒]/g, '*')
    .replace(/[★☆●○◎◆◇■□▪▫]/g, '*')
    .replace(/[←→↑↓↔↕⇐⇒⇑⇓]/g, '->')
    .replace(/[€£¥₹₽₿]/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '');
}

function reverseArabicText(text) {
  const segments = [];
  let current = '';
  let currentIsArabic = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const isArabic = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(ch);
    if (i === 0) {
      currentIsArabic = isArabic;
      current = ch;
    } else if (isArabic === currentIsArabic) {
      current += ch;
    } else {
      segments.push({ text: current, arabic: currentIsArabic });
      current = ch;
      currentIsArabic = isArabic;
    }
  }
  if (current) segments.push({ text: current, arabic: currentIsArabic });

  segments.reverse();
  return segments.map(s => s.arabic ? s.text.split('').reverse().join('') : s.text).join('');
}

function prepareText(text) {
  const sanitized = sanitizeForCP1256(text);
  const hasArabic = /[\u0600-\u06FF]/.test(sanitized);
  const final = hasArabic ? reverseArabicText(sanitized) : sanitized;
  return iconv.encode(final, 'win1256');
}

function textLine(text, options = {}) {
  const bufs = [];
  if (options.align === 'center')    bufs.push(CMD.ALIGN_CENTER);
  else if (options.align === 'left') bufs.push(CMD.ALIGN_LEFT);
  else                               bufs.push(CMD.ALIGN_RIGHT);
  bufs.push(options.bold ? CMD.BOLD_ON : CMD.BOLD_OFF);
  if (options.size === 'xlarge')     bufs.push(CMD.SIZE_XLARGE);
  else if (options.size === 'large') bufs.push(CMD.SIZE_LARGE);
  else                               bufs.push(CMD.SIZE_NORMAL);
  bufs.push(prepareText(text));
  bufs.push(Buffer.from([LF]));
  bufs.push(CMD.SIZE_NORMAL, CMD.BOLD_OFF);
  return Buffer.concat(bufs);
}

function separator() { return textLine('='.repeat(32), { align: 'center' }); }
function dashLine()   { return textLine('-'.repeat(32), { align: 'center' }); }

// ─── Receipt Template ───────────────────────────────
function buildReceiptBuffer(order) {
  const bufs = [CMD.INIT, CMD.CODE_CP1256];
  bufs.push(textLine('مطاعم الدجاج الملكي', { bold: true, size: 'large', align: 'center' }));
  bufs.push(textLine('Malaki Broast Chicken', { align: 'center' }));
  bufs.push(separator());

  const qNum = order.queueNumber || order.queue_number || order.orderNumber || '---';
  bufs.push(textLine(`رقم الطلب: #${qNum}`, { bold: true, align: 'right' }));
  if (order.branchName || order.branch_name)
    bufs.push(textLine(order.branchName || order.branch_name, { align: 'right' }));

  const now = new Date();
  bufs.push(textLine(`${now.toLocaleDateString('en-GB')}  ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, { align: 'right' }));

  const ot = order.orderType || order.order_type || '';
  const typeLabel = ot === 'takeaway' ? 'تيك اواي' : ot === 'delivery' ? 'توصيل' : 'محل';
  bufs.push(textLine(`النوع: ${typeLabel}`, { align: 'right' }));
  if (order.cashier) bufs.push(textLine(`الكاشير: ${order.cashier}`, { align: 'right' }));
  if (order.tableNumber) bufs.push(textLine(`طاولة: ${order.tableNumber}`, { align: 'right' }));
  bufs.push(dashLine());

  (order.items || []).forEach(item => {
    const qty   = item.quantity || item.qty || 1;
    const price = ((qty) * (item.price || 0)).toFixed(2);
    bufs.push(textLine(`${qty}x  ${item.name}`, { bold: true, align: 'right' }));
    bufs.push(textLine(`${price} NIS`, { align: 'left' }));
    const note = item.note || item.notes || '';
    if (note) bufs.push(textLine(`  * ${note}`, { align: 'right' }));
    if (item.modifiers && item.modifiers.length) {
      item.modifiers.forEach(m => bufs.push(textLine(`  + ${m.option_name || m.name}`, { align: 'right' })));
    }
  });

  bufs.push(separator());
  if (order.subtotal != null && order.discount)
    bufs.push(textLine(`الخصم: -${Number(order.discount).toFixed(2)} NIS`, { align: 'right' }));
  bufs.push(textLine(`TOTAL  :  ${Number(order.total || 0).toFixed(2)} NIS`, { bold: true, size: 'large', align: 'right' }));
  if (order.paymentMethod || order.payment_method)
    bufs.push(textLine(`طريقة الدفع: ${order.paymentMethod || order.payment_method}`, { align: 'right' }));
  bufs.push(separator());
  bufs.push(textLine('شكرا لزيارتكم', { bold: true, align: 'center' }));
  bufs.push(textLine('Thank You!', { align: 'center' }));
  bufs.push(CMD.FEED_3, CMD.CUT);
  return Buffer.concat(bufs);
}

// ─── Kitchen Ticket Template ────────────────────────
function buildKitchenBuffer(order, items, stationName) {
  const bufs = [CMD.INIT, CMD.CODE_CP1256];
  bufs.push(separator());
  const qNum = order.queueNumber || order.queue_number || order.orderNumber || '---';
  bufs.push(textLine(`# ${qNum}`, { bold: true, size: 'xlarge', align: 'center' }));
  bufs.push(separator());
  if (stationName) bufs.push(textLine(`[ ${stationName} ]`, { bold: true, size: 'large', align: 'center' }));

  const ot = order.orderType || order.order_type || '';
  const typeLabel = ot === 'takeaway' ? '*** تيك اواي ***' : ot === 'delivery' ? '*** توصيل ***' : '*** محل ***';
  bufs.push(textLine(typeLabel, { bold: true, size: 'large', align: 'center' }));

  const now = new Date();
  bufs.push(textLine(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), { align: 'center' }));
  if (order.tableNumber) bufs.push(textLine(`طاولة: ${order.tableNumber}`, { bold: true, align: 'center' }));
  bufs.push(dashLine());

  (items || []).forEach(item => {
    const qty  = item.quantity || item.qty || 1;
    const note = item.note || item.notes || '';
    bufs.push(textLine(`${qty}  x  ${item.name}`, { bold: true, size: 'large', align: 'right' }));
    if (note) bufs.push(textLine(`>>> ${note}`, { align: 'right' }));
    if (item.modifiers && item.modifiers.length)
      item.modifiers.forEach(m => bufs.push(textLine(`  + ${m.option_name || m.name}`, { align: 'right' })));
  });

  if (order.orderNote) {
    bufs.push(dashLine());
    bufs.push(textLine(`ملاحظة: ${order.orderNote}`, { bold: true, align: 'right' }));
  }
  bufs.push(separator(), CMD.FEED_3, CMD.CUT);
  return Buffer.concat(bufs);
}

// ─── Shift Report Template ──────────────────────────
function buildShiftReportBuffer(data) {
  const bufs = [CMD.INIT, CMD.CODE_CP1256];
  bufs.push(textLine('مطاعم الدجاج الملكي', { bold: true, size: 'large', align: 'center' }));
  bufs.push(textLine('Malaki Broast Chicken', { align: 'center' }));
  bufs.push(separator());
  bufs.push(textLine('تقرير اغلاق الوردية', { bold: true, size: 'large', align: 'center' }));
  bufs.push(separator());

  if (data.branch_name || data.branchName)
    bufs.push(textLine(`الفرع: ${data.branch_name || data.branchName}`, { align: 'right' }));
  if (data.cashier_name || data.cashierName || data.cashier)
    bufs.push(textLine(`الكاشير: ${data.cashier_name || data.cashierName || data.cashier}`, { align: 'right' }));
  if (data.opened_at || data.openedAt)
    bufs.push(textLine(`الفتح: ${formatDateTime(data.opened_at || data.openedAt)}`, { align: 'right' }));
  bufs.push(textLine(`الاغلاق: ${formatDateTime(data.closed_at || data.closedAt || new Date())}`, { align: 'right' }));

  bufs.push(dashLine());
  bufs.push(textLine(`النقدية الافتتاحية: ${fmt(data.opening_cash || data.openingCash)} NIS`, { align: 'right' }));
  bufs.push(textLine(`اجمالي المبيعات: ${fmt(data.total_sales || data.totalSales)} NIS`, { align: 'right' }));
  bufs.push(textLine(`عدد الطلبات: ${data.total_orders || data.totalOrders || data.orders_count || 0}`, { align: 'right' }));
  bufs.push(dashLine());
  bufs.push(textLine(`المتوقع: ${fmt(data.expected_cash || data.expectedCash)} NIS`, { bold: true, align: 'right' }));
  bufs.push(textLine(`المسلم: ${fmt(data.delivered_cash || data.deliveredCash)} NIS`, { bold: true, align: 'right' }));
  bufs.push(separator());

  const diff = Number(data.difference || data.diff || 0);
  const diffLabel = diff < 0 ? `عجز: ${fmt(Math.abs(diff))} NIS` :
                    diff > 0 ? `زيادة: ${fmt(diff)} NIS`          : 'مطابق';
  bufs.push(textLine(diffLabel, { bold: true, size: 'large', align: 'center' }));
  bufs.push(separator());

  bufs.push(textLine('توقيع الكاشير:  ___________', { align: 'right' }));
  bufs.push(textLine('توقيع المسؤول: ___________', { align: 'right' }));
  bufs.push(CMD.FEED_3, CMD.CUT);
  return Buffer.concat(bufs);
}

function fmt(n)            { return Number(n || 0).toFixed(2); }
function formatDateTime(d) { const dt = new Date(d); return `${dt.toLocaleDateString('en-GB')} ${dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`; }

// ─── Send to Printer ────────────────────────────────
function sendToPrinter(ip, port, buffer) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(5000);
    client.connect(port, ip, () => {
      client.write(buffer, () => { client.destroy(); resolve({ success: true }); });
    });
    client.on('error',   (err) => { client.destroy(); reject(new Error(`${ip}:${port} — ${err.message}`)); });
    client.on('timeout', ()    => { client.destroy(); reject(new Error(`${ip}:${port} — timeout`)); });
  });
}

function testConnection(ip, port) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    client.setTimeout(3000);
    client.connect(port, ip, () => { client.destroy(); resolve(true); });
    client.on('error',   () => { client.destroy(); resolve(false); });
    client.on('timeout', () => { client.destroy(); resolve(false); });
  });
}

// ─── Printer Configuration ──────────────────────────
// ⚠️  UUID الجريل تحت (b1c2d3e4...) هو placeholder — يجب استبداله بالـ UUID الحقيقي من قاعدة البيانات
const PRINTERS = {
  receipt: { ip: '192.168.1.220', port: 9100, name: 'طابعة الوصل' },
  kitchen: { ip: '192.168.1.120', port: 9100, name: 'طابعة المطبخ',   stationId: 'a09ebd1b-392c-42b2-a8a7-d180fdde1f97' },
  grill:   { ip: '192.168.1.10',  port: 9100, name: 'طابعة السخان',   stationId: 'b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e' }, // ⚠️ PLACEHOLDER
  pizza:   { ip: '192.168.1.228', port: 9100, name: 'طابعة البيتزا',  stationId: '8ee3d8c7-fdeb-47b2-bc0c-1c5f9750d516' },
};

const STATION_TO_PRINTER = {};
Object.entries(PRINTERS).forEach(([key, p]) => {
  if (p.stationId) STATION_TO_PRINTER[p.stationId] = key;
});

// ─── API Endpoints ──────────────────────────────────

app.get('/health', async (req, res) => {
  const results = await Promise.all(
    Object.entries(PRINTERS).map(async ([key, p]) => ({
      name: p.name, key, ip: p.ip, port: p.port,
      stationId: p.stationId || null,
      status: await testConnection(p.ip, p.port) ? 'online' : 'offline',
    }))
  );
  res.json({ status: 'ok', version: '4.1', printers: results, timestamp: new Date().toISOString() });
});

app.get('/status', (req, res) => {
  res.json({ status: 'ok', version: '4.1', timestamp: new Date().toISOString() });
});

// ── /test — اختبار طابعة بمفتاحها (receipt/kitchen/grill/pizza) ──
app.post('/test', async (req, res) => {
  const { printer: printerKey } = req.body;
  const printer = PRINTERS[printerKey];
  if (!printer) {
    return res.status(400).json({ success: false, error: `Unknown printer key: ${printerKey}` });
  }
  try {
    const buf = Buffer.concat([
      CMD.INIT, CMD.CODE_CP1256,
      textLine('اختبار طباعة', { bold: true, size: 'large', align: 'center' }),
      textLine('مطاعم الدجاج الملكي', { align: 'center' }),
      textLine('Malaki Broast Chicken', { align: 'center' }),
      separator(),
      textLine(`${printer.name}`, { bold: true, align: 'center' }),
      textLine('الطباعة تعمل بنجاح', { align: 'center' }),
      textLine(new Date().toLocaleString('en-GB'), { align: 'center' }),
      CMD.FEED_3, CMD.CUT,
    ]);
    await sendToPrinter(printer.ip, printer.port, buf);
    res.json({ success: true, message: `Test sent to ${printer.name}` });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── /test-printer — اختبار بـ IP مباشر ──
app.post('/test-printer', async (req, res) => {
  const { ip, port } = req.body;
  try {
    const buf = Buffer.concat([
      CMD.INIT, CMD.CODE_CP1256,
      textLine('اختبار طباعة', { bold: true, size: 'large', align: 'center' }),
      textLine('Malaki Broast Chicken', { align: 'center' }),
      separator(),
      textLine('الطباعة تعمل بنجاح', { bold: true, align: 'center' }),
      textLine(new Date().toLocaleString('en-GB'), { align: 'center' }),
      CMD.FEED_3, CMD.CUT,
    ]);
    await sendToPrinter(ip, port || 9100, buf);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── /print — الطلب الرئيسي ──
app.post('/print', async (req, res) => {
  const { type, order, stationId } = req.body;
  const results = [];

  try {
    if (type === 'receipt' || type === 'both') {
      try {
        await sendToPrinter(PRINTERS.receipt.ip, PRINTERS.receipt.port, buildReceiptBuffer(order));
        results.push({ name: PRINTERS.receipt.name, success: true });
      } catch (err) {
        results.push({ name: PRINTERS.receipt.name, success: false, error: err.message });
      }
    }

    if (type === 'kitchen' || type === 'grill' || type === 'pizza' || type === 'both') {
      const stationGroups = {};

      (order.items || []).forEach(item => {
        const itemStations = item.print_station_ids || (item.stationId ? [item.stationId] : []);
        const targetStations = stationId ? [stationId] : itemStations.length > 0 ? itemStations : [PRINTERS.kitchen.stationId];
        targetStations.forEach(sid => {
          if (!stationGroups[sid]) stationGroups[sid] = [];
          stationGroups[sid].push(item);
        });
      });

      for (const [sid, items] of Object.entries(stationGroups)) {
        const printerKey = STATION_TO_PRINTER[sid] || (type !== 'both' && type !== 'receipt' ? type : null) || 'kitchen';
        const printer    = PRINTERS[printerKey] || PRINTERS.kitchen;
        try {
          await sendToPrinter(printer.ip, printer.port, buildKitchenBuffer(order, items, printer.name));
          results.push({ name: printer.name, success: true });
        } catch (err) {
          results.push({ name: printer.name, success: false, error: err.message });
        }
      }
    }

    res.json({ success: results.every(r => r.success), results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, results });
  }
});

// ── /print-routed ──
app.post('/print-routed', async (req, res) => {
  const { order } = req.body;
  const results   = [];

  try {
    await sendToPrinter(PRINTERS.receipt.ip, PRINTERS.receipt.port, buildReceiptBuffer(order));
    results.push({ name: PRINTERS.receipt.name, success: true });
  } catch (err) {
    results.push({ name: PRINTERS.receipt.name, success: false, error: err.message });
  }

  const stationGroups = {};
  (order.items || []).forEach(item => {
    const stations = item.print_station_ids || [];
    const targets  = stations.length > 0 ? stations : [PRINTERS.kitchen.stationId];
    targets.forEach(sid => {
      if (!stationGroups[sid]) stationGroups[sid] = [];
      stationGroups[sid].push(item);
    });
  });

  for (const [sid, items] of Object.entries(stationGroups)) {
    const printerKey = STATION_TO_PRINTER[sid] || 'kitchen';
    const printer    = PRINTERS[printerKey] || PRINTERS.kitchen;
    try {
      await sendToPrinter(printer.ip, printer.port, buildKitchenBuffer(order, items, printer.name));
      results.push({ name: printer.name, success: true });
    } catch (err) {
      results.push({ name: printer.name, success: false, error: err.message });
    }
  }

  res.json({ success: results.every(r => r.success), results });
});

// ── /print-shift — تقرير اغلاق الوردية ──
app.post('/print-shift', async (req, res) => {
  try {
    console.log('[/print-shift] cashier:', req.body.cashier_name || req.body.cashier);
    await sendToPrinter(PRINTERS.receipt.ip, PRINTERS.receipt.port, buildShiftReportBuffer(req.body));
    res.json({ success: true });
  } catch (err) {
    console.error('[/print-shift]', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// ── /drawer ──
app.post('/drawer', async (req, res) => {
  try {
    await sendToPrinter(PRINTERS.receipt.ip, PRINTERS.receipt.port, CMD.DRAWER_KICK);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n  AMWALI Print Bridge v4.1');
  console.log('  Port: ' + PORT);
  Object.entries(PRINTERS).forEach(([key, p]) => {
    const uuid = p.stationId || 'no-station';
    const warn = uuid.startsWith('b1c2d3e4') ? ' ⚠ PLACEHOLDER UUID' : '';
    console.log(`  [${key}] ${p.name} @ ${p.ip}:${p.port}  ${uuid}${warn}`);
  });
  console.log('');
});
