/* 출발역 고르기 창: 길 안내 제목의 출발역 이름을 누르면 열려요 */
(() => {
  'use strict';
  const C = window.Core;
  const { $, esc, ORIGIN, STATIONS, LINE, isText, lineShort, lineName, label, state, origin, setOrigin, modal } = C;

  const meters = (a, b) => {
    const r = Math.PI / 180, dl = (b[0] - a[0]) * r, dg = (b[1] - a[1]) * r;
    const x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dg / 2) ** 2;
    return Math.round(12742000 * Math.asin(Math.sqrt(x)));
  };
  const norm = (s) => String(s).replace(/\s/g, '').replace(/역$/, '');

  function badges(name) {
    const st = STATIONS.get(name);
    return (st ? st.lines : []).map((n) => {
      const L = LINE[n];
      return `<span class="lbadge${isText(L) ? ' txt' : ''}" style="background:${L.color};color:${L.ink}" title="${esc(lineName(L))}">${esc(lineShort(L))}</span>`;
    }).join('');
  }
  function option(name, note) {
    const on = name === origin();
    /* 하나만 고르는 목록이라 켜고 끄는 aria-pressed 대신, 지금 출발역에 aria-current를 달아요 */
    return `<button type="button" class="or-opt" data-n="${esc(name)}"${on ? ' aria-current="true"' : ''}>` +
      `<span class="or-name">${esc(label(name))}${note ? `<small>${esc(note)}</small>` : ''}</span><span class="or-lines">${badges(name)}</span></button>`;
  }

  function search(q) {
    const k = norm(q);
    if (!k) return [];
    const hits = [];
    STATIONS.forEach((st, name) => { const l = norm(st.label); if (l.includes(k)) hits.push([l.startsWith(k) ? 0 : 1, l.length, name]); });
    return hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, 8).map((h) => h[2]);
  }

  function openOriginPicker(opener) {
    const scrim = document.createElement('div');
    scrim.className = 'scrim on';
    scrim.style.zIndex = 2999;
    const box = document.createElement('div');
    box.className = 'editor origin-picker';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'orTitle');
    const geoOK = !!(window.METRO.GEO && navigator.geolocation);
    box.innerHTML = `
<h2 id="orTitle">출발역</h2>
<input type="search" class="or-q" id="orQ" placeholder="역 이름으로 찾기" autocomplete="off" aria-label="역 이름으로 찾기">
<div class="or-list" id="orList"></div>
${geoOK ? '<button type="button" class="or-geo" id="orGeo">지금 위치에서 가까운 역 찾기</button>' : ''}
<p class="ed-hint" id="orMsg" role="status"></p>
<div class="ed-actions"><button type="button" class="pill" data-act="close">닫기</button></div>`;
    document.body.append(scrim, box);
    const q = $('#orQ', box), list = $('#orList', box), msg = $('#orMsg', box);
    let near = null;   // [역, 거리]

    function paint() {
      const hits = search(q.value);
      if (q.value.trim()) {
        list.innerHTML = hits.length ? hits.map((n) => option(n)).join('') : '<p class="ed-hint">찾는 역이 없어요.</p>';
        return;
      }
      const seen = new Set([ORIGIN]);
      const rows = [option(ORIGIN, 'ITX-청춘 포함')];
      if (near && !seen.has(near[0])) { rows.push(option(near[0], `지금 위치에서 ${near[1]}m`)); seen.add(near[0]); }
      const cur = origin();
      if (!seen.has(cur)) { rows.push(option(cur, '지금 출발역')); seen.add(cur); }
      (state.recentOrigins || []).forEach((n) => { if (!seen.has(n) && STATIONS.has(n)) { rows.push(option(n, '최근')); seen.add(n); } });
      list.innerHTML = rows.join('');
    }
    if (opener) opener.focus();     // 닫으면 이 버튼으로 돌아와요
    const done = () => {
      release();
      scrim.remove();
      box.remove();
    };
    const release = modal(box, done);
    scrim.addEventListener('click', done);
    $('[data-act="close"]', box).addEventListener('click', done);
    q.addEventListener('input', paint);
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.or-opt');
      if (!b) return;
      setOrigin(b.dataset.n);
      done();
      /* 안내판이 새로 그려져서 원래 버튼이 없어졌으면 새 출발역 버튼으로 */
      if (opener && !opener.isConnected) { const nb = $('.origin-btn'); if (nb) nb.focus(); }
    });
    if (geoOK) {
      $('#orGeo', box).addEventListener('click', () => {
        msg.textContent = '위치를 찾는 중…';
        navigator.geolocation.getCurrentPosition((pos) => {
          const at = [pos.coords.latitude, pos.coords.longitude];
          let best = null;
          Object.entries(window.METRO.GEO).forEach(([n, g]) => { if (!STATIONS.has(n)) return; const d = meters(at, g); if (!best || d < best[1]) best = [n, d]; });
          near = best;
          msg.textContent = best ? '' : '가까운 역을 찾지 못했어요.';
          q.value = '';
          paint();
        }, () => { msg.textContent = '위치를 알 수 없어요. 위치 권한을 확인하거나 역 이름으로 찾아 주세요.'; }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
      });
    }
    paint();
    q.focus();
  }

  Object.assign(C, { openOriginPicker });
})();
