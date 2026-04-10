/**
 * AMWALI Print Bridge v5.0 — Image Mode (Raster Printing)
 *
 * Instead of sending text commands, this version receives pre-rendered
 * receipt/ticket images (base64 PNG) from the browser and converts them
 * to ESC/POS raster bitmaps for perfect Arabic rendering.
 *
 * Install: npm install express sharp
 * Run:     node print-bridge.js
 */

const express = require('express');
const net     = require('net');
const sharp   = require('sharp');

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
app.use(express.json({ limit: '5mb' }));

const PORT = 3001;

// ─── ESC/POS Constants ──────────────────────────────
const ESC = 0x1B;
const GS  = 0x1D;

const CMD = {
  INIT:        Buffer.from([ESC, 0x40]),
  CUT:         Buffer.from([GS, 0x56, 0x00]),
  FEED_3:      Buffer.from([ESC, 0x64, 0x03]),
  DRAWER_KICK: Buffer.from([ESC, 0x70, 0x00, 0x19, 0x78]),
};

// ─── Printer Configuration ──────────────────────────
const PRINTERS = {
  receipt: { ip: '192.168.1.220', port: 9100, name: 'طابعة الوصل',    width: 576 },  // 80mm = 576 dots
  kitchen: { ip: '192.168.1.120', port: 9100, name: 'طابعة المطبخ',   width: 576, stationId: 'a09ebd1b-392c-42b2-a8a7-d180fdde1f97' },  // 80mm = 576 dots
  grill:   { ip: '192.168.1.10',  port: 9100, name: 'طابعة السخان',   width: 576, stationId: '4f64e6b4-89ab-4e22-b935-52f3ec665e54' },  // 80mm = 576 dots
  pizza:   { ip: '192.168.1.228', port: 9100, name: 'طابعة البيتزا',  width: 576, stationId: '8ee3d8c7-fdeb-47b2-bc0c-1c5f9750d516' },  // 80mm = 576 dots
};

const STATION_TO_PRINTER = {};
Object.entries(PRINTERS).forEach(([key, p]) => {
  if (p.stationId) STATION_TO_PRINTER[p.stationId] = key;
});

// ─── Image → ESC/POS Raster Conversion ─────────────

/**
 * Converts a base64 PNG image to ESC/POS raster bitmap commands.
 * Uses GS v 0 (raster bit image) command.
 */
async function imageToEscPos(base64Image, targetWidth) {
  // Remove data URI prefix if present
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  // Resize to printer width and convert to grayscale
  const { data, info } = await sharp(imageBuffer)
    .resize(targetWidth, null, { fit: 'inside', withoutEnlargement: false })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width  = info.width;
  const height = info.height;

  // Width in bytes (8 pixels per byte)
  const bytesPerRow = Math.ceil(width / 8);

  // Build raster data: convert grayscale to monochrome (1-bit)
  // Threshold: pixels darker than 128 become black (1), lighter become white (0)
  const rasterData = Buffer.alloc(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    for (let byteIdx = 0; byteIdx < bytesPerRow; byteIdx++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = byteIdx * 8 + bit;
        if (x < width) {
          const pixel = data[y * width + x];
          if (pixel < 128) {
            byte |= (0x80 >> bit); // Black pixel
          }
        }
      }
      rasterData[y * bytesPerRow + byteIdx] = byte;
    }
  }

  // GS v 0 — Print raster bit image
  // Format: GS v 0 m xL xH yL yH [data]
  // m = 0 (normal), xL xH = bytes per row, yL yH = height
  const header = Buffer.from([
    GS, 0x76, 0x30, 0x00,
    bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,
    height & 0xFF, (height >> 8) & 0xFF,
  ]);

  return Buffer.concat([CMD.INIT, header, rasterData, CMD.FEED_3, CMD.CUT]);
}

// ─── Send to Printer ────────────────────────────────
function sendToPrinter(ip, port, buffer) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(8000);
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

// ─── API Endpoints ──────────────────────────────────

app.get('/health', async (req, res) => {
  const results = await Promise.all(
    Object.entries(PRINTERS).map(async ([key, p]) => ({
      name: p.name, key, ip: p.ip, port: p.port,
      width: p.width,
      stationId: p.stationId || null,
      status: await testConnection(p.ip, p.port) ? 'online' : 'offline',
    }))
  );
  res.json({ status: 'ok', version: '5.0-image', mode: 'raster', printers: results, timestamp: new Date().toISOString() });
});

