const net = require('net');
const http = require('http');
const iconv = require('iconv-lite');

// ═══════════════════════════════════════
// PRINTER CONFIGURATION
// ═══════════════════════════════════════
const PRINTERS = {
  receipt: { ip: '192.168.1.220', port: 9100, name: 'طابعة الوصل' },
  kitchen: { ip: '192.168.1.120', port: 9100, name: 'طابعة المطبخ' },
  grill:   { ip: '192.168.1.10',  port: 9100, name: 'طابعة السخان/الجريل' },
  pizza:   { ip: '192.168.1.228', port: 9100, name: 'طابعة البيتزا' },
};

const PORT = 3001;

// ═══════════════════════════════════════
// ESC/POS CONSTANTS
// ═══════════════════════════════════════
const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

const CMD = {
  INIT:         Buffer.from([ESC, 0x40]),
  CODE_PAGE_AR: Buffer.from([ESC, 0x74, 0x16]), // CP1256 Arabic
  ALIGN_LEFT:   Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_RIGHT:  Buffer.from([ESC, 0x61, 0x02]),
  BOLD_ON:      Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF:     Buffer.from([ESC, 0x45, 0x00]),
  SIZE_NORMAL:  Buffer.from([GS,  0x21, 0x00]),
  SIZE_LARGE:   Buffer.from([GS,  0x21, 0x11]),
  SIZE_XLARGE:  Buffer.from([GS,  0x21, 0x33]),
  SIZE_SMALL:   Buffer.from([GS,  0x21, 0x00]),
  CUT:          Buffer.from([GS,  0x56, 0x00]),
  FEED_3:       Buffer.from([ESC, 0x64, 0x03]),
};

// ═══════════════════════════════════════
// ARABIC TEXT HELPER — Full character reversal
// ═══════════════════════════════════════

/**
 * Check if a character is Arabic (including extended ranges)
 */
function isArabic(ch) {
  const code = ch.charCodeAt(0);
  return (
    (code >= 0x0600 && code <= 0x06FF) || // Arabic
    (code >= 0x0750 && code <= 0x077F) || // Arabic Supplement
    (code >= 0xFB50 && code <= 0xFDFF) || // Arabic Presentation Forms-A
    (code >= 0xFE70 && code <= 0xFEFF)    // Arabic Presentation Forms-B
  );
}

/**
 * Check if character is a neutral/space character
 */
function isNeutral(ch) {
  return /[\s\d\.\,\:\;\-\+\=\#\*\(\)\[\]\{\}\/\\]/.test(ch);
}

/**
 * Reverse a string visually for RTL thermal printing.
 * Arabic segments get character-reversed so the LTR printer shows them correctly.
 * Numbers and English stay LTR.
 * 
 * Strategy: Split text into runs (Arabic vs LTR), reverse Arabic runs' characters,
 * then reverse the entire run order.
 */
function visualReverse(text) {
  if (!text) return '';

  // Parse into directional runs
  const runs = [];
  let currentRun = '';
  let currentIsArabic = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const arabic = isArabic(ch);
    const neutral = isNeutral(ch);

    if (i === 0) {
      currentIsArabic = arabic || (!neutral);
      currentRun = ch;
      continue;
    }

    if (neutral) {
      // Neutral characters attach to current run
      currentRun += ch;
      continue;
    }

    if (arabic !== currentIsArabic && !neutral) {
      // Direction change — push current run
      runs.push({ text: currentRun, arabic: currentIsArabic });
      currentRun = ch;
      currentIsArabic = arabic;
    } else {
      currentRun += ch;
    }
  }
  if (currentRun) {
    runs.push({ text: currentRun, arabic: currentIsArabic });
  }

  // Reverse Arabic runs' characters, keep LTR as-is
  const processed = runs.map(run => {
    if (run.arabic) {
      return run.text.split('').reverse().join('');
    }
    return run.text;
  });

  // Reverse the run order (overall RTL layout)
  processed.reverse();

  return processed.join('');
}

/**
 * Encode a line for the thermal printer:
 * 1. Visually reverse for RTL
 * 2. Encode as CP1256
 */
function arabicLine(text) {
  const reversed = visualReverse(text);
  return iconv.encode(reversed, 'win1256');
}

function line(text = '') {
  return Buffer.concat([arabicLine(text), Buffer.from([LF])]);
}

