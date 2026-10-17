(() => {
  'use strict';

  const { LINES, EN, CURATED } = window.METRO;
  const $ = (s) => document.querySelector(s);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  const enc = encodeURIComponent;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LINE = Object.fromEntries(LINES.map((l) => [l.n, l]));

  /* ---------- 역 색인 ---------- */
  const STATIONS = new Map();
  LINES.forEach((L) => {
    L.all = [];
    L.tracks.forEach((t) => t.s.forEach((name) => {
      if (!L.all.includes(name)) L.all.push(name);
      let st = STATIONS.get(name);
      if (!st) { st = { name, lines: [], en: EN[name] || '' }; STATIONS.set(name, st); }
      if (!st.lines.includes(L.n)) st.lines.push(L.n);
    }));
  });
  STATIONS.forEach((st) => st.lines.sort((a, b) => a - b));

  const trackFor = (L, name) => L.tracks.find((t) => t.s.includes(name));
  function neighbors(track, name) {
    const s = track.s, n = s.length, i = s.indexOf(name);
    if (track.loop) return { p: s[(i - 1 + n) % n], q: s[(i + 1) % n] };
    return { p: s[i - 1] || '', q: s[i + 1] || '' };
  }
  const stationQuery = (name) => (name.endsWith('역') ? name : name + '역');

  /* ---------- 저장 ---------- */
  const KEY = 'metro-stamp:v1';
  const state = { stamps: {}, unvisited: true, sound: true, voice: false };
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* 저장소를 못 쓰는 환경 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ } };
  const today = () => new Date().toLocaleDateString('sv-SE');
  const dotDate = (d) => d.replace(/-/g, '.');

  /* ---------- 소리 ---------- */
  let actx = null;
  function audio() {
    if (!state.sound) return null;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  function tone(freq, dur, type, vol, when) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + (when || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  const tick = (i) => tone(760 + (i % 3) * 45, 0.035, 'square', 0.016, 0);
  const chime = () => { tone(784, 0.55, 'sine', 0.07, 0); tone(587.33, 0.8, 'sine', 0.07, 0.3); };
  function announce(name) {
    if (!state.voice || !('speechSynthesis' in window)) return;
    const base = name.replace(/역$/, '');
    const u = new SpeechSynthesisUtterance('이번 역은 ' + base + ', ' + stationQuery(name) + '입니다.');
    u.lang = 'ko-KR';
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  /* ---------- 역명판 ---------- */
  const D = {
    sign: $('#sign'), num: $('#badgeNum'), ko: $('#ko'), en: $('#en'),
    prev: $('#prev'), prevName: $('#prevName'), next: $('#next'), nextName: $('#nextName'),
    xfer: $('#xfer'), draw: $('#draw'), board: $('#board'), record: $('#record'),
    count: $('#count'), note: $('#note'), live: $('#live'), unvisited: $('#unvisited'),
  };

  function paintLine(n) {
    const L = n ? LINE[n] : null;
    D.sign.style.setProperty('--line', L ? L.color : '#2b3136');
    D.sign.style.setProperty('--ink-on', L ? L.ink : '#fff');
    D.num.textContent = L ? L.n : '';
  }
  function slide(node, dur) {
    if (reduced || !node.animate) return;
    node.animate(
      [{ transform: 'translateY(46%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: Math.max(60, dur), easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
  }
  function setKo(text, dur) {
    D.ko.textContent = text;
    const len = [...text].length;
    D.ko.style.setProperty('--k', Math.min(1, 4.8 / Math.max(len, 1)).toFixed(3));
    slide(D.ko, dur);
  }
  function setNeighbors(p, q) {
    D.prevName.textContent = p || '';
    D.nextName.textContent = q || '';
    D.prev.style.visibility = p ? 'visible' : 'hidden';
    D.next.style.visibility = q ? 'visible' : 'hidden';
  }
  function setXfer(st, lineN) {
    D.xfer.replaceChildren();
    const others = st ? st.lines.filter((n) => n !== lineN) : [];
    if (!others.length) return;
    const label = document.createElement('span');
    label.className = 'xlabel';
    label.textContent = '환승';
    D.xfer.append(label);
    others.forEach((n) => {
      const b = document.createElement('span');
      b.className = 'xbadge';
      b.textContent = n;
      b.style.background = LINE[n].color;
      b.style.color = LINE[n].ink;
      b.setAttribute('aria-label', n + '호선');
      D.xfer.append(b);
    });
  }
  function showStation(name, lineN, dur, track) {
    const st = STATIONS.get(name);
    const L = LINE[lineN];
    const tr = track || trackFor(L, name);
    const { p, q } = neighbors(tr, name);
    paintLine(lineN);
    setKo(name, dur);
    D.en.textContent = st.en;
    setNeighbors(p, q);
    setXfer(st, lineN);
  }

  const delay = (i, total) => 45 + 330 * Math.pow(i / total, 2.6);

  async function rollLines(target) {
    const start = 1 + Math.floor(Math.random() * 9);
    const total = 18 + ((target - start + 9) % 9);
    D.sign.dataset.state = 'rolling';
    setNeighbors('', '');
    D.xfer.replaceChildren();
    for (let i = 0; i <= total; i++) {
      const n = ((start - 1 + i) % 9) + 1;
      const d = delay(i, total);
      paintLine(n);
      setKo(n + '호선', d);
      D.en.textContent = 'Line ' + n;
      tick(i);
      await sleep(d);
    }
  }
  async function rollStations(L, name) {
    const tr = trackFor(L, name);
    const s = tr.s;
    const idx = s.indexOf(name);
    const total = 14 + Math.floor(Math.random() * 8);
    for (let i = 0; i <= total; i++) {
      const k = (((idx - (total - i)) % s.length) + s.length) % s.length;
      const d = delay(i, total);
      showStation(s[k], L.n, d, tr);
      tick(i);
      await sleep(d);
    }
  }

  /* ---------- 뽑기 ---------- */
  let cur = null;
  let busy = false;

  function eligible() {
    const m = new Map();
    LINES.forEach((L) => {
      const list = L.all.filter((n) => !state.unvisited || !state.stamps[n]);
      if (list.length) m.set(L.n, list);
    });
    return m;
  }

  async function draw() {
    if (busy) return;
    const pool = eligible();
    if (!pool.size) {
      D.note.textContent = '모든 역에 도장을 찍었어요. 아래 옵션을 끄면 다시 뽑을 수 있어요.';
      return;
    }
    busy = true;
    D.note.textContent = '';
    D.draw.disabled = true;
    D.draw.textContent = '달리는 중';
    D.board.hidden = true;
    const lineN = rand([...pool.keys()]);
    const name = rand(pool.get(lineN));
    if (reduced) {
      showStation(name, lineN, 0);
    } else {
      audio();
      await rollLines(lineN);
      await sleep(420);
      await rollStations(LINE[lineN], name);
    }
    settle(name, lineN);
    busy = false;
    D.draw.disabled = false;
    D.draw.textContent = '다시 뽑기';
  }

  function settle(name, lineN) {
    cur = { name, line: lineN };
    D.sign.dataset.state = 'settled';
    if (!reduced) {
      D.sign.classList.remove('settle');
      void D.sign.offsetWidth;
      D.sign.classList.add('settle');
    }
    chime();
    announce(name);
    D.live.textContent = lineN + '호선 ' + stationQuery(name) + '이 나왔어요.';
    renderBoard();
  }

  function select(name, lineN) {
    if (busy) return;
    cur = { name, line: lineN };
    D.sign.dataset.state = 'settled';
    showStation(name, lineN, 0);
    D.live.textContent = lineN + '호선 ' + stationQuery(name);
    renderBoard();
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  /* ---------- 도장 ---------- */
  function stampSVG(name, lineN, date) {
    const L = LINE[lineN];
    const color = L.color === '#BDB092' ? '#8f8160' : L.color;
    const chars = [...name];
    const two = chars.length > 5;
    const half = Math.ceil(chars.length / 2);
    const rows = two ? [chars.slice(0, half).join(''), chars.slice(half).join('')] : [name];
    const longest = Math.max(...rows.map((r) => [...r].length));
    const fs = Math.min(30, 108 / longest);
    const y0 = two ? 100 : 108;
    const text = rows.map((r, i) => `<text x="100" y="${y0 + i * (fs + 4)}" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="900" fill="${color}">${esc(r)}</text>`).join('');
    return `
<svg class="stamp" viewBox="0 0 200 200" role="img" aria-label="${esc(name)} 도장" font-family="Gothic A1, sans-serif">
  <defs>
    <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="2.6" result="d"/>
      <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="2" result="t2"/>
      <feColorMatrix in="t2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -7 5.4" result="holes"/>
      <feComposite in="d" in2="holes" operator="in"/>
    </filter>
    <path id="arcTop" d="M 30 100 A 70 70 0 0 1 170 100"/>
    <path id="arcBot" d="M 24 100 A 76 76 0 0 0 176 100"/>
  </defs>
  <g filter="url(#rough)" fill="none" stroke="${color}">
    <circle cx="100" cy="100" r="93" stroke-width="5"/>
    <circle cx="100" cy="100" r="84" stroke-width="1.5"/>
    <circle cx="100" cy="100" r="59" stroke-width="1.5"/>
    <text font-size="13" font-weight="800" fill="${color}" stroke="none" letter-spacing="2"><textPath href="#arcTop" startOffset="50%" text-anchor="middle">서울 지하철</textPath></text>
    <text font-size="13" font-weight="800" fill="${color}" stroke="none" letter-spacing="1"><textPath href="#arcBot" startOffset="50%" text-anchor="middle">${esc(dotDate(date))}</textPath></text>
    <circle cx="100" cy="64" r="13" fill="${color}" stroke="none"/>
    <text x="100" y="70" text-anchor="middle" font-size="16" font-weight="800" fill="#fff" stroke="none">${lineN}</text>
    ${text.replace(/<text /g, '<text stroke="none" ')}
  </g>
</svg>`;
  }
  function emptyStampSVG() {
    return `
<svg class="stamp" style="transform:none;mix-blend-mode:normal" viewBox="0 0 200 200" role="img" aria-label="아직 도장이 없어요" font-family="Gothic A1, sans-serif">
  <circle cx="100" cy="100" r="88" fill="none" stroke="#c4cbce" stroke-width="3" stroke-dasharray="3 9" stroke-linecap="round"/>
  <text x="100" y="106" text-anchor="middle" font-size="16" font-weight="600" fill="#9aa4a8">도장 자리</text>
</svg>`;
  }

  function mapLinks(q) {
    return {
      kakao: 'https://map.kakao.com/link/search/' + enc(q),
      naver: 'https://map.naver.com/p/search/' + enc(q),
    };
  }

  function renderBoard() {
    if (!cur) { D.board.hidden = true; return; }
    const { name, line } = cur;
    const L = LINE[line];
    const stamp = state.stamps[name];
    const sq = stationQuery(name);
    const sl = mapLinks(sq);
    const places = CURATED[name] || [];

    const placeRows = places.map((p) => {
      const q = p[3] || p[1];
      const ml = mapLinks(q);
      return `<li class="place">
        <span class="kind ${p[0] === '맛집' ? 'food' : ''}">${esc(p[0])}</span>
        <span><span class="pname">${esc(p[1])}</span><span class="pdesc">${esc(p[2])}</span></span>
        <span class="plinks"><a href="${ml.kakao}" target="_blank" rel="noopener">카카오맵</a><a href="${ml.naver}" target="_blank" rel="noopener">네이버지도</a></span>
      </li>`;
    }).join('');

    const search = (kw) => mapLinks(sq + ' ' + kw);
    const chips = ['맛집', '카페', '가볼 만한 곳'].map((kw) => `<a href="${search(kw).kakao}" target="_blank" rel="noopener">${esc(sq)} ${esc(kw)}</a>`).join('');

    D.board.innerHTML = `
<div class="board-grid">
  <div class="stamp-col">
    <div class="paper" id="paper">${stamp ? stampSVG(name, stamp.l || line, stamp.d) : emptyStampSVG()}</div>
    <p class="stamp-meta" id="stampMeta">${stamp ? esc(dotDate(stamp.d)) + '에 다녀왔어요' : '다녀오면 도장을 찍어요'}</p>
    <input class="memo" id="memo" type="text" maxlength="60" placeholder="한 줄 메모" aria-label="한 줄 메모">
    <button type="button" class="stamp-btn" id="stampBtn" style="--line:${L.color};--ink-on:${L.ink}">${stamp ? '메모 저장' : '도장 찍기'}</button>
    ${stamp ? '<button type="button" class="link-btn" id="unstamp">도장 지우기</button>' : ''}
  </div>
  <div class="info-col">
    <div class="sect">
      <h3>${esc(sq)}까지 가는 길</h3>
      <div class="maplinks">
        <a href="${sl.kakao}" target="_blank" rel="noopener">카카오맵에서 열기</a>
        <a href="${sl.naver}" target="_blank" rel="noopener">네이버지도에서 열기</a>
      </div>
      <p class="hint">열린 지도에서 길찾기를 누르면 내 위치에서 출발해요.</p>
    </div>
    <div class="sect">
      <h3>이 역 근처</h3>
      ${places.length ? `<ul class="places">${placeRows}</ul>` : '<p class="empty">아직 골라 둔 장소가 없어요. 지도에서 바로 찾아보세요.</p>'}
      <div class="chips" style="margin-top:${places.length ? 14 : 0}px">${chips}</div>
    </div>
  </div>
</div>`;
    D.board.hidden = false;
    const memo = $('#memo');
    memo.value = stamp ? stamp.m || '' : '';
    $('#stampBtn').addEventListener('click', () => {
      const had = !!state.stamps[name];
      state.stamps[name] = { d: had ? state.stamps[name].d : today(), m: memo.value.trim(), l: had ? state.stamps[name].l || line : line };
      save();
      renderRecord();
      renderBoard();
      if (!had) {
        const svg = $('#paper .stamp');
        if (svg && !reduced) svg.classList.add('press');
        tone(150, 0.12, 'sine', 0.12, 0);
        tone(90, 0.18, 'sine', 0.1, 0.02);
      }
    });
    const un = $('#unstamp');
    if (un) {
      let armed = false;
      un.addEventListener('click', () => {
        if (!armed) {
          armed = true;
          un.textContent = '정말 지울까요? 한 번 더 누르세요';
          setTimeout(() => { armed = false; if (un.isConnected) un.textContent = '도장 지우기'; }, 3000);
          return;
        }
        delete state.stamps[name];
        save();
        renderRecord();
        renderBoard();
      });
    }
  }

  /* ---------- 도장 기록 ---------- */
  const openLines = new Set();
  function renderRecord() {
    const done = [...STATIONS.keys()].filter((n) => state.stamps[n]).length;
    D.count.textContent = '도장 ' + done + ' / ' + STATIONS.size + '역';
    D.record.replaceChildren();
    LINES.forEach((L) => {
      const stamped = L.all.filter((n) => state.stamps[n]).length;
      const wrap = document.createElement('div');
      wrap.className = 'rline';
      wrap.style.setProperty('--c', L.color);
      wrap.style.setProperty('--k', L.ink);
      const isOpen = openLines.has(L.n);
      wrap.innerHTML = `
        <button type="button" class="rhead" aria-expanded="${isOpen}" aria-controls="rc${L.n}">
          <span class="rbadge" style="background:${L.color};color:${L.ink}">${L.n}</span>
          <span class="rname">${L.n}호선</span>
          <span class="rbar" aria-hidden="true">${L.all.map((n) => `<i class="${state.stamps[n] ? 'on' : ''}"></i>`).join('')}</span>
          <span class="rcnt">${stamped} / ${L.all.length}</span>
        </button>
        <div class="rchips" id="rc${L.n}" ${isOpen ? '' : 'hidden'}>
          ${L.all.map((n) => `<button type="button" class="chip ${state.stamps[n] ? 'on' : ''}" data-n="${esc(n)}">${esc(n)}</button>`).join('')}
        </div>`;
      const head = wrap.querySelector('.rhead');
      const chipsBox = wrap.querySelector('.rchips');
      head.addEventListener('click', () => {
        const open = chipsBox.hidden;
        chipsBox.hidden = !open;
        head.setAttribute('aria-expanded', String(open));
        if (open) openLines.add(L.n); else openLines.delete(L.n);
      });
      chipsBox.addEventListener('click', (e) => {
        const b = e.target.closest('.chip');
        if (b) select(b.dataset.n, L.n);
      });
      D.record.append(wrap);
    });
  }

  /* ---------- 백업 ---------- */
  $('#export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ version: 1, stamps: state.stamps }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'metro-stamps-' + today() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#import').addEventListener('click', () => $('#file').click());
  $('#file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || typeof data.stamps !== 'object') throw new Error('형식');
      let added = 0;
      Object.entries(data.stamps).forEach(([n, v]) => {
        if (STATIONS.has(n) && v && typeof v.d === 'string' && !state.stamps[n]) {
          state.stamps[n] = { d: v.d, m: String(v.m || '').slice(0, 60), l: v.l };
          added++;
        }
      });
      save();
      renderRecord();
      if (cur) renderBoard();
      D.note.textContent = '도장 ' + added + '개를 불러왔어요. 이미 있던 도장은 그대로 뒀어요.';
    } catch (err) {
      D.note.textContent = '불러오지 못했어요. 이 페이지에서 내보낸 JSON 파일인지 확인해 주세요.';
    }
  });

  /* ---------- 옵션 ---------- */
  function bindToggle(btn, key) {
    btn.setAttribute('aria-pressed', String(!!state[key]));
    btn.addEventListener('click', () => {
      state[key] = !state[key];
      btn.setAttribute('aria-pressed', String(state[key]));
      save();
      if (key === 'voice' && !state.voice && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    });
  }
  bindToggle($('#tSound'), 'sound');
  bindToggle($('#tVoice'), 'voice');
  D.unvisited.checked = !!state.unvisited;
  D.unvisited.addEventListener('change', () => { state.unvisited = D.unvisited.checked; save(); D.note.textContent = ''; });

  D.draw.addEventListener('click', draw);
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.target.closest('input, textarea, button, a, label, select')) {
      e.preventDefault();
      draw();
    }
  });

  paintLine(0);
  setNeighbors('', '');
  renderRecord();
})();
