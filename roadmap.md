# Roadmap — Inventory costing (plan approved 2026-10-06)
- [x] Phase 1: engine (moving avg / FIFO / reversal / negative stock), settings choice + lock + audit, readiness check, valuation report reads engine
- [x] Phase 2: engine GL (perpetual) for invoices, voids, delivery notes, returns, adjustments/counts, negative variance, reversals; POS sale/return COGS from engine; periodic = no COGS at sale; sale line cost write-back
- [x] Phase 2b: transfers carry source cost; FIFO void restores original layers; rep sales no double COGS; deterministic FIFO order
- [x] Phase 3: item card + reconciliation page (/inventory-costing); periodic closing value from engine
- [x] Activated on demo tenant info.sayma20 (perpetual + moving avg); all 4 combos tested in rolled-back transactions
- [ ] Phase 4: method-change wizard with adjustment entry; optional opening-inventory journal at activation; staged rollout to real tenants — waits on user decision
- [ ] Note: production, imports and stock documents keep their own GL postings (engine values their movements only)
