// Service Worker — Nûr PWA
// Gère le cache de l'app (fonctionne hors ligne) et le cache des audios du Coran
// téléchargés à la demande (verset par verset).
const SHELL = 'nur-shell-v24';
const AUDIO = 'nur-quran-audio';   // versets du Coran sauvegardés par l'utilisateur
const ROQYA = 'nur-roqya';         // Roqya téléchargées hors ligne

const ASSETS = [
  './', './index.html', './styles.css', './app.js',
  './lib/adhan.js', './data/adhkar.js', './data/quran-ids.js', './data/quran-text.js', './data/roqya.js', './data/kids.js',
  './icons/icon-192.png', './icons/icon-512.png', './manifest.webmanifest', './fonts/amiri-arabic-400.woff2', './fonts/amiri-arabic-700.woff2',
  './assets/adhan_medine.mp3', './assets/adhan_new.mp3'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL && k !== AUDIO && k !== ROQYA).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Découpe une réponse complète (200) en réponse partielle (206) selon l'en-tête Range
// — indispensable pour pouvoir AVANCER/RECULER le curseur audio depuis le cache.
async function sliceForRange(fullResponse, rangeHeader) {
  const buf = await fullResponse.arrayBuffer();
  const size = buf.byteLength;
  const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader || '');
  let start = m ? parseInt(m[1], 10) : 0;
  let end = (m && m[2]) ? parseInt(m[2], 10) : size - 1;
  if (isNaN(start) || start < 0) start = 0;
  if (isNaN(end) || end >= size) end = size - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206, statusText: 'Partial Content',
    headers: {
      'Content-Type': fullResponse.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1)
    }
  });
}

// Sert un média : depuis le cache (avec gestion du Range) si présent, sinon réseau direct
async function serveMedia(request, cacheName) {
  const range = request.headers.get('range');
  const cache = cacheName ? await caches.open(cacheName) : caches;
  // caches.match ignore l'en-tête Range et renvoie la version complète stockée
  const cached = cacheName ? await cache.match(request.url) : await caches.match(request.url);
  if (cached && cached.status === 200) {
    return range ? sliceForRange(cached, range) : cached;
  }
  // Pas en cache → réseau (Netlify gère nativement le Range) — pas de mise en cache ici
  try { return await fetch(request); }
  catch { return new Response('', { status: 504 }); }
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Audios du Coran (everyayah) : cache "AUDIO" si téléchargé (hors ligne), avec Range
  if (url.hostname.includes('everyayah.com')) {
    e.respondWith(serveMedia(e.request, AUDIO));
    return;
  }

  // Domaines externes (YouTube…) : réseau direct
  if (url.origin !== self.location.origin) return;

  // Fichier APK (téléchargement de l'app Android) : réseau direct, pas de cache
  if (url.pathname.endsWith('.apk')) return;

  // Roqya : cache "ROQYA" si téléchargée (hors ligne, avec curseur), sinon streaming
  if (url.pathname.startsWith('/assets/roqya/')) {
    e.respondWith(serveMedia(e.request, ROQYA));
    return;
  }

  // Audios Adhkar/Douaa (volumineux) : AUCUNE interception — le navigateur gère
  // la lecture et le déplacement du curseur nativement (Netlify gère le Range).
  if (url.pathname.startsWith('/assets/audio/')) return;

  // Adhan (petit, precaché) : gestion du Range pour l'offline
  if (/\.mp3$/i.test(url.pathname)) {
    e.respondWith(serveMedia(e.request, SHELL));
    return;
  }

  // Reste de l'app : réseau d'abord (toujours à jour), repli cache hors ligne
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html')))
  );
});

// Permet à la page de demander le téléchargement d'un audio dans le cache AUDIO
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'cache-audio' && e.data.url) {
    caches.open(e.data.cacheName || AUDIO).then((c) => c.add(e.data.url))
      .then(() => e.source && e.source.postMessage({ type: 'cached', url: e.data.url, ok: true }))
      .catch(() => e.source && e.source.postMessage({ type: 'cached', url: e.data.url, ok: false }));
  }
});
