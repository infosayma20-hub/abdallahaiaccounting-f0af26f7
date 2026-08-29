---
name: Print Bridge TCP flush root fix (v6.3.8-flush)
description: Root cause of silently lost kitchen tickets — bridge destroyed the TCP socket 300ms after write(); fixed by waiting for FIN/close. Also adds pos_kitchen_print_log tracking.
type: feature
---

# Root cause (found 29/08/2026, فرع فيصل — طابعة البيتزا)

`sendToPrinter()` in `print-bridge-v*.js` resolved `{ok:true}` 300 ms after the
`socket.write()` callback and then called `socket.destroy()`. `write()` only
guarantees the bytes reached the local OS buffer — not the printer. On large
raster kitchen tickets a slow/busy thermal printer was still draining when the
socket was reset, so the ticket was lost while the bridge reported SUCCESS.
Symptoms: random orders never print, no error in POS, replacing the printer
does not help.

## Fix
- Bridge `sendToPrinter()`: connect → write → `socket.end()` (FIN) → resolve on
  `'close'`. Connect timeout 8s, flush cap 12s (must stay below the client's
  15s `bridgeFetch` timeout). `ECONNRESET`/`EPIPE` AFTER a full flush counts as
  success (printer closed the session itself).
- Version bumped to `6.3.8-flush`; the FILE NAME stays
  `print-bridge-v6.3.7-clean.js` because `scripts/build-print-bridge-zips.sh`
  pins that name. Both installer folders (std + win7) must stay byte-identical.
- On-site deployment is required for each cashier PC — this file ships inside
  the installer zip, so an old bridge keeps the bug.

## Visibility
`public.pos_kitchen_print_log` (+ RPC `record_pos_kitchen_print`) stores the
per-station outcome of every kitchen ticket (order_id, printer_key, status,
attempts, last_error, branch, terminal), mirroring `receipt_print_status` on
`pos_orders`. Never rely on the toast alone — query this table when a branch
reports missing tickets.

## Not the cause (verified)
`pos_category_print_rules` mute rows are global (`branch_id IS NULL`) and are
intentional (drinks/desserts/broast muted on البيتزا). No product has
`kitchen_station_id`, so items broadcast to all stations minus mutes.
