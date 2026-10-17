/* 뽑기 엔진: 노선 → 역 순서로 감속하며 멈춰요 */
(() => {
  'use strict';
  const C = window.Core;
  const {
    reduced, sleep, rand, LINE, trackFor, state, setCurrent, inScope, activeLines, pool, audio, tick,
    chime, announce,
  } = C;

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
      /* 마지막 칸(i = total)이 뽑힌 노선이 되도록 시작 칸을 거꾸로 정해요.
         예전엔 total = 18 + 차이 라서 노선이 9개가 아니면 다른 노선에서 멈췄어요 */
      const total = 18 + Math.floor(Math.random() * len);
      const start = (((roll.indexOf(lineN) - total) % len) + len) % len;
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
      /* 끝이 있는 노선은 종점에서 반대쪽 끝으로 튀지 않게, 남은 역이 많은 쪽에서 굴러와요 */
      const dir = tr.loop || idx >= steps || idx + steps >= s.length ? -1 : 1;
      for (let i = 0; i <= steps; i++) {
        const k = (((idx + dir * (steps - i)) % s.length) + s.length) % s.length;
        const d = delay(i, steps);
        h.station(s[k], L, tr, d);
        tick(i);
        await sleep(d);
      }
    }
    if (!state.voice) chime();
    announce(name, lineN);
    const result = { name, line: lineN };
    setCurrent(result);
    if (h.end) h.end(result);
    return result;
  }

  Object.assign(C, { delay, eligible, draw });
})();