function rawLine(text = '') {
  // For pure ASCII/numbers — no reversal needed
  return Buffer.concat([iconv.encode(text, 'win1256'), Buffer.from([LF])]);
}

function separator(char = '-', count = 32) {
  return Buffer.concat([Buffer.from(char.repeat(count)), Buffer.from([LF])]);
}

// ═══════════════════════════════════════
// SEND TO PRINTER
// ═══════════════════════════════════════
function sendToPrinter(printerKey, data) {
  return new Promise((resolve, reject) => {
    const printer = PRINTERS[printerKey];
    if (!printer) return reject(new Error(`Printer not found: ${printerKey}`));

    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error(`Timeout connecting to ${printer.name}`));
    }, 5000);

    client.connect(printer.port, printer.ip, () => {
      client.write(data, () => {
        clearTimeout(timeout);
        client.destroy();
        console.log(`[✓] Sent to ${printer.name} (${printer.ip})`);
        resolve();
      });
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      console.error(`[✗] ${printer.name}: ${err.message}`);
      reject(err);
    });
  });
}

// ═══════════════════════════════════════
// RECEIPT TEMPLATE — طابعة الكاشير
// ═══════════════════════════════════════
function buildReceipt(order) {
  const queueNum = order.queue_number || order.queueNumber || order.orderNumber || '---';
  const branchName = order.branch_name || order.branchName || '';
  const cashier = order.cashier || '';
  const orderType = order.order_type || order.orderType || '';
  const createdAt = order.created_at || order.date || new Date().toISOString();
  const total = order.total || 0;
  const payMethod = order.payment_method || order.paymentMethod || '';
  const isPayCash = payMethod === 'cash' || payMethod === 'نقد' || payMethod === 'نقدي';

  const orderNum = order.order_number || order.orderNumber || `POS-${queueNum}`;

  const parts = [
    CMD.INIT, CMD.CODE_PAGE_AR, CMD.ALIGN_CENTER,
    CMD.BOLD_ON, CMD.SIZE_LARGE,
    line('مطاعم الدجاج الملكي'),
    CMD.SIZE_NORMAL,
    rawLine('Chicken Broast Malaki'),
    CMD.BOLD_OFF,
    line(branchName ? `فرع ${branchName}` : ''),
    separator('='),
    CMD.ALIGN_RIGHT, CMD.BOLD_ON,
    line(`رقم: #${orderNum}`),
    CMD.BOLD_OFF,
    line(`الكاشير: ${cashier}`),
    line(`التاريخ: ${formatDate(createdAt)}`),
    line(`الوقت: ${formatTime(createdAt)}`),
    line(`النوع: ${getOrderTypeAr(orderType)}`),
    separator('-'),
  ];

  // Items
  (order.items || []).forEach((item, idx) => {
    const itemName = item.name || '';
    const qty = item.quantity || item.qty || 1;
    const itemTotal = item.total || (item.price || 0) * qty;

    parts.push(CMD.ALIGN_RIGHT);
    parts.push(line(`${idx + 1}: ${itemName}  x${qty}`));
    parts.push(CMD.ALIGN_LEFT);
    parts.push(rawLine(`NIS ${itemTotal}`));

    // Modifiers
    if (item.modifiers && item.modifiers.length > 0) {
      item.modifiers.forEach(m => {
        parts.push(CMD.ALIGN_RIGHT);
        parts.push(line(`  + ${m.option_name || m.name || ''}`));
      });
    }

    // Item notes
    const notes = item.notes || item.note || '';
    if (notes) {
      parts.push(CMD.ALIGN_RIGHT);
      parts.push(line(`  * ${notes}`));
    }
  });

  // Order note
  if (order.order_note || order.notes) {
    parts.push(separator('-'));
    parts.push(CMD.ALIGN_RIGHT);
    parts.push(line(`ملاحظة: ${order.order_note || order.notes}`));
  }

  parts.push(
    separator('='), CMD.ALIGN_CENTER, CMD.BOLD_ON, CMD.SIZE_LARGE,
    line(`الاجمالي: NIS ${total}`),
    CMD.SIZE_NORMAL, CMD.BOLD_OFF,
  );

  parts.push(CMD.ALIGN_RIGHT);
  parts.push(line(`الدفع: ${isPayCash ? 'نقدي' : payMethod}`));

  if (order.tenderedAmount && Number(order.tenderedAmount) > 0) {
    parts.push(line(`المدفوع: NIS ${order.tenderedAmount}`));
    if (order.change && Number(order.change) > 0) {
      parts.push(line(`الباقي: NIS ${order.change}`));
    }
  }

  // Discount
  if (order.discount && Number(order.discount) > 0) {
    parts.push(line(`الخصم: NIS ${order.discount}`));
  }

  parts.push(
    separator('='), CMD.ALIGN_CENTER, CMD.BOLD_ON,
    line('شكرا لزيارتكم'),
    rawLine('Thank You!'),
    CMD.BOLD_OFF, CMD.FEED_3, CMD.CUT,
  );
  return Buffer.concat(parts);
}

