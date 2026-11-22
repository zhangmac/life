/* 生活 · Service Worker
   安装只等"首屏"这一件事：先把 index.html 落地再接管，不让几张图标拖住离线能力。
   图标和 manifest 由 fetch 层按需补进缓存 —— 用得到才下，下不到也不影响打开。
   改动应用后把 VERSION 加一，旧缓存会被清掉。 */
const VERSION = "life-v18";
const SHELL = "./index.html";
const CORE = ["./index.html", "./manifest.json"];

const abs = (u) => new URL(u, self.registration.scope).href;

/* 离线也打不开时的兜底页：至少告诉人发生了什么，而不是白屏 */
const OFFLINE_HTML = `<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>需要联网一次</title><style>
html,body{height:100%;margin:0}
body{display:grid;place-items:center;background:#f4f1ea;color:#211f1b;
 font:15px/1.7 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;padding:28px;text-align:center}
h1{font-size:17px;margin:0 0 8px;font-weight:650}
p{margin:0;color:#5b564d;max-width:19em}
button{margin-top:20px;height:42px;padding:0 22px;border:0;border-radius:12px;
 background:#221f1b;color:#fbf9f4;font:inherit;font-weight:600}
@media(prefers-color-scheme:dark){body{background:#101211;color:#eceae3}p{color:#a8a49a}button{background:#e9e6dd;color:#12140f}}
</style></head><body><div>
<h1>这一版还没存到本地</h1>
<p>第一次打开需要联网，把页面读完（大约两秒），之后断网也能用。</p>
<button onclick="location.reload()">重新加载</button>
</div></body></html>`;

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    /* 逐个来：某个资源失败只跳过它自己，不让整个安装崩掉 */
    for (const u of CORE) {
      try {
        const res = await fetch(new Request(abs(u), { cache: "reload" }));
        if (res && res.ok) await c.put(abs(u), res);
      } catch (_) { /* 跳过 */ }
    }
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

  /* 页面导航：先网络（下次打开就能拿到新版本），断网或网关拦截时回落到缓存的首页 */
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      const c = await caches.open(VERSION);
      const cached = (await c.match(abs(SHELL))) || (await c.match(abs("./")));
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          c.put(abs(SHELL), res.clone()).catch(() => {});
          return res;
        }
        if (cached) return cached;
        return res;
      } catch (_) {
        return cached || new Response(OFFLINE_HTML, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }
        });
      }
    })());
    return;
  }

  /* 静态资源：缓存优先，同时后台拉新（图标、manifest 就是在这里补进来的） */
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
