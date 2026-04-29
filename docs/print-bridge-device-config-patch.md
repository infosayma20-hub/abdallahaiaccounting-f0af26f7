# Print Bridge — Device Config Persistence Patch

Add this snippet to `c:\print-bridge\print-bridge-v6.3.2.js` so the bridge
keeps a copy of the cashier's device config (branch, terminal, bridge URL,
label) on disk. The POS will auto-restore from this file even after a full
browser "Clear browsing data" wipe.

## 1) Where to put the file

The bridge will read/write **`c:\print-bridge\device.json`**. No DB required.

## 2) Code to add (anywhere after `app` / `express()` is created, before `app.listen(...)`)

```js
// ── Device-config persistence ──────────────────────────────
// The POS calls these endpoints to survive browser data wipes.
const DEVICE_CFG_PATH = path.join(__dirname, "device.json");

function readDeviceCfg() {
  try {
    if (!fs.existsSync(DEVICE_CFG_PATH)) return {};
    return JSON.parse(fs.readFileSync(DEVICE_CFG_PATH, "utf8")) || {};
  } catch (e) {
    console.warn("[device-config] read failed:", e.message);
    return {};
  }
}

function writeDeviceCfg(obj) {
  try {
    fs.writeFileSync(DEVICE_CFG_PATH, JSON.stringify(obj, null, 2), "utf8");
    return true;
  } catch (e) {
    console.warn("[device-config] write failed:", e.message);
    return false;
  }
}

// Permissive CORS for these two endpoints (the POS runs on https://amwali.app)
function cfgCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

app.options("/device-config", (req, res) => { cfgCors(req, res); res.sendStatus(204); });

app.get("/device-config", (req, res) => {
  cfgCors(req, res);
  res.json(readDeviceCfg());
});

app.post("/device-config", express.json({ limit: "32kb" }), (req, res) => {
  cfgCors(req, res);
  const incoming = req.body || {};
  const current = readDeviceCfg();
  // Merge — only overwrite fields that are non-empty in the request
  const merged = { ...current };
  for (const k of ["bridgeUrl", "branchId", "terminalId", "label"]) {
    if (typeof incoming[k] === "string" && incoming[k].trim()) {
      merged[k] = incoming[k].trim();
    }
  }
  merged.updated_at = new Date().toISOString();
  const ok = writeDeviceCfg(merged);
  if (!ok) return res.status(500).json({ error: "write_failed" });
  console.log("[device-config] saved:", merged);
  res.json(merged);
});
```

If `path` and `fs` aren't already required at the top of the file, add:
```js
const fs = require("fs");
const path = require("path");
```
(They almost certainly already are, since the bridge loads `logo.png`.)

## 3) Restart the bridge

Close the CMD window and run:
```
cd c:\print-bridge
node print-bridge-v6.3.2.js
```

## 4) How it works

- When the cashier opens POS, `main.tsx` calls `hydrateConfigFromBridge()`.
  It tries `http://127.0.0.1:3001/device-config` and restores any missing
  branch/terminal/bridge-url into `localStorage`.
- Every time the cashier saves device settings (DeviceSetupPage), the POS
  POSTs the new values to `/device-config`, which writes `device.json`.
- After a "Clear browsing data" → reopen POS → config is restored automatically.
  The cashier never has to re-enter branch/terminal again.

## 5) Backup

Once `device.json` is created, **back it up** to a USB stick or network share.
If Windows is reinstalled, just drop the file back into `c:\print-bridge\`.