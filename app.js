'use strict';
/* ===================== Nûr PWA — logique principale ===================== */

// --- Service Worker (hors ligne) ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
}

// --- Configuration (stockée localement) ---
const DEFAULT = {
  latitude: 51.515, longitude: 7.466, city: 'Dortmund', country: 'Allemagne',
  method: 'MuslimWorldLeague', madhab: 'Shafi', highLatitudeRule: 'SeventhOfTheNight',
  adhanFile: 'adhan_medine.mp3', notif: true,
  adhanEnabled: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true }
};
function loadCfg() { try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem('nur-cfg') || '{}') }; } catch { return { ...DEFAULT }; } }
function saveCfg() { localStorage.setItem('nur-cfg', JSON.stringify(cfg)); }
let cfg = loadCfg();

function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2600); }

/* ===================== Consentement (1er lancement) ===================== */
const consent = document.getElementById('consent');
if (localStorage.getItem('nur-consent') === 'yes') consent.classList.add('hidden');

document.getElementById('consent-accept').addEventListener('click', async () => {
  localStorage.setItem('nur-consent', 'yes');
  consent.classList.add('hidden');
  if ('Notification' in window && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch {} }
  detectLocation();
});
document.getElementById('consent-city').addEventListener('click', () => {
  localStorage.setItem('nur-consent', 'yes');
  consent.classList.add('hidden');
  switchView('prayers');
  document.querySelector('.settings').setAttribute('open', '');
  document.getElementById('set-city').focus();
});