// ═══════════════════════════════════════
// KITCHEN TICKET — تذكرة المطبخ/السخان/البيتزا
// ═══════════════════════════════════════
function buildKitchenTicket(order, items, stationName) {
  const orderType = order.order_type || order.orderType || '';
  const orderTypeAr = getOrderTypeLabel(orderType);
  const queueNum = order.queue_number || order.queueNumber || order.orderNumber || '---';
  const createdAt = order.created_at || order.date || new Date().toISOString();

  const parts = [
    CMD.INIT, CMD.CODE_PAGE_AR, CMD.ALIGN_CENTER,
    separator('='), CMD.BOLD_ON, CMD.SIZE_XLARGE,
    rawLine(`# ${queueNum}`),
    CMD.SIZE_NORMAL, CMD.BOLD_OFF, separator('='),
    CMD.BOLD_ON, CMD.SIZE_LARGE, line(orderTypeAr),
    CMD.SIZE_NORMAL, CMD.BOLD_OFF,
    rawLine(formatTime(createdAt)),
    stationName ? line(stationName) : Buffer.alloc(0),
    separator('-'), CMD.ALIGN_RIGHT,
  ];

  (items || []).forEach(item => {
    const qty = item.quantity || item.qty || 1;
    const itemName = item.name || '';
    const notes = item.notes || item.note || '';

    parts.push(CMD.BOLD_ON, CMD.SIZE_LARGE);
    parts.push(line(`${qty}x  ${itemName}`));
    parts.push(CMD.SIZE_NORMAL, CMD.BOLD_OFF);

    // Modifiers
    if (item.modifiers && item.modifiers.length > 0) {
      item.modifiers.forEach(m => {
        parts.push(line(`  + ${m.option_name || m.name || ''}`));
      });
    }

    // Notes
    if (notes) {
      parts.push(CMD.BOLD_ON);
      parts.push(line(`>>> ${notes}`));
      parts.push(CMD.BOLD_OFF);
    }
  });

  // Order note
  if (order.order_note || order.notes) {
    parts.push(separator('-'));
    parts.push(CMD.BOLD_ON);
    parts.push(line(`ملاحظة: ${order.order_note || order.notes}`));
    parts.push(CMD.BOLD_OFF);
  }

  parts.push(CMD.ALIGN_CENTER, separator('='), CMD.FEED_3, CMD.CUT);
  return Buffer.concat(parts);
}

