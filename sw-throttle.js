// sw-throttle.js
const DEFAULT_PROFILE = {
  enabled: true,
  rttMs: 800, 
  jitterMs: 120,
  downKbps: 800,
  match: /.*/i
};

let profile = { ...DEFAULT_PROFILE };

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
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

  if (req.mode === 'navigate') return;

  if (!profile.enabled) return;

  const url = new URL(req.url);
  event.respondWith((async () => {
    const baseDelay = profile.rttMs + randJitter(profile.jitterMs);
    await sleep(Math.max(0, baseDelay));

    const res = await fetch(req);

    const isCrossOrigin = url.origin !== self.location.origin;

    if (isCrossOrigin) return res;

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
