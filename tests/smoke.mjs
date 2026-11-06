/* 화면 스모크 테스트: 아이폰 15 Pro 크기(일부는 데스크톱 창)에서 두 화면을 열고 핵심 동작과 기록 보존을 확인해요.
   node tests/smoke.mjs [기본 주소]   (기본 http://localhost:8765/, 정적 서버가 떠 있어야 해요)
   playwright는 require로 불러서 NODE_PATH에 깔린 것도 써요. CHROMIUM_PATH로 브라우저 경로를 줄 수 있어요. */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const BASE = process.argv[2] || 'http://localhost:8765/';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ALL_LINES = { GJ: true, SB: true, SS: true, AR: true, GC: true, UI: true, SL: true };
const seed = (extra) => ({ stamps: {}, unvisited: true, sound: false, voice: false, scope: 'all', lines: ALL_LINES, ...extra });

let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failed++; };

/* opts.viewport: 아이폰 대신 마우스 쓰는 데스크톱 창 크기, opts.init: 시드 다음에 돌릴 스크립트 */
async function page(state, opts = {}) {
  const dev = opts.viewport ? { viewport: opts.viewport } : { ...devices['iPhone 15 Pro'], deviceScaleFactor: 1 };
  const ctx = await browser.newContext({ ...dev, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('metro-stamp:v2', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, state);
  if (opts.init) await ctx.addInitScript(opts.init);
  /* 지도 타일·배경 제거 라이브러리는 받지 않아요 (네트워크 없이도 돌게) */
  await ctx.route(/basemaps\.cartocdn\.com|background-removal|esm\.sh/, (r) => r.abort());
  const p = await ctx.newPage();
  p.errors = [];
  p.on('pageerror', (e) => p.errors.push(e.message));
  return p;
}

console.log('역명판 화면');
{
  const p = await page(seed());
  await p.goto(BASE + 'index.html');
  await p.waitForFunction(() => window.Core && window.Core.draw);
  /* 노선 룰렛이 실제로 뽑힌 노선에서 멈추는지 (노선 16개) */
  const rolls = [];
  for (let i = 0; i < 3; i++) {
    rolls.push(await p.evaluate(async () => {
      let last = null;
      const r = await window.Core.draw({ line(n) { last = n; }, station() {} });
      return String(last) === String(r.line);
    }));
  }
  ok(rolls.every(Boolean), `노선 룰렛이 뽑힌 노선에서 멈춤 (${rolls.filter(Boolean).length}/3)`);

  /* 뽑는 동안 역명판 높이가 그대로인지 */
  const heights = p.evaluate(() => new Promise((res) => {
    const s = document.querySelector('#sign'), hs = new Set();
    const id = setInterval(() => hs.add(Math.round(s.getBoundingClientRect().height)), 25);
    setTimeout(() => { clearInterval(id); res([...hs]); }, 7000);
  }));
  await p.click('#draw');
  const hs = await heights;
  ok(hs.length === 1, `뽑는 동안 역명판 높이 고정 (${hs.join(', ')}px)`);

  /* 모든 역 이름이 393px 역명판 안에 들어가는지 */
  const overflow = await p.evaluate(() => {
    const C = window.Core, bad = [];
    const badge = document.querySelector('#badge'), num = document.querySelector('#badgeNum'), ko = document.querySelector('#ko');
    const body = document.querySelector('.sign-body'), core = document.querySelector('.core'), win = document.querySelector('.ko-win');
    C.LINES.forEach((L) => L.all.forEach((name) => {
      num.textContent = C.lineShort(L);
      badge.classList.toggle('txt', C.isText(L));
      const t = C.label(name);
      ko.textContent = t;
      ko.style.setProperty('--k', Math.min(1, 4.8 / Math.max([...t].length, 1)).toFixed(3));
      const b = body.getBoundingClientRect(), c = core.getBoundingClientRect();
      if (c.right > b.right - 8 || c.left < b.left + 8 || ko.scrollWidth > win.clientWidth + 1) bad.push(t);
    }));
    return bad;
  });
  ok(!overflow.length, '모든 역 이름이 역명판 안에 들어감' + (overflow.length ? ': ' + overflow.slice(0, 5).join(', ') : ''));
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

console.log('지도 ↔ 역명판 전환');
{
  const p = await page(seed({ cur: { name: '종로3가', line: 1 } }));
  await p.goto(BASE + 'map.html');
  await p.waitForSelector('#panel:not([hidden])');
  ok((await p.textContent('.ph-ko')) === '종로3가', '지도가 저장된 역(종로3가)으로 열림');
  await p.click('.views a[href="index.html"]');
  await p.waitForSelector('#sign[data-state="settled"]');
  ok((await p.textContent('#ko')) === '종로3가', '역명판으로 넘어가도 같은 역');
  ok(/번 출구/.test(await p.textContent('#board')), '이 역 근처에 출구 안내가 보임');
  await p.click('.origin-btn');
  await p.fill('#orQ', '홍대입구');
  await p.click('.or-opt');
  ok(/^홍대입구.*에서 종로3가역까지$/.test((await p.textContent('.sect h3')).trim()), '출발역을 홍대입구로 바꾸면 길 안내 제목이 바뀜');
  ok(!/코레일/.test(await p.textContent('#board')), '남춘천이 아니면 ITX 안내가 없음');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

console.log('사진 도장 (배경 제거 없이)');
{
  const p = await page(seed({ cur: { name: '서울역', line: 1 } }));
  await p.goto(BASE + 'index.html');
  await p.waitForSelector('#board:not([hidden]) .shot', { state: 'attached' });
  /* 배경까지 칠한(투명한 곳 없는) 사진 대신 PNG */
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 80; const g = c.getContext('2d'); g.fillStyle = '#e8ecea'; g.fillRect(0, 0, 120, 80); g.fillStyle = '#0052A4'; g.fillRect(10, 10, 100, 60); return c.toDataURL('image/png').split(',')[1]; });
  const file = join(tmpdir(), 'smoke-stamp.png');
  writeFileSync(file, Buffer.from(png, 'base64'));
  await p.setInputFiles('.shot', file);
  await p.waitForSelector('.editor', { timeout: 15000 });
  ok(!(await p.isDisabled('[data-act="ok"]')), '배경 제거를 기다리지 않고 바로 붙일 수 있음');
  await p.waitForFunction(() => /지우지 못했어요/.test(document.querySelector('#edHint').textContent), null, { timeout: 60000 });
  ok(await p.isDisabled('[data-mode="cut"]'), '배경 제거를 못 하면 사진 그대로만 고를 수 있음');
  await p.click('[data-act="ok"]');
  await p.waitForSelector('.sticker img', { timeout: 10000 });
  ok(/배경은 못 지웠지만/.test(await p.textContent('.status')), '배경 제거 실패를 알려 줌');
  ok(await p.evaluate(() => !!window.Core.state.stamps['서울역'] && window.Core.state.stamps['서울역'].p === 1), '스티커 도장이 저장됨');
  const [card] = await Promise.all([p.waitForEvent('download'), p.click('[data-act="card"]')]);
  ok(/^metro-stamp-\d{8}\.png$/.test(card.suggestedFilename()), '도장 카드 이미지가 만들어짐');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

console.log('복사한 누끼 붙여넣기');
{
  const p = await page(seed({ cur: { name: '시청', line: 1 } }));
  await p.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await p.goto(BASE + 'index.html');
  await p.waitForSelector('[data-act="paste"]');
  await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 200; c.height = 200;
    const g = c.getContext('2d'); g.fillStyle = '#00A84D'; g.beginPath(); g.arc(100, 100, 70, 0, Math.PI * 2); g.fill();
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  });
  await p.click('[data-act="paste"]');
  await p.waitForSelector('.editor', { timeout: 15000 });
  ok(!(await p.isDisabled('[data-mode="cut"]')) && (await p.getAttribute('[data-mode="cut"]', 'aria-pressed')) === 'true', '투명 배경 이미지는 모델 없이 바로 누끼로 열림');
  await p.click('[data-act="ok"]');
  await p.waitForSelector('.sticker img', { timeout: 10000 });
  ok(true, '붙여넣은 누끼가 스티커로 붙음');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

console.log('오프라인');
{
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(BASE + 'index.html');
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload();                      // 서비스 워커가 이 페이지를 맡은 뒤
  await p.waitForFunction(() => !!navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await p.reload();
  await p.waitForFunction(() => window.Core && window.Core.draw, null, { timeout: 10000 });
  ok(true, '인터넷 없이 역명판 화면이 다시 열림');
  await p.goto(BASE + 'map.html');
  await p.waitForFunction(() => window.Core && document.querySelector('#draw'), null, { timeout: 10000 });
  ok(true, '인터넷 없이 지도 화면도 열림');
  ok(!errors.filter((m) => !/Leaflet|L is not defined/.test(m)).length, '자바스크립트 오류 없음' + (errors.length ? ': ' + errors[0] : ''));
  await ctx.close();
}

console.log('기록 서랍');
{
  const p = await page(seed({ stamps: { '왕십리': { d: '2026-10-17', l: 'GJ' } } }));
  await p.goto(BASE + 'index.html');
  await p.click('#openRecord');
  await p.waitForSelector('.drawer.on');
  ok((await p.$$('.book-tab')).length >= 9, '도장첩에 노선 탭이 보임');
  await p.click('.book-tab[data-line="GJ"]');
  ok((await p.$$('.slot.on')).length === 1 && (await p.textContent('.book-title')).includes('경의중앙선'), '경의중앙선 도장첩에 도장 1개');
  ok(/1 \/ \d+/.test(await p.textContent('.book-cnt')), '도장첩에 노선 진행 수가 보임');
  await p.click('[data-go="secBackup"]');
  ok(await p.waitForFunction(() => {
    const h = document.querySelector('#secBackup'), body = document.querySelector('.drawer-body').getBoundingClientRect();
    const r = h.getBoundingClientRect();
    return document.activeElement === h && r.top >= body.top && r.bottom <= body.bottom;
  }, null, { timeout: 3000 }).then(() => true, () => false), '바로가기로 백업 칸에 바로 감');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#export')]);
  ok(/metro-stamps-.*\.json$/.test(dl.suggestedFilename()), '기록 내보내기 파일이 만들어짐');
  await p.click('.slot.on');
  await p.waitForSelector('#sign[data-state="settled"]');
  ok((await p.textContent('#ko')) === '왕십리', '도장 칸을 누르면 그 역이 열림');
  await p.click('#openRecord');
  await p.waitForSelector('.drawer.on');
  await p.click('#voiceTry');
  await p.keyboard.press('Escape');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

console.log('직접 방문한 역도 하나의 도장첩에 저장');
{
  const p = await page(seed({ scope: 'seoul', lines: { ...ALL_LINES, 1: false } }));
  await p.goto(BASE + 'index.html');
  await p.click('#openRecord');
  await p.fill('#stationSearch', '신창');
  ok(await p.isVisible('.station-hit[data-n="신창"]'), '서울 범위 밖이면서 비활성화한 노선의 역도 찾을 수 있음');
  await p.click('.station-hit[data-n="신창"]');
  await p.waitForSelector('#board:not([hidden])');
  ok((await p.textContent('#ko')) === '신창', '검색한 역이 바로 열림');
  await p.click('[data-act="plain"]');
  ok(await p.evaluate(() => {
    const s = window.Core.state.stamps['신창'];
    return !!s && Object.keys(s).sort().join(',') === 'd,l';
  }), '별도 방문 유형 없이 기존 도장 저장 형식을 사용');
  await p.click('#openRecord');
  ok(/^방문한 역 1 \/ \d+역$/.test((await p.textContent('#drawerSum')).trim()), '방문 수는 뽑기 범위와 무관한 하나의 전체 집계');
  await p.fill('#stationSearch', '신창');
  ok(/도장 있음/.test(await p.textContent('.station-matches')), '직접 방문한 역도 기존 도장으로 인식');
  await p.reload();
  await p.click('#openRecord');
  ok(/^방문한 역 1 \/ \d+역$/.test((await p.textContent('#drawerSum')).trim()), '새로고침 후 직접 방문 기록을 보존');
  ok(await p.evaluate(() => {
    const C = window.Core;
    C.state.scope = 'all';
    C.state.lines[1] = true;
    const candidates = C.eligible().get(1);
    return !!candidates && !candidates.includes('신창');
  }), '도장 없는 역만 뽑기를 켜면 직접 방문한 역도 추첨에서 제외');
  ok(!p.errors.length, '직접 방문 흐름에 자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

console.log('저장 실패 알림');
{
  /* 시드를 넣은 뒤 저장이 막힌 기기 (용량 초과 등) */
  const p = await page(seed({ cur: { name: '시청', line: 1 } }), {
    init: () => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; },
  });
  await p.goto(BASE + 'index.html');
  await p.click('[data-act="plain"]');
  await p.waitForSelector('.save-warn:not([hidden])', { timeout: 5000 });
  ok(true, '저장하지 못하면 알림이 뜸');
  ok(/저장하지 못했어요/.test(await p.textContent('.status')), '안내판에도 저장 실패가 보임');
  ok(await p.evaluate(() => !!window.Core.state.stamps['시청']), '지금 화면의 도장은 그대로');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

console.log('손상된 저장값');
{
  const p = await page({ stamps: null, cur: 5, lines: 'x', recentOrigins: 'y' });
  await p.goto(BASE + 'index.html');
  await p.waitForFunction(() => window.Core && window.Core.draw);
  ok(await p.evaluate(async () => !!(await window.Core.draw({ line() {}, station() {} }))), 'stamps가 null이어도 열리고 뽑기가 됨');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();

  const q = await page(seed({ stamps: { '시청': { d: 'banana', l: 1 }, '서울역': { d: '2026-10-01', l: 'bad' } } }));
  await q.goto(BASE + 'index.html');
  await q.waitForFunction(() => window.Core && window.Core.draw);
  const st = await q.evaluate(() => ({ s: window.Core.state.stamps, z: window.Core.state.quarantine }));
  ok(!st.s['시청'] && st.z && st.z['시청'], '날짜가 틀린 도장은 따로 보관');
  ok(st.s['서울역'] && st.s['서울역'].l === 1, '노선이 틀린 도장은 그 역의 노선으로 고침');
  await q.context().close();
}

console.log('백업 검증·사진 복구');
{
  const p = await page(seed({ stamps: { '시청': { d: '2026-10-01', l: 1 } } }));
  await p.goto(BASE + 'index.html');
  await p.waitForFunction(() => window.Core && window.Core.importJSON);
  const out = await p.evaluate(async () => {
    const C = window.Core;
    const f = (o) => new File([JSON.stringify(o)], 'b.json');
    const res = {};
    for (const [k, o] of [['v999', { version: 999, stamps: {} }], ['nil', { version: 2, stamps: null }]]) {
      try { await C.importJSON(f(o)); res[k] = 'accepted'; } catch (e) { res[k] = 'rejected'; }
    }
    const c = document.createElement('canvas'); c.width = c.height = 20; c.getContext('2d').fillRect(0, 0, 20, 20);
    res.r = await C.importJSON(f({
      version: 2,
      stamps: { '종각': { d: 'banana', l: 1 }, '서울역': { d: '2026-10-02', l: 'bad' }, '시청': { d: '2026-10-01', l: 1 }, '을지로입구': { d: '2026-10-03', l: 2 } },
      photos: { '시청': c.toDataURL('image/png'), '을지로입구': 'http://example.com/a.png' },
    }));
    res.s = C.state.stamps;
    res.photo = !!(await C.DB.get('시청'));
    return res;
  });
  ok(out.v999 === 'rejected' && out.nil === 'rejected', '모르는 버전·빈 stamps는 거절');
  ok(out.r.added === 2 && out.r.invalid === 1 && !out.s['종각'], `잘못된 날짜는 건너뛰고 셈 (추가 ${out.r.added}, 잘못 ${out.r.invalid})`);
  ok(out.s['서울역'].l === 1, '노선이 틀린 백업은 그 역의 노선으로');
  ok(out.r.photos === 1 && out.s['시청'].p === 1 && out.photo, '사진이 빠진 기존 도장에 백업 사진을 채움');
  ok(out.r.photoFail === 1 && !out.s['을지로입구'].p, 'data URL이 아닌 사진은 받지 않음');

  /* 사진 하나를 못 읽으면 부분 백업이라고 알려요 */
  await p.evaluate(() => window.Core.DB.del('시청'));
  await p.click('#openRecord');
  await p.waitForSelector('.drawer.on');
  await Promise.all([p.waitForEvent('download'), p.click('#export')]);
  ok(/사진 1장 중 0장/.test(await p.textContent('#backupNote')), '사진이 빠진 백업은 부분 백업으로 안내');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

console.log('도장 순번');
{
  const p = await page(seed({ stamps: {
    '시청': { d: '2026-10-05', l: 1 }, '종각': { d: '2026-10-05', l: 1 }, '서울역': { d: '2026-10-05', l: 1 }, '동대문': { d: '2026-10-01', l: 1 },
  } }));
  await p.goto(BASE + 'index.html');
  await p.waitForFunction(() => window.Core && window.Core.stampOrder);
  const order = await p.evaluate(() => ['시청', '종각', '서울역', '동대문'].map(window.Core.stampOrder));
  ok(order.join() === '2,3,4,1', `같은 날 도장도 찍은 순서대로 번호 (${order.join(', ')})`);
  await p.context().close();
}

console.log('창 안에서만 도는 Tab');
{
  const p = await page(seed({ cur: { name: '시청', line: 1 } }), { viewport: { width: 1280, height: 900 } });
  await p.goto(BASE + 'index.html');
  await p.click('.origin-btn');
  for (let i = 0; i < 12; i++) await p.keyboard.press('Tab');
  ok(await p.evaluate(() => !!document.activeElement.closest('.origin-picker')), '출발역 창에서 Tab이 창 밖으로 나가지 않음');
  await p.keyboard.press('Escape');
  ok(await p.evaluate(() => document.activeElement.classList.contains('origin-btn')), '닫으면 출발역 버튼으로 포커스가 돌아옴');
  await p.context().close();
}

console.log('반쪽 창 지도 (960px)');
{
  const p = await page(seed(), { viewport: { width: 960, height: 1000 } });
  await p.goto(BASE + 'map.html');
  await p.waitForSelector('.leaflet-container');
  const w = () => p.evaluate(() => [document.querySelector('.stage'), document.querySelector('.mapbox'), document.querySelector('#panel')].map((x) => Math.round(x.getBoundingClientRect().width)));
  let [stage, mapW] = await w();
  ok(mapW === stage, `역을 뽑기 전엔 지도가 전체 폭 (${mapW}/${stage}px)`);
  await p.click('#openRecord');
  await p.waitForSelector('.drawer.on');
  await p.click('.slot');
  await p.waitForSelector('#panel:not([hidden])');
  let panelW;
  [stage, mapW, panelW] = await w();
  ok(panelW === 360 && mapW === stage - 360, `안내 패널 360px, 지도 ${mapW}px`);
  ok(await p.isVisible('.leaflet-control-zoom'), '확대 버튼이 보임');
  await p.click('#panelFold');
  [stage, mapW] = await w();
  ok(mapW === stage && await p.isVisible('#panelUnfold'), '안내를 접으면 지도가 전체 폭');
  await p.click('#panelUnfold');
  [stage, mapW, panelW] = await w();
  ok(panelW === 360 && await p.evaluate(() => document.activeElement.id === 'panelFold'), '다시 펴면 안내가 돌아옴');
  await p.setViewportSize({ width: 700, height: 900 });
  ok(await p.isVisible('.leaflet-control-zoom'), '좁은 마우스 창에서도 확대 버튼이 보임');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

console.log('Life Hub 제안 (네트워크는 가짜 응답)');
{
  const tokens = { access_token: 'access-synthetic', refresh_token: 'refresh-synthetic', access_expires_at: Date.now() + 3600e3 };
  const p = await page(seed({ stamps: { '왕십리': { d: '2026-10-17', l: 'GJ' } } }), {
    init: `localStorage.setItem('metro-stamp.lifehub.tokens.v1', ${JSON.stringify(JSON.stringify(tokens))});`,
  });
  const cand = (key, payload) => ({ key: 'claude:' + key, candidate: { schema_version: 1, candidate_type: 'station_visit', source: 'claude', idempotency_key: key, created_at: '2026-11-01T01:00:00Z', payload } });
  const posted = [];
  await p.context().route(/life-hub-api\.213303\.workers\.dev/, async (r) => {
    const req = r.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (req.method() === 'POST') { posted.push(JSON.parse(req.postData() || '{}')); return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{}' }); }
    return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ candidates: [
      cand('mcp-' + 'a'.repeat(40), { station: '망원역', date: '2026-10-31', note: '가상 메모' }),
      cand('mcp-' + 'b'.repeat(40), { station: '신촌', date: '2026-10-30' }),
    ] }) });
  });
  await p.goto(BASE + 'index.html');
  await p.waitForSelector('#openRecord[data-hub="2"]');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '기록 버튼에 제안 수 배지가 붙고 화면이 넘치지 않음');
  await p.click('#openRecord');
  await p.waitForSelector('.drawer.on');
  ok((await p.textContent('[data-go="secHub"]')) === 'Life Hub 2', '서랍 바로가기에 제안 수');
  await p.click('[data-go="secHub"]');
  const items = await p.$$('.hub-item');
  ok(items.length === 2, '서랍에 제안 2개');
  ok(await p.isChecked('.hub-item:first-child input[type=radio]'), '이름이 하나로 맞으면(망원역 → 망원) 미리 골라 둠');
  ok((await p.$$('.hub-item:nth-child(2) input[type=radio]:checked')).length === 0 && (await p.$$('.hub-item:nth-child(2) input[type=radio]')).length === 2, '같은 이름의 역이 둘이면(신촌) 고르게 함');
  await p.click('.hub-item:first-child [data-act="stamp"]');
  const stamp = await p.evaluate(() => JSON.parse(localStorage.getItem('metro-stamp:v2')).stamps['망원']);
  ok(stamp && stamp.d === '2026-10-31' && !stamp.p, '승인하면 제안한 날짜로 기본 도장');
  await p.waitForFunction(() => document.querySelectorAll('.hub-item').length === 1);
  ok(/망원역에 2026\.10\.31 도장/.test(await p.textContent('#lifehubBox .note')), '찍은 결과를 알려 줌');
  ok(await p.isVisible('[data-act="open"]'), '사진을 붙이러 그 역을 열 수 있음');
  ok(posted.some((b) => b.key === 'claude:mcp-' + 'a'.repeat(40) && b.entity_type === 'station_visit' && /^st_[A-Za-z0-9_-]+$/.test(b.entity_id)), '승인 결과를 Life Hub에 보냄');
  await p.click('.hub-item [data-act="reject"]');
  ok(posted.some((b) => b.key === 'claude:mcp-' + 'b'.repeat(40) && !b.entity_type), '거절을 Life Hub에 보냄');
  ok(!(await p.evaluate(() => JSON.parse(localStorage.getItem('metro-stamp:v2')).stamps['신촌'])), '거절하면 도장첩은 그대로');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

console.log('Life Hub 카드 승인 (네트워크는 가짜 응답)');
{
  const tokens = { access_token: 'access-synthetic', refresh_token: 'refresh-synthetic', access_expires_at: Date.now() + 3600e3 };
  const p = await page(seed({ stamps: {} }), {
    init: `localStorage.setItem('metro-stamp.lifehub.tokens.v1', ${JSON.stringify(JSON.stringify(tokens))});`,
  });
  const todayStr = new Date().toLocaleDateString('sv-SE');
  const item = (key, type, payload, status = 'approved') => ({ key: 'claude:' + key, status, revision: 0, final_candidate: null, needs_app_review: false,
    candidate: { schema_version: 1, candidate_type: type, source: 'claude', idempotency_key: key, created_at: '2026-11-01T0' + key.slice(-1) + ':00:00Z', payload } });
  const list = [
    item('mcp-' + 'c'.repeat(39) + '1', 'station_visit', { station: '망원역', date: '2026-10-31' }),
    item('mcp-' + 'd'.repeat(39) + '2', 'station_visit', { station: '신촌', date: '2026-10-30' }),
    item('mcp-' + 'e'.repeat(39) + '3', 'station_draw', { date: '2020-01-01', line: '1호선', station: '시청' }),
    item('mcp-' + 'f'.repeat(39) + '4', 'station_draw', { date: todayStr, line: '1호선', station: '시청' }),
  ];
  const posted = [], puts = {};
  await p.context().route(/life-hub-api\.213303\.workers\.dev/, async (r) => {
    const req = r.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (req.method() === 'PUT') { const b = JSON.parse(req.postData() || '{}'); puts[new URL(req.url()).pathname.split('/').pop()] = b; return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{}' }); }
    if (req.method() === 'POST') { const b = JSON.parse(req.postData() || '{}'); posted.push(b); return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{}' }); }
    const done = new Set(posted.map((b) => b.key));
    return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ candidates: list.filter((c) => !done.has(c.key)) }) });
  });
  await p.goto(BASE + 'index.html');
  await p.waitForFunction(() => { const s = JSON.parse(localStorage.getItem('metro-stamp:v2') || '{}'); return s.stamps && s.stamps['망원'] && s.cur; });
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('metro-stamp:v2')));
  ok(saved.stamps['망원'].d === '2026-10-31', '카드에서 승인한 방문은 역이 하나로 정해지면 바로 도장');
  ok(!saved.stamps['신촌'] && !saved.stamps['신촌(경의중앙)'], '이름이 둘로 갈리는 방문(신촌)은 찍지 않음');
  ok(saved.cur && saved.cur.name === '시청' && String(saved.cur.line) === '1', '오늘 승인한 뽑기는 지금 목표 역이 됨');
  await p.waitForFunction(() => /시청/.test(document.querySelector('#sign, .sign, main').textContent));
  ok(true, '역명판에 목표 역이 보임');
  await p.waitForFunction(() => document.querySelector('#openRecord') && document.querySelector('#openRecord').dataset.hub === '1');
  ok(posted.some((b) => b.key.endsWith('1') && b.entity_type === 'station_visit'), '도장 결과를 Life Hub에 보냄');
  ok(posted.some((b) => b.key.endsWith('4') && b.entity_type === 'station_draw' && /^cur_[A-Za-z0-9_-]+$/.test(b.entity_id)), '목표 역 결과를 Life Hub에 보냄');
  ok(posted.some((b) => b.key.endsWith('3') && !b.entity_type), '지난 날짜의 뽑기는 거절로 알림');
  ok(puts.lines && puts.lines.items.length === 16 && puts.stations && puts.stations.items.length > 600, '노선·역 목록을 공유');
  ok(puts.pool && puts.pool.items.length > 100 && !puts.pool.items.some((x) => x.label === '망원'), '뽑을 수 있는 역(안 간 역만)을 공유');
  await p.click('#openRecord');
  await p.waitForSelector('.drawer.on');
  await p.click('[data-go="secHub"]');
  ok(/Claude 카드에서 승인함/.test(await p.textContent('#lifehubBox')), '남은 제안에 카드 승인 표시');
  ok(await p.isChecked('#lifehubBox [data-act="auto"]'), '자동 반영 설정이 기본으로 켜져 있음');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

console.log('Life Hub 뽑기 가능 역: 409 뒤에 다시 보냄 (네트워크는 가짜 응답)');
{
  const tokens = { access_token: 'access-synthetic', refresh_token: 'refresh-synthetic', access_expires_at: Date.now() + 3600e3 };
  const p = await page(seed({ stamps: {} }), {
    init: `localStorage.setItem('metro-stamp.lifehub.tokens.v1', ${JSON.stringify(JSON.stringify(tokens))});`,
  });
  const pools = [];
  let poolStatus = 409;
  await p.context().route(/life-hub-api\.213303\.workers\.dev/, async (r) => {
    const req = r.request();
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (req.method() === 'PUT') {
      const kind = new URL(req.url()).pathname.split('/').pop();
      if (kind === 'pool') { pools.push(JSON.parse(req.postData() || '{}').revision); return r.fulfill({ status: poolStatus, headers: cors, contentType: 'application/json', body: '{}' }); }
      return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: '{}' });
    }
    return r.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ candidates: [] }) });
  });
  await p.goto(BASE + 'index.html');
  await p.waitForFunction(() => { const s = JSON.parse(localStorage.getItem('metro-stamp.lifehub.refs.v1') || '{}'); return s.lists === 1; });
  const first = await p.evaluate(() => JSON.parse(localStorage.getItem('metro-stamp.lifehub.refs.v1')));
  ok(pools.length === 1 && !first.poolBody, '409를 받은 뽑기 가능 역은 보낸 것으로 적지 않음');
  poolStatus = 200;
  await p.click('#openRecord');
  await p.waitForSelector('.drawer.on');
  await p.click('[data-go="secHub"]');
  await p.click('#lifehubBox [data-act="sync"]');
  await p.waitForFunction(() => !!JSON.parse(localStorage.getItem('metro-stamp.lifehub.refs.v1') || '{}').poolBody);
  ok(pools.length === 2, '다음 동기화에서 다시 보내고 저장됨');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

