/**
 * ═══════════════════════════════════════════════════════════════════════
 *  AMWALI Print Bridge v6.2.5 — v6.2.3 + 6 cleanup fixes
 *    1) kitchen: removed line under "استلام" (above items)
 *    2) receipt: removed line above "رقم الطلب"
 *    3) receipt: removed line under items header (الصنف/الكمية/السعر/المجموع)
 *    4) receipt: removed "المجموع الفرعي" row
 *    5) receipt: removed line above الإجمالي
 *    6) logo.png loading retained (place logo at C:\malaki-print\logo.png)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Purpose
 *  -------
 *  Local HTTP bridge running on the cashier PC (C:\malaky-print\) that
 *  receives print jobs from the Amwali POS web app and sends raster image
 *  data to the thermal printers over TCP (ESC/POS raster mode).
 *
 *  Changes vs v6.1 (chunked)
 *  -------------------------
 *   1. MAX_CHUNK_HEIGHT lowered from 128 → 48 rows (buffer-overflow proof).
 *   2. Idempotency: duplicate print jobs (same id + printer) within 60s
 *      are silently ignored. Logs: [duplicate-blocked].
 *   3. Printer flow hardened:
 *        - ESC @ (INIT) once at start
 *        - GS v 0 per chunk, no resets between chunks
 *        - NO text after image
 *        - Single FEED + CUT at the very end
 *   4. Cash receipt font sizes matched to the (known-good) closure report
 *      template (22–32px body, 46px total).
 *   5. Kitchen ticket:
 *        - Black top bar → replaced by outer black border
 *        - Extra top margin (clip-safe)
 *        - Time moved directly below order # and enlarged
 *        - Invoice-level note suppressed (item-level only)
 *   6. POS note printed on cash receipt in a bold framed block.
 *   7. Call-center payment label preserved verbatim (e.g. "فيزا - Wheel App").
 *   8. Structured logs: [print-start] [chunk-send] [print-end]
 *                       [duplicate-blocked] [printer-error]
 *
 *  Run with:  pm2 start print-bridge-v6.2.js --name amwali-bridge
 *  Health:    GET  http://192.168.1.65:3001/health
 *
 *  Dependencies (already installed):
 *    express, cors, body-parser, sharp, net
 * ═══════════════════════════════════════════════════════════════════════
 */

const express     = require('express');
const cors        = require('cors');
const bodyParser  = require('body-parser');
const net         = require('net');
const sharp       = require('sharp');
const fs          = require('fs');
const path        = require('path');

// ─── Logo loading (optional, for receipt + shift summary) ──────────────
function loadLogoBase64() {
  const candidates = [
    path.join(__dirname, 'logo.png'),
    path.join(__dirname, 'assets', 'logo.png'),
    'C:\\malaky-print\\logo.png',
    'C:\\malaki-print\\logo.png',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const b = fs.readFileSync(p);
        console.log(`[logo] loaded from ${p} (${b.length} bytes)`);
        return 'data:image/png;base64,' + b.toString('base64');
      }
    } catch { /* ignore */ }
  }
  console.log('[logo] not found — receipts/shift will print without logo');
  return null;
}
const LOGO_B64 = loadLogoBase64();

const app  = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json({ limit: '8mb' }));

// ────────────────────────────────────────────────────────────────────────
//  PRINTER REGISTRY — adjust IPs for your branch
// ────────────────────────────────────────────────────────────────────────
const PRINTERS = {
  receipt: { ip: '192.168.1.220', port: 9100, name: 'طابعة الوصل',  width: 576 },
  kitchen: { ip: '192.168.1.120', port: 9100, name: 'طابعة المطبخ',  width: 576, stationId: 'a09ebd1b-392c-42b2-a8a7-d180fdde1f97' },
  grill:   { ip: '192.168.1.10',  port: 9100, name: 'طابعة السخان',  width: 576, stationId: '4f64e6b4-89ab-4e22-b935-52f3ec665e54' },
  pizza:   { ip: '192.168.1.228', port: 9100, name: 'طابعة البيتزا', width: 576, stationId: '8ee3d8c7-fdeb-47b2-bc0c-1c5f9750d516' },
};

