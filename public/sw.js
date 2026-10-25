// Nizhal service worker: keeps the app working offline.
// App files: cache first, refreshed in the background. Weather API: network first,
// falling back to the last copy. Everything stays on the device.
const VERSION = 'nizhal-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
// Caps so the cache cannot grow without bound between version bumps. Cache keys keep insertion
// order and a put moves its entry to the end, so trimming from the front drops the stalest.
// Place searches get their own small bucket so typing in the search box cannot push the
// saved forecast out.
const MAX = { search: 12, weather: 24, file: 80 };

function kind(u) {
  const host = new URL(u).hostname;
  if (host === 'geocoding-api.open-meteo.com') return 'search';
  return host.endsWith('open-meteo.com') ? 'weather' : 'file';
}

function trim(cache, k) {
  return cache.keys().then((keys) => {
    const shell = new Set(SHELL.map((p) => new URL(p, self.location).href));
    const own = keys.filter((r) => kind(r.url) === k && !shell.has(r.url));
    const extra = own.slice(0, Math.max(0, own.length - MAX[k]));
    return Promise.all(extra.map((r) => cache.delete(r)));
  });
}

function store(req, res) {
  return caches.open(VERSION).then((c) => c.put(req, res).then(() => trim(c, kind(req.url))));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isWeather = url.hostname.endsWith('open-meteo.com');
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  const sameOrigin = url.origin === self.location.origin;
  if (!isWeather && !isFont && !sameOrigin) return;

  if (isWeather) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // A rate-limit or server error must not replace the last good forecast.
          if (!res.ok) return caches.match(req).then((hit) => hit || res);
          store(req, res.clone());
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) store(req, res.clone());
          return res;
        })
        // Only page loads fall back to the app shell; a script or image must not get HTML back.
        .catch(() => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
      return hit || network;
    }),
  );
});
