/* 화면 스모크 테스트: 아이폰 15 Pro 크기에서 두 화면을 열고 핵심 동작을 확인해요.
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

async function page(state, opts = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], deviceScaleFactor: 1, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('metro-stamp:v2', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, state);
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
  /* 1x1보다 큰 간단한 PNG를 만들어 올려요 */
  const png = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 80; const g = c.getContext('2d'); g.fillStyle = '#0052A4'; g.fillRect(10, 10, 100, 60); return c.toDataURL('image/png').split(',')[1]; });
  const file = join(tmpdir(), 'smoke-stamp.png');
  writeFileSync(file, Buffer.from(png, 'base64'));
  await p.setInputFiles('.shot', file);
  await p.waitForSelector('.editor', { timeout: 60000 });
  ok(await p.isDisabled('[data-mode="cut"]'), '배경 제거를 못 하면 사진 그대로만 고를 수 있음');
  await p.click('[data-act="ok"]');
  await p.waitForSelector('.sticker img', { timeout: 10000 });
  ok(await p.evaluate(() => !!window.Core.state.stamps['서울역'] && window.Core.state.stamps['서울역'].p === 1), '스티커 도장이 저장됨');
  const [card] = await Promise.all([p.waitForEvent('download'), p.click('[data-act="card"]')]);
  ok(/^metro-stamp-\d{8}\.png$/.test(card.suggestedFilename()), '도장 카드 이미지가 만들어짐');
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
  ok((await p.$$('.gallery .tile')).length === 1, '도장 갤러리에 도장 1개');
  ok((await p.$$('.rline')).length >= 9, '노선별 기록 줄이 보임');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#export')]);
  ok(/metro-stamps-.*\.json$/.test(dl.suggestedFilename()), '기록 내보내기 파일이 만들어짐');
  await p.click('#voiceTry');
  await p.keyboard.press('Escape');
  ok(!p.errors.length, '자바스크립트 오류 없음' + (p.errors.length ? ': ' + p.errors[0] : ''));
  await p.context().close();
}

await browser.close();
console.log(failed ? `\n실패 ${failed}개` : '\n모두 통과');
process.exit(failed ? 1 : 0);
