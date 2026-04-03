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
// ARABIC TEXT HELPER
// ═══════════════════════════════════════
function arabicLine(text) {
  // Reverse word order for RTL thermal printing
  const reversed = text.split(' ').reverse().join(' ');
  // Encode as CP1256 (Windows Arabic)
  return iconv.encode(reversed, 'win1256');
}

function line(text = '') {
  return Buffer.concat([arabicLine(text), Buffer.from([LF])]);
}

function separator(char = '-', count = 32) {
  return line(char.repeat(count));
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

  const parts = [
    CMD.INIT, CMD.CODE_PAGE_AR, CMD.ALIGN_CENTER,
    CMD.BOLD_ON, CMD.SIZE_LARGE,
    line('مطاعم الدجاج الملكي'),
    CMD.SIZE_NORMAL,
    line('Malaki Broast Chicken'),
    CMD.BOLD_OFF,
    line(branchName),
    separator('='),
    CMD.ALIGN_RIGHT, CMD.BOLD_ON,
    line(`رقم الطلب: #${queueNum}`),
    CMD.BOLD_OFF,
    line(`الكاشير: ${cashier}`),
    line(`التاريخ: ${formatDate(createdAt)}`),
    line(`الوقت: ${formatTime(createdAt)}`),
    line(`النوع: ${orderType === 'takeaway' ? 'تيك أواي' : orderType === 'توصيل' ? 'توصيل' : 'داخل المطعم'}`),
    separator('-'),
  ];

  // Items
  order.items.forEach(item => {
    const itemLine = `${item.name}  x${item.quantity}`;
    const priceLine = `${item.total} NIS`;
    parts.push(CMD.ALIGN_RIGHT);
    parts.push(line(itemLine));
    parts.push(CMD.ALIGN_LEFT);
    parts.push(line(priceLine));
    if (item.notes) {
      parts.push(CMD.ALIGN_RIGHT);
      parts.push(line(`  * ${item.notes}`));
    }
  });

  parts.push(
    separator('='),
    CMD.ALIGN_RIGHT,
    CMD.BOLD_ON,
    CMD.SIZE_LARGE,
    line(`الاجمالي: ${order.total} NIS`),
    CMD.SIZE_NORMAL,
    CMD.BOLD_OFF,
    line(`الدفع: ${order.payment_method === 'cash' ? 'نقدي' : 'شبكة'}`),
    separator('='),
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON,
    line('شكرا لزيارتكم'),
    line('Thank You!'),
    CMD.BOLD_OFF,
    CMD.FEED_3,
    CMD.CUT,
  );

  return Buffer.concat(parts);
}

// ═══════════════════════════════════════
// KITCHEN TICKET — تذكرة المطبخ/السخان/البيتزا
// ═══════════════════════════════════════
function buildKitchenTicket(order, items, stationName) {
  const orderTypeAr = order.order_type === 'takeaway' ? '*** تيك اواي ***' : '*** محل ***';

  const parts = [
    CMD.INIT,
    CMD.CODE_PAGE_AR,
    CMD.ALIGN_CENTER,
    separator('='),
    CMD.BOLD_ON,
    CMD.SIZE_XLARGE,
    line(`# ${order.queue_number}`),
    CMD.SIZE_NORMAL,
    CMD.BOLD_OFF,
    separator('='),
    CMD.BOLD_ON,
    CMD.SIZE_LARGE,
    line(orderTypeAr),
    CMD.SIZE_NORMAL,
    CMD.BOLD_OFF,
    line(formatTime(order.created_at)),
    stationName ? line(stationName) : Buffer.alloc(0),
    separator('-'),
    CMD.ALIGN_RIGHT,
  ];

  // Items for this station only
  items.forEach(item => {
    parts.push(CMD.BOLD_ON);
    parts.push(CMD.SIZE_LARGE);
    parts.push(line(`${item.quantity}  x  ${item.name}`));
    parts.push(CMD.SIZE_NORMAL);
    parts.push(CMD.BOLD_OFF);
    if (item.notes) {
      parts.push(line(`>>> ${item.notes}`));
    }
  });

  parts.push(
    CMD.ALIGN_CENTER,
    separator('='),
    CMD.FEED_3,
    CMD.CUT,
  );

  return Buffer.concat(parts);
}

