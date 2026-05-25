---
name: POS Device Config Bridge Persistence
description: Print Bridge stores device config (branch/terminal/bridge URL/label) in c:\print-bridge\device.json; POS auto-restores via GET/POST /device-config on boot to survive browser data wipes
type: feature
---

# POS Device Config — Bridge-Side Persistence

**Problem:** Device config (branch, terminal, bridge URL) lives in `localStorage` and is wiped by Chrome's "Clear browsing data". Cashier had to re-enter on every wipe.

**Solution:** Print Bridge keeps a copy on disk and exposes it via HTTP.

## Bridge endpoints (added to print-bridge-v6.3.2.js)
- `GET  /device-config`     → returns full `device.json` (incl. `printers` map)
- `POST /device-config`     → merges non-empty fields incl. `printers` (validated)
- `POST /reload-config`     → re-reads `device.json` from disk (hot-reload)
- `GET  /printers-active`   → currently effective printers + source (`device.json` | `fallback`)
- File: `c:\print-bridge\device.json`
- Addon: `docs/device-config-addon.js` (returns `{ getConfig, getPrinters, getSource, reload }`)
- Patch doc: `docs/print-bridge-installer/PRINTERS-FROM-DEVICE-JSON.md`

### device.json schema (Sprint 2.5)
```
{
  bridgeUrl, branchId, terminalId, cashBoxId, label,
  printers: {
    receipt:         { type:"network", ip, port, name, width?, stationId? },
    kitchen|grill|pizza|unified_kitchen: { ... same shape ... },
    // OR for USB:   { type:"windows", windowsPrinterName, name }
  }
}
```
Bridge merges `DEFAULT_PRINTERS` (hardcoded fallback) ← with `printers` from device.json.
If `printers` is empty/missing, bridge falls back to hardcoded constants — printing never breaks.

## Frontend flow (src/lib/device-config.ts)
- `hydrateConfigFromBridge()` runs once at boot from `src/main.tsx` (after createRoot). Probes `http://127.0.0.1:3001` then `http://localhost:3001`. Restores any missing localStorage field from the bridge.
- `pushConfigToBridge()` is called fire-and-forget from every `setBridgeUrl/setDeviceBranchId/setDeviceTerminalId/setDeviceLabel` so the disk copy stays in sync.
- `pushPrintersToBridge(map)` POSTs a `{printers}` payload then calls `/reload-config`. Used by `/onboarding/new-device` after add/edit/delete printer, on import, and on every printer list refresh.
- `pullRawDeviceJsonFromBridge()` returns the full file (used by Export so backup includes printers).
- `reloadBridgeConfig()` POST `/reload-config` — hot-reload without restarting the Windows service.
- Printer sync supports full replacement (`replacePrinters: true`): device.json printers become source of truth so stale fallback IPs (192.168.1.50-53) do not reappear. Use null to delete a printer key.

## Result
After "Clear browsing data" or new browser install, opening POS auto-restores the device's branch + terminal + bridge URL within ~1.5s. Cashier sees no setup screen.

## Backup recommendation
Tell users to copy `c:\print-bridge\device.json` to a USB stick once configured. Restoring after Windows reinstall = drop file back.