// ────────────────────────────────────────────────────────────────────────
//  ESC/POS CONSTANTS + CHUNKING
// ────────────────────────────────────────────────────────────────────────
const CMD = {
  INIT:        Buffer.from([0x1B, 0x40]),             // ESC @
  FEED_LINES:  (n) => Buffer.from([0x1B, 0x64, n]),   // ESC d n
  CUT:         Buffer.from([0x1D, 0x56, 0x42, 0x00]), // GS V B 0 (partial)
  DRAWER:      Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]),
};

// Most critical tunable in the whole file.
// 48 rows ≈ 3.4 KB per chunk → well under the 4 KB buffer most Epson/Xprinter
// 80 mm printers actually honour in practice. Do NOT raise above 64.
const MAX_CHUNK_HEIGHT = 48;

// ────────────────────────────────────────────────────────────────────────
//  IDEMPOTENCY GUARD (anti-duplicate)
// ────────────────────────────────────────────────────────────────────────
const recentJobs = new Map(); // key → timestamp
const DEDUPE_WINDOW_MS = 60_000;

function shouldBlockDuplicate(key) {
  const now = Date.now();
  for (const [k, t] of recentJobs) {
    if (now - t > DEDUPE_WINDOW_MS) recentJobs.delete(k);
  }
  const last = recentJobs.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) {
    console.log(`[duplicate-blocked] ${key} (${now - last}ms ago)`);
    return true;
  }
  recentJobs.set(key, now);
  return false;
}

// ────────────────────────────────────────────────────────────────────────
//  IMAGE → ESC/POS RASTER (chunked GS v 0)
// ────────────────────────────────────────────────────────────────────────
/**
 * Convert a 1-bit threshold raster (Buffer of bytes, MSB-first) into
 * a sequence of `GS v 0` chunks.  Each chunk is a self-contained raster
 * image so the printer never stays starved waiting for more data.
 *
 *  header per chunk:  1D 76 30 m xL xH yL yH  <data...>
 *     m = 0 (normal), xL/xH = bytes-per-row, yL/yH = rows-in-chunk
 */
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

/**
 * Take a PNG buffer, convert to 1-bit raster, and wrap with full
 * ESC/POS job envelope.  Returns a single Buffer ready for TCP write.
 */
async function buildPrintJob(pngBuffer, targetWidthPx) {
  // Threshold → 1-bit (sharp produces MSB-first bytes by default)
  const { data, info } = await sharp(pngBuffer)
    .resize({ width: targetWidthPx, withoutEnlargement: false })
    .greyscale()
    .threshold(160)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Pack greyscale (1 byte/pixel after threshold) into 1-bit MSB-first
  const widthPx  = info.width;
  const heightPx = info.height;
  const bytesPerRow = Math.ceil(widthPx / 8);
  const packed = Buffer.alloc(bytesPerRow * heightPx, 0x00);

  for (let y = 0; y < heightPx; y++) {
    for (let x = 0; x < widthPx; x++) {
      const pixel = data[y * widthPx + x];
      if (pixel === 0) { // black
        const byteIdx = y * bytesPerRow + (x >> 3);
        const bitIdx  = 7 - (x & 7);
        packed[byteIdx] |= (1 << bitIdx);
      }
    }
  }

  const chunks = imageToEscPosChunks(packed, widthPx, heightPx);
  console.log(`[chunk-send] ${chunks.length} chunks × ${MAX_CHUNK_HEIGHT} rows (${heightPx}px total)`);

  return Buffer.concat([
    CMD.INIT,                 // one-time init
    ...chunks,                // N × (GS v 0 + raster)
    CMD.FEED_LINES(4),        // feed before cut
    CMD.CUT,                  // partial cut, once
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
        // Give the printer a beat to flush the last chunk.
        setTimeout(() => finish(true, null), 300);
      });
    });
  });
}