/* ===================== Localisation ===================== */
function detectLocation() {
  if (!navigator.geolocation) { toast('Géolocalisation indisponible'); return; }
  toast('Localisation en cours…');
  navigator.geolocation.getCurrentPosition(async (pos) => {
    cfg.latitude = pos.coords.latitude; cfg.longitude = pos.coords.longitude;
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${cfg.latitude}&longitude=${cfg.longitude}&localityLanguage=fr`);
      const d = await r.json();
      cfg.city = d.city || d.locality || 'Ma position'; cfg.country = d.countryName || '';
    } catch { cfg.city = 'Ma position'; cfg.country = ''; }
    saveCfg(); renderAll();
    toast('Position : ' + cfg.city);
  }, () => toast('Autorisation refusée — saisissez votre ville'), { enableHighAccuracy: false, timeout: 10000 });
}

async function geocodeCity(name) {
  const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(name) + '&count=1&language=fr&format=json');
  const d = await r.json();
  if (d.results && d.results.length) { const x = d.results[0]; return { city: x.name, country: x.country || '', lat: x.latitude, lon: x.longitude }; }
  return null;
}

/* ===================== Horaires de prière ===================== */
const PRAYERS = [
  { key: 'fajr', name: 'Fajr', ar: 'الفجر' }, { key: 'sunrise', name: 'Lever du soleil', ar: 'الشروق' },
  { key: 'dhuhr', name: 'Dhuhr', ar: 'الظهر' }, { key: 'asr', name: 'Asr', ar: 'العصر' },
  { key: 'maghrib', name: 'Maghrib', ar: 'المغرب' }, { key: 'isha', name: 'Isha', ar: 'العشاء' }
];
function prayerTimes(date) {
  const coords = new adhan.Coordinates(cfg.latitude, cfg.longitude);
  const methodMap = {
    MuslimWorldLeague: adhan.CalculationMethod.MuslimWorldLeague(), Egyptian: adhan.CalculationMethod.Egyptian(),
    Karachi: adhan.CalculationMethod.Karachi(), UmmAlQura: adhan.CalculationMethod.UmmAlQura(),
    NorthAmerica: adhan.CalculationMethod.NorthAmerica()
  };
  const p = methodMap[cfg.method] || adhan.CalculationMethod.MuslimWorldLeague();
  p.madhab = cfg.madhab === 'Hanafi' ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
  const hlr = { SeventhOfTheNight: adhan.HighLatitudeRule.SeventhOfTheNight, TwilightAngle: adhan.HighLatitudeRule.TwilightAngle, MiddleOfTheNight: adhan.HighLatitudeRule.MiddleOfTheNight };
  if (hlr[cfg.highLatitudeRule]) p.highLatitudeRule = hlr[cfg.highLatitudeRule];
  return new adhan.PrayerTimes(coords, date, p);
}
const fmt = (d) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function renderTimes() {
  const t = prayerTimes(new Date());
  document.getElementById('appbar-loc').textContent = '📍 ' + cfg.city;
  const now = Date.now();
  const order = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
  let nextKey = order.find(k => t[k].getTime() > now) || 'fajr';
  const c = document.getElementById('times'); c.innerHTML = '';
  for (const p of PRAYERS) {
    const row = document.createElement('div');
    row.className = 'time-row' + (p.key === nextKey ? ' active' : '');
    const noBell = p.key === 'sunrise';
    const on = cfg.adhanEnabled[p.key];
    const bell = noBell ? '' : `<span class="bell ${on ? '' : 'off'}" data-key="${p.key}" title="Activer/couper l'Adhan">${on ? '🔔' : '🔕'}</span>`;
    row.innerHTML = `<div><span class="pn">${p.name}</span><span class="pa">${p.ar}</span></div><div class="right"><span class="pt">${fmt(t[p.key])}</span>${bell}</div>`;
    c.appendChild(row);
  }
  c.querySelectorAll('.bell').forEach(el => el.addEventListener('click', () => {
    const k = el.dataset.key; cfg.adhanEnabled[k] = !cfg.adhanEnabled[k]; saveCfg();
    renderTimes(); scheduleAdhans();
    toast(cfg.adhanEnabled[k] ? 'Adhan activé' : 'Adhan coupé');
  }));
}
function updateCountdown() {
  const t = prayerTimes(new Date()); const now = Date.now();
  const order = [['Fajr', 'fajr'], ['Dhuhr', 'dhuhr'], ['Asr', 'asr'], ['Maghrib', 'maghrib'], ['Isha', 'isha']];
  let next = order.find(([, k]) => t[k].getTime() > now); let target, name;
  if (next) { target = t[next[1]].getTime(); name = next[0]; }
  else { target = t.fajr.getTime() + 86400000; name = 'Fajr (demain)'; }
  const diff = Math.max(0, target - now);
  const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
  document.getElementById('np-name').textContent = name;
  document.getElementById('np-countdown').textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  document.getElementById('np-at').textContent = 'à ' + new Date(target).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function renderSettings() {
  document.getElementById('set-city').value = cfg.city || '';
  document.getElementById('set-method').value = cfg.method;
  document.getElementById('set-madhab').value = cfg.madhab;
  document.getElementById('set-hlr').value = cfg.highLatitudeRule;
  document.getElementById('set-adhan-file').value = cfg.adhanFile;
  document.getElementById('set-notif').checked = cfg.notif;
}
function renderAll() { renderTimes(); updateCountdown(); renderSettings(); }

document.getElementById('btn-find-city').addEventListener('click', async () => {
  const name = document.getElementById('set-city').value.trim(); if (!name) return;
  toast('Recherche…');
  const r = await geocodeCity(name);
  if (r) { Object.assign(cfg, { city: r.city, country: r.country, latitude: r.lat, longitude: r.lon }); saveCfg(); renderAll(); toast('✓ ' + r.city); }
  else toast('Ville introuvable');
});
document.getElementById('btn-geoloc').addEventListener('click', detectLocation);
// Bouton « Sauvegarder mon choix » : mémorise emplacement + son de l'Adhan + méthode
document.getElementById('btn-save').addEventListener('click', async () => {
  const cityVal = document.getElementById('set-city').value.trim();
  if (cityVal && cityVal !== cfg.city) {
    toast('Recherche de la ville…');
    const r = await geocodeCity(cityVal);
    if (r) Object.assign(cfg, { city: r.city, country: r.country, latitude: r.lat, longitude: r.lon });
  }
  cfg.method = document.getElementById('set-method').value;
  cfg.madhab = document.getElementById('set-madhab').value;
  cfg.highLatitudeRule = document.getElementById('set-hlr').value;
  cfg.adhanFile = document.getElementById('set-adhan-file').value;
  cfg.notif = document.getElementById('set-notif').checked;
  saveCfg(); renderAll(); scheduleAdhans();
  toast('✓ Choix enregistré (ville + son de l\'Adhan)');
});
['set-method', 'set-madhab', 'set-hlr'].forEach(id => document.getElementById(id).addEventListener('change', () => {
  cfg.method = document.getElementById('set-method').value;
  cfg.madhab = document.getElementById('set-madhab').value;
  cfg.highLatitudeRule = document.getElementById('set-hlr').value;
  saveCfg(); renderAll(); scheduleAdhans();
}));
document.getElementById('set-adhan-file').addEventListener('change', () => { cfg.adhanFile = document.getElementById('set-adhan-file').value; saveCfg(); toast('Son enregistré'); });
document.getElementById('set-notif').addEventListener('change', async (e) => {
  cfg.notif = e.target.checked; saveCfg();
  if (cfg.notif && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
});
document.getElementById('btn-test-adhan').addEventListener('click', () => playAdhan('Test'));
document.getElementById('btn-test-native').addEventListener('click', () => testNativeAdhan());

/* ===================== Adhan : planificateur + lecture ===================== */
let adhanTimers = [];
const adhanAudio = document.getElementById('adhan-audio');
function clearAdhanTimers() { adhanTimers.forEach(clearTimeout); adhanTimers = []; }
function scheduleAdhans() {
  clearAdhanTimers();
  const t = prayerTimes(new Date()); const now = Date.now();
  [['fajr', 'Fajr'], ['dhuhr', 'Dhuhr'], ['asr', 'Asr'], ['maghrib', 'Maghrib'], ['isha', 'Isha']].forEach(([k, name]) => {
    const delay = t[k].getTime() - now;
    if (delay > 0 && delay < 86400000 && cfg.adhanEnabled[k]) {
      adhanTimers.push(setTimeout(() => { playAdhan(name); setTimeout(scheduleAdhans, 60000); }, delay));
    }
  });
  const mid = new Date(); mid.setHours(24, 0, 30, 0);
  adhanTimers.push(setTimeout(scheduleAdhans, Math.max(1000, mid.getTime() - now)));
  scheduleNativeAdhan(); // app native Android : Adhan même en veille
}

// ===== Adhan en VEILLE (uniquement dans l'app native Android — Capacitor) =====
// Programme des notifications/alarmes système qui réveillent le téléphone et jouent
// l'Adhan aux heures de prière, même app fermée / écran verrouillé.
window._adhanStatus = '';
function getLN() {
  const cap = window.Capacitor;
  if (!cap) return null;
  const isNat = cap.isNativePlatform ? cap.isNativePlatform() : (cap.platform && cap.platform !== 'web');
  if (!isNat) return null;
  // IMPORTANT : sur page distante, enregistrer le plugin explicitement
  return (cap.Plugins && cap.Plugins.LocalNotifications) || (cap.registerPlugin && cap.registerPlugin('LocalNotifications')) || null;
}
async function ensureAdhanChannel(LN) {
  if (LN.createChannel) {
    await LN.createChannel({ id: 'adhan_call', name: 'Adhan', description: 'Appel à la prière',
      sound: 'adhan.mp3', importance: 5, visibility: 1, vibration: true }).catch(() => {});
  }
}
async function scheduleNativeAdhan() {
  const LN = getLN();
  if (!LN) return; // PWA web ou plugin indisponible
  try {
    await LN.requestPermissions();
    await ensureAdhanChannel(LN);
    const pending = await LN.getPending().catch(() => ({ notifications: [] }));
    if (pending.notifications && pending.notifications.length) {
      await LN.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) }).catch(() => {});
    }
    const order = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    const names = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
    const notifs = [];
    for (let d = 0; d < 7; d++) { // 7 jours d'avance
      const date = new Date(); date.setDate(date.getDate() + d);
      const t = prayerTimes(date);
      order.forEach((k, i) => {
        if (!cfg.adhanEnabled[k]) return;
        const at = t[k];
        if (at.getTime() <= Date.now() + 5000) return;
        notifs.push({
          id: d * 10 + i + 1,
          title: '🕌 ' + names[k],
          body: "C'est l'heure de la prière — Adhan",
          schedule: { at: at, allowWhileIdle: true },
          channelId: 'adhan_call', sound: 'adhan.mp3'
        });
      });
    }
    if (notifs.length) await LN.schedule({ notifications: notifs });
    window._adhanStatus = '✓ ' + notifs.length + ' Adhan programmés';
  } catch (e) { window._adhanStatus = '⚠️ ' + (e && e.message ? e.message : e); }
  updateAdhanStatusUI();
}
// Test : déclenche une notification Adhan dans ~12 secondes
async function testNativeAdhan() {
  const LN = getLN();
  if (!LN) { playAdhan('Test'); toast('Test (mode web) — l\'app native sonnera en veille'); return; }
  try {
    await LN.requestPermissions();
    await ensureAdhanChannel(LN);
    const when = new Date(Date.now() + 12000);
    await LN.schedule({ notifications: [{ id: 999, title: '🕌 Test Adhan', body: 'Ceci est un test — verrouillez le téléphone', schedule: { at: when, allowWhileIdle: true }, channelId: 'adhan_call', sound: 'adhan.mp3' }] });
    toast('🔔 Test programmé dans 12 s — verrouillez le téléphone maintenant !');
  } catch (e) { toast('Erreur test : ' + (e && e.message ? e.message : e)); }
}
function updateAdhanStatusUI() {
  const el = document.getElementById('adhan-native-status');
  if (el && window._adhanStatus) el.textContent = window._adhanStatus;
}
function playAdhan(name) {
  // Notification (si autorisée) — utile quand l'app est en arrière-plan
  if (cfg.notif && 'Notification' in window && Notification.permission === 'granted') {
    const opt = { body: 'C\'est l\'heure de la prière — Adhan', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'adhan-' + name, vibrate: [300, 100, 300] };
    if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(r => r.showNotification('🕌 ' + name, opt)).catch(() => {});
    else try { new Notification('🕌 ' + name, opt); } catch {}
  }
  // Audio + écran
  adhanAudio.src = 'assets/' + cfg.adhanFile;
  adhanAudio.play().catch(() => {});
  document.getElementById('adhan-title').textContent = 'Adhan — ' + name;
  document.getElementById('adhan-overlay').classList.add('show');
}
document.getElementById('adhan-stop').addEventListener('click', () => { adhanAudio.pause(); adhanAudio.currentTime = 0; document.getElementById('adhan-overlay').classList.remove('show'); });
adhanAudio.addEventListener('ended', () => document.getElementById('adhan-overlay').classList.remove('show'));

/* ===================== Navigation (onglets) ===================== */
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.tabbar .tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  if (name === 'adhkar' && !adhkarInit) initAdhkar();
  if (name === 'quran' && !quranInit) initQuran();
  if (name === 'kids' && !kidsInit) initKids();
}
document.querySelectorAll('.tabbar .tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

/* ===================== Adhkar ===================== */
const ADATA = window.ADHKAR_DATA || {};
/* ===== Favoris ===== */
function getFavs() { try { return JSON.parse(localStorage.getItem('nur_favs') || '[]'); } catch { return []; } }
function saveFavs(f) { try { localStorage.setItem('nur_favs', JSON.stringify(f)); } catch {} }
function favId(catKey, it) { return catKey + '|' + (it.tr || (it.ar || '').slice(0, 24)); }
function isFav(id) { return getFavs().some(f => f.id === id); }
function toggleFav(catKey, it) {
  const id = favId(catKey, it); let f = getFavs();
  if (f.some(x => x.id === id)) { f = f.filter(x => x.id !== id); saveFavs(f); return false; }
  f.push({ id, cat: (ADATA[catKey] && ADATA[catKey].title) || '', ar: it.ar, tr: it.tr, fr: it.fr, rep: it.rep || 1 });
  saveFavs(f); return true;
}
const AORDER = ['matin', 'soir', 'apres_priere', 'reveil', 'sommeil', 'angoisse', 'voyage', 'repas', 'salat_nabi', 'istikhara', 'parents', 'rizq_pardon', 'vendredi', 'jeune', 'pluie', 'sortie_maison', 'entree_maison', 'mauvais_oeil', 'protection_enfants', 'organes'];
let adhkarInit = false;
function initAdhkar() {
  adhkarInit = true;
  const tabs = document.getElementById('adhkar-tabs');
  // Onglet « Favoris » (en premier)
  const fb = document.createElement('div'); fb.className = 'tab-a tab-fav'; fb.textContent = '⭐ Favoris';
  fb.addEventListener('click', () => { document.querySelectorAll('#adhkar-tabs .tab-a').forEach(x => x.classList.remove('active')); fb.classList.add('active'); renderFavoris(); });
  tabs.appendChild(fb);
  AORDER.forEach((k) => {
    const b = document.createElement('div'); b.className = 'tab-a'; b.textContent = ADATA[k].title;
    b.addEventListener('click', () => { document.querySelectorAll('#adhkar-tabs .tab-a').forEach(x => x.classList.remove('active')); b.classList.add('active'); renderAdhkar(k); });
    if (k === 'matin') b.classList.add('active');
    tabs.appendChild(b);
  });
  // Onglet spécial « Roqya & Protection »
  if (window.ROQYA_DATA) {
    const rb = document.createElement('div'); rb.className = 'tab-a tab-roqya'; rb.textContent = window.ROQYA_DATA.title;
    rb.addEventListener('click', () => { document.querySelectorAll('#adhkar-tabs .tab-a').forEach(x => x.classList.remove('active')); rb.classList.add('active'); renderRoqya(); });
    tabs.appendChild(rb);
  }
  renderAdhkar('matin');
}

const roqyaPlayer = document.createElement('audio'); roqyaPlayer.preload = 'none';
async function roqyaCached(file) { try { const c = await caches.open('nur-roqya'); return !!(await c.match('assets/roqya/' + file)) || !!(await c.match(location.origin + '/assets/roqya/' + file)); } catch { return false; } }
function renderRoqya() {
  const R = window.ROQYA_DATA; const c = document.getElementById('adhkar-content');
  c.innerHTML = `<div class="cat-title">${R.title}</div><div class="cat-sub">${R.subtitle}</div>` + (R.credit ? `<div class="cat-credit">${R.credit}</div>` : '');
  // lecteur partagé (natif, barre glissable)
  const playerBox = document.createElement('div'); playerBox.className = 'roqya-playerbox';
  const player = document.createElement('audio'); player.controls = true; player.className = 'audio-ctrl'; player.id = 'roqya-audio'; player.preload = 'none';
  const nowP = document.createElement('div'); nowP.className = 'roqya-now'; nowP.textContent = '▶ Choisissez une Roqya ci-dessous';
  playerBox.appendChild(nowP); playerBox.appendChild(player); c.appendChild(playerBox);

  for (const g of R.groups) {
    const gt = document.createElement('div'); gt.className = 'roqya-group'; gt.textContent = g.name; c.appendChild(gt);
    for (const it of g.items) {
      const row = document.createElement('div'); row.className = 'roqya-item';
      const play = document.createElement('button'); play.className = 'roqya-play';
      play.innerHTML = `<span class="rl">${it.label}</span><span class="rm">${it.meta}</span>`;
      play.addEventListener('click', () => {
        nowP.textContent = '🎧 ' + g.name + ' — ' + it.label;
        player.src = 'assets/roqya/' + it.file; player.play().catch(() => {});
        playerBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
      const dl = document.createElement('button'); dl.className = 'roqya-dl'; dl.title = 'Télécharger hors ligne';
      roqyaCached(it.file).then(ok => { dl.textContent = ok ? '✓' : '⬇'; if (ok) dl.classList.add('saved'); });
      dl.addEventListener('click', async () => {
        dl.textContent = '…';
        const ok = await cacheUrl(new URL('assets/roqya/' + it.file, location.href).href, 'nur-roqya');
        dl.textContent = ok ? '✓' : '⬇'; if (ok) { dl.classList.add('saved'); toast('Roqya disponible hors ligne ✓'); } else toast('Échec (vérifiez Internet)');
      });
      row.appendChild(play); row.appendChild(dl); c.appendChild(row);
    }
  }
  c.scrollTop = 0;
}
function renderAdhkar(key) {
  const cat = ADATA[key]; const c = document.getElementById('adhkar-content');
  c.innerHTML = `<div class="cat-title">${cat.title}</div><div class="cat-sub">${cat.subtitle}</div>`;
  // Bouton : écouter la récitation la plus vue sur YouTube (usage personnel)
  const ytq = ((cat.ytq || cat.subtitle || cat.title) + '').split('—')[0].trim();
  const yb = document.createElement('button'); yb.className = 'btn-ghost adhkar-yt';
  yb.textContent = '▶ Écouter sur YouTube (les plus vues)';
  yb.addEventListener('click', () => window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(ytq), '_blank', 'noopener'));
  c.appendChild(yb);
  // Lecteur audio de la catégorie (matin, soir, roqya…)
  if (cat.audios && cat.audios.length) {
    const panel = document.createElement('div'); panel.className = 'audio-panel';
    const btns = document.createElement('div'); btns.className = 'audio-btns';
    const audio = document.createElement('audio'); audio.controls = true; audio.className = 'audio-ctrl'; audio.preload = 'none';
    cat.audios.forEach(a => {
      const b = document.createElement('button'); b.className = 'audio-btn'; b.textContent = a.label;
      b.addEventListener('click', () => {
        btns.querySelectorAll('.audio-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        audio.src = 'assets/audio/' + a.file; audio.play().catch(() => {});
      });
      btns.appendChild(b);
    });
    panel.appendChild(btns); panel.appendChild(audio); c.appendChild(panel);
  }
  for (const it of cat.items) {
    const d = document.createElement('div'); d.className = 'item';
    const id = favId(key, it); const on = isFav(id);
    d.innerHTML = `<button class="fav-star${on ? ' on' : ''}" title="Ajouter aux favoris">${on ? '★' : '☆'}</button><div class="ar">${it.ar}</div><div class="tr">${it.tr}</div><div class="fr">${it.fr}</div>` + (it.rep > 1 ? `<span class="rep-badge">× ${it.rep}</span>` : '');
    const star = d.querySelector('.fav-star');
    star.addEventListener('click', () => { const now = toggleFav(key, it); star.classList.toggle('on', now); star.textContent = now ? '★' : '☆'; if (now) toast('Ajouté aux favoris ⭐'); });
    c.appendChild(d);
  }
  c.scrollTop = 0;
}
function renderFavoris() {
  const c = document.getElementById('adhkar-content');
  const favs = getFavs();
  c.innerHTML = `<div class="cat-title">⭐ Mes favoris</div><div class="cat-sub">Vos invocations épinglées (enregistrées sur cet appareil)</div>`;
  if (!favs.length) {
    const e = document.createElement('div'); e.className = 'fav-empty';
    e.innerHTML = "Aucun favori pour l'instant.<br>Touchez l'étoile ☆ à côté d'une invocation pour l'ajouter ici.";
    c.appendChild(e); return;
  }
  favs.forEach(it => {
    const d = document.createElement('div'); d.className = 'item';
    d.innerHTML = `<button class="fav-star on" title="Retirer des favoris">★</button>` + (it.cat ? `<div class="fav-cat">${it.cat}</div>` : '') + `<div class="ar">${it.ar}</div><div class="tr">${it.tr}</div><div class="fr">${it.fr}</div>` + (it.rep > 1 ? `<span class="rep-badge">× ${it.rep}</span>` : '');
    d.querySelector('.fav-star').addEventListener('click', () => { saveFavs(getFavs().filter(x => x.id !== it.id)); renderFavoris(); });
    c.appendChild(d);
  });
  c.scrollTop = 0;
}

/* ===================== Espace Enfants ===================== */
let kidsInit = false;
function ytSearch(q) { window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(q), '_blank', 'noopener'); }
function initKids() {
  kidsInit = true; renderKids();
}
function renderKids() {
  const K = window.KIDS_DATA; const c = document.getElementById('kids-content');
  if (!K) { c.innerHTML = '<div class="cat-sub">Contenu indisponible.</div>'; return; }
  c.innerHTML = `<div class="cat-title">🧒 Espace Enfants</div><div class="cat-sub">Apprendre l'alphabet arabe et les premières sourates en s'amusant</div>`;

  // --- Alphabet ---
  const h1 = document.createElement('div'); h1.className = 'kids-h'; h1.textContent = '🔤 L\'alphabet arabe (28 lettres)';
  c.appendChild(h1);
  // Lecteur vidéo intégré (piloté par les chansons ET par les lettres)
  let kidsPlay = null, kidsNow = null;
  if (K.songs && K.songs.length) {
    const vbox = document.createElement('div'); vbox.className = 'kids-video';
    kidsNow = document.createElement('div'); kidsNow.className = 'kids-now'; kidsNow.textContent = '🎵 Chanson de l\'alphabet';
    const frame = document.createElement('div'); frame.className = 'yt-wrap';
    kidsPlay = (id, auto) => { frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1${auto ? '&autoplay=1' : ''}" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`; };
    vbox.appendChild(kidsNow); vbox.appendChild(frame);
    const chips = document.createElement('div'); chips.className = 'kids-songrow';
    K.songs.forEach((s, i) => {
      const b = document.createElement('button'); b.className = 'audio-btn' + (i === 0 ? ' active' : ''); b.textContent = s.label;
      b.addEventListener('click', () => { chips.querySelectorAll('.audio-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); kidsNow.textContent = s.label; kidsPlay(s.id, true); });
      chips.appendChild(b);
    });
    vbox.appendChild(chips); c.appendChild(vbox);
    kidsPlay(K.songs[0].id, false);
  }
  const grid = document.createElement('div'); grid.className = 'kids-grid';
  K.alphabet.forEach(a => {
    const cell = document.createElement('button'); cell.className = 'kids-letter';
    cell.innerHTML = `<span class="kl">${a.l}</span><span class="kn">${a.n}</span>`;
    cell.addEventListener('click', () => {
      grid.querySelectorAll('.kids-letter').forEach(x => x.classList.remove('sel')); cell.classList.add('sel');
      const vid = a.v || (K.songs && K.songs[0] && K.songs[0].id);
      if (kidsPlay && vid) {
        document.querySelectorAll('.kids-songrow .audio-btn').forEach(x => x.classList.remove('active'));
        if (kidsNow) kidsNow.textContent = 'حرف ' + a.l + ' — ' + a.n;
        kidsPlay(vid, true);
        document.getElementById('view-kids').scrollTo({ top: 0, behavior: 'smooth' });
      } else { ytSearch('حرف ' + a.l + ' للأطفال تعليم نطق الحروف'); }
    });
    grid.appendChild(cell);
  });
  c.appendChild(grid);
  const vids = document.createElement('div'); vids.className = 'kids-vidrow';
  const v1 = document.createElement('button'); v1.className = 'btn-ghost kids-vid'; v1.textContent = '🎬 Plus de chansons d\'alphabet';
  v1.addEventListener('click', () => ytSearch(K.alphabetVideo));
  const v2 = document.createElement('button'); v2.className = 'btn-ghost kids-vid'; v2.textContent = '▶ Les voyelles (Harakât)';
  v2.addEventListener('click', () => ytSearch(K.harakatVideo));
  vids.appendChild(v1); vids.appendChild(v2); c.appendChild(vids);

  // --- Premières sourates ---
  const h2 = document.createElement('div'); h2.className = 'kids-h'; h2.textContent = '📖 Mes premières sourates';
  c.appendChild(h2);
  const sub = document.createElement('div'); sub.className = 'cat-sub'; sub.textContent = 'Touchez une sourate pour voir sa vidéo d\'apprentissage (répétition pour enfants).';
  c.appendChild(sub);
  const surahRows = [];
  K.surahs.forEach(s => {
    const row = document.createElement('button'); row.className = 'kids-surah';
    row.innerHTML = `<span class="ks-ar">${s.ar}</span><span class="ks-fr">${s.n}. ${s.fr}</span><span class="ks-play">▶</span>`;
    row.addEventListener('click', () => {
      surahRows.forEach(x => x.classList.remove('sel')); row.classList.add('sel');
      if (kidsPlay && s.v) {
        document.querySelectorAll('.kids-songrow .audio-btn').forEach(x => x.classList.remove('active'));
        grid.querySelectorAll('.kids-letter').forEach(x => x.classList.remove('sel'));
        if (kidsNow) kidsNow.textContent = 'سورة ' + s.ar + ' — ' + s.fr;
        kidsPlay(s.v, true);
        document.getElementById('view-kids').scrollTo({ top: 0, behavior: 'smooth' });
      } else { ytSearch(s.q); }
    });
    surahRows.push(row); c.appendChild(row);
  });
  const note = document.createElement('div'); note.className = 'cat-credit';
  note.textContent = 'Touchez une lettre pour voir sa vidéo ici même. Astuce : utilisez l\'app YouTube Kids pour un environnement adapté aux enfants.';
  c.appendChild(note);
  c.scrollTop = 0;
}

/* ===================== Coran ===================== */
const RECITERS = [
  { id: 'Alafasy_64kbps', name: 'Mishary Al-Afasy' }, { id: 'Husary_64kbps', name: 'Mahmoud Al-Husary' },
  { id: 'Abdul_Basit_Murattal_64kbps', name: 'Abdul Basit' }, { id: 'Abdurrahmaan_As-Sudais_64kbps', name: 'As-Sudais' }
];
const SURAHS = buildSurahs();
const TEXT = window.QURAN_TEXT || {}; const COUNTS = window.QURAN_AYAH_COUNTS || {}; const IDS = window.QURAN_IDS || {};
let quranInit = false, offReciter = RECITERS[0].id, offSurah = 1, offAyah = 1, pendingSeek = 0, userSeeking = false;
const offAudio = document.getElementById('off-audio');

function ayahFile(s, a) { return String(s).padStart(3, '0') + String(a).padStart(3, '0') + '.mp3'; }
function ayahUrl(rec, s, a) { return `https://everyayah.com/data/${rec}/${ayahFile(s, a)}`; }
function fmtT(s) { if (!isFinite(s) || s < 0) s = 0; const m = Math.floor(s / 60); return m + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }

async function initQuran() {
  quranInit = true;
  const r = document.getElementById('off-reciter'); RECITERS.forEach(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = x.name; r.appendChild(o); });
  const su = document.getElementById('off-surah'); SURAHS.forEach(([n, ar, fr]) => { const o = document.createElement('option'); o.value = n; o.textContent = `${n}. ${fr}`; su.appendChild(o); });
  r.addEventListener('change', async () => { const wasPlaying = !offAudio.paused, pos = offAudio.currentTime || 0; offReciter = r.value; await refreshCachedSet(); updateSurahMarks(); loadAyah(offSurah, offAyah, wasPlaying, pos); });
  su.addEventListener('change', () => loadAyah(parseInt(su.value, 10), 1, false));
  await refreshCachedSet(); updateSurahMarks();
  loadAyah(1, 1, false);
  // YouTube grid
  renderYtGrid('');
  document.getElementById('yt-search').addEventListener('input', e => renderYtGrid(e.target.value));
}

async function loadAyah(s, a, autoplay, seekTo = 0) {
  offSurah = s; offAyah = a; document.getElementById('off-surah').value = s;
  document.getElementById('ayah-big').textContent = (TEXT[s] || [])[a - 1] || '…';
  const so = SURAHS.find(x => x[0] === s);
  document.getElementById('ayah-meta').textContent = `${so ? so[2] : ''} — verset ${a} / ${COUNTS[s] || '?'}`;
  pendingSeek = seekTo || 0;
  offAudio.src = ayahUrl(offReciter, s, a);
  updateDlMark();
  preloadNext();
  if (autoplay) offAudio.play().catch(() => {});
}
let cachedSet = new Set(); // versets de ce récitateur déjà hors ligne (ids "sssaaa")
function fileId(s, a) { return String(s).padStart(3, '0') + String(a).padStart(3, '0'); }
async function refreshCachedSet() {
  cachedSet = new Set();
  try {
    const c = await caches.open('nur-quran-audio'); const keys = await c.keys();
    const marker = '/data/' + offReciter + '/';
    for (const req of keys) { const i = req.url.indexOf(marker); if (i >= 0) cachedSet.add(req.url.slice(i + marker.length).replace('.mp3', '')); }
  } catch {}
}
function surahFullyCached(s) { const n = COUNTS[s] || 0; if (!n) return false; for (let a = 1; a <= n; a++) if (!cachedSet.has(fileId(s, a))) return false; return true; }
function updateSurahMarks() {
  const sel = document.getElementById('off-surah');
  for (const opt of sel.options) { const n = parseInt(opt.value, 10); const so = SURAHS.find(x => x[0] === n); opt.textContent = (surahFullyCached(n) ? '🟢 ' : '') + `${n}. ${so ? so[2] : ''}`; }
}
function updateDlMark() {
  const saved = cachedSet.has(fileId(offSurah, offAyah));
  const dl = document.getElementById('off-dl'); dl.textContent = saved ? '✓' : '⬇'; dl.style.color = saved ? '#46d18a' : '';
  const b = document.getElementById('ayah-dl-badge'); b.textContent = saved ? '🟢 Verset disponible hors ligne' : ''; b.className = 'ayah-dl-badge' + (saved ? ' saved' : '');
}
function nextAyah(ap) { let a = offAyah + 1, s = offSurah; if (a > (COUNTS[offSurah] || 0)) { s = offSurah < 114 ? offSurah + 1 : 1; a = 1; } loadAyah(s, a, ap); }
function prevAyah() { let a = offAyah - 1, s = offSurah; if (a < 1) { s = offSurah > 1 ? offSurah - 1 : 114; a = COUNTS[s]; } loadAyah(s, a, true); }

// Préchargement du verset suivant → enchaînement FLUIDE, sans coupure
const preAudio = new Audio(); preAudio.preload = 'auto';
function preloadNext() {
  let a = offAyah + 1, s = offSurah;
  if (a > (COUNTS[offSurah] || 0)) { s = offSurah < 114 ? offSurah + 1 : 1; a = 1; }
  try { preAudio.src = ayahUrl(offReciter, s, a); preAudio.load(); } catch {}
}

document.getElementById('off-next').addEventListener('click', () => nextAyah(true));
document.getElementById('off-prev').addEventListener('click', prevAyah);
// Restaure la position lors d'un changement d'imam (barre native = curseur fluide comme Adhkar)
offAudio.addEventListener('loadedmetadata', () => {
  if (pendingSeek > 0 && isFinite(offAudio.duration)) offAudio.currentTime = Math.min(pendingSeek, offAudio.duration - 0.1);
  pendingSeek = 0;
});
// Enchaînement automatique fluide vers le verset suivant (déjà préchargé)
offAudio.addEventListener('ended', () => { if (document.getElementById('off-autonext').checked) nextAyah(true); });

// Téléchargement d'un verset (sauvegarde hors ligne)
function cacheUrl(url, cacheName) {
  cacheName = cacheName || 'nur-quran-audio';
  return new Promise((resolve) => {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
      // repli : Cache API directe
      caches.open(cacheName).then(c => c.add(url)).then(() => resolve(true)).catch(() => resolve(false));
      return;
    }
    const ch = (e) => { if (e.data && e.data.type === 'cached' && e.data.url === url) { navigator.serviceWorker.removeEventListener('message', ch); resolve(e.data.ok); } };
    navigator.serviceWorker.addEventListener('message', ch);
    navigator.serviceWorker.controller.postMessage({ type: 'cache-audio', url, cacheName });
    setTimeout(() => resolve(false), 15000);
  });
}
document.getElementById('off-dl').addEventListener('click', async () => {
  document.getElementById('dl-status').textContent = 'Sauvegarde du verset…';
  const ok = await cacheUrl(ayahUrl(offReciter, offSurah, offAyah));
  if (ok) cachedSet.add(fileId(offSurah, offAyah));
  document.getElementById('dl-status').textContent = ok ? '🟢 Verset disponible hors ligne' : 'Échec (vérifiez Internet)';
  updateDlMark(); updateSurahMarks();
});
document.getElementById('off-dl-surah').addEventListener('click', async () => {
  const s = offSurah, total = COUNTS[s] || 0; let done = 0;
  const st = document.getElementById('dl-status');
  for (let a = 1; a <= total; a++) {
    st.textContent = `Téléchargement sourate ${s} : ${done}/${total}…`;
    if (!cachedSet.has(fileId(s, a))) { const ok = await cacheUrl(ayahUrl(offReciter, s, a)); if (ok) cachedSet.add(fileId(s, a)); }
    done++;
  }
  st.textContent = `🟢 Sourate ${s} disponible hors ligne (${total} versets)`;
  updateDlMark(); updateSurahMarks();
});

// Télécharger TOUT le Coran pour le récitateur en cours (avec arrêt possible)
let dlAllRunning = false, dlAllCancel = false;
document.getElementById('off-dl-all').addEventListener('click', async () => {
  const btn = document.getElementById('off-dl-all'), st = document.getElementById('dl-status');
  if (dlAllRunning) { dlAllCancel = true; btn.textContent = 'Arrêt…'; return; }
  const rec = offReciter, recName = (RECITERS.find(r => r.id === rec) || {}).name || '';
  dlAllRunning = true; dlAllCancel = false; btn.textContent = '⏹ Arrêter le téléchargement';
  const totalAll = 6236; let done = 0;
  for (let s = 1; s <= 114 && !dlAllCancel; s++) {
    const cnt = COUNTS[s] || 0;
    for (let a = 1; a <= cnt; a++) {
      if (dlAllCancel) break;
      const id = fileId(s, a);
      if (!cachedSet.has(id)) { const ok = await cacheUrl(ayahUrl(rec, s, a)); if (ok) cachedSet.add(id); }
      done++;
      if (done % 5 === 0) st.textContent = `Coran (${recName}) : ${done} / ${totalAll} versets…`;
    }
    updateSurahMarks();
  }
  updateSurahMarks(); updateDlMark();
  st.textContent = dlAllCancel ? `⏸ Arrêté à ${done} / ${totalAll} versets (reprend où vous en êtes)` : `🟢 Coran complet hors ligne — ${recName}`;
  dlAllRunning = false; dlAllCancel = false; btn.textContent = '⬇ Télécharger TOUT le Coran (ce récitateur)';
});

// Mode YouTube
const RECITER_AR = 'هيثم الدخين';
document.querySelectorAll('.qmode-btn').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.qmode-btn').forEach(x => x.classList.remove('active')); b.classList.add('active');
  document.querySelectorAll('.qview').forEach(v => v.classList.remove('active'));
  document.getElementById('qview-' + b.dataset.qmode).classList.add('active');
  if (b.dataset.qmode !== 'offline') offAudio.pause();
}));
function ytPlay(num) {
  const seq = []; for (let n = num; n <= 114; n++) if (IDS[n]) seq.push(IDS[n]);
  if (!seq.length) return;
  let src = `https://www.youtube-nocookie.com/embed/${seq[0]}?autoplay=1&rel=0`;
  if (seq.length > 1) src += `&playlist=${seq.slice(1).join(',')}`;
  document.getElementById('yt-wrap').innerHTML = `<iframe src="${src}" allow="autoplay; encrypted-media" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
}
function renderYtGrid(filter) {
  const g = document.getElementById('yt-grid'); g.innerHTML = ''; const f = (filter || '').trim().toLowerCase();
  for (const [n, ar, fr] of SURAHS) {
    if (f && !fr.toLowerCase().includes(f) && !ar.includes(filter) && String(n) !== f) continue;
    const el = document.createElement('div'); el.className = 'yt-surah';
    el.innerHTML = `<div class="n">${n}</div><div class="nm"><div class="a">${ar}</div><div class="f">${fr}</div></div>`;
    el.addEventListener('click', () => ytPlay(n));
    g.appendChild(el);
  }
}

/* ===================== Sheet : Impressum / Datenschutz / Kontakt ===================== */
const SHEETS = {
  impressum: { title: 'Impressum', html: `<h3>Angaben gemäß § 5 DDG</h3><p><b>Nûr — Adhan &amp; Adhkar</b></p><h3>Verantwortlich</h3><p><b>Messaoudi Oualid</b><br>Dortmund, Deutschland</p><h3>Kontakt</h3><p>Über das Kontaktformular.</p><h3>Quellen &amp; Lizenzen der Audios</h3><p style="font-size:13px;line-height:1.55"><b>Koran-Verse:</b> everyayah.com — Lizenz <b>CC&nbsp;BY-NC</b> (kostenlose, nicht-kommerzielle Nutzung mit Quellenangabe).<br><b>Roqya:</b> archive.org — <b>Gemeinfrei / Public Domain &amp; CC0</b>. Rezitatoren: M.&nbsp;Al-Afasy, A.&nbsp;Al-Ajmy, S.&nbsp;Al-Ghamdi, Y.&nbsp;Al-Dosari, N.&nbsp;Al-Qatami, K.&nbsp;Al-Qahtani, I.&nbsp;Abkar.<br><b>Adhan:</b> archive.org — <b>Public Domain</b> (Doha, Qatar).<br><b>Videos:</b> YouTube (offizieller eingebetteter Player).</p><h3>Haftungsausschluss</h3><p>Die berechneten Gebetszeiten dienen als Orientierung.</p><div class="sig">✦ Diese App ist <b>kostenlos auf Lebenszeit</b> und <b>werbefrei</b>. ✦<br>Créé par <b>Messaoudi Oualid</b></div>` },
  datenschutz: { title: 'Datenschutz', html: `<h3>Datenschutzerklärung</h3><p>Die App läuft <b>lokal auf Ihrem Gerät</b>. Keine Konten, kein Tracking. Standort &amp; Einstellungen werden nur lokal gespeichert.</p><h3>Standort</h3><p>Per GPS (Browser) oder Stadteingabe (open-meteo.com). Nur lokal gespeichert.</p><h3>Audio &amp; Video</h3><p>Koran-Verse: everyayah.com (CC&nbsp;BY-NC, auf Wunsch offline gespeichert). Roqya &amp; Adhan: archive.org (gemeinfrei / Public Domain). Videos: youtube-nocookie.com.</p><h3>Externe Dienste</h3><p>open-meteo.com, bigdatacloud.net, everyayah.com, youtube-nocookie.com, formsubmit.co erhalten technisch Ihre IP-Adresse.</p><div class="sig">Verantwortlich: <b>Messaoudi Oualid</b></div>` },
  kontakt: { title: 'Kontakt', html: `<p>Kurze Nachricht an den Entwickler (max. 150 Zeichen):</p><textarea id="c-msg" maxlength="150" rows="5" placeholder="Ihre Nachricht…"></textarea><div class="crow"><span class="ccount" id="c-count">0 / 150</span><button class="csend" id="c-send">Senden ✉</button></div><div class="cstatus" id="c-status"></div>` },
  install: { title: 'Installer l\'app', html: `
    <p>Ajoutez <b>Nûr</b> à votre écran d'accueil pour l'ouvrir comme une vraie application : <b>plein écran</b>, <b>hors ligne</b>, avec l'icône mosquée 🕌.</p>
    <h3>🍎 iPhone / iPad (Safari)</h3>
    <ol>
      <li>Ouvrez cette page dans <b>Safari</b> (pas Chrome sur iPhone).</li>
      <li>Touchez l'icône <b>Partager</b> <span class="step-ico">⬆️</span> (carré avec flèche, en bas).</li>
      <li>Faites défiler et touchez <b>« Sur l'écran d'accueil »</b>.</li>
      <li>Touchez <b>« Ajouter »</b> — l'icône 🕌 apparaît.</li>
    </ol>
    <h3>⭐ Android — App native (Adhan en veille)</h3>
    <p>Pour que l'<b>Adhan sonne même téléphone verrouillé / en veille</b>, installez l'application native Android :</p>
    <a href="Nur-Android.apk" download class="apk-dl">⬇ Télécharger l'app Android (.apk)</a>
    <p style="font-size:12px;opacity:0.75;margin-top:8px">Ouvrez le fichier téléchargé → autorisez « sources inconnues » → Installer. Puis autorisez <b>Notifications</b> + <b>Alarmes</b> et désactivez l'optimisation de batterie pour Nûr.</p>
    <h3>🤖 Android (juste le site web)</h3>
    <ol>
      <li>Ouvrez cette page dans <b>Chrome</b>.</li>
      <li>Touchez <b>« Installer l'application »</b> (bannière en bas) — ou menu <b>⋮</b> → <b>Installer l'application</b>.</li>
      <li>Confirmez — l'icône 🕌 s'ajoute à l'écran d'accueil.</li>
    </ol>
    <h3>💻 Ordinateur (Chrome / Edge)</h3>
    <p>Cliquez sur l'icône d'installation <b>⊕</b> à droite de la barre d'adresse, puis « Installer ».</p>
    <div class="sig">Partagez l'app : <b>nur-adhan.netlify.app</b> · Gratuit à vie</div>` }
};
const sheet = document.getElementById('sheet');
function openSheet(key) {
  document.getElementById('sheet-title').textContent = SHEETS[key].title;
  document.getElementById('sheet-body').innerHTML = SHEETS[key].html;
  sheet.classList.add('show');
  if (key === 'kontakt') wireContact();
}
document.getElementById('sheet-close').addEventListener('click', () => sheet.classList.remove('show'));
document.getElementById('link-impressum').addEventListener('click', () => openSheet('impressum'));
document.getElementById('link-datenschutz').addEventListener('click', () => openSheet('datenschutz'));
document.getElementById('link-kontakt').addEventListener('click', () => openSheet('kontakt'));

