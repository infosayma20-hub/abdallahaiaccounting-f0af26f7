# POS Rules

- POS boot: `initializePOS` fetches tenant/user lookups in one parallel batch (products/rates start immediately), `POSDeviceAuthGuard` mounts POS under the shared `POSBootOverlay` while device checks run (no shift claim until the guard resolves via `posBootLoading`), and the offline pre-cache is deferred 20s. Why: entry used to serialize ~15 round-trips plus the bridge probe.
- POS v2 (`/pos-v2`) is the same `POSPage` with `variant="v2"`: only the top bar, products and cart zones swap to `src/components/pos/v2/*`, fed by the existing state/handlers; v2 theme/card size live in React state only. Why: a UI experiment must never fork sales/print logic or change `/pos`.
