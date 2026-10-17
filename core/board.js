/* 안내판: 도장 찍기 · 가는 길 · 이 역 근처 */
(() => {
  'use strict';
  const C = window.Core;
  const {
    CURATED, $, esc, ACCESS, LINE, ORIGIN, origin, openOriginPicker, shareCard, isText, lineShort, label, ro, stationQuery, mapLinks,
    dotDate, on, state, segLabel, routesTo, stampWithFile, editSticker, stampPlain, unstamp,
  } = C;

  /* ---------- 안내판 (가는 길 · 근처 · 도장) ---------- */
  const CAM_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.6-2.4h6.8L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>';
  const TRAIN_SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 20l-2 2M15 20l2 2"/><circle cx="9" cy="14" r=".6"/><circle cx="15" cy="14" r=".6"/></svg>';

  function legsHTML(r, dest) {
    const items = [];
    if (r.entry.train) items.push(`<li class="leg"><span class="rb rb-train">${TRAIN_SVG}</span><div class="rt"><b>${esc(label(origin()))} → ${esc(label(r.entry.name))}</b><span class="sub">${esc(r.entry.train)} <a href="https://www.letskorail.com" target="_blank" rel="noopener">열차 시각 확인</a></span></div></li>`);
    r.segments.forEach((s, i) => {
      const L = LINE[s.line];
      const next = r.segments[i + 1];
      const dir = s.loopDir ? s.loopDir + ' ' + esc(label(s.via[1])) + ' 방향' : esc(label(s.via[1])) + ' 방면';
      const fork = s.branch ? ` ${esc(s.branch.at)}에서 ${esc(ro(s.branch.name))} 가는 열차인지 행선지를 확인하세요.` : '';
      items.push(`<li class="leg" style="--c:${L.color}"><span class="rb${isText(L) ? ' txt' : ''}" style="background:${L.color};color:${L.ink}">${esc(lineShort(L))}</span><div class="rt"><b>${esc(segLabel(s))} ${esc(label(s.from))}에서 ${dir}</b><span class="sub">${s.stops}정거장, ${next ? esc(label(s.to)) + '에서 ' + esc(ro(segLabel(next))) + ' 환승' : esc(label(s.to)) + '에서 내려요'}${fork}</span></div></li>`);
    });
    items.push(`<li class="leg end"><span class="rb rb-end"></span><div class="rt"><b>${esc(stationQuery(dest))} 도착</b></div></li>`);
    const wide = r.segments.some((s) => isText(LINE[s.line]));
    return `<ol class="route${wide ? ' wide' : ''}">${items.join('')}</ol>`;
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
    const itx = rs.some((r) => r.entry.train);
    return `<p class="route-sum">${esc(summary)}</p>${best.segments.length || best.entry.train ? legsHTML(best, dest) : ''}
      ${alts ? `<details class="alts"><summary>다른 경로 ${rs.length - 1}개</summary><ul>${alts}</ul></details>` : ''}
      ${itx ? '<p class="hint">정차역과 열차 시각은 바뀔 수 있어요. 타기 전에 코레일에서 확인하세요.</p>' : ''}`;
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
    /* 장소마다 가까운 출구와 도보 시간(어림)만 보여 줘요. 아직 조사 안 된 장소는 이름과 설명만 */
    const accessHTML = (p) => {
      const a = ACCESS[name + '|' + p[1]];
      if (!a) return '';
      const [exit, min] = a;
      /* 도보 0분 = 공원·궁처럼 넓은 곳: 걸리는 시간 대신 어느 출구 쪽인지만 */
      if (!min) return exit ? `<span class="pacc"><b>${esc(exit)}번 출구</b> 쪽</span>` : '';
      return `<span class="pacc">${exit ? `<b>${esc(exit)}번 출구</b>` : '<b>역에서</b>'} 도보 약 ${esc(min)}분</span>`;
    };
    const placeRows = places.map((p) => `<li class="place">
        <span class="kind ${p[0] === '맛집' ? 'food' : ''}">${esc(p[0])}</span>
        <span><span class="pname">${esc(p[1])}</span><span class="pdesc">${esc(p[2])}</span>${accessHTML(p)}</span>
      </li>`).join('');

    el.innerHTML = `
<div class="stampbar" style="--line:${L.color};--ink-on:${L.ink}">
  <button type="button" class="cam" ${busyStamp ? 'disabled' : ''}>${CAM_SVG}<span>${stamp && stamp.p ? '사진 다시 찍기' : '사진으로 도장 찍기'}</span></button>
  <input type="file" class="shot" accept="image/*" capture="environment" hidden>
  <span class="status" role="status">${stamp ? esc(dotDate(stamp.d)) + '에 다녀왔어요' : '출구나 역명판을 찍으면 스티커가 돼요'}</span>
  <span class="stampopts">
    ${!stamp ? '<button type="button" class="link-btn" data-act="plain">사진 없이 도장만</button>' : ''}
    ${stamp ? '<button type="button" class="link-btn" data-act="card">도장 카드 공유</button>' : ''}
    ${stamp ? '<button type="button" class="link-btn" data-act="clear">도장 지우기</button>' : ''}
  </span>
</div>
<div class="info-grid">
  <section class="sect">
    <h3><button type="button" class="origin-btn" aria-haspopup="dialog" aria-label="출발역 바꾸기, 지금 ${esc(label(origin()))}">${esc(label(origin()))}<span aria-hidden="true">▾</span></button>에서 ${esc(sq)}까지</h3>
    ${routeHTML(name)}
  </section>
  <section class="sect">
    <h3>이 역 근처</h3>
    ${places.length ? `<ul class="places">${placeRows}</ul>` : '<p class="empty">아직 골라 둔 장소가 없어요.</p>'}
    <p class="hint"><a href="${mapLinks(sq).kakao}" target="_blank" rel="noopener">카카오맵</a>이나 <a href="${mapLinks(sq).naver}" target="_blank" rel="noopener">네이버지도</a>에서 열면 길찾기를 바로 쓸 수 있어요.</p>
  </section>
</div>`;

    const ob = $('.origin-btn', el);
    ob.addEventListener('click', () => openOriginPicker(ob));
    const cam = $('.cam', el), shot = $('.shot', el), status = $('.status', el);
    cam.addEventListener('click', () => shot.click());
    shot.addEventListener('change', async () => {
      const f = shot.files && shot.files[0];
      shot.value = '';
      if (!f || busyStamp) return;
      busyStamp = true;
      cam.disabled = true;
      try {
        const r = await stampWithFile(name, line, f, (t) => { status.textContent = t; }, editSticker);
        busyStamp = false;
        if (r.cancelled) {
          status.textContent = '붙이지 않았어요. 다시 찍거나 고를 수 있어요';
          cam.disabled = false;
          return;
        }
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
      if (b.dataset.act === 'card') {
        b.disabled = true;
        status.textContent = '도장 카드 만드는 중…';
        try {
          const r = await shareCard(name, line);
          status.textContent = r === 'saved' ? '도장 카드를 저장했어요' : r === 'shared' ? '도장 카드를 보냈어요' : '';
        } catch (e) {
          status.textContent = '도장 카드를 만들지 못했어요';
        }
        b.disabled = false;
        return;
      }
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

  on('origin', () => { if (infoEl && infoCur) renderInfo(infoEl, infoCur); });
  on('stamps', (e) => {
    if (infoEl && infoCur && (e.bulk || !e.name || e.name === infoCur.name)) renderInfo(infoEl, infoCur);
  });

  Object.assign(C, { CAM_SVG, TRAIN_SVG, legsHTML, routeHTML, infoEl, infoCur, busyStamp, renderInfo });
})();