// --- Installation de l'app (PWA) ---
let deferredPrompt = null;
const installBanner = document.getElementById('install-banner');
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
if (isStandalone) {
  // App déjà installée : on masque la bannière ET le lien « Installer » (plus besoin)
  installBanner.classList.add('hidden');
  const li = document.getElementById('link-install'); if (li) li.style.display = 'none';
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (!isStandalone) installBanner.classList.remove('hidden'); });
window.addEventListener('appinstalled', () => { installBanner.classList.add('hidden'); toast('✓ Application installée !'); });
async function triggerInstall() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    try { const { outcome } = await deferredPrompt.userChoice; if (outcome === 'accepted') installBanner.classList.add('hidden'); } catch {}
    deferredPrompt = null;
  } else {
    openSheet('install'); // iPhone / pas de prompt natif → page d'instructions
  }
}
installBanner.addEventListener('click', triggerInstall);
document.getElementById('link-install').addEventListener('click', () => openSheet('install'));
document.getElementById('consent-install').addEventListener('click', () => openSheet('install'));

function wireContact() {
  const msg = document.getElementById('c-msg'), cnt = document.getElementById('c-count'), st = document.getElementById('c-status'), snd = document.getElementById('c-send');
  msg.addEventListener('input', () => cnt.textContent = msg.value.length + ' / 150');
  snd.addEventListener('click', async () => {
    const v = msg.value.trim(); if (!v) { st.className = 'cstatus err'; st.textContent = 'Bitte eine Nachricht eingeben.'; return; }
    snd.disabled = true; st.className = 'cstatus'; st.textContent = 'Senden…';
    // e-mail non affichée : encodée en base64
    const to = atob('bGlkb21lc3Nhb3VkaUBob3RtYWlsLmZy');
    try {
      const r = await fetch('https://formsubmit.co/ajax/' + encodeURIComponent(to), {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ Nachricht: v, _subject: 'Nûr App — neue Nachricht', _template: 'table', _captcha: 'false' })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { st.className = 'cstatus ok'; st.textContent = (d.success === 'true') ? 'Gesendet ✓ Vielen Dank!' : 'Registriert ✓ (einmalige Aktivierung per E-Mail nötig)'; msg.value = ''; cnt.textContent = '0 / 150'; }
      else { st.className = 'cstatus err'; st.textContent = 'Fehler.'; }
    } catch { st.className = 'cstatus err'; st.textContent = 'Keine Internetverbindung?'; }
    snd.disabled = false;
  });
}

