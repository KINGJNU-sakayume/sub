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
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  /* 'YYYY-MM-DD'이면서 실제로 있는 날짜 */
  const validDate = (d) => {
    if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    const t = new Date(d + 'T00:00:00Z');
    return !isNaN(t) && t.toISOString().slice(0, 10) === d;
  };
  /* 도장 하나를 검사해요. 날짜가 틀리면 null, 노선이 그 역의 노선이 아니면 역의 첫 노선으로 고쳐요 */
  function cleanStamp(name, v) {
    if (!isObj(v) || !validDate(v.d)) return null;
    const st = STATIONS.get(RENAMED[name] || name);
    const out = { d: v.d };
    const l = st ? st.lines.find((n) => String(n) === String(v.l)) : LINE[v.l] && LINE[v.l].n;
    if (l !== undefined) out.l = l; else if (st) out.l = st.lines[0];
    if (v.p) out.p = 1;
    return out;
  }
  /* 저장된 값을 형태별로 검사해서 읽어요. 형식이 틀린 도장은 지우지 않고 quarantine에 따로 둬요 */
  function load(raw) {
    if (!isObj(raw)) return;
    if (isObj(raw.quarantine)) state.quarantine = { ...raw.quarantine };
    if (isObj(raw.stamps)) {
      Object.entries(raw.stamps).forEach(([n, v]) => {
        const s = cleanStamp(n, v);
        if (s) state.stamps[n] = s;
        else (state.quarantine = state.quarantine || {})[n] = v;
      });
    }
    ['unvisited', 'sound', 'voice', 'mapFold'].forEach((k) => { if (typeof raw[k] === 'boolean') state[k] = raw[k]; });
    if (raw.scope === 'all') state.scope = 'all';
    if (isObj(raw.lines)) Object.entries(raw.lines).forEach(([k, v]) => { if (LINE[k]) state.lines[k] = !!v; });
    if (isObj(raw.cur) && typeof raw.cur.name === 'string') state.cur = { name: raw.cur.name, line: raw.cur.line };
    if (typeof raw.origin === 'string') state.origin = raw.origin;
    if (Array.isArray(raw.recentOrigins)) state.recentOrigins = raw.recentOrigins.filter((n) => typeof n === 'string').slice(0, 4);
    if (typeof raw.bookLine === 'string' || typeof raw.bookLine === 'number') state.bookLine = raw.bookLine;
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      load(JSON.parse(raw));
    } else {
      const old = JSON.parse(localStorage.getItem('metro-stamp:v1') || 'null');
      if (isObj(old)) load({ stamps: old.stamps, unvisited: old.unvisited, sound: old.sound, voice: old.voice });
    }
  } catch (e) { /* 저장소를 못 쓰는 환경, 또는 읽을 수 없는 값 */ }

  /* 저장에 실패하면(용량 초과, 저장 막힘) 화면 위에 알려요. 다음 저장이 되면 사라져요 */
  let saveOK = true, warnEl = null;
  function paintSaveWarn() {
    if (saveOK) { if (warnEl) warnEl.hidden = true; return; }
    if (!warnEl) {
      warnEl = document.createElement('div');
      warnEl.className = 'save-warn';
      warnEl.setAttribute('role', 'alert');
      warnEl.innerHTML = '<p>기록을 이 기기에 저장하지 못했어요. 지금 화면에는 보이지만 새로고침하면 사라질 수 있어요. 기록 › 백업에서 내보내 두세요.</p><button type="button" class="x">닫기</button>';
      warnEl.querySelector('button').addEventListener('click', () => { warnEl.hidden = true; });
      document.body.append(warnEl);
    }
    warnEl.hidden = false;
  }
  /* 기기에 저장했으면 true, 못 했으면 false */
  const save = () => {
    let ok = true;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { ok = false; }
    if (ok !== saveOK) { saveOK = ok; paintSaveWarn(); }
    return ok;
  };

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

  /* ---------- 창 (서랍 · 출발역 · 스티커 다듬기) ---------- */
  /* 열려 있는 동안 Tab은 창 안에서만 돌고, Escape로 닫고, 뒤 페이지는 스크롤되지 않아요.
     돌려준 함수로 풀면 창을 열었던 버튼으로 포커스가 돌아가요 */
  const FOCUSABLE = 'button:not([disabled]), a[href], input:not([hidden]):not([disabled]):not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
  let locks = 0;
  function modal(box, close) {
    const back = document.activeElement;
    locks++;
    document.documentElement.classList.add('locked');
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const items = [...box.querySelectorAll(FOCUSABLE)].filter((x) => x.getClientRects().length);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1], at = document.activeElement;
      if (e.shiftKey && (at === first || !box.contains(at))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (at === last || !box.contains(at))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      locks = Math.max(0, locks - 1);
      if (!locks) document.documentElement.classList.remove('locked');
      if (back && back.isConnected && back.focus) back.focus();
    };
  }

  /* 오프라인에서도 열리게 사이트 파일을 기기에 저장해 둬요 (sw.js) */
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  Object.assign(C, { LINES, EN, CURATED, RENAMED, $, reduced, sleep, rand, enc, esc, REGION, ACCESS, LINE, ORIGIN, lineName, isText, lineShort, lineEn, label, ro, STATIONS, lineOrder, trackFor, neighbors, stationQuery, mapLinks, today, dotDate, handlers, on, emit, KEY, state, isObj, validDate, cleanStamp, save, modal, current, setCurrent, origin, setOrigin, lineOn, inScope, activeLines, pool, renamedPhotos, DB, photosReady, urls, photoURL, dropURL });
})();
