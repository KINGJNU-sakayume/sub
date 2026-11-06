/* 보드 타일 테스트 (Node만, 브라우저·네트워크 없음)
   node tests/board.mjs
   - 예시 출력(board/sample.json)이 board 규격 v1을 통과하는지: tests/board-schema.mjs(board js/schema.js 복사본)의
     validateManifest(manifest, policy)로 검사하고, ok만이 아니라 errors가 비었는지와 남은 타일 수를 봐요.
   - buildBoardTiles의 빈 상태·크기·id·자르기·빈 글자·결정성·룰렛 후보 규칙
   - 업로드(core/boardUpload.js): 가짜 fetch·저장소·시계로 응답별 동작과 빈도 규칙 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { validateManifest } from './board-schema.mjs';
import { loadMetro, eligibleFor, buildBoardTiles, pickCandidates, sampleManifest, SAMPLE_STATE, SAMPLE_NOW } from '../tools/board-sample.mjs';

const require = createRequire(import.meta.url);
const { createBoardUploader, BOARD_KEYS } = require('../core/boardUpload.js');

/* board js/config.js와 같은 값 (커밋 5c26d37) */
const POLICY = {
  imageOrigins: [
    'https://kingjnu-sakayume.github.io', 'https://image.aladin.co.kr', 'https://upload.wikimedia.org', 'https://i.scdn.co',
    'https://is1-ssl.mzstatic.com', 'https://is2-ssl.mzstatic.com', 'https://is3-ssl.mzstatic.com', 'https://is4-ssl.mzstatic.com', 'https://is5-ssl.mzstatic.com',
    'https://image.tmdb.org', 'https://t1.daumcdn.net', 'https://search1.kakaocdn.net',
  ],
  linkOrigins: ['https://kingjnu-sakayume.github.io'],
};

let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failed++; };
const valid = (m) => { const r = validateManifest(m, POLICY); return r.ok && r.errors.length === 0 && r.tiles.length === m.tiles.length ? r : (console.log('    ', JSON.stringify(r.errors)), null); };
/* 빈 글자("", 공백만)가 어디에도 없는지 */
const noBlank = (v) => (typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) ? v.every(noBlank) : v && typeof v === 'object' ? Object.values(v).every(noBlank) : true);

const METRO = loadMetro();
const build = (stamps, extra = {}, now = SAMPLE_NOW) => buildBoardTiles({
  stamps, eligible: extra.eligible || eligibleFor(METRO, { ...SAMPLE_STATE, stamps, ...extra.state }), LINES: extra.LINES || METRO.LINES, EN: extra.EN || METRO.EN,
}, now);
const tile = (m, id) => m.tiles.find((t) => t.id === id);

