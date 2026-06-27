function isWorkboxCacheForThisRegistration(name) {
  const hasWorkboxBucket = /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name);
  return hasWorkboxBucket && name.endsWith(self.registration.scope);
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const workboxCacheNames = cacheNames.filter(isWorkboxCacheForThisRegistration);
        await Promise.allSettled(workboxCacheNames.map((name) => caches.delete(name)));
        await self.clients.claim();
        const windowClients = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(
          windowClients.map((client) => {
            const url = new URL(client.url);
            url.searchParams.delete("__recover");
            url.searchParams.delete("__hard");
            url.searchParams.delete("v");
            url.searchParams.delete("t");
            url.searchParams.set("sw-cleanup", Date.now().toString());
            return client.navigate(url.toString());
          }),
        );
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);