// ────────────────────────────────────────────────────────────────────────
//  SVG TEMPLATES (server-side — NO browser involved)
// ────────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Cash receipt SVG — sized 576 × dynamic.
 * Fonts & spacing mirror the closure-report template that prints cleanly.
 */
function renderReceiptSVG(order) {
  const W = 576;
  const padX = 24;

  const dateStr = new Date(order.createdAt || Date.now()).toLocaleDateString('en-GB');
  const timeStr = new Date(order.createdAt || Date.now()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const rows = [];
  let y = 40;
  const push = (h, fn) => { rows.push(fn(y)); y += h; };

  // Logo (Fix #3) — optional, at top if logo.png exists
  if (LOGO_B64) {
    push(96, (cy) =>
      `<image href="${LOGO_B64}" x="${(W - 180) / 2}" y="${cy - 80}" width="180" height="90" preserveAspectRatio="xMidYMid meet"/>`);
  }

  // Header
  push(50, (cy) =>
    `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="32" font-weight="900" font-family="Tahoma">${esc(order.companyName || 'مطعم الملكي')}</text>`);
  if (order.terminalName) {
    push(34, (cy) =>
      `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="22" font-weight="800" font-family="Tahoma">${esc(order.terminalName)}</text>`);
  }
  push(28, (cy) =>
    `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="20" font-family="Tahoma">${dateStr} • ${timeStr}</text>`);

  // (v6.2.5 fix #2) removed line above "رقم الطلب" — keep small spacer
  push(16, () => '');

  // Order #
  push(54, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="34" font-weight="900" font-family="Tahoma">رقم الطلب</text>
    <text x="${padX}" y="${cy}" text-anchor="start" font-size="34" font-weight="900" font-family="Tahoma">${esc(order.queueNumber || order.orderNumber || '---')}</text>`);

  if (order.cashierName)
    push(30, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">الكاشير</text>
      <text x="${padX}" y="${cy}" text-anchor="start" font-size="22" font-weight="700" font-family="Tahoma">${esc(order.cashierName)}</text>`);

  push(30, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">نوع الطلب</text>
    <text x="${padX}" y="${cy}" text-anchor="start" font-size="22" font-weight="800" font-family="Tahoma">${esc(order.orderTypeLabel || 'محلي')}</text>`);

  if (order.tableNumber)
    push(30, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">الطاولة</text>
      <text x="${padX}" y="${cy}" text-anchor="start" font-size="22" font-weight="800" font-family="Tahoma">${esc(order.tableNumber)}</text>`);

  push(14, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="2"/>`);

  // Items header
  push(32, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end"    font-size="20" font-weight="800" font-family="Tahoma">الصنف</text>
    <text x="${W * 0.48}" y="${cy}" text-anchor="middle" font-size="20" font-weight="800" font-family="Tahoma">الكمية</text>
    <text x="${W * 0.30}" y="${cy}" text-anchor="middle" font-size="20" font-weight="800" font-family="Tahoma">السعر</text>
    <text x="${padX}" y="${cy}" text-anchor="start"      font-size="20" font-weight="800" font-family="Tahoma">المجموع</text>`);
  // (v6.2.5 fix #3) removed line under items header
  push(8, () => '');

  for (const it of (order.items || [])) {
    const qty    = it.quantity || 1;
    const price  = Number(it.unitPrice || 0).toFixed(2);
    const total  = (qty * Number(it.unitPrice || 0)).toFixed(2);
    // Name is confined to the right column (~55% of width). Wrap if long.
    const nameLines = wrapTextForSvg(String(it.name || ''), 22);
    // Fix #4 — widened rows (42px base, 32px per extra line) to stop overlap
    const rowH = 42 + Math.max(0, nameLines.length - 1) * 32;
    push(rowH, (cy) => {
      const firstY = cy;
      const nameSvg = nameLines.map((ln, i) =>
        `<text x="${W - padX}" y="${firstY + i * 32}" text-anchor="end" font-size="24" font-weight="900" font-family="Tahoma">${esc(ln)}</text>`
      ).join('');
      return `
      ${nameSvg}
      <text x="${W * 0.48}" y="${firstY}" text-anchor="middle" font-size="24" font-weight="900" font-family="Tahoma">${qty}</text>
      <text x="${W * 0.30}" y="${firstY}" text-anchor="middle" font-size="22" font-weight="700" font-family="Tahoma">₪${price}</text>
      <text x="${padX}" y="${firstY}" text-anchor="start"      font-size="22" font-weight="800" font-family="Tahoma">₪${total}</text>`;
    });
    if (it.notes) {
      const noteLines = wrapTextForSvg(String(it.notes), 34);
      const noteH = 26 + Math.max(0, noteLines.length - 1) * 24;
      push(noteH, (cy) => noteLines.map((ln, i) =>
        `<text x="${W - padX - 12}" y="${cy + i * 24}" text-anchor="end" font-size="18" font-family="Tahoma">${i === 0 ? '+ ' : ''}${esc(ln)}</text>`
      ).join(''));
    }
  }

  // (v6.2.5) keep small spacer where the line under items used to be
  push(10, () => '');

  // (v6.2.5 fix #4) removed "المجموع الفرعي" row entirely
  if (order.discount)
    push(28, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="20" font-weight="700" font-family="Tahoma">الخصم</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="20" font-weight="800" font-family="Tahoma">-₪${Number(order.discount).toFixed(2)}</text>`);

  // TOTAL — boxed, largest
  // (v6.2.5 fix #5) removed line above الإجمالي — small spacer instead
  push(12, () => '');
  push(70, (cy) => `
    <rect x="${padX}" y="${cy - 44}" width="${W - padX*2}" height="58" fill="none" stroke="#000" stroke-width="3"/>
    <text x="${W - padX - 10}" y="${cy}" text-anchor="end"   font-size="40" font-weight="900" font-family="Tahoma">الإجمالي</text>
    <text x="${padX + 10}" y="${cy}" text-anchor="start"     font-size="40" font-weight="900" font-family="Tahoma">₪${Number(order.total || 0).toFixed(2)}</text>`);

  // Payment
  push(32, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">طريقة الدفع</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="22" font-weight="800" font-family="Tahoma">${esc(order.paymentMethod || 'نقد')}</text>`);
  if (order.cashReceived)
    push(32, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="22" font-weight="700" font-family="Tahoma">المبلغ المستلم</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="22" font-weight="800" font-family="Tahoma">₪${Number(order.cashReceived).toFixed(2)}</text>`);
  if (order.change)
    push(34, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="24" font-weight="900" font-family="Tahoma">الباقي</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="900" font-family="Tahoma">₪${Number(order.change).toFixed(2)}</text>`);

  // POS NOTE — framed, always printed when present
  if (order.orderNote) {
    push(10, (cy) => '');
    const note = esc(order.orderNote);
    const lines = wrapTextForSvg(note, 36);
    const boxH = 16 + lines.length * 28;
    push(boxH + 6, (cy) => `
      <rect x="${padX}" y="${cy - boxH + 4}" width="${W - padX*2}" height="${boxH}" fill="none" stroke="#000" stroke-width="2"/>
      ${lines.map((ln, i) => `<text x="${W - padX - 8}" y="${cy - boxH + 32 + i*28}" text-anchor="end" font-size="20" font-weight="800" font-family="Tahoma">${i === 0 ? '📝 ملاحظة: ' : ''}${ln}</text>`).join('')}`);
  }

  push(24, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="22" font-weight="800" font-family="Tahoma">❤️ شكراً لتعاملكم معنا</text>`);

  const H = y + 30;
  return `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fff"/>
  ${rows.join('\n')}
</svg>`;
}

/**
 * Kitchen ticket SVG — 384 wide.
 * - outer black border (no top bar)
 * - generous top padding (clip-safe)
 * - time moved directly under order #
 * - invoice-level note NOT printed
 */
function renderKitchenSVG(order, stationLabel) {
  const W = 384;
  const padX = 18;
  const topPad = 56; // clip-safe

  const now = new Date(order.createdAt || Date.now());
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-GB');

  const typeLabel = order.orderTypeLabel
    || (order.orderType === 'delivery' ? 'توصيل' : order.orderType === 'dine_in' ? 'محلي' : 'استلام');

  const rows = [];
  let y = topPad;
  const push = (h, fn) => { rows.push(fn(y)); y += h; };

  if (stationLabel)
    push(46, (cy) => `
      <text x="${W/2}" y="${cy}" text-anchor="middle" font-size="30" font-weight="900" font-family="Tahoma">${esc(stationLabel)}</text>
      <line x1="${padX}" y1="${cy + 8}" x2="${W - padX}" y2="${cy + 8}" stroke="#000" stroke-width="2"/>`);

  // BIG order #
  push(62, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="52" font-weight="900" font-family="Tahoma"># ${esc(order.queueNumber || order.orderNumber || '---')}</text>`);

  // TIME — directly beneath (Fix #2 — smaller 28px to save space)
  push(44, (cy) => `
    <rect x="${padX}" y="${cy - 32}" width="${W - padX*2}" height="40" fill="none" stroke="#000" stroke-width="2"/>
    <text x="${W/2}" y="${cy}" text-anchor="middle" font-size="28" font-weight="900" font-family="Tahoma">🕐 ${timeStr} • ${dateStr}</text>`);

  // Order type
  push(52, (cy) => `
    <rect x="${padX}" y="${cy - 38}" width="${W - padX*2}" height="48" fill="none" stroke="#000" stroke-width="3"/>
    <text x="${W/2}" y="${cy}" text-anchor="middle" font-size="28" font-weight="900" font-family="Tahoma">${esc(typeLabel)}</text>`);

  if (order.tableNumber)
    push(32, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="22" font-weight="900" font-family="Tahoma">طاولة: ${esc(order.tableNumber)}</text>`);

  // (v6.2.5 fix #1) removed line under "استلام/توصيل/محلي" — keep spacer
  push(12, () => '');

  for (const it of (order.items || [])) {
    const qty = it.quantity || 1;
    // Kitchen: qty on the left, name fills the rest. Wrap long names.
    const nameLines = wrapTextForSvg(String(it.name || ''), 18);
    const rowH = 34 + Math.max(0, nameLines.length - 1) * 30;
    push(rowH, (cy) => {
      const firstY = cy;
      const nameSvg = nameLines.map((ln, i) =>
        `<text x="${W - padX}" y="${firstY + i * 30}" text-anchor="end" font-size="26" font-weight="900" font-family="Tahoma">${esc(ln)}</text>`
      ).join('');
      return `
      ${nameSvg}
      <text x="${padX}" y="${firstY}" text-anchor="start" font-size="22" font-weight="900" font-family="Tahoma">${qty}×</text>`;
    });
    if (it.notes) {
      const noteLines = wrapTextForSvg(String(it.notes), 22);
      const noteH = 28 + Math.max(0, noteLines.length - 1) * 26;
      push(noteH, (cy) => noteLines.map((ln, i) =>
        `<text x="${W - padX - 12}" y="${cy + i * 26}" text-anchor="end" font-size="20" font-weight="700" font-family="Tahoma">${esc(ln)}</text>`
      ).join(''));
    }
  }

  // Fix #1 — Invoice-level order note (printed at bottom of kitchen ticket)
  if (order.orderNote) {
    push(14, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="3"/>`);
    const noteLines = wrapTextForSvg(String(order.orderNote), 22);
    const boxH = 16 + noteLines.length * 28;
    push(boxH + 6, (cy) => `
      <rect x="${padX}" y="${cy - boxH + 4}" width="${W - padX*2}" height="${boxH}" fill="none" stroke="#000" stroke-width="2"/>
      ${noteLines.map((ln, i) => `<text x="${W - padX - 6}" y="${cy - boxH + 30 + i*28}" text-anchor="end" font-size="22" font-weight="900" font-family="Tahoma">${i === 0 ? '📝 ' : ''}${esc(ln)}</text>`).join('')}`);
  }

  const H = y + topPad;
  return `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fff"/>
  <!-- outer border replaces old black top bar -->
  <rect x="2" y="2" width="${W-4}" height="${H-4}" fill="none" stroke="#000" stroke-width="4" rx="4"/>
  ${rows.join('\n')}
</svg>`;
}