console.log('예시 출력 규격 검사');
{
  const file = JSON.parse(readFileSync(new URL('../board/sample.json', import.meta.url), 'utf8'));
  ok(JSON.stringify(file) === JSON.stringify(sampleManifest()), 'board/sample.json이 지금 코드의 결과와 같음');
  const r = validateManifest(file, POLICY);
  ok(r.ok && r.errors.length === 0, `규격 v1 통과 (errors ${r.errors.length}개)`);
  ok(r.tiles.length === file.tiles.length && file.tiles.length === 4, `남은 타일 수가 입력과 같음 (${r.tiles.length} / ${file.tiles.length})`);
  const bytes = Buffer.byteLength(JSON.stringify(file));
  ok(bytes <= 64 * 1024, `UTF-8 64 KiB 이하 (${bytes} bytes)`);
  ok(!/"data:/.test(JSON.stringify(file)), 'data: 이미지 없음');
  ok(noBlank(file), '빈 글자 없음');
  ok(file.version === 1 && file.app === 'sub' && file.generated_at === SAMPLE_NOW.toISOString(), '머리: version 1, app sub, generated_at = now');
  ok(file.tiles.every((t) => t.href === 'https://kingjnu-sakayume.github.io/sub/'), 'href는 이 앱의 GitHub Pages 주소');
}

console.log('타일 모양');
{
  const m = build(SAMPLE_STATE.stamps);
  ok(JSON.stringify(m.tiles.map((t) => t.id)) === '["station","recent","line","count"]', 'id 고정: station, recent, line, count');
  const want = { station: [['1x1', '2x1', '4x2'], '4x2', true, 'plate'], recent: [['2x1', '2x2'], '2x2', true, 'type'], line: [['2x1', '2x2', '4x2'], '2x2', false, 'map'], count: [['1x1', '2x1'], '1x1', false, 'type'] };
  ok(m.tiles.every((t) => JSON.stringify([t.sizes, t.size, t.default, t.tone]) === JSON.stringify(want[t.id])), 'sizes·size·default·tone이 정한 대로');
  ok(tile(m, 'recent').form === 'list' && tile(m, 'count').form === 'num', 'type 톤의 form');
  const st = tile(m, 'station').data;
  ok(st.name === '홍대입구' && st.roman === 'Hongik Univ.' && st.sub === '11/2 · 2호선 · 7 / 540역', '최근 역: 이름·로마자·날짜·노선·진행');
  ok(tile(m, 'recent').data.rows.map((r) => r.title).join() === '홍대입구,왕십리,성수,합정,망원,을지로3가,시청', '최근 찍은 역: 날짜순, 같은 날은 나중에 찍은 것이 먼저');
  ok(tile(m, 'line').data.cells.filter((c) => c.state === 'last').length === 1 && tile(m, 'line').data.label === '2호선', '노선 지도: 최근 노선, 최근 역 하나만 last');
  ok(tile(m, 'count').data.value === 7, '진행률: 도장 수');
  const old = build({ '시청': { d: '2025-12-31', l: 1 } });
  ok(tile(old, 'recent').data.rows[0].value === '2025/12/31', '올해가 아닌 날짜는 연도까지');
  ok(!/어제|오늘|일 전/.test(JSON.stringify(m)), '날이 지나면 틀려지는 말을 쓰지 않음');
}

console.log('빈 상태');
{
  const m = build({});
  ok(!!valid(m), '도장이 없어도 규격 통과');
  ok(JSON.stringify(m.tiles.map((t) => t.id)) === '["station","recent","count"]', '노선 지도는 빼고 나머지는 보냄');
  ok(tile(m, 'station').data.name === '첫 역을 찾아요' && !('roman' in tile(m, 'station').data), '최근 역: 안내 이름, 로마자 없음');
  ok(tile(m, 'recent').data.rows.length === 1 && tile(m, 'recent').data.rows[0].muted === true, '최근 찍은 역: muted 행 하나');
  ok(tile(m, 'count').data.value === 0 && !('foot' in tile(m, 'count').data), '진행률: 0, foot 없음');
  const none = build({}, { eligible: new Map() });
  ok(!('roulette' in tile(none, 'station').data) && !!valid(none), '뽑을 역이 없으면 룰렛을 뺌');
  const one = build({}, { eligible: new Map([[2, ['시청']]]) });
  ok(!('roulette' in tile(one, 'station').data), '후보가 하나뿐이면 룰렛을 뺌(최소 2개)');
  const junk = build({ '없는역': { d: '2026-11-01', l: 2 }, '시청': { d: 'bad', l: 1 } });
  ok(tile(junk, 'count').data.value === 0 && !!valid(junk), '모르는 역·틀린 날짜는 세지 않음');
}

console.log('길이 자르기와 빈 글자');
{
  /* 지어낸 노선: 12자를 넘는 역 이름, 30자를 넘는 로마자, 빈 로마자 */
  const longName = '아주아주긴이름의가상역이에요'; // 14자
  const LINES = [{ n: 'ZZ', name: '가상선', tracks: [{ s: [longName, '가', '나', '다'] }] }];
  const EN = { [longName]: 'A Very Long Imaginary Station Name For Tests', '가': '   ' };
  const m = buildBoardTiles({ stamps: { [longName]: { d: '2026-11-01', l: 'ZZ' } }, eligible: new Map([['ZZ', [longName, '가', '나', '다']]]), LINES, EN }, SAMPLE_NOW);
  const st = tile(m, 'station').data;
  ok(st.name.length === 12 && st.name.endsWith('…'), `plate.name 12자로 자름 (${st.name})`);
  ok(st.roman.length === 30, 'roman 30자로 자름');
  ok(st.roulette.candidates.every((c) => c.length <= 12) && !st.roulette.candidates.includes(longName), '12자 넘는 역은 룰렛 후보에서 뺌(자르면 Hub pool과 달라짐)');
  ok(tile(m, 'line').data.cells.every((c) => !c.name || c.name.length <= 6), '지도 칸 이름 6자 이하');
  const m2 = buildBoardTiles({ stamps: { '가': { d: '2026-11-01', l: 'ZZ' } }, eligible: new Map(), LINES, EN }, SAMPLE_NOW);
  ok(!('roman' in tile(m2, 'station').data), '공백뿐인 로마자는 필드를 뺌');
  ok(!!valid(m) && !!valid(m2) && noBlank(m) && noBlank(m2), '자른 결과도 규격 통과, 빈 글자 없음');
  ok(METRO.LINES.every((L) => L.tracks.every((t) => t.s.every((n) => n.replace(/\(.+\)$/, '').length <= 12))), '지금 역 이름은 모두 12자 이내');
}

console.log('결정성과 룰렛 후보');
{
  const a = JSON.stringify(build(SAMPLE_STATE.stamps)), b = JSON.stringify(build({ ...SAMPLE_STATE.stamps }));
  ok(a === b, '같은 입력·같은 now면 같은 출력');
  const all = eligibleFor(METRO, { stamps: {}, scope: 'all', unvisited: false, lines: Object.fromEntries(METRO.LINES.map((L) => [L.n, true])) });
  const c1 = pickCandidates(all, METRO.LINES, SAMPLE_NOW);
  const c1b = pickCandidates(all, METRO.LINES, new Date('2026-11-05T14:59:00Z'));   // 같은 KST 날짜
  const c2 = pickCandidates(all, METRO.LINES, new Date('2026-11-05T15:00:00Z'));    // KST 11/6
  ok(c1.length === 50 && new Set(c1).size === 50, '후보는 최대 50개, 중복 없음');
  ok(JSON.stringify(c1) === JSON.stringify(c1b), '같은 KST 날짜면 같은 후보');
  ok(JSON.stringify(c1) !== JSON.stringify(c2), 'KST 날짜가 바뀌면 다른 고정 후보');
  const pool = new Set([...all.values()].flat());
  ok(c1.every((c) => pool.has(c)), '후보는 모두 지금 뽑을 수 있는 역(pool)의 역 키');
  const order = [...new Set([...all.values()].flat())];
  ok(c1.every((c, i) => i === 0 || order.indexOf(c1[i - 1]) < order.indexOf(c)), '고른 뒤에는 노선 순서대로');
  const src = readFileSync(new URL('../core/boardTiles.js', import.meta.url), 'utf8');
  ok(!/Math\.random|Date\.now|localStorage|fetch\(/.test(src), '타일 함수에 무작위·시계·저장소·네트워크 없음');
  const stamped = build(SAMPLE_STATE.stamps);
  ok(tile(stamped, 'station').data.roulette.candidates.every((c) => !SAMPLE_STATE.stamps[c]), '안 간 역만 설정이면 찍은 역은 후보에 없음');
}

/* ---------- 업로드 ---------- */
function harness(opts = {}) {
  const store = new Map(Object.entries(opts.storage || {}));
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  if (opts.tokens !== false) store.set('tokens', '1');
  const h = { store, storage, clock: opts.clock || Date.parse('2026-11-05T12:00:00Z'), calls: [], timers: [], responses: opts.responses || [], stamps: opts.stamps || { ...SAMPLE_STATE.stamps }, dropped: 0, refreshed: 0, logs: [] };
  h.up = createBoardUploader({
    storage, now: () => h.clock,
    fetch: async (url, init) => {
      h.calls.push({ url, init, body: JSON.parse(init.body) });
      const r = h.responses.length ? h.responses.shift() : { status: 200, body: { generated_at: 'x' } };
      if (r.throw) throw new TypeError('network');
      return { status: r.status, ok: r.status >= 200 && r.status < 300, headers: { get: (n) => (r.headers || {})[n.toLowerCase()] || null }, text: async () => JSON.stringify(r.body || {}) };
    },
    setTimer: (fn, ms) => { h.timers.push({ fn, at: h.clock + ms }); return h.timers.length; },
    clearTimer: () => {},
    getToken: async (force) => { if (!store.has('tokens')) { const e = new Error('x'); e.kind = 'not_connected'; throw e; } if (force) h.refreshed++; return force ? 'fresh' : 'old'; },
    dropTokens: () => { store.delete('tokens'); h.dropped++; },
    build: (now) => build(h.stamps, {}, now),
    hasRecords: () => Object.keys(h.stamps).length > 0,
    connected: () => store.has('tokens') && opts.connected !== false,
    log: (...a) => h.logs.push(a.join(' ')),
  });
  /* 때가 된 타이머를 돌리고 끝날 때까지 기다려요 */
  h.tick = async (ms = 0) => {
    h.clock += ms;
    for (let guard = 0; guard < 20; guard++) {
      const due = h.timers.filter((t) => t.at <= h.clock);
      if (!due.length) break;
      h.timers = h.timers.filter((t) => t.at > h.clock);
      for (const t of due) t.fn();
      await new Promise((r) => setTimeout(r, 5));
    }
    await new Promise((r) => setTimeout(r, 5));
  };
  h.state = () => JSON.parse(store.get(BOARD_KEYS.STATE_KEY) || '{}');
  return h;
}
const MIN = 60 * 1000, DAY = 24 * 60 * MIN;

console.log('업로드 응답');
{
  const h = harness();
  h.up.onStart(); await h.tick();
  const c = h.calls[0];
  ok(h.calls.length === 1 && c.url === 'https://life-hub-api.213303.workers.dev/sub/v1/board' && c.init.method === 'PUT', '처음 열면 PUT /sub/v1/board');
  ok(c.init.headers.Authorization === 'Bearer old' && c.init.headers['Content-Type'] === 'application/json', 'Bearer 토큰과 JSON');
  ok(c.body.generated_at === new Date(h.clock).toISOString() && !!valid(c.body), '본문은 올리는 순간의 manifest, 규격 통과');
  ok(h.state().sha && h.state().at === h.clock && h.state().dirty === false, '성공하면 sha·시각을 적음');

  for (const body of [{ unchanged: true }, { ignored: true, current: {} }]) {
    const u = harness({ responses: [{ status: 200, body }] });
    u.up.onStart(); await u.tick();
    ok(!!u.state().sha && u.state().dirty === false, `${Object.keys(body)[0]}도 성공으로 적음`);
  }
}
{
  const h = harness({ responses: [{ status: 403, headers: { 'www-authenticate': 'Bearer error="insufficient_scope", scope="sub:board"' } }] });
  h.up.onStart(); await h.tick();
  ok(h.store.has('tokens') && h.dropped === 0, 'insufficient_scope: 토큰을 지우지 않음');
  ok(h.up.scopeNeeded(), 'insufficient_scope: 다시 연결 안내 표시');
  h.up.markDirty(); await h.tick(11 * MIN);
  ok(h.calls.length === 1, '권한이 없는 동안은 다시 보내지 않음');
  h.up.clearScopeNeeded(); h.up.onStart(); await h.tick();
  ok(h.calls.length === 2 && !!h.state().sha, '다시 연결하면 보냄');
}
{
  const h = harness({ responses: [{ status: 403, body: { error: 'insufficient_scope' } }] });
  h.up.onStart(); await h.tick();
  ok(h.store.has('tokens') && h.up.scopeNeeded(), '헤더를 못 읽어도 본문 error가 insufficient_scope면 토큰 유지');
}
{
  const h = harness({ responses: [{ status: 403, body: { error: 'forbidden' } }] });
  h.up.onStart(); await h.tick();
  ok(!h.store.has('tokens') && h.dropped === 1 && !h.up.scopeNeeded(), '다른 403: 기존 규칙대로 연결 해제');
}
{
  const h = harness({ responses: [{ status: 401 }, { status: 200 }] });
  h.up.onStart(); await h.tick();
  ok(h.refreshed === 1 && h.calls[1].init.headers.Authorization === 'Bearer fresh' && h.store.has('tokens') && !!h.state().sha, '401이면 토큰을 갱신해 한 번 더, 되면 성공');
  const g = harness({ responses: [{ status: 401 }, { status: 401 }] });
  g.up.onStart(); await g.tick();
  ok(!g.store.has('tokens') && g.dropped === 1, '갱신 뒤에도 401이면 연결 해제');
}
{
  const h = harness({ responses: [{ status: 400 }] });
  h.up.onStart(); await h.tick();
  ok(h.logs.length === 1 && h.store.has('tokens') && h.state().badSha && !h.state().at, '400: 콘솔에만 남기고 토큰 유지');
  h.up.markDirty(); await h.tick(11 * MIN);
  h.up.onStart(); await h.tick(11 * MIN);   // 같은 날(룰렛 후보가 날짜로 바뀌지 않게)
  ok(h.calls.length === 1, '400: 같은 내용은 다시 보내지 않음(앱을 다시 열어도)');
  h.stamps = { ...h.stamps, '신촌': { d: '2026-11-04', l: 2 } };
  h.up.markDirty(); await h.tick();
  ok(h.calls.length === 2, '내용이 바뀌면 다시 보냄');
  const big = harness({ responses: [{ status: 413 }] });
  big.up.onStart(); await big.tick();
  ok(big.logs.length === 1 && !!big.state().badSha, '413도 같은 규칙');
}
{
  const h = harness({ responses: [{ throw: true }, { status: 503 }, { status: 200 }] });
  h.up.onStart(); await h.tick();
  ok(h.calls.length === 1 && !h.state().at && h.store.has('tokens'), '네트워크 오류: 연결은 그대로, 성공으로 적지 않음');
  h.up.markDirty(); await h.tick(10 * MIN);
  ok(h.calls.length === 2 && !h.state().at, '5xx: 다음 기회에 다시(10분 뒤)');
  h.up.markDirty(); await h.tick(10 * MIN);
  ok(h.calls.length === 3 && !!h.state().at, '그다음 성공');
}

console.log('업로드 빈도');
{
  const h = harness();
  h.up.onStart(); await h.tick();
  h.stamps = { ...h.stamps, '신촌': { d: '2026-11-05', l: 2 } };
  h.up.markDirty(); await h.tick(MIN);
  ok(h.calls.length === 1 && h.state().dirty === true, '10분 안에는 보내지 않고 보낼 것 있음만 적음');
  h.stamps = { ...h.stamps, '이대': { d: '2026-11-05', l: 2 } };
  h.up.markDirty(); await h.tick(MIN);
  await h.tick(7 * MIN);
  ok(h.calls.length === 1, '10분이 차기 전에는 한 번도 안 보냄');
  await h.tick(MIN);
  ok(h.calls.length === 2 && h.calls[1].body.tiles[0].data.name === '이대' && h.state().dirty === false, '10분이 차면 최신 내용으로 한 번');
  h.up.markDirty(); await h.tick(10 * MIN);
  ok(h.calls.length === 2, 'sha가 같으면 보내지 않음');
  h.up.onStart(); await h.tick(DAY);
  ok(h.calls.length === 3, '마지막 성공이 하루보다 오래됐으면 같아도 보냄');
}
{
  /* 지난 실행에서 10분 안에 닫혀 못 보낸 것: 다음 실행에서 바로 */
  const first = harness();
  first.up.onStart(); await first.tick();
  first.stamps = { ...first.stamps, '신촌': { d: '2026-11-05', l: 2 } };
  first.up.markDirty(); await first.tick(MIN);
  ok(first.state().dirty === true && first.calls.length === 1, '앱이 닫힐 때 보낼 것 있음이 남음');
  const next = harness({ storage: Object.fromEntries(first.store), clock: first.clock + 30 * MIN, stamps: first.stamps });
  next.up.onStart(); await next.tick();
  ok(next.calls.length === 1 && next.calls[0].body.tiles[0].data.name === '신촌' && next.state().dirty === false, '다음에 열면 바로 보냄');
}
{
  const empty = harness({ stamps: {} });
  empty.up.onStart(); empty.up.markDirty(); await empty.tick(DAY);
  ok(empty.calls.length === 0, '기록이 없으면 올리지 않음(새 기기가 빈 목록으로 덮지 않게)');
  const off = harness({ storage: { [BOARD_KEYS.DEVICE_KEY]: 'off' } });
  ok(!off.up.enabled(), '기기 설정 끔이 읽힘');
  off.up.onStart(); off.up.markDirty(); await off.tick(DAY);
  ok(off.calls.length === 0, '이 기기에서 보드에 올리기가 꺼져 있으면 올리지 않음');
  off.up.setEnabled(true); await off.tick();
  ok(off.calls.length === 1 && !off.store.has(BOARD_KEYS.DEVICE_KEY), '켜면 바로 보내고 기본값(켬)으로 돌아감');
  ok(harness().up.enabled(), '기본값은 켬');
  const nc = harness({ tokens: false });
  nc.up.onStart(); nc.up.markDirty(); await nc.tick(DAY);
  ok(nc.calls.length === 0, 'Life Hub에 연결돼 있지 않으면 올리지 않음');
  /* 이 앱에는 예시·체험 모드가 없어요: 지어낸 상태는 tools/board-sample.mjs에서만 쓰고 업로드와 연결되지 않아요 */
  ok(!/sample|SAMPLE/.test(readFileSync(new URL('../core/boardUpload.js', import.meta.url), 'utf8')), '업로드 코드는 예시 데이터를 쓰지 않음');
}

console.log(failed ? `\n실패 ${failed}개` : '\n모두 통과');
process.exit(failed ? 1 : 0);
