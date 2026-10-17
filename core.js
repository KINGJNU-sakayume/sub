/* 두 화면(역명판 / 지도)이 같이 쓰는 코어:
   역 색인, 저장, 소리, 뽑기 엔진, 남춘천 출발 경로, 사진 도장, 안내판·서랍 UI */
(() => {
  'use strict';

  const { LINES, EN, CURATED } = window.METRO;
  const RENAMED = window.METRO.RENAMED || {};
  const $ = (s, r = document) => r.querySelector(s);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  const enc = encodeURIComponent;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const REGION = window.METRO.REGION || {};
  const LINE = Object.fromEntries(LINES.map((l) => [l.n, l]));
  const ORIGIN = '남춘천';

  /* 노선·역 표시 이름 */
  const lineName = (L) => L.name || L.n + '호선';
  const lineShort = (L) => L.short || String(L.n);
  const lineEn = (L) => L.en || 'Line ' + L.n;
  const isText = (L) => typeof L.n !== 'number';          // 숫자 대신 글자 배지를 쓰는 노선
  const label = (key) => String(key).replace(/\(.+\)$/, '');  // '신촌(경의중앙)' → '신촌'

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
  const state = { stamps: {}, unvisited: true, sound: true, voice: false, scope: 'seoul', lines: {} };
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

  /* ---------- 소리 ---------- */
  let actx = null;
  function audio() {
    if (!state.sound) return null;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  function tone(freq, dur, type, vol, when) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + (when || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  const tick = (i) => tone(760 + (i % 3) * 45, 0.035, 'square', 0.016, 0);
  const chime = () => { tone(784, 0.55, 'sine', 0.07, 0); tone(587.33, 0.8, 'sine', 0.07, 0.3); };
  const thud = () => { tone(150, 0.12, 'sine', 0.12, 0); tone(90, 0.18, 'sine', 0.1, 0.02); };
  function announce(name) {
    if (!state.voice || !('speechSynthesis' in window)) return;
    const base = label(name).replace(/역$/, '');
    const u = new SpeechSynthesisUtterance('이번 역은 ' + base + ', ' + stationQuery(name) + '입니다.');
    u.lang = 'ko-KR';
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  /* ---------- 뽑기 엔진 ---------- */
  const delay = (i, total) => 45 + 330 * Math.pow(i / total, 2.6);

  function eligible() {
    const m = new Map();
    activeLines().forEach((L) => {
      const list = L.all.filter((n) => inScope(n) && (!state.unvisited || !state.stamps[n]));
      if (list.length) m.set(L.n, list);
    });
    return m;
  }

  /* h.begin() / h.line(n, ms) / h.lineLanded(L) / h.station(name, L, track, ms) / h.end(result)
     호선 → 역 순서로 감속하며 멈춰요. 뽑을 역이 없으면 null. */
  async function draw(h) {
    const pool = eligible();
    if (!pool.size) return null;
    const lineN = rand([...pool.keys()]);
    const name = rand(pool.get(lineN));
    const L = LINE[lineN];
    const tr = trackFor(L, name);
    if (h.begin) h.begin();
    if (reduced) {
      h.station(name, L, tr, 0);
    } else {
      audio();
      const roll = activeLines().map((x) => x.n);
      const len = roll.length;
      const start = Math.floor(Math.random() * len);
      const total = 18 + ((roll.indexOf(lineN) - start + len) % len);
      for (let i = 0; i <= total; i++) {
        const n = roll[(start + i) % len];
        const d = delay(i, total);
        h.line(n, d);
        tick(i);
        await sleep(d);
      }
      await sleep(420);
      if (h.lineLanded) h.lineLanded(L);
      const s = tr.s;
      const idx = s.indexOf(name);
      const steps = 14 + Math.floor(Math.random() * 8);
      for (let i = 0; i <= steps; i++) {
        const k = (((idx - (steps - i)) % s.length) + s.length) % s.length;
        const d = delay(i, steps);
        h.station(s[k], L, tr, d);
        tick(i);
        await sleep(d);
      }
    }
    chime();
    announce(name);
    const result = { name, line: lineN };
    if (h.end) h.end(result);
    return result;
  }

  /* ---------- 남춘천 출발 경로 ---------- */
  /* 남춘천에서 걸리는 시간(분)으로 가장 빠른 길을 골라요. 모두 어림값이에요.
     ITX-청춘은 대부분 청량리·용산에만 서서 두 역에서만 갈아타요(pen: 남춘천에서 그 역까지 ITX 시간).
     ITX에서 지하철로 갈아타는 것도 환승 한 번으로 셉니다.
     남춘천이 노선 데이터에 있으면 경춘선 전철로 바로 가는 길도 같이 비교해요(train 없음). */
  const ENTRIES = [
    { name: '청량리', pen: 65, train: 'ITX-청춘' },
    { name: '용산', pen: 83, train: 'ITX-청춘' },
    { name: ORIGIN, pen: 0 },
  ];
  const STOP_MIN = 2;             // 한 정거장 기본값 (노선별 min이 있으면 그 값)
  const TRANSFER = 7;             // 갈아타기(걷기 + 기다리기)
  /* 따로 다니는 지선(sep)은 '2#1'처럼 별도 그룹으로 둬서 만나는 역에서 환승으로 계산해요 */
  const NODES = new Map();
  const GROUPS = new Map();       // 역 이름 -> 그 역이 속한 그룹들
  const GROUP_LINE = new Map();   // 그룹 -> { L, ti }  (ti: 지선 트랙 번호, 본선이면 -1)
  const groupOf = (L, ti) => {
    const g = L.tracks[ti].sep ? L.n + '#' + ti : String(L.n);
    if (!GROUP_LINE.has(g)) GROUP_LINE.set(g, { L, ti: L.tracks[ti].sep ? ti : -1 });
    return g;
  };
  const nodeOf = (g, name) => {
    const k = g + '|' + name;
    let n = NODES.get(k);
    if (!n) {
      n = { key: k, name, edges: [] };
      NODES.set(k, n);
      if (!GROUPS.has(name)) GROUPS.set(name, new Set());
      GROUPS.get(name).add(g);
    }
    return n;
  };
  const link = (g, a, b, oneway, cost) => {
    const A = nodeOf(g, a), B = nodeOf(g, b);
    if (!A.edges.some((e) => e.to === B)) A.edges.push({ to: B, cost });
    if (!oneway && !B.edges.some((e) => e.to === A)) B.edges.push({ to: A, cost });
  };
  LINES.forEach((L) => L.tracks.forEach((t, ti) => {
    const s = t.s, g = groupOf(L, ti), c = L.min || STOP_MIN;
    for (let i = 0; i < s.length - 1; i++) link(g, s[i], s[i + 1], t.oneway, c);
    if (t.loop && s.length > 2) link(g, s[s.length - 1], s[0], t.oneway, c);
  }));
  GROUPS.forEach((gs, name) => {
    if (gs.size < 2) return;
    gs.forEach((a) => gs.forEach((b) => {
      if (a !== b) nodeOf(a, name).edges.push({ to: nodeOf(b, name), cost: TRANSFER });
    }));
  });

  function shortest(fromName, destName) {
    const dist = new Map(), prev = new Map(), done = new Set();
    GROUPS.get(fromName).forEach((g) => dist.set(g + '|' + fromName, 0));
    for (;;) {
      let cur = null, cd = Infinity;
      for (const [k, d] of dist) if (!done.has(k) && d < cd) { cd = d; cur = k; }
      if (cur === null) break;
      done.add(cur);
      for (const e of NODES.get(cur).edges) {
        const nd = cd + e.cost;
        if (nd < (dist.has(e.to.key) ? dist.get(e.to.key) : Infinity)) {
          dist.set(e.to.key, nd);
          prev.set(e.to.key, cur);
        }
      }
    }
    let best = null, bd = Infinity;
    GROUPS.get(destName).forEach((g) => {
      const k = g + '|' + destName;
      if (dist.has(k) && dist.get(k) < bd) { bd = dist.get(k); best = k; }
    });
    if (best === null) return null;
    const path = [];
    for (let k = best; k !== undefined; k = prev.get(k)) path.unshift(k);
    return { path, cost: bd };
  }

  function toSegments(path) {
    const segs = [];
    let cur = null;
    path.forEach((k) => {
      const i = k.indexOf('|');
      const g = k.slice(0, i), name = k.slice(i + 1);
      if (!cur || cur.g !== g) {
        if (cur) segs.push(cur);
        cur = { g, line: GROUP_LINE.get(g).L.n, from: name, to: name, via: [name] };
      } else {
        cur.to = name;
        cur.via.push(name);
      }
    });
    if (cur) segs.push(cur);
    const real = segs.filter((s) => s.via.length > 1);
    real.forEach((s) => {
      s.stops = s.via.length - 1;
      const L = LINE[s.line];
      const ti = GROUP_LINE.get(s.g).ti;
      if (ti >= 0) s.sepName = L.tracks[ti].name;
      s.track = ti >= 0 ? L.tracks[ti] : trackFor(L, s.from);
      const loopTrack = L.tracks.find((t) => t.loop && t.fwd && t.s.includes(s.from) && t.s.includes(s.via[1]));
      if (loopTrack) {
        const a = loopTrack.s, n = a.length, i = a.indexOf(s.from);
        s.loopDir = a[(i + 1) % n] === s.via[1] ? loopTrack.fwd : loopTrack.back;
      }
      /* 본선과 직결로 다니는 갈래로 넘어가면 행선지를 확인하라고 알려요 */
      const main = L.tracks[0].s;
      L.tracks.forEach((t, j) => {
        if (j === 0 || t.sep || t.loop || !t.name) return;
        const onBranch = s.via.some((n) => t.s.includes(n) && !main.includes(n));
        const offBranch = s.via.some((n) => !t.s.includes(n));
        if (onBranch && offBranch) s.branch = { name: t.name, at: t.s[0] };
      });
    });
    return real;
  }
  const segLabel = (s) => lineName(LINE[s.line]) + (s.sepName ? ' ' + s.sepName : '');

  const routeCache = new Map();
  function routesTo(dest) {
    if (routeCache.has(dest)) return routeCache.get(dest);
    const out = [];
    if (!GROUPS.has(dest)) return out;
    ENTRIES.forEach((en) => {
      if (!GROUPS.has(en.name)) return;
      if (en.name === dest) { out.push({ entry: en, segments: [], stops: 0, transfers: 0, cost: en.pen }); return; }
      const r = shortest(en.name, dest);
      if (!r) return;
      const segments = toSegments(r.path);
      const itx = en.train ? 1 : 0;   // ITX에서 지하철로 갈아타는 것도 환승 1회
      out.push({
        entry: en,
        segments,
        stops: segments.reduce((a, s) => a + s.stops, 0),
        transfers: Math.max(0, segments.length - 1 + itx),
        cost: r.cost + en.pen + itx * TRANSFER,
      });
    });
    out.sort((a, b) => a.cost - b.cost);
    routeCache.set(dest, out);
    return out;
  }

  /* ---------- 사진 → 스티커 도장 ---------- */
  async function fileToCanvas(file, maxSide) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * s));
    c.height = Math.max(1, Math.round(bmp.height * s));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return c;
  }
  const toBlob = (c, type) => new Promise((res) => c.toBlob(res, type || 'image/png'));

  function trimCanvas(src) {
    const w = src.width, h = src.height;
    const d = src.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 16) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return src;
    const c = document.createElement('canvas');
    c.width = x1 - x0 + 1;
    c.height = y1 - y0 + 1;
    c.getContext('2d').drawImage(src, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  }

  /* 오려낸 이미지에 흰 테두리를 둘러 스티커처럼 만들어요 */
  function stickerFromCutout(cut) {
    const trimmed = trimCanvas(cut);
    const maxSide = 600;
    const sc = Math.min(1, maxSide / Math.max(trimmed.width, trimmed.height));
    const w = Math.max(1, Math.round(trimmed.width * sc)), h = Math.max(1, Math.round(trimmed.height * sc));
    const r = Math.max(6, Math.round(Math.max(w, h) * 0.025));
    const out = document.createElement('canvas');
    out.width = w + r * 2 + 2;
    out.height = h + r * 2 + 2;
    const ctx = out.getContext('2d');
    const sil = document.createElement('canvas');
    sil.width = w;
    sil.height = h;
    const sctx = sil.getContext('2d');
    sctx.drawImage(trimmed, 0, 0, w, h);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = '#fff';
    sctx.fillRect(0, 0, w, h);
    for (let a = 0; a < 360; a += 12) {
      const rad = (a * Math.PI) / 180;
      ctx.drawImage(sil, r + 1 + Math.cos(rad) * r, r + 1 + Math.sin(rad) * r);
    }
    ctx.drawImage(sil, r + 1, r + 1);
    ctx.drawImage(trimmed, 0, 0, trimmed.width, trimmed.height, r + 1, r + 1, w, h);
    return out;
  }

  /* 배경을 못 지웠을 때: 사진을 둥근 사각형 스티커로 */
  function stickerFromPhoto(photo) {
    const maxSide = 560;
    const sc = Math.min(1, maxSide / Math.max(photo.width, photo.height));
    const w = Math.round(photo.width * sc), h = Math.round(photo.height * sc);
    const b = 12;
    const out = document.createElement('canvas');
    out.width = w + b * 2;
    out.height = h + b * 2;
    const ctx = out.getContext('2d');
    const rr = (x, y, ww, hh, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + ww, y, x + ww, y + hh, r);
      ctx.arcTo(x + ww, y + hh, x, y + hh, r);
      ctx.arcTo(x, y + hh, x, y, r);
      ctx.arcTo(x, y, x + ww, y, r);
      ctx.closePath();
    };
    ctx.fillStyle = '#fff';
    rr(0, 0, out.width, out.height, 26);
    ctx.fill();
    ctx.save();
    rr(b, b, w, h, 16);
    ctx.clip();
    ctx.drawImage(photo, b, b, w, h);
    ctx.restore();
    return out;
  }

  let bgLib = null;
  async function loadBG() {
    if (bgLib) return bgLib;
    const sources = [
      'https://esm.sh/@imgly/background-removal@1.5.8',
      'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.8/+esm',
    ];
    let last = null;
    for (const u of sources) {
      try {
        const m = await Promise.race([
          import(u),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000)),
        ]);
        if (m && m.removeBackground) { bgLib = m; return m; }
      } catch (e) { last = e; }
    }
    throw last || new Error('load-failed');
  }

  async function cutOut(photoCanvas, onStatus) {
    const lib = await loadBG();
    const blob = await toBlob(photoCanvas, 'image/png');
    const out = await lib.removeBackground(blob, {
      model: 'isnet_quint8',
      output: { format: 'image/png' },
      progress: (key, cur, total) => {
        if (String(key).startsWith('fetch') && total) onStatus('모델 내려받는 중 ' + Math.round((cur / total) * 100) + '% (처음 한 번만)');
      },
    });
    const bmp = await createImageBitmap(out);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    return c;
  }

  async function savePhoto(name, canvas) {
    const blob = await toBlob(canvas, 'image/png');
    await DB.put(name, blob);
    dropURL(name);
  }

  async function stampWithFile(name, lineN, file, onStatus) {
    const say = onStatus || (() => {});
    say('사진 줄이는 중…');
    const photo = await fileToCanvas(file, 1024);
    let sticker = null;
    let cut = true;
    try {
      say('배경 지우는 중… 폰에서는 20~40초쯤 걸려요');
      const c = await cutOut(photo, say);
      sticker = stickerFromCutout(c);
    } catch (e) {
      console.warn('배경 제거 실패, 사진 그대로 사용', e);
      cut = false;
      sticker = stickerFromPhoto(photo);
    }
    await savePhoto(name, sticker);
    const prev = state.stamps[name];
    state.stamps[name] = { d: prev ? prev.d : today(), l: prev && prev.l ? prev.l : lineN, p: 1 };
    save();
    thud();
    emit('stamps', { name, fresh: !prev, cut });
    return { cut };
  }

  function stampPlain(name, lineN) {
    if (state.stamps[name]) return;
    state.stamps[name] = { d: today(), l: lineN };
    save();
    thud();
    emit('stamps', { name, fresh: true });
  }

  async function unstamp(name) {
    delete state.stamps[name];
    save();
    try { await DB.del(name); } catch (e) { /* 무시 */ }
    dropURL(name);
    emit('stamps', { name, removed: true });
  }

  /* ---------- 기록 백업 ---------- */
  const blobToDataURL = (b) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

  async function exportJSON() {
    await photosReady;
    const photos = {};
    for (const name of Object.keys(state.stamps)) {
      if (!state.stamps[name].p) continue;
      try {
        const b = await DB.get(name);
        if (b) photos[name] = await blobToDataURL(b);
      } catch (e) { /* 사진 하나쯤은 건너뛰어요 */ }
    }
    const data = { version: 2, stamps: state.stamps, photos };
    return new Blob([JSON.stringify(data)], { type: 'application/json' });
  }

  async function importJSON(file) {
    const data = JSON.parse(await file.text());
    if (!data || typeof data.stamps !== 'object') throw new Error('형식');
    let added = 0;
    for (const [old, v] of Object.entries(data.stamps)) {
      const n = RENAMED[old] || old;
      if (!STATIONS.has(n) || !v || typeof v.d !== 'string' || state.stamps[n]) continue;
      state.stamps[n] = { d: v.d, l: v.l };
      const url = data.photos && data.photos[old];
      if (url) {
        try {
          const blob = await (await fetch(url)).blob();
          await DB.put(n, blob);
          state.stamps[n].p = 1;
        } catch (e) { /* 사진 없이 가져와요 */ }
      }
      added++;
    }
    save();
    emit('stamps', { bulk: true });
    return added;
  }

  /* ---------- 도장 SVG (사진 없이 찍었을 때) ---------- */
  let sealId = 0;
  function sealSVG(name, lineN, date) {
    const id = 'r' + (++sealId);
    const L = LINE[lineN] || LINES[0];
    const color = L.color === '#BDB092' ? '#8f8160' : L.color;
    const shown = label(name);
    const chars = [...shown];
    const two = chars.length > 5;
    const half = Math.ceil(chars.length / 2);
    const rows = two ? [chars.slice(0, half).join(''), chars.slice(half).join('')] : [shown];
    const longest = Math.max(...rows.map((r) => [...r].length));
    const fs = Math.min(30, 108 / longest);
    const y0 = two ? 100 : 108;
    const text = rows.map((r, i) => `<text x="100" y="${y0 + i * (fs + 4)}" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="900" fill="${color}" stroke="none">${esc(r)}</text>`).join('');
    const tag = lineShort(L);
    const tagSize = Math.min(16, 34 / Math.max(1, [...tag].length));
    return `<svg class="seal" viewBox="0 0 200 200" role="img" aria-label="${esc(shown)} 도장" font-family="Gothic A1, sans-serif">
  <defs>
    <filter id="f${id}" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="2.6"/>
    </filter>
    <path id="t${id}" d="M 30 100 A 70 70 0 0 1 170 100"/>
    <path id="b${id}" d="M 24 100 A 76 76 0 0 0 176 100"/>
  </defs>
  <g filter="url(#f${id})" fill="none" stroke="${color}">
    <circle cx="100" cy="100" r="93" stroke-width="5"/>
    <circle cx="100" cy="100" r="84" stroke-width="1.5"/>
    <circle cx="100" cy="100" r="59" stroke-width="1.5"/>
    <text font-size="13" font-weight="800" fill="${color}" stroke="none" letter-spacing="2"><textPath href="#t${id}" startOffset="50%" text-anchor="middle">서울 지하철</textPath></text>
    <text font-size="13" font-weight="800" fill="${color}" stroke="none" letter-spacing="1"><textPath href="#b${id}" startOffset="50%" text-anchor="middle">${esc(dotDate(date))}</textPath></text>
    ${isText(L) ? `<rect x="72" y="52" width="56" height="24" rx="12" fill="${color}" stroke="none"/>` : `<circle cx="100" cy="64" r="13" fill="${color}" stroke="none"/>`}
    <text x="100" y="${(64 + tagSize * 0.36).toFixed(1)}" text-anchor="middle" font-size="${tagSize.toFixed(1)}" font-weight="800" fill="${L.ink === '#fff' ? '#fff' : L.ink}" stroke="none">${esc(tag)}</text>
    ${text}
  </g>
</svg>`;
  }

  /* ---------- 안내판 (가는 길 · 근처 · 도장) ---------- */
  const CAM_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>';
  const TRAIN_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 20l-2 2M15 20l2 2"/><circle cx="9" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/></svg>';

  function legsHTML(r, dest) {
    const items = [];
    if (r.entry.train) items.push(`<li class="leg"><span class="rb rb-train">${TRAIN_SVG}</span><div class="rt"><b>${ORIGIN} → ${esc(label(r.entry.name))}</b><span class="sub">${esc(r.entry.train)} <a href="https://www.letskorail.com" target="_blank" rel="noopener">열차 시각 확인</a></span></div></li>`);
    r.segments.forEach((s, i) => {
      const L = LINE[s.line];
      const next = r.segments[i + 1];
      const dir = s.loopDir ? s.loopDir + ' ' + esc(label(s.via[1])) + ' 방향' : esc(label(s.via[1])) + ' 방면';
      const fork = s.branch ? ` ${esc(s.branch.at)}에서 ${esc(s.branch.name)}으로 가는 열차인지 행선지를 확인하세요.` : '';
      items.push(`<li class="leg" style="--c:${L.color}"><span class="rb${isText(L) ? ' txt' : ''}" style="background:${L.color};color:${L.ink}">${esc(lineShort(L))}</span><div class="rt"><b>${esc(segLabel(s))} ${esc(label(s.from))}에서 ${dir}</b><span class="sub">${s.stops}정거장, ${next ? esc(label(s.to)) + '에서 ' + esc(segLabel(next)) + '으로 환승' : esc(label(s.to)) + '에서 내려요'}${fork}</span></div></li>`);
    });
    items.push(`<li class="leg end"><span class="rb rb-end"></span><div class="rt"><b>${esc(stationQuery(dest))} 도착</b></div></li>`);
    return `<ol class="route">${items.join('')}</ol>`;
  }

  function routeHTML(dest) {
    const rs = routesTo(dest);
    if (!rs.length) return '<p class="empty">경로를 찾지 못했어요.</p>';
    const best = rs[0];
    const alts = rs.slice(1, 3).map((r) => {
      const lines = r.segments.length ? r.segments.map(segLabel).join(' → ') : '열차에서 바로 내려요';
      return `<li><b>${esc(label(r.entry.name))}</b>에서 시작, ${lines}, 환승 ${r.transfers}회, ${r.stops}정거장</li>`;
    }).join('');
    const summary = best.segments.length ? `환승 ${best.transfers}회, 지하철 ${best.stops}정거장` : best.entry.train ? '열차에서 바로 도착' : '출발역이에요';
    return `<p class="route-sum">${esc(summary)}</p>${legsHTML(best, dest)}
      ${alts ? `<details class="alts"><summary>다른 경로 ${rs.length - 1}개</summary><ul>${alts}</ul></details>` : ''}
      <p class="hint">정차역과 열차 시각은 바뀔 수 있어요. 타기 전에 코레일에서 확인하세요.</p>`;
  }

  let infoEl = null;
  let infoCur = null;
  let busyStamp = false;

  function renderInfo(el, cur) {
    infoEl = el;
    infoCur = cur;
    if (!el || !cur) return;
    const { name, line } = cur;
    const L = LINE[line];
    const stamp = state.stamps[name];
    const sq = stationQuery(name);
    const places = CURATED[name] || [];
    const placeRows = places.map((p) => {
      const ml = mapLinks(p[3] || p[1]);
      return `<li class="place">
        <span class="kind ${p[0] === '맛집' ? 'food' : ''}">${esc(p[0])}</span>
        <span><span class="pname">${esc(p[1])}</span><span class="pdesc">${esc(p[2])}</span></span>
        <span class="plinks"><a href="${ml.kakao}" target="_blank" rel="noopener">카카오맵</a><a href="${ml.naver}" target="_blank" rel="noopener">네이버지도</a></span>
      </li>`;
    }).join('');
    const chips = ['맛집', '카페', '가볼 만한 곳'].map((kw) => `<a href="${mapLinks(sq + ' ' + kw).kakao}" target="_blank" rel="noopener">${esc(sq)} ${esc(kw)}</a>`).join('');

    el.innerHTML = `
<div class="stampbar" style="--line:${L.color};--ink-on:${L.ink}">
  <button type="button" class="cam" ${busyStamp ? 'disabled' : ''}>${CAM_SVG}<span>${stamp && stamp.p ? '사진 다시 찍기' : '사진으로 도장 찍기'}</span></button>
  <input type="file" class="shot" accept="image/*" capture="environment" hidden>
  <span class="status" role="status">${stamp ? esc(dotDate(stamp.d)) + '에 다녀왔어요' : '출구나 역명판을 찍으면 스티커가 돼요'}</span>
  <span class="stampopts">
    ${!stamp ? '<button type="button" class="link-btn" data-act="plain">사진 없이 도장만</button>' : ''}
    ${stamp ? '<button type="button" class="link-btn" data-act="clear">도장 지우기</button>' : ''}
  </span>
</div>
<div class="info-grid">
  <section class="sect">
    <h3>${ORIGIN}에서 ${esc(sq)}까지</h3>
    ${routeHTML(name)}
  </section>
  <section class="sect">
    <h3>이 역 근처</h3>
    ${places.length ? `<ul class="places">${placeRows}</ul>` : '<p class="empty">아직 골라 둔 장소가 없어요. 지도에서 바로 찾아보세요.</p>'}
    <div class="chips" style="margin-top:${places.length ? 14 : 0}px">${chips}</div>
    <p class="hint"><a href="${mapLinks(sq).kakao}" target="_blank" rel="noopener">카카오맵</a>이나 <a href="${mapLinks(sq).naver}" target="_blank" rel="noopener">네이버지도</a>에서 열면 길찾기를 바로 쓸 수 있어요.</p>
  </section>
</div>`;

    const cam = $('.cam', el), shot = $('.shot', el), status = $('.status', el);
    cam.addEventListener('click', () => shot.click());
    shot.addEventListener('change', async () => {
      const f = shot.files && shot.files[0];
      shot.value = '';
      if (!f || busyStamp) return;
      busyStamp = true;
      cam.disabled = true;
      try {
        const r = await stampWithFile(name, line, f, (t) => { status.textContent = t; });
        busyStamp = false;
        if (!r.cut) {
          const s2 = $('.status', el);
          if (s2) s2.textContent = '배경은 못 지웠지만 사진 그대로 붙였어요';
        }
      } catch (e) {
        console.error(e);
        busyStamp = false;
        status.textContent = '사진을 처리하지 못했어요. 다시 시도해 주세요';
        cam.disabled = false;
      }
    });
    el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.act === 'plain') { stampPlain(name, line); return; }
      if (b.dataset.act === 'clear') {
        if (b.dataset.armed !== '1') {
          b.dataset.armed = '1';
          b.textContent = '정말 지울까요? 한 번 더';
          setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = '도장 지우기'; } }, 3000);
          return;
        }
        await unstamp(name);
      }
    }));
  }

  on('stamps', (e) => {
    if (infoEl && infoCur && (e.bulk || !e.name || e.name === infoCur.name)) renderInfo(infoEl, infoCur);
  });

  /* ---------- 기록 서랍 ---------- */
  function mountDrawer(opts) {
    const btn = opts.button;
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.hidden = true;
    const dr = document.createElement('aside');
    dr.className = 'drawer';
    dr.hidden = true;
    dr.setAttribute('role', 'dialog');
    dr.setAttribute('aria-modal', 'true');
    dr.setAttribute('aria-labelledby', 'drawerTitle');
    dr.innerHTML = `
<div class="drawer-head"><h2 id="drawerTitle">도장 기록</h2><button type="button" class="x" aria-label="닫기">닫기</button></div>
<div class="drawer-body">
  <p class="sum" id="drawerSum"></p>
  <div class="gallery" id="gallery"></div>
  <div id="record"></div>
  <section class="settings">
    <h3>설정</h3>
    <label class="switch"><input type="checkbox" id="optSound"><span class="box" aria-hidden="true"></span><span>소리</span></label>
    <label class="switch"><input type="checkbox" id="optVoice"><span class="box" aria-hidden="true"></span><span>안내방송</span></label>
  </section>
  <section class="settings">
    <h3>뽑기 범위</h3>
    <fieldset class="scope">
      <legend class="sr">뽑을 역의 지역</legend>
      <label class="radio"><input type="radio" name="scope" value="seoul"><span class="dot" aria-hidden="true"></span><span>서울</span></label>
      <label class="radio"><input type="radio" name="scope" value="all"><span class="dot" aria-hidden="true"></span><span>수도권 전체</span></label>
    </fieldset>
    <fieldset class="linepick" id="linePick">
      <legend>뽑기에 넣을 노선</legend>
    </fieldset>
    <p class="hint">끈 노선과 범위 밖 역의 도장도 지워지지 않고 남아요. 길 안내는 모든 노선으로 찾아요.</p>
  </section>
  <section class="settings">
    <h3>백업</h3>
    <p class="hint">기록은 이 브라우저에만 저장돼요. 기기를 바꾸기 전에 내보내 두세요.</p>
    <div class="backup-actions">
      <button type="button" class="pill" id="export">기록 내보내기</button>
      <button type="button" class="pill" id="import">기록 불러오기</button>
      <input type="file" id="file" accept="application/json,.json" hidden>
    </div>
    <p class="note" id="backupNote" role="status"></p>
  </section>
</div>`;
    document.body.append(scrim, dr);

    const openLines = new Set();
    let isOpen = false;

    const optSound = $('#optSound', dr), optVoice = $('#optVoice', dr);
    optSound.checked = !!state.sound;
    optVoice.checked = !!state.voice;
    optSound.addEventListener('change', () => { state.sound = optSound.checked; save(); });
    optVoice.addEventListener('change', () => {
      state.voice = optVoice.checked;
      save();
      if (!state.voice && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    });

    /* 뽑기 범위: 지역(서울/수도권 전체)과 노선별 켜기 */
    dr.querySelectorAll('input[name="scope"]').forEach((r) => {
      r.checked = r.value === state.scope;
      r.addEventListener('change', () => { if (r.checked) { state.scope = r.value; save(); emit('settings'); } });
    });
    const linePick = $('#linePick', dr);
    LINES.forEach((L) => {
      const lab = document.createElement('label');
      lab.className = 'switch lp';
      lab.innerHTML = `<input type="checkbox" data-line="${esc(L.n)}"><span class="box" aria-hidden="true"></span>` +
        `<span class="lbadge${isText(L) ? ' txt' : ''}" style="background:${L.color};color:${L.ink}" aria-hidden="true">${esc(lineShort(L))}</span><span>${esc(lineName(L))}</span>`;
      const cb = $('input', lab);
      cb.checked = lineOn(L);
      cb.addEventListener('change', () => { state.lines[L.n] = cb.checked; save(); emit('settings'); });
      linePick.append(lab);
    });

    async function renderGallery() {
      const box = $('#gallery', dr);
      const names = Object.keys(state.stamps).filter((n) => STATIONS.has(n));
      if (!names.length) { box.innerHTML = '<p class="empty">아직 도장이 없어요. 역을 뽑고 다녀오세요.</p>'; return; }
      names.sort((a, b) => String(state.stamps[b].d).localeCompare(String(state.stamps[a].d)));
      box.replaceChildren();
      for (const n of names) {
        const st = state.stamps[n];
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'tile';
        const u = st.p ? await photoURL(n) : null;
        tile.innerHTML = `<span class="tile-img">${u ? `<img src="${u}" alt="">` : sealSVG(n, st.l || STATIONS.get(n).lines[0], st.d)}</span><span class="tile-name">${esc(label(n))}</span>`;
        tile.addEventListener('click', () => { close(); opts.onSelect(n, st.l || STATIONS.get(n).lines[0]); });
        box.append(tile);
      }
    }

    function renderRecord() {
      const box = $('#record', dr);
      box.replaceChildren();
      activeLines().forEach((L) => {
        const all = L.all.filter(inScope);
        if (!all.length) return;
        const stamped = all.filter((n) => state.stamps[n]).length;
        const wrap = document.createElement('div');
        wrap.className = 'rline';
        wrap.style.setProperty('--c', L.color);
        wrap.style.setProperty('--k', L.ink);
        const o = openLines.has(L.n);
        wrap.innerHTML = `
          <button type="button" class="rhead" aria-expanded="${o}" aria-controls="rc${L.n}">
            <span class="rbadge${isText(L) ? ' txt' : ''}" style="background:${L.color};color:${L.ink}" aria-label="${esc(lineName(L))}">${esc(lineShort(L))}</span>
            <span class="rbar" aria-hidden="true">${all.map((n) => `<i class="${state.stamps[n] ? 'on' : ''}"></i>`).join('')}</span>
            <span class="rcnt">${stamped} / ${all.length}</span>
          </button>
          <div class="rchips" id="rc${L.n}" ${o ? '' : 'hidden'}>
            ${all.map((n) => `<button type="button" class="chip ${state.stamps[n] ? 'on' : ''}" data-n="${esc(n)}">${esc(label(n))}</button>`).join('')}
          </div>`;
        const head = $('.rhead', wrap), chipsBox = $('.rchips', wrap);
        head.addEventListener('click', () => {
          const open = chipsBox.hidden;
          chipsBox.hidden = !open;
          head.setAttribute('aria-expanded', String(open));
          if (open) openLines.add(L.n); else openLines.delete(L.n);
        });
        chipsBox.addEventListener('click', (e) => {
          const b = e.target.closest('.chip');
          if (b) { close(); opts.onSelect(b.dataset.n, L.n); }
        });
        box.append(wrap);
      });
    }

    function renderAll() {
      const p = pool();
      const done = [...p].filter((n) => state.stamps[n]).length;
      $('#drawerSum', dr).textContent = '도장 ' + done + ' / ' + p.size + '역' + (p.size ? '' : ' · 설정에서 노선을 켜 주세요');
      renderRecord();
      renderGallery();
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      renderAll();
      scrim.hidden = false;
      dr.hidden = false;
      requestAnimationFrame(() => { scrim.classList.add('on'); dr.classList.add('on'); });
      btn.setAttribute('aria-expanded', 'true');
      $('.x', dr).focus();
    }
    function close() {
      if (!isOpen) return;
      isOpen = false;
      scrim.classList.remove('on');
      dr.classList.remove('on');
      btn.setAttribute('aria-expanded', 'false');
      const done = () => { if (!isOpen) { scrim.hidden = true; dr.hidden = true; } };
      if (reduced) done(); else setTimeout(done, 260);
      btn.focus();
    }

    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', open);
    $('.x', dr).addEventListener('click', close);
    scrim.addEventListener('click', close);
    /* 열려 있는 동안 Tab은 서랍 안에서만 돌아요 */
    const FOCUSABLE = 'button:not([disabled]), a[href], input:not([hidden]):not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      const items = [...dr.querySelectorAll(FOCUSABLE)].filter((x) => x.getClientRects().length);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dr.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dr.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    });
    on('stamps', () => { if (isOpen) renderAll(); });
    on('settings', () => { if (isOpen) renderAll(); });

    $('#export', dr).addEventListener('click', async () => {
      const note = $('#backupNote', dr);
      note.textContent = '내보내는 중…';
      try {
        const blob = await exportJSON();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'metro-stamps-' + today() + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
        note.textContent = '내보냈어요. 사진도 함께 들어 있어요.';
      } catch (e) { note.textContent = '내보내지 못했어요.'; }
    });
    $('#import', dr).addEventListener('click', () => $('#file', dr).click());
    $('#file', dr).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const note = $('#backupNote', dr);
      try {
        const n = await importJSON(f);
        note.textContent = '도장 ' + n + '개를 불러왔어요. 이미 있던 도장은 그대로 뒀어요.';
      } catch (err) {
        note.textContent = '불러오지 못했어요. 이 페이지에서 내보낸 JSON 파일인지 확인해 주세요.';
      }
    });
    return { open, close };
  }

  /* 기록 버튼에 도장 수를 표시 */
  function bindCount(btn) {
    const paint = () => {
      const p = pool();
      const done = [...p].filter((n) => state.stamps[n]).length;
      btn.textContent = '기록 ' + done + ' / ' + p.size;
    };
    paint();
    on('stamps', paint);
    on('settings', paint);
  }

  window.Core = {
    LINES, LINE, STATIONS, ORIGIN, state, save, on, emit, reduced, sleep, esc,
    lineName, lineShort, lineEn, isText, label, lineOn, inScope, activeLines, pool,
    trackFor, neighbors, stationQuery, mapLinks, today, dotDate,
    draw, eligible, routesTo, photoURL, sealSVG, stampPlain, stampWithFile, unstamp,
    renderInfo, mountDrawer, bindCount, tone, thud, chime,
  };
})();