app.get('/status', (req, res) => {
  res.json({ status: 'ok', version: '5.0-image', mode: 'raster', timestamp: new Date().toISOString() });
});

// ── /print-image — Main image-mode endpoint ──
// Accepts: { image: "base64...", printerKey: "receipt"|"kitchen"|"grill"|"pizza" }
app.post('/print-image', async (req, res) => {
  const { image, printerKey } = req.body;

  if (!image) {
    return res.status(400).json({ success: false, error: 'Missing image data' });
  }

  const printer = PRINTERS[printerKey];
  if (!printer) {
    return res.status(400).json({ success: false, error: `Unknown printer: ${printerKey}` });
  }

  try {
    console.log(`[print-image] Rendering for ${printer.name} (${printer.width}px wide)...`);
    const escposBuffer = await imageToEscPos(image, printer.width);
    console.log(`[print-image] Sending ${escposBuffer.length} bytes to ${printer.ip}:${printer.port}`);
    await sendToPrinter(printer.ip, printer.port, escposBuffer);
    res.json({ success: true, printer: printer.name, bytes: escposBuffer.length });
  } catch (err) {
    console.error(`[print-image] Error:`, err.message);
    res.json({ success: false, error: err.message, printer: printer.name });
  }
});


// ── /test — test print by printer key ──
app.post('/test', async (req, res) => {
  const { printer: printerKey } = req.body;
  const printer = PRINTERS[printerKey];
  if (!printer) {
    return res.status(400).json({ success: false, error: `Unknown printer key: ${printerKey}` });
  }
  try {
    // Generate a real test page image using sharp and print it
    const w = printer.width;
    const h = 300;
    const now = new Date().toLocaleString('ar-EG', { timeZone: 'Asia/Jerusalem' });

    // Build SVG test page
    const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${w}" height="${h}" fill="white"/>
      <text x="${w/2}" y="40" text-anchor="middle" font-size="28" font-weight="bold" fill="black">★ AMWALI ★</text>
      <text x="${w/2}" y="75" text-anchor="middle" font-size="18" fill="black">Test Print / طباعة تجريبية</text>
      <line x1="20" y1="95" x2="${w-20}" y2="95" stroke="black" stroke-width="2" stroke-dasharray="6,4"/>
      <text x="${w/2}" y="130" text-anchor="middle" font-size="16" fill="black">Printer: ${printer.name}</text>
      <text x="${w/2}" y="160" text-anchor="middle" font-size="14" fill="black">IP: ${printer.ip}:${printer.port}</text>
      <text x="${w/2}" y="190" text-anchor="middle" font-size="14" fill="black">Width: ${printer.width}px</text>
      <text x="${w/2}" y="220" text-anchor="middle" font-size="14" fill="black">${now}</text>
      <line x1="20" y1="245" x2="${w-20}" y2="245" stroke="black" stroke-width="2" stroke-dasharray="6,4"/>
      <text x="${w/2}" y="280" text-anchor="middle" font-size="16" fill="black">✓ الطابعة تعمل بنجاح</text>
    </svg>`;

    const imgBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const base64 = 'data:image/png;base64,' + imgBuffer.toString('base64');
    const escposBuffer = await imageToEscPos(base64, printer.width);
    console.log(`[test] Printing test page on ${printer.name} (${escposBuffer.length} bytes)`);
    await sendToPrinter(printer.ip, printer.port, escposBuffer);
    res.json({ success: true, message: `${printer.name} — test page printed` });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── /test-printer — test by IP ──
app.post('/test-printer', async (req, res) => {
  const { ip, port } = req.body;
  const online = await testConnection(ip, port || 9100);
  res.json({ success: online });
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

// ── /config — Returns printer config for the client to know widths ──
app.get('/config', (req, res) => {
  const config = {};
  Object.entries(PRINTERS).forEach(([key, p]) => {
    config[key] = {
      name: p.name,
      width: p.width,
      stationId: p.stationId || null,
    };
  });
  res.json({ config, stationMap: STATION_TO_PRINTER });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('\n  AMWALI Print Bridge v5.0 — IMAGE MODE');
  console.log('  Port: ' + PORT);
  Object.entries(PRINTERS).forEach(([key, p]) => {
    console.log(`  [${key}] ${p.name} @ ${p.ip}:${p.port}  ${p.width}px  ${p.stationId || ''}`);
  });
  console.log('');
});
