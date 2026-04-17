# 🛠️ Print Bridge — Patch: معالجة خرابيش فاتورة الكاشير

> **هدف**: إصلاح ظهور رموز عشوائية / خرابيش بعد جزء صحيح من فاتورة الكاشير على الطابعة الحرارية، مع إضافة وضع نصي ESC/POS احتياطي وتشخيص مفصّل.

---

## 1) تشخيص السبب

| السبب المحتمل | كيف يظهر | الحل |
|---|---|---|
| **Driver "Generic / Text Only"** بدل تعريف الطابعة الرسمي | الجزء الأول صحيح (نص ESC/POS) ثم خرابيش لأن الـ raster يُفسَّر كنص | تركيب التعريف الرسمي للطابعة |
| **عرض الصورة > سعة الطابعة** (مثلاً 800px على طابعة 80mm = 576px) | تكسّر / تكرار سطر / رموز | إجبار العرض على 576/384px |
| **الصورة ليست monochrome 1-bit** | بطء + buffer overflow → بايتات تخرج كنص | تحويل لـ 1-bit threshold |
| **إرسال raster كقطعة واحدة كبيرة** | Buffer overflow في Firmware → جزء يطبع وجزء يخرّب | تقطيع لـ bands بطول 24/256 سطراً |
| **أمر القص قبل اكتمال الـ raster** | يقص قبل الانتهاء أو يخلط الأوامر | انتظار اكتمال الكتابة قبل إرسال GS V |
| **اختلاط بايتات raster مع نص خام** | البردج يكتب نص قبل/بعد raster بدون reset | إرسال `ESC @` (init) قبل وبعد |

---

## 2) خطوات التشخيص السريع (قبل التعديل)

نفّذ على جهاز الكاش `192.168.1.65`:

```bash
# 1. اطبع نص بسيط من Notepad على نفس الطابعة → "Hello 123"
#    ✓ نظيف        → المشكلة في كود البردج (raster handling)
#    ✗ خرابيش      → المشكلة في Driver أو الكيبل

# 2. تحقق من نوع الـ Driver:
#    Control Panel → Devices and Printers → اختر الطابعة → Properties → Advanced → "Driver:"
#    يجب أن يكون: XPrinter / Epson TM / Star … (ليس "Generic / Text Only")

# 3. شغّل البردج من Terminal مرئي وراقب اللوقات أثناء الطباعة:
node print-bridge.js
#    لاحظ: image width, byte length, chunk count, cut timing
```

---

## 3) Patch كود البردج (Node.js)

### 3.1 التبعيات المطلوبة

```bash
npm install sharp escpos escpos-usb
# أو: npm install node-thermal-printer sharp
```

### 3.2 Helper: تحويل PNG → 1-bit raster bands

أضف هذا الملف الجديد `lib/raster.js`:

```javascript
// lib/raster.js
const sharp = require('sharp');

const PRINTER_WIDTH_PX = 576;   // 80mm = 576, 58mm = 384
const BAND_HEIGHT = 24;          // 24-line bands (آمن لمعظم firmwares)

/**
 * Convert a PNG buffer → array of ESC/POS GS v 0 raster bands.
 * Each band is a Buffer ready to write directly to the printer.
 */
async function pngToRasterBands(pngBuffer, opts = {}) {
  const widthPx = opts.widthPx || PRINTER_WIDTH_PX;
  const bandHeight = opts.bandHeight || BAND_HEIGHT;
  const threshold = opts.threshold ?? 128;

  // 1. Resize to exact printer width, convert to 1-bit grayscale
  const { data, info } = await sharp(pngBuffer)
    .resize({ width: widthPx, fit: 'contain', background: '#fff' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const bytesPerRow = Math.ceil(width / 8);
  const bands = [];

  // 2. Slice into horizontal bands
  for (let y = 0; y < height; y += bandHeight) {
    const h = Math.min(bandHeight, height - y);
    const bandBytes = Buffer.alloc(bytesPerRow * h, 0);

    for (let row = 0; row < h; row++) {
      for (let x = 0; x < width; x++) {
        const pixel = data[(y + row) * width + x];
        if (pixel < threshold) {
          // black pixel → set bit
          bandBytes[row * bytesPerRow + Math.floor(x / 8)] |= (0x80 >> (x % 8));
        }
      }
    }

    // 3. Build GS v 0 command for this band
    const xL = bytesPerRow & 0xff;
    const xH = (bytesPerRow >> 8) & 0xff;
    const yL = h & 0xff;
    const yH = (h >> 8) & 0xff;
    const header = Buffer.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
    bands.push(Buffer.concat([header, bandBytes]));
  }

  return { bands, width, height, totalBytes: bytesPerRow * height };
}

module.exports = { pngToRasterBands, PRINTER_WIDTH_PX, BAND_HEIGHT };
```

