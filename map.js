/* 방안2: 지도 화면 (Leaflet + CARTO 타일) */
(() => {
  'use strict';
  const C = window.Core;
  const GEO = (window.METRO && window.METRO.GEO) || {};
  const { LINE, LINES, STATIONS, state, reduced } = C;
  const $ = (s) => document.querySelector(s);
  const D = {
    draw: $('#draw'), note: $('#note'), live: $('#live'), unvisited: $('#unvisited'),
    panel: $('#panel'), head: $('#panelHead'), board: $('#board'), toggle: $('#panelToggle'),
    stage: $('.stage'), mapbox: $('.mapbox'), fold: $('#panelFold'), unfold: $('#panelUnfold'),
  };

  if (!window.L) { $('#maperr').hidden = false; D.draw.disabled = true; }
  const L_ = window.L;

  const GRAY = '#9aa1a5';
  const mobile = window.matchMedia('(max-width: 860px)');
  /* CARTO 배경 지도 키. 2026년 9월부터 키 없는 타일은 막혀요. 페이지에 그대로 보이는 공개용 키예요 */
  const CARTO_KEY = 'cb1_4n1a_1_fddc778f9d09d67236fddad6';
  let map = null;
  const lineLayers = {};          // n -> [polyline]
  let dotLayer = null;            // 활성 호선의 역 점
  let bigMarker = null;
  let activeLine = 0;
  let cur = null;
  let busy = false;

  const pts = (t) => {
    const a = t.s.filter((n) => GEO[n]).map((n) => GEO[n]);
    if (t.loop && a.length) a.push(a[0]);
    return a;
  };

  function setStyle(n, mode) {
    // mode: 'gray' | 'on' | 'flash'
    (lineLayers[n] || []).forEach((pl) => {
      if (mode === 'gray') pl.setStyle({ color: GRAY, weight: 2.5, opacity: .55 });
      else pl.setStyle({ color: LINE[n].color, weight: mode === 'on' ? 7 : 6, opacity: 1 });
      if (mode !== 'gray') pl.bringToFront();
    });
  }
  function setActive(n) {
    if (activeLine && activeLine !== n) setStyle(activeLine, 'gray');
    activeLine = n;
    if (n) setStyle(n, 'on');
    drawDots(n);
  }

  function drawDots(n) {
    if (!map) return;
    if (dotLayer) { dotLayer.remove(); dotLayer = null; }
    if (!n) return;
    dotLayer = L_.layerGroup().addTo(map);
    const seen = new Set();
    LINE[n].tracks.forEach((t) => t.s.forEach((name) => {
      if (seen.has(name) || !GEO[name]) return;
      seen.add(name);
      const visited = !!state.stamps[name];
      const m = L_.circleMarker(GEO[name], {
        radius: 5, weight: 2.5, color: LINE[n].color, fillColor: visited ? LINE[n].color : '#fff', fillOpacity: 1,
      });
      m.bindTooltip(C.label(name), { direction: 'top', className: 'tip' });
      m.on('click', () => pick(name, n));
      m.addTo(dotLayer);
    }));
  }

  function bigIcon(name, n) {
    const Ln = LINE[n];
    return L_.divIcon({
      className: '',
      iconSize: [0, 0],
      html: '<div class="big-marker" style="--c:' + Ln.color + ';--k:' + Ln.ink + '">' +
        '<span class="pulse"></span><span class="core-dot"></span>' +
        '<span class="nameplate"><i' + (C.isText(Ln) ? ' class="txt"' : '') + '>' + C.esc(C.lineShort(Ln)) + '</i>' + C.esc(C.label(name)) + '</span></div>',
    });
  }
  function hopIcon(n) {
    const Ln = LINE[n];
    return L_.divIcon({
      className: '', iconSize: [0, 0],
      html: '<div class="big-marker hop-marker" style="--c:' + Ln.color + '"><span class="core-dot"></span></div>',
    });
  }
  function place(name, n, hop) {
    const ll = GEO[name];
    if (!ll || !map) return;
    if (!bigMarker) bigMarker = L_.marker(ll, { keyboard: false, zIndexOffset: 1000 }).addTo(map);
    bigMarker.setLatLng(ll);
    bigMarker.setIcon(hop ? hopIcon(n) : bigIcon(name, n));
  }

  function fit(n, animate) {
    const all = [];
    LINE[n].tracks.forEach((t) => all.push(...pts(t)));
    if (!all.length) return;
    const pad = mobile.matches ? { paddingTopLeft: [24, 24], paddingBottomRight: [24, 24 + dockSpace()] } : { padding: [50, 50] };
    map.fitBounds(L_.latLngBounds(all), { ...pad, animate: !!animate && !reduced });
  }
  /* 모바일에선 아래 안내 시트가 지도를 덮으니, 보이는 지도 영역 가운데에 역이 오게 맞춰요 */
  const sheetCover = () => (mobile.matches && !D.panel.hidden ? D.panel.getBoundingClientRect().height : 0);
  function focus(name, instant) {
    const ll = GEO[name];
    if (!ll) return;
    const z = 15;
    const dy = sheetCover() / 2;
    const target = dy ? map.unproject(map.project(ll, z).add([0, dy]), z) : ll;
    if (reduced || instant) map.setView(target, z, { animate: false });
    else map.flyTo(target, z, { duration: 1.1 });
  }

  function showPanel(name, n) {
    const Ln = LINE[n];
    const st = STATIONS.get(name);
    D.head.replaceChildren();
    const b = document.createElement('div');
    b.className = 'ph-badge' + (C.isText(Ln) ? ' txt' : '');
    b.textContent = C.lineShort(Ln);
    b.setAttribute('aria-label', C.lineName(Ln));
    b.style.background = Ln.color;
    b.style.color = Ln.ink;
    const tx = document.createElement('div');
    const ko = document.createElement('div'); ko.className = 'ph-ko'; ko.textContent = C.label(name);
    const en = document.createElement('div'); en.className = 'ph-en'; en.textContent = st ? st.en : '';
    tx.append(ko, en);
    const x = document.createElement('div'); x.className = 'ph-x';
    (st ? st.lines : []).filter((m) => m !== n).forEach((m) => {
      const s = document.createElement('span');
      s.className = 'xbadge' + (C.isText(LINE[m]) ? ' txt' : ''); s.textContent = C.lineShort(LINE[m]);
      s.style.background = LINE[m].color; s.style.color = LINE[m].ink;
      s.setAttribute('aria-label', C.lineName(LINE[m]) + ' 환승');
      x.append(s);
    });
    D.head.append(b, tx, x, D.fold);
    C.renderInfo(D.board, { name, line: n });
    D.panel.hidden = false;
    paintFold();
    setCollapsed(mobile.matches);   // 모바일은 역 이름만 보이게 접어 두고, 누르면 펼쳐요
    D.panel.scrollTop = 0;
  }

  function settle(name, n, quiet) {
    cur = { name, line: n };
    C.setCurrent(cur);
    setActive(n);
    place(name, n);
    showPanel(name, n);
    focus(name, quiet);
    D.draw.textContent = '다시 뽑기';
    if (!quiet) D.live.textContent = C.lineName(LINE[n]) + ' ' + C.stationQuery(name) + '이 나왔어요.';
  }

  function pick(name, n) {
    if (busy) return;
    settle(name, n);
  }

  async function onDraw() {
    if (busy || !map) return;
    busy = true;
    C.unlockVoice();
    D.draw.disabled = true;
    D.draw.textContent = '달리는 중';
    let flashed = 0;
    const res = await C.draw({
      begin() {
        D.note.textContent = '';
        D.panel.hidden = true;
        paintFold();
        if (activeLine) setStyle(activeLine, 'gray');
        activeLine = 0;
        drawDots(0);
        if (bigMarker) { bigMarker.remove(); bigMarker = null; }
        map.setView([37.5665, 126.978], 11, { animate: false });
      },
      line(n) {
        if (flashed && flashed !== n) setStyle(flashed, 'gray');
        flashed = n;
        setStyle(n, 'flash');
      },
      lineLanded(Ln) {
        if (flashed && flashed !== Ln.n) setStyle(flashed, 'gray');
        flashed = 0;
        setActive(Ln.n);
        fit(Ln.n, true);
      },
      station(name, Ln) {
        if (GEO[name]) place(name, Ln.n, true);
        if (reduced) { setActive(Ln.n); }
      },
    });
    busy = false;
    D.draw.disabled = false;
    D.draw.textContent = '다시 뽑기';
    if (!res) {
      D.note.textContent = C.pool().size ? '이 범위의 역은 모두 도장을 찍었어요. 옵션을 끄거나 기록에서 노선을 더 켜 보세요.' : '뽑을 노선이 없어요. 기록 > 뽑기 범위에서 노선을 켜 주세요.';
      return;
    }
    settle(res.name, res.line);
  }

  function init() {
    if (!L_) return;
    map = L_.map('map', { zoomControl: true, preferCanvas: false, attributionControl: true })
      .setView([37.5665, 126.978], 11);
    L_.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key=' + CARTO_KEY, {
      subdomains: 'abcd', maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(map);
    LINES.forEach((Ln) => {
      lineLayers[Ln.n] = Ln.tracks.map((t) => L_.polyline(pts(t), {
        color: GRAY, weight: 2.5, opacity: .55, lineJoin: 'round', interactive: false,
      }).addTo(map));
    });
  }

  C.on('stamps', () => { if (activeLine && !busy) drawDots(activeLine); });
  C.mountDrawer({
    button: $('#openRecord'),
    onSelect(name, n) { if (!busy) settle(name, n); },
  });
  C.bindCount($('#openRecord'));

  D.unvisited.checked = !!state.unvisited;
  D.unvisited.addEventListener('change', () => { state.unvisited = D.unvisited.checked; C.save(); D.note.textContent = ''; });
  D.draw.addEventListener('click', onDraw);
  function setCollapsed(c) {
    D.panel.classList.toggle('collapsed', c);
    D.toggle.setAttribute('aria-label', c ? '안내 펼치기' : '안내 접기');
    D.toggle.setAttribute('aria-expanded', String(!c));
    if (map) {
      setTimeout(() => {
        map.invalidateSize();
        /* 시트를 펼치면 역이 시트 뒤에 숨지 않게 보이는 지도 가운데로 다시 맞춰요 */
        if (!c && cur && mobile.matches) focus(cur.name);
      }, 50);
    }
  }
  /* 큰 화면에서 안내 패널 접기·펴기. 접어 두면 지도 위 버튼으로 다시 열어요 */
  function paintFold() {
    const folded = !!state.mapFold && !mobile.matches;
    D.stage.classList.toggle('folded', folded);
    D.unfold.hidden = !folded || D.panel.hidden;
    if (cur) D.unfold.textContent = C.label(cur.name) + ' 안내 보기';
  }
  function setFold(f) {
    state.mapFold = f;
    C.save();
    paintFold();
    (f ? D.unfold : D.fold).focus();
  }
  D.fold.addEventListener('click', (e) => { e.stopPropagation(); setFold(true); });
  D.unfold.addEventListener('click', () => setFold(false));
  mobile.addEventListener('change', paintFold);
  D.toggle.addEventListener('click', () => setCollapsed(!D.panel.classList.contains('collapsed')));
  D.head.addEventListener('click', () => { if (mobile.matches) setCollapsed(!D.panel.classList.contains('collapsed')); });

  /* 도크(역 뽑기)는 모바일에서 안내 시트 바로 위에 떠요 */
  const dock = $('.dock');
  const dockSpace = () => (dock ? dock.getBoundingClientRect().height + 24 : 0) + sheetCover();
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      document.documentElement.style.setProperty('--sheet', (D.panel.hidden ? 0 : D.panel.getBoundingClientRect().height) + 'px');
    }).observe(D.panel);
  }

  init();
  /* 패널이 나타나거나 접혀서 지도 칸 크기가 바뀌면 Leaflet에 알려요 */
  if (map && window.ResizeObserver) new ResizeObserver(() => map.invalidateSize()).observe(D.mapbox);
  paintFold();
  const last = C.current();
  if (last && map) {
    settle(last.name, last.line, true);
    if (mobile.matches) setCollapsed(true);
  }
})();