// ═══════════════════════════════════════
// ROUTING LOGIC — sends to ALL stations
// ═══════════════════════════════════════
async function routePrintJob(order) {
  const results = { receipt: null, kitchen: null, grill: null, pizza: null };
  const items = order.items || [];

  // 1. Always print receipt
  try {
    await sendToPrinter('receipt', buildReceipt(order));
    results.receipt = 'ok';
    console.log('[ROUTE] Receipt sent ✓');
  } catch (e) {
    results.receipt = e.message;
    console.log('[ROUTE] Receipt FAILED:', e.message);
  }

  // 2. Group items by station based on print_stations array
  const kitchenItems = [];
  const grillItems = [];
  const pizzaItems = [];

  items.forEach(item => {
    const stations = item.print_stations || [];
    // If no stations defined, default to kitchen
    if (stations.length === 0) {
      kitchenItems.push(item);
      return;
    }
    if (stations.includes('kitchen')) kitchenItems.push(item);
    if (stations.includes('grill')) grillItems.push(item);
    if (stations.includes('pizza')) pizzaItems.push(item);
  });

  console.log(`[ROUTE] Items — kitchen: ${kitchenItems.length}, grill: ${grillItems.length}, pizza: ${pizzaItems.length}`);

  // 3. Print per station
  if (kitchenItems.length > 0) {
    try {
      await sendToPrinter('kitchen', buildKitchenTicket(order, kitchenItems, 'المطبخ الرئيسي'));
      results.kitchen = 'ok';
    } catch (e) {
      results.kitchen = e.message;
    }
  }

  if (grillItems.length > 0) {
    try {
      await sendToPrinter('grill', buildKitchenTicket(order, grillItems, 'السخان / الجريل'));
      results.grill = 'ok';
    } catch (e) {
      results.grill = e.message;
    }
  }

  if (pizzaItems.length > 0) {
    try {
      await sendToPrinter('pizza', buildKitchenTicket(order, pizzaItems, 'البيتزا'));
      results.pizza = 'ok';
    } catch (e) {
      results.pizza = e.message;
    }
  }

  return results;
}

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
function getOrderTypeAr(type) {
  if (type === 'takeaway' || type === 'تيك أواي' || type === 'تيك اواي') return 'تيك أواي';
  if (type === 'delivery' || type === 'توصيل') return 'توصيل';
  if (type === 'dine_in' || type === 'داخل المطعم' || type === 'محل') return 'داخل المطعم';
  return type || 'داخل المطعم';
}

function getOrderTypeLabel(type) {
  const ar = getOrderTypeAr(type);
  return `*** ${ar} ***`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr || Date.now());
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function formatTime(dateStr) {
  const d = new Date(dateStr || Date.now());
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ═══════════════════════════════════════
// TEST TICKET
// ═══════════════════════════════════════
function buildTestTicket(printerName) {
  return Buffer.concat([
    CMD.INIT, CMD.CODE_PAGE_AR, CMD.ALIGN_CENTER,
    CMD.BOLD_ON, CMD.SIZE_LARGE,
    line('اختبار الطباعة'),
    CMD.SIZE_NORMAL, CMD.BOLD_OFF,
    line('مطاعم الدجاج الملكي'),
    line(printerName),
    separator('-'),
    line('النص العربي يعمل بشكل صحيح'),
    rawLine('1234567890'),
    rawLine('Arabic Test OK'),
    separator('='),
    CMD.FEED_3, CMD.CUT,
  ]);
}

// ═══════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════
function testPrinterConnection(printerKey) {
  return new Promise((resolve) => {
    const printer = PRINTERS[printerKey];
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      resolve({ key: printerKey, name: printer.name, status: 'offline', ip: printer.ip });
    }, 3000);

    client.connect(printer.port, printer.ip, () => {
      clearTimeout(timeout);
      client.destroy();
      resolve({ key: printerKey, name: printer.name, status: 'online', ip: printer.ip });
    });

    client.on('error', () => {
      clearTimeout(timeout);
      resolve({ key: printerKey, name: printer.name, status: 'offline', ip: printer.ip });
    });
  });
}