### 3.3 الطباعة الآمنة مع pacing + cut

```javascript
// lib/printer-safe.js
const escpos = require('escpos');
escpos.USB = require('escpos-usb');
const { pngToRasterBands } = require('./raster');

const ESC_INIT = Buffer.from([0x1b, 0x40]);              // ESC @
const LF = Buffer.from([0x0a]);
const FEED_3 = Buffer.from([0x1b, 0x64, 0x03]);          // ESC d 3 → feed 3 lines
const CUT_FULL = Buffer.from([0x1d, 0x56, 0x00]);        // GS V 0 → full cut
const CUT_PARTIAL = Buffer.from([0x1d, 0x56, 0x01]);     // GS V 1 → partial

/** delay helper */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Print a PNG receipt safely:
 * - resize to printer width
 * - 1-bit conversion
 * - band slicing with pacing
 * - init before, cut after flush
 */
async function printPngSafe(device, pngBuffer, meta = {}) {
  const t0 = Date.now();
  const { bands, width, height, totalBytes } = await pngToRasterBands(pngBuffer);

  console.log(`[printer] 📄 ${meta.type || 'receipt'} | ${width}×${height}px | ${totalBytes} bytes | ${bands.length} bands`);

  return new Promise((resolve, reject) => {
    device.open(async (err) => {
      if (err) return reject(err);
      try {
        // 1. Init (clears any leftover state)
        device.write(ESC_INIT);

        // 2. Send bands one by one with tiny pacing
        for (let i = 0; i < bands.length; i++) {
          device.write(bands[i]);
          if (i % 4 === 3) await wait(15);  // breathe every 4 bands (~96 lines)
        }

        // 3. Wait for buffer to drain BEFORE cutting
        await wait(80);
        device.write(FEED_3);
        device.write(CUT_FULL);

        // 4. Close
        device.close(() => {
          const dt = Date.now() - t0;
          console.log(`[printer] ✅ done in ${dt}ms`);
          resolve({ success: true, ms: dt, bands: bands.length, bytes: totalBytes });
        });
      } catch (e) {
        reject(e);
      }
    });
  });
}

module.exports = { printPngSafe };
```

### 3.4 الوضع النصّي ESC/POS الاحتياطي (Text Fallback)