// ═══════════════════════════════════════
// ROUTING LOGIC
// ═══════════════════════════════════════
async function routePrintJob(order) {
  const results = { receipt: null, kitchen: null, grill: null, pizza: null };

  // 1. Always print receipt
  try {
    await sendToPrinter('receipt', buildReceipt(order));
    results.receipt = 'ok';
  } catch (e) {
    results.receipt = e.message;
  }

  // 2. Group items by station
  const kitchenItems = order.items.filter(i =>
    !i.print_stations || i.print_stations.includes('kitchen'));
  const grillItems = order.items.filter(i =>
    i.print_stations && i.print_stations.includes('grill'));
  const pizzaItems = order.items.filter(i =>
    i.print_stations && i.print_stations.includes('pizza'));

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
// TEST TICKET
// ═══════════════════════════════════════
function buildTestTicket(printerName) {
  return Buffer.concat([
    CMD.INIT,
    CMD.CODE_PAGE_AR,
    CMD.ALIGN_CENTER,
    CMD.BOLD_ON,
    CMD.SIZE_LARGE,
    line('اختبار الطباعة'),
    CMD.SIZE_NORMAL,
    CMD.BOLD_OFF,
    line('مطاعم الدجاج الملكي'),
    line(printerName),
    separator('-'),
    line('النص العربي يعمل بشكل صحيح'),
    line('1234567890'),
    separator('='),
    CMD.FEED_3,
    CMD.CUT,
  ]);
}

// ═══════════════════════════════════════
// HEALTH CHECK — test printer connection
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
// DATE HELPERS
// ═══════════════════════════════════════
function formatDate(dateStr) {
  const d = new Date(dateStr || Date.now());
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function formatTime(dateStr) {
  const d = new Date(dateStr || Date.now());
  return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
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

  // ── GET /status ──────────────────────
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', version: '2.1.0' }));
    return;
  }

  const url = req.url;

  // ── GET /health ──────────────────────
  if (req.method === 'GET' && url === '/health') {
    const checks = await Promise.all(Object.keys(PRINTERS).map(testPrinterConnection));
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'ok',
      bridge_version: '2.0.0',
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
        const order = JSON.parse(body);
        const results = await routePrintJob(order);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, results }));
      } catch (e) {
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

        // New format from web app: { type, order, stationId }
        if (parsed.type && parsed.order) {
          const { type, order, stationId } = parsed;
          const results = [];

          if (type === 'receipt' || type === 'both') {
            try {
              await sendToPrinter('receipt', buildReceipt(order));
              results.push({ name: 'receipt', success: true });
            } catch (e) {
              results.push({ name: 'receipt', success: false, error: e.message });
            }
          }

          if (type === 'kitchen' || type === 'both') {
            // If stationId provided, route to specific printer
            const targetPrinter = stationId
              ? Object.keys(PRINTERS).find(k => k === stationId) || 'kitchen'
              : 'kitchen';
            const items = order.items || [];
            try {
              await sendToPrinter(targetPrinter, buildKitchenTicket(order, items, PRINTERS[targetPrinter]?.name || ''));
              results.push({ name: targetPrinter, success: true });
            } catch (e) {
              results.push({ name: targetPrinter, success: false, error: e.message });
            }
          }

          const allOk = results.every(r => r.success);
          res.writeHead(200);
          res.end(JSON.stringify({ success: allOk, results }));
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

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

const BRIDGE_IP = '192.168.1.65';

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Malaki Print Bridge v2.0             ║');
  console.log('║   مطاعم الدجاج الملكي                  ║');
  console.log('╠════════════════════════════════════════╣');
  console.log(`║   URL: http://${BRIDGE_IP}:${PORT}         ║`);
  console.log('╠════════════════════════════════════════╣');
  Object.entries(PRINTERS).forEach(([key, p]) => {
    console.log(`║   ${p.name.padEnd(20)} ${p.ip}  ║`);
  });
  console.log('╚════════════════════════════════════════╝');
  console.log('');
  console.log(`Health check: http://${BRIDGE_IP}:${PORT}/health`);
  console.log('');
});
