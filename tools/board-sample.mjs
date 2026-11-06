/* 보드 목록 예시 출력(board/sample.json)을 지어낸 상태로 만들어요. 실제 기록·개인 데이터·토큰은 쓰지 않아요.
   node tools/board-sample.mjs           # board/sample.json을 다시 써요
   node tools/board-sample.mjs --check   # 파일이 지금 코드의 결과와 같은지만 확인(다르면 실패) */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** data.js를 브라우저 없이 읽어요 (window.METRO) */
let metro = null;
export function loadMetro() {
  if (metro) return metro;
  const prev = globalThis.window;
  globalThis.window = {};
  try { require(join(ROOT, 'data.js')); metro = globalThis.window.METRO; return metro; } finally { globalThis.window = prev; }
}
export const { buildBoardTiles, pickCandidates } = require(join(ROOT, 'core/boardTiles.js'));

/** draw.js의 eligible()과 같은 기준: 켜진 노선(pick !== false 또는 설정) × 범위 × 안 간 역만 */
export function eligibleFor(METRO, state) {
  const REGION = METRO.REGION || {};
  const m = new Map();
  METRO.LINES.forEach((L) => {
    const on = L.n in (state.lines || {}) ? !!state.lines[L.n] : L.pick !== false;
    if (!on) return;
    const all = [];
    L.tracks.forEach((t) => t.s.forEach((n) => { if (!all.includes(n)) all.push(n); }));
    const list = all.filter((n) => (state.scope === 'all' || !REGION[n]) && (!state.unvisited || !state.stamps[n]));
    if (list.length) m.set(L.n, list);
  });
  return m;
}

/* 지어낸 상태: 몇 개의 도장(날짜도 지어냄), 서울 범위, 안 간 역만 */
export const SAMPLE_STATE = {
  stamps: {
    '시청': { d: '2026-09-20', l: 1 },
    '을지로3가': { d: '2026-10-04', l: 2 },
    '망원': { d: '2026-10-11', l: 6 },
    '합정': { d: '2026-10-11', l: 2 },
    '성수': { d: '2026-10-25', l: 2 },
    '왕십리': { d: '2026-11-01', l: 2 },
    '홍대입구': { d: '2026-11-02', l: 2 },
  },
  scope: 'seoul', unvisited: true, lines: {},
};
export const SAMPLE_NOW = new Date('2026-11-05T12:00:00Z');

export function sampleManifest() {
  const METRO = loadMetro();
  return buildBoardTiles({ stamps: SAMPLE_STATE.stamps, eligible: eligibleFor(METRO, SAMPLE_STATE), LINES: METRO.LINES, EN: METRO.EN }, SAMPLE_NOW);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = join(ROOT, 'board/sample.json');
  const text = JSON.stringify(sampleManifest(), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    let old = '';
    try { old = readFileSync(file, 'utf8'); } catch (e) { /* 없음 */ }
    if (old !== text) { console.error('board/sample.json이 지금 코드의 결과와 달라요. node tools/board-sample.mjs 로 다시 만들어 주세요.'); process.exit(1); }
    console.log('board/sample.json 최신');
  } else {
    mkdirSync(join(ROOT, 'board'), { recursive: true });
    writeFileSync(file, text);
    console.log('board/sample.json을 썼어요 (' + Buffer.byteLength(text) + ' bytes)');
  }
}
