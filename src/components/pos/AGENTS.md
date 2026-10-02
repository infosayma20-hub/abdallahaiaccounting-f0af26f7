# POS Rules

- POS boot: `initializePOS` fetches tenant/user lookups in one parallel batch (products/rates start immediately), `POSDeviceAuthGuard` mounts POS under the shared `POSBootOverlay` while device checks run (no shift claim until the guard resolves via `posBootLoading`), and the offline pre-cache is deferred 20s. Why: entry used to serialize ~15 round-trips plus the bridge probe.
