/* 출발역에서 가는 길: 가장 빠른 길 찾기 */
(() => {
  'use strict';
  const C = window.Core;
  const {
    LINES, LINE, ORIGIN, lineName, trackFor, origin,
  } = C;

  /* ---------- 출발역에서 가는 길 ---------- */
  /* 출발역에서 걸리는 시간(분)으로 가장 빠른 길을 골라요. 모두 어림값이에요.
     출발역이 남춘천일 때만 아래 ITX-청춘 진입점을 같이 비교해요. 다른 역에서는 지하철로만 찾아요.
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
  const entriesFrom = (o) => (o === ORIGIN ? ENTRIES : [{ name: o, pen: 0 }]);
  function routesTo(dest) {
    const o = origin();
    const key = o + '|' + dest;
    if (routeCache.has(key)) return routeCache.get(key);
    const out = [];
    if (!GROUPS.has(dest)) return out;
    entriesFrom(o).forEach((en) => {
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
    routeCache.set(key, out);
    return out;
  }

  Object.assign(C, { ENTRIES, STOP_MIN, TRANSFER, NODES, GROUPS, GROUP_LINE, groupOf, nodeOf, link, shortest, toSegments, segLabel, routeCache, entriesFrom, routesTo });
})();