```javascript
// lib/printer-text.js
const iconv = require('iconv-lite');

const ESC_INIT = Buffer.from([0x1b, 0x40]);
const ESC_ALIGN_CENTER = Buffer.from([0x1b, 0x61, 0x01]);
const ESC_ALIGN_RIGHT = Buffer.from([0x1b, 0x61, 0x02]);
const ESC_ALIGN_LEFT = Buffer.from([0x1b, 0x61, 0x00]);
const ESC_BOLD_ON = Buffer.from([0x1b, 0x45, 0x01]);
const ESC_BOLD_OFF = Buffer.from([0x1b, 0x45, 0x00]);
const ESC_DOUBLE_HW = Buffer.from([0x1d, 0x21, 0x11]);    // double width+height
const ESC_NORMAL = Buffer.from([0x1d, 0x21, 0x00]);
const CODEPAGE_ARABIC = Buffer.from([0x1b, 0x74, 22]);    // page 22 = Farsi/Arabic on most XPrinters
const LF = Buffer.from([0x0a]);
const CUT_FULL = Buffer.from([0x1d, 0x56, 0x00]);

function ar(text) {
  // CP864 / Windows-1256 — جرّب الاثنين حسب الطابعة
  return iconv.encode(text, 'windows-1256');
}

function buildTextReceipt(order) {
  const buf = [];
  buf.push(ESC_INIT, CODEPAGE_ARABIC);

  buf.push(ESC_ALIGN_CENTER, ESC_DOUBLE_HW, ar(order.companyName || 'Receipt'), LF, ESC_NORMAL);
  if (order.companyPhone) buf.push(ar(order.companyPhone), LF);
  buf.push(ar('--------------------------------'), LF);

  buf.push(ESC_ALIGN_CENTER, ESC_BOLD_ON);
  buf.push(ar(`#${order.queueNumber || order.orderNumber}`), LF);
  buf.push(ESC_BOLD_OFF, LF);

  buf.push(ESC_ALIGN_RIGHT);
  for (const item of order.items || []) {
    const line = `${item.quantity}x ${item.name}`.padEnd(28).slice(0, 28);
    const price = String((item.unitPrice * item.quantity).toFixed(2)).padStart(8);
    buf.push(ar(line + price), LF);
  }
  buf.push(ar('--------------------------------'), LF);

  buf.push(ESC_DOUBLE_HW);
  buf.push(ar(`Total: ${order.total} ${order.currency || ''}`), LF);
  buf.push(ESC_NORMAL, LF, LF, LF);

  buf.push(CUT_FULL);
  return Buffer.concat(buf);
}

async function printTextSafe(device, order) {
  const t0 = Date.now();
  const data = buildTextReceipt(order);
  console.log(`[printer-text] 📝 receipt | ${data.length} bytes`);
  return new Promise((resolve, reject) => {
    device.open((err) => {
      if (err) return reject(err);
      device.write(data);
      device.close(() => resolve({ success: true, ms: Date.now() - t0, bytes: data.length, mode: 'text' }));
    });
  });
}

module.exports = { printTextSafe, buildTextReceipt };
```

---

## 4) Endpoints جديدة في `print-bridge.js`

أضف هذه المسارات بجانب المسارات الحالية:

```javascript
const express = require('express');
const { printPngSafe } = require('./lib/printer-safe');
const { printTextSafe } = require('./lib/printer-text');
const { renderReceiptPng } = require('./lib/render-receipt'); // الموجود حالياً
const escpos = require('escpos');
escpos.USB = require('escpos-usb');

function getDevice() {
  return new escpos.Printer(new escpos.USB());
}

// ──────── EXISTING: /print-receipt (UPDATED to support printMode) ────────
app.post('/print-receipt', async (req, res) => {
  const { order } = req.body;
  const meta = req.body.meta || {};
  const mode = meta.printMode === 'text' ? 'text' : 'raster';

  console.log(`[bridge] /print-receipt | mode=${mode} | items=${meta.itemsCount} | est=${meta.estimatedHeight}px | debug=${meta.debug}`);

  try {
    const device = getDevice();
    let result;
    if (mode === 'text') {
      result = await printTextSafe(device, order);
    } else {
      const png = await renderReceiptPng(order);
      result = await printPngSafe(device, png, { type: 'cashier_receipt', ...meta });
    }
    res.json({ ...result, mode });
  } catch (err) {
    console.error('[bridge] ❌', err);
    res.json({ success: false, error: err.message, mode });
  }
});

