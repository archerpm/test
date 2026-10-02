// Офлайн-режим: страница и сборка кэшируются при первом открытии.
// Навигация — сначала сеть (чтобы получить новую версию), затем кэш; остальное — кэш, затем сеть.
const CACHE = "posobie-v2";
const SHELL = ["./", "./manifest.webmanifest", "./icon.svg", "./icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("./", copy)); return res; }).catch(() => caches.match("./")),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => hit ?? fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })),
  );
});
