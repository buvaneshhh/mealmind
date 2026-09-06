const CACHE_NAME = "mealmind-v3";
const APP_SHELL = ["/", "/manifest.webmanifest"];

// Next.js client-side navigations (router.push/replace) fetch RSC payloads
// from the same page URLs (e.g. /dashboard?_rsc=...) using streamed
// responses that can stay open for HMR in dev. Caching those via
// response.clone() ties up the stream and can hang the navigation
// indefinitely, so only genuine static assets get cache-first treatment.
function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?|json)$/.test(url.pathname)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Only cache our own static assets — never cache cross-origin API calls
  // (Supabase REST/realtime), or a response captured once would be served
  // forever regardless of what actually changes in the database.
  if (new URL(request.url).origin !== self.location.origin) return;

  // Navigations: network-first so users get fresh pages online, cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/").then((res) => res || caches.match(request))),
    );
    return;
  }

  // Anything that isn't a static asset (e.g. RSC data fetches for
  // client-side page transitions) goes straight to the network, uncached.
  if (!isStaticAsset(new URL(request.url))) return;

  // Static assets: cache-first, filling the cache as new assets are requested.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }),
    ),
  );
});
