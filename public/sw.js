const BUILD = "__FINANCE_BUILD__";
const PREFIX = "mis-finanzas-shell-";
const STATIC = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/maskable-192.png",
  "/maskable-512.png",
  "/wallet.webp",
];
let activeCache;
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const response = await fetch("/", { cache: "reload" });
      if (!response.ok) throw new Error("No se pudo cargar la aplicación.");
      const html = await response.clone().text();
      const assets = [
        ...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g),
      ].map((match) => match[1]);
      const key = PREFIX + BUILD;
      const cache = await caches.open(key);
      const styles = await Promise.all(
        assets
          .filter((path) => path.endsWith(".css"))
          .map(async (path) => (await fetch(path)).text()),
      );
      const fonts = styles.flatMap((css) =>
        [...css.matchAll(/url\((?:["'])?(\/assets\/[^)'"]+)(?:["'])?\)/g)].map(
          (match) => match[1],
        ),
      );
      await cache.addAll([...new Set([...STATIC, ...assets, ...fonts])]);
      await cache.put("/", response);
      activeCache = key;
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (activeCache && key.startsWith(PREFIX) && key !== activeCache)
          await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/backend/")
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(
        async () => (await caches.match("/")) ?? Response.error(),
      ),
    );
  } else if (
    url.pathname.startsWith("/assets/") ||
    STATIC.includes(url.pathname)
  ) {
    event.respondWith(
      caches
        .match(event.request, { ignoreVary: true })
        .then((response) => response ?? fetch(event.request)),
    );
  }
});