/* ===================== Démarrage ===================== */
renderAll();
scheduleAdhans();
setInterval(updateCountdown, 1000);
setInterval(renderTimes, 60000);
// Replanifie l'Adhan quand l'app revient au premier plan (les timers peuvent être suspendus)
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleAdhans(); });

/* ===================== Données sourates ===================== */
function buildSurahs() {
  return [[1,"الفاتحة","Al-Fatiha (L'Ouverture)"],[2,"البقرة","Al-Baqara (La Vache)"],[3,"آل عمران","Al-'Imran"],[4,"النساء","An-Nisa (Les Femmes)"],[5,"المائدة","Al-Ma'ida"],[6,"الأنعام","Al-An'am"],[7,"الأعراف","Al-A'raf"],[8,"الأنفال","Al-Anfal"],[9,"التوبة","At-Tawba"],[10,"يونس","Yunus"],[11,"هود","Hud"],[12,"يوسف","Yusuf"],[13,"الرعد","Ar-Ra'd"],[14,"إبراهيم","Ibrahim"],[15,"الحجر","Al-Hijr"],[16,"النحل","An-Nahl"],[17,"الإسراء","Al-Isra"],[18,"الكهف","Al-Kahf"],[19,"مريم","Maryam"],[20,"طه","Ta-Ha"],[21,"الأنبياء","Al-Anbiya"],[22,"الحج","Al-Hajj"],[23,"المؤمنون","Al-Mu'minun"],[24,"النور","An-Nur"],[25,"الفرقان","Al-Furqan"],[26,"الشعراء","Ash-Shu'ara"],[27,"النمل","An-Naml"],[28,"القصص","Al-Qasas"],[29,"العنكبوت","Al-'Ankabut"],[30,"الروم","Ar-Rum"],[31,"لقمان","Luqman"],[32,"السجدة","As-Sajda"],[33,"الأحزاب","Al-Ahzab"],[34,"سبأ","Saba"],[35,"فاطر","Fatir"],[36,"يس","Ya-Sin"],[37,"الصافات","As-Saffat"],[38,"ص","Sad"],[39,"الزمر","Az-Zumar"],[40,"غافر","Ghafir"],[41,"فصلت","Fussilat"],[42,"الشورى","Ash-Shura"],[43,"الزخرف","Az-Zukhruf"],[44,"الدخان","Ad-Dukhan"],[45,"الجاثية","Al-Jathiya"],[46,"الأحقاف","Al-Ahqaf"],[47,"محمد","Muhammad"],[48,"الفتح","Al-Fath"],[49,"الحجرات","Al-Hujurat"],[50,"ق","Qaf"],[51,"الذاريات","Adh-Dhariyat"],[52,"الطور","At-Tur"],[53,"النجم","An-Najm"],[54,"القمر","Al-Qamar"],[55,"الرحمن","Ar-Rahman"],[56,"الواقعة","Al-Waqi'a"],[57,"الحديد","Al-Hadid"],[58,"المجادلة","Al-Mujadala"],[59,"الحشر","Al-Hashr"],[60,"الممتحنة","Al-Mumtahana"],[61,"الصف","As-Saff"],[62,"الجمعة","Al-Jumu'a"],[63,"المنافقون","Al-Munafiqun"],[64,"التغابن","At-Taghabun"],[65,"الطلاق","At-Talaq"],[66,"التحريم","At-Tahrim"],[67,"الملك","Al-Mulk"],[68,"القلم","Al-Qalam"],[69,"الحاقة","Al-Haqqa"],[70,"المعارج","Al-Ma'arij"],[71,"نوح","Nuh"],[72,"الجن","Al-Jinn"],[73,"المزمل","Al-Muzzammil"],[74,"المدثر","Al-Muddaththir"],[75,"القيامة","Al-Qiyama"],[76,"الإنسان","Al-Insan"],[77,"المرسلات","Al-Mursalat"],[78,"النبأ","An-Naba"],[79,"النازعات","An-Nazi'at"],[80,"عبس","'Abasa"],[81,"التكوير","At-Takwir"],[82,"الإنفطار","Al-Infitar"],[83,"المطففين","Al-Mutaffifin"],[84,"الإنشقاق","Al-Inshiqaq"],[85,"البروج","Al-Buruj"],[86,"الطارق","At-Tariq"],[87,"الأعلى","Al-A'la"],[88,"الغاشية","Al-Ghashiya"],[89,"الفجر","Al-Fajr"],[90,"البلد","Al-Balad"],[91,"الشمس","Ash-Shams"],[92,"الليل","Al-Layl"],[93,"الضحى","Ad-Duha"],[94,"الشرح","Ash-Sharh"],[95,"التين","At-Tin"],[96,"العلق","Al-'Alaq"],[97,"القدر","Al-Qadr"],[98,"البينة","Al-Bayyina"],[99,"الزلزلة","Az-Zalzala"],[100,"العاديات","Al-'Adiyat"],[101,"القارعة","Al-Qari'a"],[102,"التكاثر","At-Takathur"],[103,"العصر","Al-'Asr"],[104,"الهمزة","Al-Humaza"],[105,"الفيل","Al-Fil"],[106,"قريش","Quraych"],[107,"الماعون","Al-Ma'un"],[108,"الكوثر","Al-Kawthar"],[109,"الكافرون","Al-Kafirun"],[110,"النصر","An-Nasr"],[111,"المسد","Al-Masad"],[112,"الإخلاص","Al-Ikhlas"],[113,"الفلق","Al-Falaq"],[114,"الناس","An-Nas"]];
}
