// Guarda o app no celular para abrir mesmo sem internet na academia.
// Sempre busca a versão mais nova quando há internet (sem cache do navegador).
const CACHE = "treino-v13";
const FILES = ["./", "index.html", "firebase-config.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => fetch(f, { cache: "no-store" }).then(r => c.put(f, r)))))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  const sameOrigin = u.origin === location.origin;
  const staticLib = u.hostname === "www.gstatic.com" || u.hostname === "fonts.gstatic.com" || (u.hostname === "fonts.googleapis.com");
  if (!sameOrigin && !staticLib) return; // dados do Firebase passam direto
  const req = sameOrigin ? fetch(u.href, { cache: "no-store" }) : fetch(e.request);
  e.respondWith(req.then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(sameOrigin && e.request.mode === "navigate" ? "./" : e.request, copy)); } return r; })
    .catch(() => caches.match(e.request).then(m => m || caches.match("./"))));
});
