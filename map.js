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
  };

  if (!window.L) { $('#maperr').hidden = false; D.draw.disabled = true; }
  const L_ = window.L;

  const GRAY = '#9aa1a5';
  let map = null;
  const lineLayers = {};          // n -> [polyline]
  let dotLayer = null;            // 활성 호선의 역 점
  let bigMarker = null;
  let activeLine = 0;
  let cur = null;
  let busy = false;
  const refined = {};             // 이름 -> [lat,lng]

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
      m.bindTooltip(name, { direction: 'top', className: 'tip' });
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
        '<span class="nameplate"><i>' + Ln.n + '</i>' + C.esc(name) + '</span></div>',
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
    const ll = (!hop && refined[name]) || GEO[name];
    if (!ll || !map) return;
    if (!bigMarker) bigMarker = L_.marker(ll, { keyboard: false, zIndexOffset: 1000 }).addTo(map);
    bigMarker.setLatLng(ll);
    bigMarker.setIcon(hop ? hopIcon(n) : bigIcon(name, n));
  }

  function fit(n, animate) {
    const all = [];
    LINE[n].tracks.forEach((t) => all.push(...pts(t)));
    if (all.length) map.fitBounds(L_.latLngBounds(all), { padding: [50, 50], animate: !!animate && !reduced });
  }
  function focus(name) {
    const ll = refined[name] || GEO[name];
    if (!ll) return;
    const z = 15;
    if (reduced) map.setView(ll, z);
    else map.flyTo(ll, z, { duration: 1.1 });
  }

  /* 정확한 위치 보정: 실패해도 근사 좌표로 계속 */
  async function refine(name) {
    if (refined[name] || !GEO[name]) return;
    const [la, lo] = GEO[name];
    const d = 0.012;
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ko' +
      '&viewbox=' + [lo - d, la + d, lo + d, la - d].join(',') + '&bounded=1&q=' + encodeURIComponent(C.stationQuery(name));
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch(url, { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) return;
      const j = await r.json();
      if (j && j[0]) {
        refined[name] = [parseFloat(j[0].lat), parseFloat(j[0].lon)];
        if (cur && cur.name === name && !busy) { place(name, cur.line); focus(name); }
      }
    } catch (e) { /* 근사 좌표 사용 */ }
  }

  function showPanel(name, n) {
    const Ln = LINE[n];
    const st = STATIONS.get(name);
    D.head.replaceChildren();
    const b = document.createElement('div');
    b.className = 'ph-badge';
    b.textContent = Ln.n;
    b.style.background = Ln.color;
    b.style.color = Ln.ink;
    const tx = document.createElement('div');
    const ko = document.createElement('div'); ko.className = 'ph-ko'; ko.textContent = name;
    const en = document.createElement('div'); en.className = 'ph-en'; en.textContent = st ? st.en : '';
    tx.append(ko, en);
    const x = document.createElement('div'); x.className = 'ph-x';
    (st ? st.lines : []).filter((m) => m !== n).forEach((m) => {
      const s = document.createElement('span');
      s.className = 'xbadge'; s.textContent = m;
      s.style.background = LINE[m].color; s.style.color = LINE[m].ink;
      s.setAttribute('aria-label', m + '호선 환승');
      x.append(s);
    });
    D.head.append(b, tx, x);
    C.renderInfo(D.board, { name, line: n });
    D.panel.hidden = false;
    D.panel.classList.remove('collapsed');
    D.toggle.textContent = '안내 접기';
    D.toggle.setAttribute('aria-expanded', 'true');
    D.panel.scrollTop = 0;
  }

  function settle(name, n) {
    cur = { name, line: n };
    setActive(n);
    place(name, n);
    focus(name);
    showPanel(name, n);
    D.live.textContent = n + '호선 ' + C.stationQuery(name) + '이 나왔어요.';
    refine(name);
  }

  function pick(name, n) {
    if (busy) return;
    settle(name, n);
  }

  async function onDraw() {
    if (busy || !map) return;
    busy = true;
    D.draw.disabled = true;
    D.draw.textContent = '달리는 중';
    let flashed = 0;
    const res = await C.draw({
      begin() {
        D.note.textContent = '';
        D.panel.hidden = true;
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
      D.note.textContent = '모든 역에 도장을 찍었어요. 옵션을 끄면 다시 뽑을 수 있어요.';
      return;
    }
    settle(res.name, res.line);
  }

  function init() {
    if (!L_) return;
    map = L_.map('map', { zoomControl: true, preferCanvas: false, attributionControl: true })
      .setView([37.5665, 126.978], 11);
    L_.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
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
  D.toggle.addEventListener('click', () => {
    const c = D.panel.classList.toggle('collapsed');
    D.toggle.textContent = c ? '안내 펼치기' : '안내 접기';
    D.toggle.setAttribute('aria-expanded', String(!c));
    if (map) setTimeout(() => map.invalidateSize(), 50);
  });

  init();
})();