// ──────── NEW: /test-text — طباعة سطر نصي بسيط ────────
app.post('/test-text', async (req, res) => {
  console.log('[bridge] /test-text');
  try {
    const device = getDevice();
    const result = await printTextSafe(device, {
      companyName: 'TEST PRINT',
      queueNumber: 'T1',
      items: [{ quantity: 1, name: 'Hello 123', unitPrice: 0 }],
      total: 0,
    });
    res.json({ ...result, test: 'text' });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ──────── NEW: /test-logo — طباعة شعار صغير فقط ────────
app.post('/test-logo', async (req, res) => {
  console.log('[bridge] /test-logo');
  try {
    const fs = require('fs');
    const path = require('path');
    const logoPath = path.join(__dirname, 'assets', 'logo.png');
    const logoBuf = fs.readFileSync(logoPath);
    const device = getDevice();
    const result = await printPngSafe(device, logoBuf, { type: 'test_logo' });
    res.json({ ...result, test: 'logo' });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ──────── NEW: /test-receipt — فاتورة كاملة بنفس عينة POS ────────
app.post('/test-receipt', async (req, res) => {
  console.log('[bridge] /test-receipt');
  try {
    const sampleOrder = {
      companyName: 'مطعم الملكي',
      queueNumber: 'TEST',
      orderNumber: 9999,
      orderType: 'takeaway',
      orderTypeLabel: 'استلام',
      items: [
        { quantity: 2, name: 'دجاج مشوي', unitPrice: 35 },
        { quantity: 1, name: 'اجنحة 25 قطعة', unitPrice: 70 },
        { quantity: 1, name: 'بيتزا شاورما', unitPrice: 22 },
      ],
      subtotal: 127,
      total: 127,
      currency: 'ILS',
      paymentMethod: 'نقد',
      cashierName: 'TEST',
      createdAt: new Date().toISOString(),
    };
    const device = getDevice();
    const png = await renderReceiptPng(sampleOrder);
    const result = await printPngSafe(device, png, { type: 'test_receipt', itemsCount: 3 });
    res.json({ ...result, test: 'receipt' });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ──────── EXISTING /health (extend with diagnostics) ────────
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    version: '6.1-corruption-patch',
    printerWidthPx: 576,
    bandHeight: 24,
    supports: ['raster', 'text', 'test-text', 'test-logo', 'test-receipt'],
    timestamp: new Date().toISOString(),
  });
});
```

---

## 5) Logging مفصّل (sample output)

عند الطباعة الناجحة يجب أن ترى في Terminal البردج:

```
[bridge] /print-receipt | mode=raster | items=8 | est=1450px | debug=true
[printer] 📄 cashier_receipt | 576×1450px | 104400 bytes | 61 bands
[printer] ✅ done in 2840ms
```

عند المشكلة سيظهر السبب فوراً (band count غير منطقي، byte length ضخم، خطأ device.open).

---

## 6) Checklist تثبيت

- [ ] تركيب `sharp` و `iconv-lite` و `escpos-usb`
- [ ] إنشاء `lib/raster.js`, `lib/printer-safe.js`, `lib/printer-text.js`
- [ ] استبدال handler `/print-receipt` ليستخدم `printPngSafe` ويدعم `meta.printMode`
- [ ] إضافة `/test-text`, `/test-logo`, `/test-receipt`
- [ ] التأكد من Driver الطابعة (XPrinter/Epson TM وليس Generic Text Only)
- [ ] ضبط `PRINTER_WIDTH_PX` (576 لـ 80mm، 384 لـ 58mm)
- [ ] إعادة تشغيل: `pm2 restart print-bridge` أو `node print-bridge.js`

---

## 7) خطة الاختبار من POS

من صفحة `/print-preview` ستجد:
1. زر **"اختبار: نص فقط"** → يستدعي `/test-text`
2. زر **"اختبار: شعار فقط"** → يستدعي `/test-logo`
3. زر **"اختبار: فاتورة كاملة"** → يستدعي `/test-receipt`
4. مفتاح **Print Mode: raster | text** → يُرسل ضمن meta.printMode
5. لوحة **Print Diagnostics** أسفل الصفحة تعرض آخر العمليات (status, bytes, ms, mode)

### ترتيب العزل:
1. **نص فقط** نظيف ✅ → الطابعة والـ driver سليمان
2. **شعار صغير** نظيف ✅ → الـ raster pipeline سليم
3. **فاتورة كاملة** خرابيش ❌ → المشكلة في حجم/تقطيع/buffer للفواتير الطويلة → خفّض `BAND_HEIGHT` إلى 16 أو زِد wait إلى 25ms

---

## 8) إذا استمرّت المشكلة

شغّل البردج مع dump للبايتات وأرسل أول 200 بايت من الجزء المخرَّب:

```javascript
// أضف قبل device.write داخل printPngSafe:
if (meta.debug) {
  require('fs').appendFileSync('print-debug.bin', bands[i]);
}
```

ثم ارسل لي ملف `print-debug.bin` للتحليل.