const HUB_CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, PUT' };
const HUB_TOKENS = `localStorage.setItem('metro-stamp.lifehub.tokens.v1', ${JSON.stringify(JSON.stringify({ access_token: 'access-synthetic', refresh_token: 'refresh-synthetic', access_expires_at: Date.now() + 3600e3 }))});`;

console.log('Life Hub 설정 섹션 규격 (네트워크는 가짜 응답)');
{
  /* 연결 전: 제안 진입점 없음, 연결 버튼은 설정의 Life Hub 섹션에만 */
  const p = await page(seed());
  await p.goto(BASE + 'index.html');
  await p.waitForFunction(() => window.Core && window.Core.mountLifeHub);
  ok((await p.$$('#openRecord[data-hub]')).length === 0 && (await p.$$('#openRecord[data-hub-alert]')).length === 0, '연결 전에는 기록 버튼에 배지·점이 없음');
  ok(await p.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Life Hub 연결').every((b) => b.closest('#lifehubBox')) &&
    document.querySelectorAll('#lifehubBox [data-act="connect"]').length === 1), '「Life Hub 연결」 버튼은 서랍의 Life Hub 섹션에만 하나');
  ok((await p.textContent('#secHub')) === 'Life Hub', '섹션 제목이 Life Hub');
  ok(!(await p.evaluate(() => /클라우드/.test(document.body.innerText + document.querySelector('.drawer').textContent))), '화면에 「클라우드」라는 말이 없음');
  await p.context().close();
}

