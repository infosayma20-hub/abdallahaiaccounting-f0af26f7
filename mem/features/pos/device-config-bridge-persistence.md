---
name: POS Device Config Bridge Persistence
description: Print Bridge stores device config (branch/terminal/bridge URL/label) in c:\print-bridge\device.json; POS auto-restores via GET/POST /device-config on boot to survive browser data wipes
type: feature
---

# POS Device Config — Bridge-Side Persistence

**Problem:** Device config (branch, terminal, bridge URL) lives in `localStorage` and is wiped by Chrome's "Clear browsing data". Cashier had to re-enter on every wipe.

**Solution:** Print Bridge keeps a copy on disk and exposes it via HTTP.

## Bridge endpoints (added to print-bridge-v6.3.2.js)
- `GET  http://127.0.0.1:3001/device-config` → returns `device.json`
- `POST http://127.0.0.1:3001/device-config` → merges into `device.json` (non-empty fields only)
- File: `c:\print-bridge\device.json`
- Patch doc: `docs/print-bridge-device-config-patch.md`

## Frontend flow (src/lib/device-config.ts)
- `hydrateConfigFromBridge()` runs once at boot from `src/main.tsx` (after createRoot). Probes `http://127.0.0.1:3001` then `http://localhost:3001`. Restores any missing localStorage field from the bridge.
- `pushConfigToBridge()` is called fire-and-forget from every `setBridgeUrl/setDeviceBranchId/setDeviceTerminalId/setDeviceLabel` so the disk copy stays in sync.
- Merge semantics: only non-empty incoming fields overwrite stored values. Never destructive.

## Result
After "Clear browsing data" or new browser install, opening POS auto-restores the device's branch + terminal + bridge URL within ~1.5s. Cashier sees no setup screen.

## Backup recommendation
Tell users to copy `c:\print-bridge\device.json` to a USB stick once configured. Restoring after Windows reinstall = drop file back.
