/* 生活 · Service Worker
   安装：逐个缓存首屏资源，单个失败不影响其余 —— 弱网下也能装一半用一半。
   取用：静态资源先给缓存、后台静默更新；页面导航优先网络，断网回落到缓存首页。
   改动应用后把 VERSION 加一，旧缓存会被清掉。 */
const VERSION = "life-v6";
const SHELL = "./index.html";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./icon-180.png"
];

const abs = (u) => new URL(u, self.registration.scope).href;

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(ASSETS.map(async (u) => {
      try {
        const res = await fetch(new Request(abs(u), { cache: "reload" }));
        if (res && res.ok) await c.put(abs(u), res);
      } catch (_) { /* 单个资源失败就跳过 */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  /* 页面导航：先网络（这样上下一次打开就能拿到新版本），断网回落到缓存首页 */
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const c = await caches.open(VERSION);
          c.put(abs(SHELL), res.clone()).catch(() => {});
          return res;
        }
        /* 网关拦了（403/404 之类）：还能用缓存就先顶上，别给用户一张错误页 */
        const c = await caches.open(VERSION);
        const hit = (await c.match(abs(SHELL))) || (await c.match(abs("./")));
        if (hit) return hit;
        return res;
      } catch (_) {
        const c = await caches.open(VERSION);
        return (await c.match(abs(SHELL))) ||
               (await c.match(abs("./"))) ||
               new Response("离线，且本地缓存缺失", { status: 503, headers: { "Content-Type": "text/plain;charset=utf-8" } });
      }
    })());
    return;
  }

  /* 静态资源：缓存优先，同时后台拉新 */
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(async (res) => {
      if (res && res.status === 200 && res.type === "basic") {
        const c = await caches.open(VERSION);
        c.put(req, res.clone()).catch(() => {});
      }
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});