{
  /* 연결됨 + 제안 0건: 진입점 없음, 상태 줄과 규격 버튼 */
  const p = await page(seed(), { init: HUB_TOKENS });
  await p.context().route(/life-hub-api\.213303\.workers\.dev/, (r) => r.fulfill({ status: 200, headers: HUB_CORS, contentType: 'application/json', body: JSON.stringify({ candidates: [] }) }));
  await p.goto(BASE + 'index.html');
  await p.waitForSelector('#lifehubBox .hub-status', { state: 'attached' });
  await p.waitForFunction(() => document.querySelector('#lifehubBox .hub-status').textContent.trim() === '연결됨');
  ok((await p.$$('#openRecord[data-hub]')).length === 0, '제안 0건이면 제안 진입점(배지)이 렌더되지 않음');
  const text = await p.textContent('#lifehubBox');
  ok(text.includes('지금 동기화') && text.includes('연결 해제') && text.includes('Claude에서 승인한 기록은 바로 반영'), '연결됨: 지금 동기화·연결 해제·자동 반영 체크박스');
  ok((await p.$$('#lifehubBox details')).length === 0, '제안만 받는 앱은 고급 영역이 없음');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

{
  /* 토큰이 거부되면 상태 C: 설정 진입점에 점 + 접근성 이름 */
  const p = await page(seed(), { init: HUB_TOKENS });
  await p.context().route(/life-hub-api\.213303\.workers\.dev/, (r) => r.fulfill({ status: 401, headers: HUB_CORS, contentType: 'application/json', body: '{"error":"invalid_grant"}' }));
  await p.goto(BASE + 'index.html');
  await p.waitForSelector('#openRecord[data-hub-alert]', { state: 'attached' });
  ok(/ \(확인 필요\)$/.test((await p.getAttribute('#openRecord', 'aria-label')) || ''), '확인 필요일 때 설정 진입점 접근성 이름 끝에 (확인 필요)');
  const dot = await p.evaluate(() => { const c = getComputedStyle(document.querySelector('#openRecord'), '::before'); return [c.width, c.height]; });
  ok(dot[0] === '8px' && dot[1] === '8px', '설정 진입점의 경고 점은 지름 8px');
  await p.click('#openRecord');
  await p.waitForSelector('.drawer.on');
  const box = await p.textContent('#lifehubBox');
  ok(box.includes('확인 필요') && box.includes('Life Hub 연결이 끊겼습니다. 다시 연결해 주세요. 이 기기의 기록은 그대로입니다.'), '서랍에 확인 필요 상태와 원인 문장');
  ok((await p.textContent('#lifehubBox [data-act="connect"]')) === '다시 연결', '해결 버튼은 「다시 연결」');
  await p.click('#lifehubBox [data-act="disconnect"]');
  ok((await p.$$('#openRecord[data-hub-alert]')).length === 0 && !(await p.getAttribute('#openRecord', 'aria-label')), '연결 해제하면 점과 (확인 필요)가 사라짐');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

console.log('Life Board (네트워크는 가짜 응답)');
{
  /* 보드 룰렛이 보낸 뽑기(출처 board): Claude 뽑기와 같은 승인 흐름, 출처 표시. 보드 목록 업로드는 권한 부족(403) */
  const todayStr = new Date().toLocaleDateString('sv-SE');
  const p = await page(seed({ stamps: { '왕십리': { d: '2026-10-17', l: 2 } } }), { init: HUB_TOKENS });
  const posted = [], boards = [];
  await p.context().route(/life-hub-api\.213303\.workers\.dev/, async (r) => {
    const req = r.request(), url = req.url();
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: HUB_CORS });
    if (/\/sub\/v1\/board$/.test(url)) {
      boards.push(JSON.parse(req.postData() || '{}'));
      /* 헤더를 노출하지 않는 CORS여도 본문으로 insufficient_scope를 알아봐야 해요 */
      return r.fulfill({ status: 403, headers: { ...HUB_CORS, 'www-authenticate': 'Bearer error="insufficient_scope", scope="sub:board"' }, contentType: 'application/json', body: '{"error":"insufficient_scope"}' });
    }
    if (req.method() === 'POST') { posted.push(JSON.parse(req.postData() || '{}')); return r.fulfill({ status: 200, headers: HUB_CORS, contentType: 'application/json', body: '{}' }); }
    if (req.method() === 'PUT') return r.fulfill({ status: 200, headers: HUB_CORS, contentType: 'application/json', body: '{}' });
    return r.fulfill({ status: 200, headers: HUB_CORS, contentType: 'application/json', body: JSON.stringify({ candidates: [
      { key: 'board:roulette-' + 'c'.repeat(20), candidate: { schema_version: 1, candidate_type: 'station_draw', source: 'board', idempotency_key: 'roulette-' + 'c'.repeat(20), created_at: '2026-11-05T01:00:00Z', payload: { date: todayStr, line: '1호선', station: '시청' } } },
      { key: 'board:visit-' + 'd'.repeat(20), candidate: { schema_version: 1, candidate_type: 'station_visit', source: 'board', idempotency_key: 'visit-' + 'd'.repeat(20), created_at: '2026-11-05T01:00:00Z', payload: { date: todayStr, station: '시청' } } },
    ] }) });
  });
  await p.goto(BASE + 'index.html');
  await p.waitForSelector('#openRecord[data-hub="1"]');
  ok(true, '출처 board는 station_draw만 받음(방문 제안은 버림)');
  await p.click('#openRecord');
  await p.waitForSelector('.drawer.on');
  ok(/보드 룰렛에서 뽑음/.test(await p.textContent('#lifehubBox .hub-item')), '보드 룰렛에서 뽑았다고 출처를 보여 줌');
  await p.waitForFunction(() => /보드에 올리려면/.test(document.querySelector('#lifehubBox').textContent));
  ok(boards.length >= 1 && boards[0].app === 'sub' && boards[0].tiles.some((t) => t.id === 'station'), '열면 보드 목록을 올림');
  ok(await p.evaluate(() => !!localStorage.getItem('metro-stamp.lifehub.tokens.v1')), '권한 부족(insufficient_scope)이어도 토큰을 지우지 않음');
  ok((await p.textContent('#lifehubBox .hub-status')).includes('연결됨') && (await p.$$('#lifehubBox .hub-alert [data-act="connect"]')).length === 1, '연결은 그대로, 보드용 다시 연결 안내');
  ok(await p.isChecked('#lifehubBox [data-act="board"]'), '이 기기에서 보드에 올리기: 기본 켬');
  await p.click('#lifehubBox .hub-item [data-act="go"]');
  await p.waitForFunction(() => /시청/.test(document.querySelector('#sign, .sign, main').textContent));
  ok(posted.some((b) => b.key === 'board:roulette-' + 'c'.repeat(20) && b.entity_type === 'station_draw'), '목표로 정하면 Claude 뽑기와 같이 결과를 보냄');
  await p.click('#openRecord');
  await p.waitForSelector('.drawer.on');
  await p.click('#lifehubBox label:has([data-act="board"])');
  ok(await p.evaluate(() => localStorage.getItem('metro-stamp.board.device.v1') === 'off'), '스위치를 끄면 이 기기 설정으로 저장');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

await browser.close();
console.log(failed ? `\n실패 ${failed}개` : '\n모두 통과');
process.exit(failed ? 1 : 0);