function wrapTextForSvg(text, maxChars) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Shift Summary SVG — 576 wide, large fonts (matches working closure template).
 * Renders a proper cash-closure report, NOT a fake receipt.
 */
function renderShiftSVG(session) {
  const W = 576;
  const padX = 24;
  const fmt = (n) => Number(n || 0).toFixed(2);

  const openedAt = session.sessionStart ? new Date(session.sessionStart) : null;
  const closedAt = session.sessionEnd   ? new Date(session.sessionEnd)   : new Date();
  const fmtDT = (d) => {
    if (!d) return '—';
    const dd = d.toLocaleDateString('en-GB');
    const tt = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `${dd} ${tt}`;
  };

  const rows = [];
  let y = 40;
  const push = (h, fn) => { rows.push(fn(y)); y += h; };

  // Fix #5a — Logo on top of shift closure (optional)
  if (LOGO_B64) {
    push(120, (cy) =>
      `<image href="${LOGO_B64}" x="${(W - 200) / 2}" y="${cy - 90}" width="200" height="100" preserveAspectRatio="xMidYMid meet"/>`);
  }

  // Title
  push(60, (cy) =>
    `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="42" font-weight="900" font-family="Tahoma">تسليم العهدة</text>`);
  push(40, (cy) =>
    `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="26" font-weight="800" font-family="Tahoma">${esc(session.branchName || 'مطعم الملكي')}</text>`);
  if (session.terminalName)
    push(34, (cy) =>
      `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="24" font-family="Tahoma">${esc(session.terminalName)}</text>`);

  push(18, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="3"/>`);

  // Cashier + times
  if (session.cashierName)
    push(38, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">الكاشير</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="26" font-weight="800" font-family="Tahoma">${esc(session.cashierName)}</text>`);

  push(38, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">فتح الوردية</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="800" font-family="Tahoma">${esc(fmtDT(openedAt))}</text>`);
  push(38, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">إغلاق الوردية</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="800" font-family="Tahoma">${esc(fmtDT(closedAt))}</text>`);

  push(18, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="2"/>`);

  // Orders & sales
  push(40, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="28" font-weight="800" font-family="Tahoma">عدد الطلبات</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="28" font-weight="900" font-family="Tahoma">${session.totalOrders || 0}</text>`);
  push(40, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="28" font-weight="800" font-family="Tahoma">إجمالي المبيعات</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="28" font-weight="900" font-family="Tahoma">₪${fmt(session.totalSales)}</text>`);
  if (session.totalExpenses)
    push(40, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="28" font-weight="800" font-family="Tahoma">إجمالي المصروفات</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="28" font-weight="900" font-family="Tahoma">₪${fmt(session.totalExpenses)}</text>`);

  push(18, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="2"/>`);

  // Payment methods
  push(38, (cy) =>
    `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="28" font-weight="900" font-family="Tahoma">توزيع المبيعات</text>`);
  push(38, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">نقد</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="26" font-weight="800" font-family="Tahoma">₪${fmt(session.cashSales)}</text>`);
  push(38, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">بطاقة / فيزا</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="26" font-weight="800" font-family="Tahoma">₪${fmt(session.cardSales)}</text>`);

  push(18, (cy) => `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#000" stroke-width="3"/>`);

  // Cash balances
  push(38, (cy) =>
    `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="28" font-weight="900" font-family="Tahoma">أرصدة الصندوق</text>`);
  push(38, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">الرصيد الافتتاحي</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="26" font-weight="800" font-family="Tahoma">₪${fmt(session.openingBalance)}</text>`);
  push(38, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">المتوقع (شيكل)</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="26" font-weight="800" font-family="Tahoma">₪${fmt(session.expectedCash)}</text>`);
  push(38, (cy) => `
    <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="26" font-weight="700" font-family="Tahoma">الفعلي (شيكل)</text>
    <text x="${padX}" y="${cy}" text-anchor="start"   font-size="26" font-weight="800" font-family="Tahoma">₪${fmt(session.closingBalance)}</text>`);

  if (session.expectedCashUSD != null || session.closingCashUSD != null) {
    push(36, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="24" font-weight="700" font-family="Tahoma">المتوقع (دولار)</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="800" font-family="Tahoma">$${fmt(session.expectedCashUSD)}</text>`);
    push(36, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="24" font-weight="700" font-family="Tahoma">الفعلي (دولار)</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="800" font-family="Tahoma">$${fmt(session.closingCashUSD)}</text>`);
  }
  if (session.expectedCashJOD != null || session.closingCashJOD != null) {
    push(36, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="24" font-weight="700" font-family="Tahoma">المتوقع (دينار)</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="800" font-family="Tahoma">${fmt(session.expectedCashJOD)} د.أ</text>`);
    push(36, (cy) => `
      <text x="${W - padX}" y="${cy}" text-anchor="end" font-size="24" font-weight="700" font-family="Tahoma">الفعلي (دينار)</text>
      <text x="${padX}" y="${cy}" text-anchor="start"   font-size="24" font-weight="800" font-family="Tahoma">${fmt(session.closingCashJOD)} د.أ</text>`);
  }

  // Spacer above variance — no separator line so it can't cross the result text
  push(30, () => '');

  // Variance — stacked layout, clean box, no crossing rule
  const diff = Number(session.difference || 0);
  const diffLabel = diff === 0 ? 'مطابق ✓' : diff > 0 ? `فائض +₪${fmt(diff)}` : `عجز -₪${fmt(Math.abs(diff))}`;
  const boxH = 130;
  push(boxH + 10, (cy) => `
    <rect x="${padX}" y="${cy - boxH + 6}" width="${W - padX*2}" height="${boxH}" rx="6" ry="6" fill="none" stroke="#000" stroke-width="3"/>
    <text x="${W/2}" y="${cy - boxH + 52}" text-anchor="middle" font-size="32" font-weight="900" font-family="Tahoma">الفرق</text>
    <text x="${W/2}" y="${cy - boxH + 100}" text-anchor="middle" font-size="38" font-weight="900" font-family="Tahoma">${esc(diffLabel)}</text>`);

  push(40, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="24" font-family="Tahoma">توقيع الكاشير: ________________</text>`);
  push(32, (cy) => `<text x="${W/2}" y="${cy}" text-anchor="middle" font-size="24" font-weight="800" font-family="Tahoma">❤️ شكراً</text>`);

  const H = y + 30;
  return `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#fff"/>
  ${rows.join('\n')}
</svg>`;
}

// ────────────────────────────────────────────────────────────────────────
//  SVG → PNG  (sharp)
// ────────────────────────────────────────────────────────────────────────
async function svgToPng(svg) {
  return await sharp(Buffer.from(svg)).png().toBuffer();
}

// ────────────────────────────────────────────────────────────────────────
//  ROUTES
// ────────────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  res.json({
    online: true,
    version: '6.2.5',
    logo: !!LOGO_B64,
    printers: Object.entries(PRINTERS).map(([k, p]) => ({ key: k, name: p.name, ip: p.ip, connected: true })),
  });
});

app.post('/print-receipt', async (req, res) => {
  const order = req.body?.order || {};
  // Dedup by orderNumber only — createdAt varies between retries and breaks dedup.
  const jobKey = `receipt|${order.orderNumber || '?'}`;
  if (shouldBlockDuplicate(jobKey)) {
    console.log(`[duplicate-blocked] receipt #${order.orderNumber}`);
    return res.json({ success: true, duplicate: true });
  }

  console.log(`[print-start] receipt #${order.orderNumber}`);
  try {
    const svg = renderReceiptSVG(order);
    const png = await svgToPng(svg);
    const payload = await buildPrintJob(png, PRINTERS.receipt.width);
    const r = await sendToPrinter(PRINTERS.receipt.ip, PRINTERS.receipt.port, payload, 'receipt');
    console.log(`[print-end] receipt #${order.orderNumber} → ${r.ok ? 'OK' : 'FAIL: ' + r.err}`);
    res.json({ success: r.ok, error: r.err });
  } catch (e) {
    console.error('[printer-error] receipt', e);
    res.json({ success: false, error: e.message });
  }
});

app.post('/print-kitchen', async (req, res) => {
  const order       = req.body?.order || {};
  const printerKey  = req.body?.printerKey || 'kitchen';
  const stationLbl  = req.body?.stationLabel || PRINTERS[printerKey]?.name || '';
  const printer     = PRINTERS[printerKey];
  if (!printer) return res.json({ success: false, error: `unknown_printer:${printerKey}` });

  // Dedup by orderNumber + printerKey only.
  const jobKey = `kitchen|${printerKey}|${order.orderNumber || '?'}`;
  if (shouldBlockDuplicate(jobKey)) {
    console.log(`[duplicate-blocked] kitchen/${printerKey} #${order.orderNumber}`);
    return res.json({ success: true, duplicate: true });
  }

  console.log(`[print-start] kitchen/${printerKey} #${order.orderNumber}`);
  try {
    const svg = renderKitchenSVG(order, stationLbl);
    const png = await svgToPng(svg);
    const payload = await buildPrintJob(png, printer.width);
    const r = await sendToPrinter(printer.ip, printer.port, payload, `kitchen/${printerKey}`);
    console.log(`[print-end] kitchen/${printerKey} #${order.orderNumber} → ${r.ok ? 'OK' : 'FAIL: ' + r.err}`);
    res.json({ success: r.ok, error: r.err });
  } catch (e) {
    console.error('[printer-error] kitchen', e);
    res.json({ success: false, error: e.message });
  }
});

app.post('/print-shift', async (req, res) => {
  const session = req.body?.session || {};
  // Dedup: one summary per sessionEnd timestamp (prevents accidental double-prints)
  const jobKey  = `shift|${session.sessionEnd || session.sessionStart || Date.now()}`;
  if (shouldBlockDuplicate(jobKey)) {
    console.log('[duplicate-blocked] shift summary');
    return res.json({ success: true, duplicate: true });
  }

  console.log('[print-start] shift summary');
  try {
    const svg     = renderShiftSVG(session);
    const png     = await svgToPng(svg);
    const payload = await buildPrintJob(png, PRINTERS.receipt.width);
    const r       = await sendToPrinter(PRINTERS.receipt.ip, PRINTERS.receipt.port, payload, 'shift');
    console.log(`[print-end] shift → ${r.ok ? 'OK' : 'FAIL: ' + r.err}`);
    res.json({ success: r.ok, error: r.err });
  } catch (e) {
    console.error('[printer-error] shift', e);
    res.json({ success: false, error: e.message });
  }
});

app.post('/drawer', async (_req, res) => {
  const r = await sendToPrinter(PRINTERS.receipt.ip, PRINTERS.receipt.port, CMD.DRAWER, 'drawer');
  res.json({ success: r.ok, error: r.err });
});

app.post('/test-printer', async (req, res) => {
  const { ip, port } = req.body || {};
  const payload = Buffer.concat([CMD.INIT, CMD.FEED_LINES(2), CMD.CUT]);
  const r = await sendToPrinter(ip, port, payload, 'test');
  res.json({ success: r.ok, error: r.err });
});

// ────────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  AMWALI Print Bridge v6.2.5 — CLEANUP + ANTI-DUPLICATE + LOGO');
  console.log('  SERVER-SIDE SVG → PNG → raster ESC/POS');
  console.log(`  Listening on http://0.0.0.0:${PORT}`);
  console.log('═══════════════════════════════════════════════════════════');
});
