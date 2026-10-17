/* 역 색인 · 이벤트 · 저장 · 뽑기 범위 · 사진 저장소(IndexedDB) */
(() => {
  'use strict';
  const C = (window.Core = {});

  const { LINES, EN, CURATED } = window.METRO;
  const RENAMED = window.METRO.RENAMED || {};
  const $ = (s, r = document) => r.querySelector(s);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  const enc = encodeURIComponent;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const REGION = window.METRO.REGION || {};
  const ACCESS = window.METRO.ACCESS || {};   // '역|장소' → [출구, 도보 분] (access.js)
  const LINE = Object.fromEntries(LINES.map((l) => [l.n, l]));
  const ORIGIN = '남춘천';

  /* 노선·역 표시 이름 */
  const lineName = (L) => L.name || L.n + '호선';
  const isText = (L) => typeof L.n !== 'number';          // 숫자 대신 글자 배지를 쓰는 노선
  /* 배지 글자: 숫자 노선은 원, 글자 노선은 같은 높이의 둥근 사각에 이름 그대로 ('경의중앙') */
  const lineShort = (L) => L.short || String(L.n);
  const lineEn = (L) => L.en || 'Line ' + L.n;
  const label = (key) => String(key).replace(/\(.+\)$/, '');  // '신촌(경의중앙)' → '신촌'
  /* 받침에 맞춰 '로/으로': '공항철도로', '2호선으로', '경의중앙선으로' (ㄹ 받침도 '로') */
  const ro = (word) => {
    const c = String(word).charCodeAt(String(word).length - 1) - 0xac00;
    const jong = c >= 0 && c <= 11171 ? c % 28 : 0;
    return word + (jong === 0 || jong === 8 ? '로' : '으로');
  };

  /* ---------- 역 색인 ---------- */
  const STATIONS = new Map();
  LINES.forEach((L) => {
    L.all = [];
    L.tracks.forEach((t) => t.s.forEach((name) => {
      if (!L.all.includes(name)) L.all.push(name);
      let st = STATIONS.get(name);
      if (!st) { st = { name, label: label(name), lines: [], en: EN[name] || '', region: REGION[name] || '' }; STATIONS.set(name, st); }
      if (!st.lines.includes(L.n)) st.lines.push(L.n);
    }));
  });
  const lineOrder = new Map(LINES.map((L, i) => [L.n, i]));
  STATIONS.forEach((st) => st.lines.sort((a, b) => lineOrder.get(a) - lineOrder.get(b)));

  const trackFor = (L, name) => L.tracks.find((t) => t.s.includes(name));
  function neighbors(track, name) {
    const s = track.s, n = s.length, i = s.indexOf(name);
    if (track.loop) return { p: s[(i - 1 + n) % n], q: s[(i + 1) % n] };
    return { p: s[i - 1] || '', q: s[i + 1] || '' };
  }
  const stationQuery = (name) => { const t = label(name); return t.endsWith('역') ? t : t + '역'; };
  const mapLinks = (q) => ({
    kakao: 'https://map.kakao.com/link/search/' + enc(q),
    naver: 'https://map.naver.com/p/search/' + enc(q),
  });
  const today = () => new Date().toLocaleDateString('sv-SE');
  const dotDate = (d) => String(d).replace(/-/g, '.');

  /* ---------- 이벤트 ---------- */
  const handlers = {};
  const on = (evt, fn) => { (handlers[evt] = handlers[evt] || []).push(fn); };
  const emit = (evt, data) => (handlers[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });

  /* ---------- 저장 ---------- */
  const KEY = 'metro-stamp:v2';
  const state = { stamps: {}, unvisited: true, sound: true, voice: false, scope: 'seoul', lines: {}, cur: null, origin: ORIGIN, recentOrigins: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      Object.assign(state, JSON.parse(raw));
    } else {
      const old = JSON.parse(localStorage.getItem('metro-stamp:v1') || 'null');
      if (old && old.stamps) {
        Object.entries(old.stamps).forEach(([n, v]) => { state.stamps[n] = { d: v.d, l: v.l }; });
        if (typeof old.unvisited === 'boolean') state.unvisited = old.unvisited;
        if (typeof old.sound === 'boolean') state.sound = old.sound;
        if (typeof old.voice === 'boolean') state.voice = old.voice;
      }
    }
  } catch (e) { /* 저장소를 못 쓰는 환경 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ } };
  if (!state.lines || typeof state.lines !== 'object') state.lines = {};
  if (state.scope !== 'all') state.scope = 'seoul';

  /* 지금 보고 있는 역: 역명판 ↔ 지도로 넘어가도 이어서 보여 줘요 */
  function current() {
    const c = state.cur;
    if (!c || !STATIONS.has(c.name)) return null;
    const lineN = STATIONS.get(c.name).lines.find((n) => String(n) === String(c.line));
    return lineN === undefined ? null : { name: c.name, line: lineN };
  }
  /* 출발역: 길 안내의 시작. 기본은 남춘천(ITX-청춘 경로 포함) */
  const origin = () => (STATIONS.has(state.origin) ? state.origin : ORIGIN);
  function setOrigin(name) {
    if (!STATIONS.has(name)) return;
    state.origin = name;
    const rec = (Array.isArray(state.recentOrigins) ? state.recentOrigins : []).filter((n) => n !== name && n !== ORIGIN && STATIONS.has(n));
    if (name !== ORIGIN) rec.unshift(name);
    state.recentOrigins = rec.slice(0, 4);
    save();
    emit('origin', name);
  }
  function setCurrent(cur) {
    state.cur = cur ? { name: cur.name, line: cur.line } : null;
    save();
  }

  /* ---------- 뽑기 범위 (설정) ---------- */
  const lineOn = (L) => (L.n in state.lines ? !!state.lines[L.n] : L.pick !== false);
  const inScope = (name) => state.scope === 'all' || !REGION[name];
  const activeLines = () => LINES.filter(lineOn);
  /* 지금 설정으로 뽑을 수 있는 역 (도장 기록 수의 분모) */
  function pool() {
    const set = new Set();
    activeLines().forEach((L) => L.all.forEach((n) => { if (inScope(n)) set.add(n); }));
    return set;
  }

  /* 이름이 바뀐 역의 도장을 새 이름으로 옮겨요. 사진은 아래 사진 저장소에서 옮겨요 */
  const renamedPhotos = [];       // [옛 이름, 새 이름, 사진을 새 이름으로 옮길지]
  Object.entries(RENAMED).forEach(([from, to]) => {
    const st = state.stamps[from];
    if (!st) return;
    const keep = !state.stamps[to];
    if (keep) state.stamps[to] = st;
    if (st.p) renamedPhotos.push([from, to, keep]);
    delete state.stamps[from];
    save();
  });

  /* ---------- 사진 저장소 (IndexedDB) ---------- */
  const DB = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('no-idb')); return; }
      const r = indexedDB.open('metro-stamp', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('photos', mode);
        const req = fn(t.objectStore('photos'));
        t.oncomplete = () => res(req ? req.result : undefined);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    };
    return {
      put: (k, v) => run('readwrite', (s) => s.put(v, k)),
      get: (k) => run('readonly', (s) => s.get(k)),
      del: (k) => run('readwrite', (s) => s.delete(k)),
    };
  })();

  const photosReady = Promise.all(renamedPhotos.map(async ([from, to, keep]) => {
    try {
      const blob = await DB.get(from);
      if (blob && keep) await DB.put(to, blob);
      await DB.del(from);
    } catch (e) { /* 사진을 못 옮겨도 도장은 남아요 */ }
  }));

  const urls = new Map();
  async function photoURL(name) {
    if (urls.has(name)) return urls.get(name);
    await photosReady;
    const st = state.stamps[name];
    if (!st || !st.p) return null;
    try {
      const blob = await DB.get(name);
      if (!blob) return null;
      const u = URL.createObjectURL(blob);
      urls.set(name, u);
      return u;
    } catch (e) { return null; }
  }
  function dropURL(name) {
    const u = urls.get(name);
    if (u) { URL.revokeObjectURL(u); urls.delete(name); }
  }

  /* 오프라인에서도 열리게 사이트 파일을 기기에 저장해 둬요 (sw.js) */
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  Object.assign(C, { LINES, EN, CURATED, RENAMED, $, reduced, sleep, rand, enc, esc, REGION, ACCESS, LINE, ORIGIN, lineName, isText, lineShort, lineEn, label, ro, STATIONS, lineOrder, trackFor, neighbors, stationQuery, mapLinks, today, dotDate, handlers, on, emit, KEY, state, save, current, setCurrent, origin, setOrigin, lineOn, inScope, activeLines, pool, renamedPhotos, DB, photosReady, urls, photoURL, dropURL });
})();
