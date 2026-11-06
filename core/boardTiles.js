/* Life Board에 보낼 보드 목록(manifest v1)을 만들어요. 규격: board 저장소 docs/TILES.md, 검증 js/schema.js
   - 순수 함수: 네트워크·저장소·무작위를 쓰지 않아요. 같은 입력과 같은 now면 같은 결과(중복 전송 방지가 이걸로 동작해요).
   - 기록(도장) 자체는 보내지 않고, 보드에 그릴 글자만 만들어요. 사진은 기기 안에만 있어 표지는 보내지 않아요.
   - 타일 id(station, recent, line, count)는 보드의 사용자 배치가 이 id로 저장되니 바꾸지 않아요.
   - 브라우저에서는 window.Core.buildBoardTiles, Node 테스트에서는 require로 불러요. */
(function (root) {
  'use strict';

  const APP = 'sub';
  const HREF = 'https://kingjnu-sakayume.github.io/sub/';
  const LABEL = '역 도장깨기';
  const MAX_CANDIDATES = 50;
  const MAX_ROWS = 12;
  const KST_MS = 9 * 60 * 60 * 1000;

  /* 글자 정리: 공백만 있으면 undefined(필드를 빼요), 길면 잘라서 끝에 '…' */
  function cut(s, max) {
    if (typeof s !== 'string') return undefined;
    const t = s.trim();
    if (!t) return undefined;
    return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + '…';
  }
  /* 값이 undefined인 필드를 빼요 */
  function clean(o) {
    const out = {};
    Object.keys(o).forEach((k) => { if (o[k] !== undefined) out[k] = o[k]; });
    return out;
  }
  const label = (key) => String(key).replace(/\(.+\)$/, '');      // '신촌(경의중앙)' → '신촌'
  const lineName = (L) => L.name || L.n + '호선';
  /* 노선의 역(갈래를 합쳐 중복 없이). base.js가 만든 L.all이 있으면 그걸 써요 */
  const stationsOf = (L) => {
    if (Array.isArray(L.all)) return L.all;
    const out = [];
    (L.tracks || []).forEach((t) => t.s.forEach((n) => { if (!out.includes(n)) out.push(n); }));
    return out;
  };
  const kstDate = (now) => new Date(now.getTime() + KST_MS).toISOString().slice(0, 10);
  /* 'YYYY-MM-DD' → '11/2', 올해(KST)가 아니면 '2025/11/2'. 보드에 남아도 틀려지지 않게 날짜로만 써요 */
  function shortDate(d, now) {
    const [y, m, day] = d.split('-');
    const md = Number(m) + '/' + Number(day);
    return y === kstDate(now).slice(0, 4) ? md : y + '/' + md;
  }

  /* FNV-1a 32비트: 하루마다 바뀌지만 같은 날에는 늘 같은 후보를 고르는 데 써요 */
  function fnv(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  const eligibleList = (eligible, n) => (eligible instanceof Map ? eligible.get(n) : eligible && eligible[n]) || [];

  /**
   * 룰렛 후보: Life Hub에 공유하는 '지금 뽑을 수 있는 역(pool)'과 같은 역 키.
   * 노선 순서 → 역 순서로 펼쳐 중복을 빼고, 12자를 넘는 키는 빼요(자르면 Hub pool과 달라져 409).
   * 50개를 넘으면 (KST 날짜 + 역 키) 해시 순으로 50개를 골라 원래 순서로 되돌려요.
   */
  function pickCandidates(eligible, LINES, now) {
    const seen = new Set(), all = [];
    LINES.forEach((L) => eligibleList(eligible, L.n).forEach((key) => {
      if (typeof key !== 'string' || seen.has(key)) return;
      seen.add(key);
      if (key.trim() && key.length <= 12) all.push(key);
    }));
    if (all.length <= MAX_CANDIDATES) return all;
    const seed = kstDate(now) + '|';
    return all.map((key, i) => ({ key, i, h: fnv(seed + key) }))
      .sort((a, b) => a.h - b.h || a.i - b.i)
      .slice(0, MAX_CANDIDATES)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.key);
  }

  /**
   * @param input { stamps: {역 키: {d, l}}, eligible: Map(노선 번호 → [역 키]) | {노선: [역 키]}, LINES, EN }
   * @param now Date — generated_at과 날짜 표기(올해인지), 후보 고르기의 기준
   */
  function buildBoardTiles(input, now) {
    const LINES = input.LINES || [];
    const EN = input.EN || {};
    const stamps = input.stamps || {};
    const LINE = new Map(LINES.map((L) => [String(L.n), L]));
    const known = new Map();      // 역 키 → 그 역의 노선들
    LINES.forEach((L) => stationsOf(L).forEach((k) => { if (!known.has(k)) known.set(k, []); known.get(k).push(L); }));
    const total = known.size;

    /* 도장: 아는 역만, 날짜 최신순, 같은 날은 나중에 찍은(객체 순서 뒤) 것이 먼저 */
    const list = [];
    Object.keys(stamps).forEach((key, order) => {
      const s = stamps[key];
      if (!known.has(key) || !s || typeof s.d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.d)) return;
      const L = LINE.get(String(s.l)) && known.get(key).includes(LINE.get(String(s.l))) ? LINE.get(String(s.l)) : known.get(key)[0];
      list.push({ key, d: s.d, L, order });
    });
    list.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : b.order - a.order));
    const done = list.length;
    const doneSet = new Set(list.map((x) => x.key));
    const last = list[0] || null;
    const tiles = [];

    /* 1. station: 최근 도장 역 + 룰렛 */
    const candidates = pickCandidates(input.eligible, LINES, now);
    tiles.push({
      id: 'station', name: '역 도장깨기 · 최근 역', tone: 'plate',
      sizes: ['1x1', '2x1', '4x2'], size: '4x2', default: true, href: HREF,
      data: clean({
        label: LABEL,
        name: last ? cut(label(last.key), 12) : '첫 역을 찾아요',
        roman: last ? cut(EN[last.key], 30) : undefined,
        sub: cut(last ? `${shortDate(last.d, now)} · ${lineName(last.L)} · ${done} / ${total}역` : `${done} / ${total}역`, 80),
        roulette: candidates.length >= 2 ? { candidates } : undefined,
      }),
    });

    /* 2. recent: 최근 찍은 역 */
    const rows = list.slice(0, MAX_ROWS).map((x) => clean({
      title: cut(label(x.key), 80), value: shortDate(x.d, now), sub: cut(lineName(x.L), 80),
    }));
    tiles.push({
      id: 'recent', name: '역 도장깨기 · 최근 찍은 역', tone: 'type', form: 'list',
      sizes: ['2x1', '2x2'], size: '2x2', default: true, href: HREF,
      data: { label: '최근 찍은 역', rows: rows.length ? rows : [{ title: '아직 찍은 역이 없어요', muted: true }] },
    });

    /* 3. line: 최근 도장 노선의 역 칸 (도장이 없으면 보내지 않아요) */
    if (last) {
      const L = last.L, names = stationsOf(L).slice(0, 200);
      const on = names.filter((k) => doneSet.has(k)).length;
      tiles.push({
        id: 'line', name: '역 도장깨기 · 노선 지도', tone: 'map',
        sizes: ['2x1', '2x2', '4x2'], size: '2x2', default: false, href: HREF,
        data: {
          label: cut(lineName(L), 80),
          summary: cut(`${lineName(L)} ${names.length}역 중 ${on}역 방문 · 최근 ${label(last.key)} ${shortDate(last.d, now)}`, 80),
          cols: names.length >= 48 ? 12 : 8,
          cells: names.map((k) => clean({
            state: k === last.key ? 'last' : doneSet.has(k) ? 'on' : 'off',
            name: cut(label(k), 6),
          })),
        },
      });
    }

    /* 4. count: 찍은 역 / 전체 */
    const foot = [];
    if (last) {
      const all = stationsOf(last.L);
      foot.push({ k: cut(lineName(last.L), 10), v: `${all.filter((k) => doneSet.has(k)).length}/${all.length}` });
      foot.push({ k: '최근', v: shortDate(last.d, now) });
    }
    tiles.push({
      id: 'count', name: '역 도장깨기 · 진행률', tone: 'type', form: 'num',
      sizes: ['1x1', '2x1'], size: '1x1', default: false, href: HREF,
      data: clean({ label: '찍은 역', value: done, unit: '역', caption: `/ ${total}`, foot: foot.length ? foot : undefined }),
    });

    return { version: 1, app: APP, generated_at: now.toISOString(), tiles };
  }

  const api = { buildBoardTiles, pickCandidates, boardCut: cut };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.Core) Object.assign(root.Core, api);
})(typeof window !== 'undefined' ? window : globalThis);
