/*
 * Amwali App-Shell Service Worker
 * --------------------------------
 * Purpose: keep the application usable when the internet drops.
 *
 * Design constraints (deliberate — do not "simplify"):
 *  - Filename is NOT /sw.js or /service-worker.js, and cache names do NOT
 *    match the legacy cleanup patterns (`precache-v\d+-`, `-runtime-`,
 *    `workbox`). The existing force-update / recovery code in index.html and
 *    versionUtils.ts unregisters those on purpose; this worker must survive it.
 *  - Navigations are NETWORK-FIRST: a fresh deploy is always picked up while
 *    online. Only when the network fails do we serve the cached shell.
 *  - API traffic (Supabase, functions, app-version.json) is NEVER cached.
 */

const SHELL_CACHE = "amwali-shell-v1";
const ASSET_CACHE = "amwali-assets-v1";
const SHELL_URL = "/index.html";

const NEVER_CACHE_HOSTS = [".supabase.co", ".supabase.in"];
const NEVER_CACHE_PATHS = ["/app-version.json", "/version.json", "/print-bridge.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SHELL_CACHE);
        await cache.add(new Request(SHELL_URL, { cache: "reload" }));
      } catch (_) {
        /* first install may happen offline — runtime caching will fill in */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("amwali-") && k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") self.skipWaiting();
  if (type === "CLEAR_SHELL_CACHE") {
    event.waitUntil(
      (async () => {
        await caches.delete(SHELL_CACHE);
        await caches.delete(ASSET_CACHE);
      })(),
    );
  }
});

function isNeverCached(url) {
  if (NEVER_CACHE_HOSTS.some((h) => url.hostname.endsWith(h))) return true;
  if (NEVER_CACHE_PATHS.includes(url.pathname)) return true;
  return false;
}

function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return /\.(js|mjs|css|woff2?|ttf|otf|png|jpe?g|svg|webp|ico|json)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (isNeverCached(url)) return;

  // 1) Navigations → network first, cached shell as offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(SHELL_URL, fresh.clone());
          }
          return fresh;
        } catch (_) {
          const cache = await caches.open(SHELL_CACHE);
          const cached = (await cache.match(SHELL_URL)) || (await caches.match(SHELL_URL));
          if (cached) return cached;
          return new Response(
            "<!doctype html><meta charset='utf-8'><body style='font-family:system-ui;direction:rtl;padding:2rem'>لا يوجد اتصال بالإنترنت، وما زال التطبيق غير محفوظ محلياً. افتح البرنامج مرة واحدة وأنت متصل ثم أعد المحاولة.</body>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
    return;
  }

  // 2) Static build assets → cache first (hashed filenames make this safe).
  if (isCacheableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh && (fresh.ok || fresh.type === "opaque")) {
          cache.put(req, fresh.clone()).catch(() => {});
        }
        return fresh;
      })(),
    );
  }
});
