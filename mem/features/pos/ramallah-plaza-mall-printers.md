---
name: Ramallah Plaza Mall Branch Printers
description: Printer configuration and routing for رام الله بلازا مول branch (2 printers, unified kitchen)
type: feature
---

# رام الله بلازا مول — Printer Configuration

**Branch ID:** `f82642e1-ce32-456e-8ef8-e556d8d65af9`
**Opened:** April 30, 2026

## Hardware (only 2 printers, NOT 4 like Sufian branches)

| Role | IP | Port | Type |
|------|-----|------|------|
| Receipt (cashier) | `10.10.211.7` | 9100 | `receipt` |
| Unified Kitchen (delivery-called) | `10.10.211.8` | 9100 | `kitchen_ticket` |

**Important:** This branch has NO separate pizza/grill printers. All food items (Main Kitchen, Pizza station, Grill station) print as ONE unified ticket on `10.10.211.8`.

## Database Configuration (`pos_printers`)
- One `receipt` row → `10.10.211.7`
- One `kitchen_ticket` row → `10.10.211.8`, mapped to all 3 station UUIDs (Main Kitchen, Pizza, Grill).

## Frontend Routing Override
File: `src/lib/image-print-service.ts` — `printAllImage()` contains a branch check for `f82642e1-ce32-456e-8ef8-e556d8d65af9`. When matched, it flattens all kitchen-station items into a single `kitchen` printer key so the bridge routes them to `10.10.211.8` instead of legacy `pizza`/`grill` keys (which would target unreachable IPs `192.168.1.10` / `192.168.1.228`).

## Print Bridge (cashier PC)
- Path: `c:\print-bridge\print-bridge-v6.3.2.js`
- URL in POS Device Settings: `http://127.0.0.1:3001`
- Banner confirms: Receipt `10.10.211.7:9100`, Kitchen `10.10.211.8:9100`
- Auto-start via `start-bridge.vbs` in `shell:startup`.

## Verified Test (POS-20260429-0024)
Both printers fired successfully — receipt at `10.10.211.7`, kitchen ticket at `10.10.211.8`. Branch is production-ready.
