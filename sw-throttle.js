// sw-throttle.js
// 代码层节流：RTT（round-trip time）+（同源时）Bandwidth（带宽）模拟
// 跨域（cross-origin）只加 RTT，避免 opaque response 读 body 失败

const DEFAULT_PROFILE = {
  enabled: true,
  rttMs: 800,          // 先设大一点，确保肉眼可见
  jitterMs: 120,
  downKbps: 800,       // 仅对同源生效
  // 你页面主要是 picsum（无后缀），所以这里要放宽：匹配所有路径
  match: /.*/i
};

let profile = { ...DEFAULT_PROFILE };

self.addEventListener('install', () => {
  // 让新 SW 立刻进入 active
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  // 立刻接管当前已打开页面
  e.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_THROTTLE_PROFILE') {
    profile = { ...profile, ...event.data.payload };
  }
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function randJitter(j) {
  if (!j) return 0;
  return Math.floor((Math.random() * 2 - 1) * j);
}
function calcTransferDelayMs(bytes, downKbps) {
  if (!downKbps || downKbps <= 0) return 0;
  const bits = bytes * 8;
  const bps = downKbps * 1000;
  return Math.ceil((bits / bps) * 1000);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 不建议节流导航 HTML（否则首进/刷新体验会很混乱）
  if (req.mode === 'navigate') return;

  if (!profile.enabled) return;

  const url = new URL(req.url);

  // 先做 RTT（对同源/跨域都生效）
  event.respondWith((async () => {
    const baseDelay = profile.rttMs + randJitter(profile.jitterMs);
    await sleep(Math.max(0, baseDelay));

    const res = await fetch(req);

    const isCrossOrigin = url.origin !== self.location.origin;

    // 跨域：直接返回（只做 RTT）
    if (isCrossOrigin) return res;

    // 同源：可读 body，做带宽模拟
    if (!profile.match.test(url.pathname)) return res;

    const clone = res.clone();
    const buf = await clone.arrayBuffer();
    await sleep(calcTransferDelayMs(buf.byteLength, profile.downKbps));

    return new Response(buf, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  })());
});
