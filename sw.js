/* 오프라인에서도 열리게: 사이트 파일을 기기에 저장해 두고, 저장된 것을 먼저 보여 준 뒤 뒤에서 새로 받아 둬요.
   지도 타일·서체·Leaflet은 한 번 본 것만 저장해요. VERSION은 배포할 때 커밋 번호로 바뀌어요. */
const VERSION = '__VERSION__';
const APP = 'app-' + VERSION;
const RUNTIME = 'runtime-v1';
const TILES = 'tiles-v1';
const MAX_TILES = 600;

const FILES = [
  './', 'index.html', 'map.html', 'manifest.webmanifest',
  'common.css', 'sign.css', 'map.css',
  'data.js', 'geo.js', 'access.js', 'sign.js', 'map.js',
  'core/base.js', 'core/sound.js', 'core/draw.js', 'core/route.js', 'core/sticker.js',
  'core/backup.js', 'core/seal.js', 'core/board.js', 'core/drawer.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('app-') && k !== APP).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* 저장된 것을 먼저 주고, 네트워크로 새로 받아 저장해 둬요 */
function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then((cache) => cache.match(req, { ignoreSearch: cacheName === APP }).then((hit) => {
    const fresh = fetch(req).then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || fresh;
  }));
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

function tile(req) {
  return caches.open(TILES).then((cache) => cache.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).then(() => trim(TILES, MAX_TILES));
    return res;
  })));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.includes('/tools/')) return;          // 관리 도구는 늘 새로
    if (req.mode === 'navigate') {
      e.respondWith(staleWhileRevalidate(req, APP).then((r) => r || caches.match('index.html')));
      return;
    }
    e.respondWith(staleWhileRevalidate(req, APP));
    return;
  }
  if (/basemaps\.cartocdn\.com$/.test(url.hostname)) { e.respondWith(tile(req)); return; }
  if (/^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)$/.test(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req, RUNTIME));
  }
  /* 배경 제거 라이브러리·모델, 카카오 등은 건드리지 않아요 */
});