// ═══════════════════════════════════════
// HTTP SERVER
// ═══════════════════════════════════════
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url;

  // ── GET /status ──────────────────────
  if (req.method === 'GET' && url === '/status') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', version: '3.0.0' }));
    return;
  }

  // ── GET /health ──────────────────────
  if (req.method === 'GET' && url === '/health') {
    const checks = await Promise.all(Object.keys(PRINTERS).map(testPrinterConnection));
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      bridge_version: '3.0.0',
      timestamp: new Date().toISOString(),
      printers: checks,
    }));
    return;
  }

  // ── POST /print-routed ───────────────
  if (req.method === 'POST' && url === '/print-routed') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        const order = parsed.order || parsed;
        console.log('[print-routed] Order:', order.orderNumber || order.queue_number || '?');
        const results = await routePrintJob(order);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, results }));
      } catch (e) {
        console.error('[print-routed] Error:', e.message);
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // ── POST /print ──────────────────────
  // Accepts { type, order, stationId } from the web app
  if (req.method === 'POST' && url === '/print') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body);
        console.log('[/print] Received:', parsed.type || 'raw', '| Order:', parsed.order?.orderNumber || parsed.order?.queue_number || '?');

        // New format from web app: { type, order, stationId }
        if (parsed.type && parsed.order) {
          const { type, order } = parsed;

          // ★ "both" = receipt + ALL station kitchen tickets via routePrintJob
          if (type === 'both') {
            const results = await routePrintJob(order);
            const allOk = Object.values(results).every(v => v === 'ok' || v === null);
            res.writeHead(200);
            res.end(JSON.stringify({ success: allOk, results }));
            return;
          }

          // Receipt only
          if (type === 'receipt') {
            try {
              await sendToPrinter('receipt', buildReceipt(order));
              res.writeHead(200);
              res.end(JSON.stringify({ success: true, results: [{ name: 'receipt', success: true }] }));
            } catch (e) {
              res.writeHead(200);
              res.end(JSON.stringify({ success: false, results: [{ name: 'receipt', success: false, error: e.message }] }));
            }
            return;
          }

          // Kitchen only (specific station or default)
          if (type === 'kitchen') {
            const targetPrinter = parsed.stationId
              ? Object.keys(PRINTERS).find(k => k === parsed.stationId) || 'kitchen'
              : 'kitchen';
            const items = order.items || [];
            try {
              await sendToPrinter(targetPrinter, buildKitchenTicket(order, items, PRINTERS[targetPrinter]?.name || ''));
              res.writeHead(200);
              res.end(JSON.stringify({ success: true, results: [{ name: targetPrinter, success: true }] }));
            } catch (e) {
              res.writeHead(200);
              res.end(JSON.stringify({ success: false, results: [{ name: targetPrinter, success: false, error: e.message }] }));
            }
            return;
          }

          res.writeHead(400);
          res.end(JSON.stringify({ success: false, error: `Unknown type: ${type}` }));
          return;
        }

        // Legacy format: { printer, data } (raw base64)
        if (parsed.printer && parsed.data) {
          const buffer = Buffer.from(parsed.data, 'base64');
          await sendToPrinter(parsed.printer, buffer);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true }));
          return;
        }

        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: 'Unknown format' }));
      } catch (e) {
        console.error('[/print] Error:', e.message);
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // ── POST /test ───────────────────────
  if (req.method === 'POST' && url === '/test') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { printer } = JSON.parse(body);
        const ticket = buildTestTicket(PRINTERS[printer]?.name || printer);
        await sendToPrinter(printer, ticket);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, message: `Test sent to ${printer}` }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // ── POST /drawer ─────────────────────
  if (req.method === 'POST' && url === '/drawer') {
    try {
      // ESC/POS cash drawer kick pulse
      const drawerCmd = Buffer.from([ESC, 0x70, 0x00, 0x19, 0xFA]);
      await sendToPrinter('receipt', drawerCmd);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

const BRIDGE_IP = '192.168.1.65';

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Malaki Print Bridge v3.0             ║');
  console.log('║   مطاعم الدجاج الملكي                  ║');
  console.log('╠════════════════════════════════════════╣');
  console.log(`║   URL: http://${BRIDGE_IP}:${PORT}         ║`);
  console.log('╠════════════════════════════════════════╣');
  Object.entries(PRINTERS).forEach(([key, p]) => {
    console.log(`║   ${key.padEnd(10)} → ${p.ip.padEnd(16)} ║`);
  });
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`Health check: http://${BRIDGE_IP}:${PORT}/health`);
  console.log(`Test print:   curl -X POST http://${BRIDGE_IP}:${PORT}/test -H "Content-Type: application/json" -d '{"printer":"receipt"}'`);
  console.log('');
});

// ═══════════════════════════════════════
// TEST TICKET
// ═══════════════════════════════════════
function buildTestTicket(printerName) {
  return Buffer.concat([
    CMD.INIT, CMD.CODE_PAGE_AR, CMD.ALIGN_CENTER,
    CMD.BOLD_ON, CMD.SIZE_LARGE,
    line('اختبار الطباعة'),
    CMD.SIZE_NORMAL, CMD.BOLD_OFF,
    line('مطاعم الدجاج الملكي'),
    line(printerName),
    separator('-'),
    line('النص العربي يعمل بشكل صحيح'),
    rawLine('1234567890'),
    rawLine('Arabic Test OK'),
    separator('='),
    CMD.FEED_3, CMD.CUT,
  ]);
}
