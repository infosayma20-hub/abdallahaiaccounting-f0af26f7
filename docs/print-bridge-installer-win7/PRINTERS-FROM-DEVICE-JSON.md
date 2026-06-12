# Print Bridge — قراءة الطابعات من device.json

بعد Sprint 2.5، عناوين الطابعات تُحفظ تلقائياً داخل `C:\print-bridge\device.json`
بدلاً من الكود المضمَّن داخل `print-bridge-v6.3.7-clean.js`. هذا الملف يوضح كيف يقرأ
الجسر هذه الطابعات.

## ما الذي تغيّر؟

1. **`device-config-addon.js`** صار يقبل ويتحقق من حقل `printers` ويعيدها عبر:
   - `GET  /device-config`     → الملف الكامل بما فيه `printers`
   - `POST /device-config`     → يدمج (لا يحذف) الحقول، ويتحقق من الطابعات
   - `POST /reload-config`     → يعيد قراءة الملف من القرص (يستدعيها أموالي بعد كل حفظ)
   - `GET  /printers-active`   → الطابعات الفعّالة الآن + المصدر (`device.json` أو `fallback`)

2. **الـ POS** صار يـ POST تلقائياً على `/device-config` لمّا تضيف/تعدّل/تحذف طابعة من
   `/onboarding/new-device`، ثم يستدعي `/reload-config` ليلتقط الجسر التغيير بدون إعادة تشغيل.

## التطبيق على print-bridge-v6.3.7-clean.js

ثلاث تعديلات صغيرة:

### 1) استبدل سطر التحميل القديم
```diff
- require('./device-config-addon')(app);
+ const deviceCfg = require('./device-config-addon')(app);
```

### 2) حوّل `PRINTERS` من ثابت إلى افتراضي قابل للاستبدال
```diff
- const PRINTERS = {
-   receipt: { ip: '192.168.1.220', port: 9100, name: 'طابعة الوصل',  width: 576 },
-   kitchen: { ip: '192.168.1.120', port: 9100, name: 'طابعة المطبخ', width: 576, stationId: '...' },
-   ...
- };
+ let PRINTERS = {
+   receipt: { type: 'network', ip: '192.168.1.220', port: 9100, name: 'طابعة الوصل',  width: 576 },
+   kitchen: { type: 'network', ip: '192.168.1.120', port: 9100, name: 'طابعة المطبخ', width: 576, stationId: '...' },
+   ...
+ };
+ const DEFAULT_PRINTERS = JSON.parse(JSON.stringify(PRINTERS));
+
+ function getActivePrinters() {
+   const fromFile = deviceCfg.getPrinters();
+   if (fromFile && Object.keys(fromFile).length) {
+     // اندمج مع الافتراضي حتى لو device.json فيه فقط receipt + kitchen ما تختفي البقية
+     return { ...DEFAULT_PRINTERS, ...fromFile };
+   }
+   return DEFAULT_PRINTERS;
+ }
```

### 3) استبدل قراءات `PRINTERS[...]` بـ `getActivePrinters()[...]`

- في `/print-image`:
```diff
- const printer = PRINTERS[printerKey];
+ const printer = getActivePrinters()[printerKey];
```

- في `/test`:
```diff
- const printer = PRINTERS[printerKey];
+ const printer = getActivePrinters()[printerKey];
```

- في `/health` (أضف device info كمان):
```diff
- app.get('/health', async (req, res) => {
-   const results = await Promise.all(
-     Object.entries(PRINTERS).map(async ([key, p]) => ({ ... }))
-   );
-   res.json({ status: 'ok', version: '6.3.2', printers: results, timestamp: new Date().toISOString() });
- });
+ app.get('/health', async (req, res) => {
+   const active = getActivePrinters();
+   const cfg = deviceCfg.getConfig();
+   const results = await Promise.all(
+     Object.entries(active).map(async ([key, p]) => ({
+       key, name: p.name, ip: p.ip || null, port: p.port || null,
+       type: p.type || 'network',
+       windowsPrinterName: p.windowsPrinterName || null,
+       width: p.width || 576, stationId: p.stationId || null,
+       status: p.type === 'network' && p.ip
+         ? (await testConnection(p.ip, p.port || 9100) ? 'online' : 'offline')
+         : 'n/a',
+     }))
+   );
+   res.json({
+     status: 'ok',
+     version: '6.3.2',
+     device: { label: cfg.label || null, branchId: cfg.branchId || null, terminalId: cfg.terminalId || null },
+     printers: results,
+     printers_source: deviceCfg.getSource(),
+     timestamp: new Date().toISOString(),
+   });
+ });
```

- في بناء `STATION_TO_PRINTER` (إن استعملته): احسبه من `getActivePrinters()` بدل `PRINTERS`.

## السلوك الناتج

| الحالة | المصدر |
|--------|--------|
| لا يوجد `device.json` أو فاضي من `printers` | `DEFAULT_PRINTERS` (fallback) ✅ |
| `device.json` فيه `printers: { receipt: {...} }` | يدمج فوق الافتراضي ويستعمل receipt الجديد |
| الزبون عدّل IP من أموالي وضغط حفظ | POS يستدعي POST `/device-config` ثم POST `/reload-config` → الجسر يستعمل IP الجديد فوراً |
| المتصفح أو localStorage راحوا | `hydrate` يقرأ من `/device-config` ويرجّع الفرع/المحطة/الطابعات |

لا تتعطل الطباعة في أي حالة — fallback القديم لا يُحذف نهائياً.