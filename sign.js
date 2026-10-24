/* 방안1: 역명판 화면 */
(() => {
  'use strict';
  const C = window.Core;
  const { LINE, STATIONS, state } = C;
  const $ = (s) => document.querySelector(s);
  const reduced = C.reduced;

  const D = {
    sign: $('#sign'), badge: $('#badge'), num: $('#badgeNum'), ko: $('#ko'), en: $('#en'),
    prev: $('#prev'), prevName: $('#prevName'), next: $('#next'), nextName: $('#nextName'),
    xfer: $('#xfer'), draw: $('#draw'), board: $('#board'), note: $('#note'),
    live: $('#live'), unvisited: $('#unvisited'), sticker: $('#stickerSlot'),
  };

  function paintLine(n) {
    const L = n ? LINE[n] : null;
    D.sign.style.setProperty('--line', L ? L.color : '#2b3136');
    D.sign.style.setProperty('--ink-on', L ? L.ink : '#fff');
    D.num.textContent = L ? C.lineShort(L) : '';
    D.badge.classList.toggle('txt', !!L && C.isText(L));
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
  /* 영문 이름도 한 줄에 맞춰 줄여서 역명판 높이가 흔들리지 않게 해요 */
  function setEn(text) {
    D.en.textContent = text;
    D.en.style.setProperty('--e', Math.min(1, 24 / Math.max([...text].length, 1)).toFixed(3));
  }
  function setNeighbors(p, q) {
    D.prevName.textContent = p ? C.label(p) : '';
    D.nextName.textContent = q ? C.label(q) : '';
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
      b.className = 'xbadge' + (C.isText(LINE[n]) ? ' txt' : '');
      b.textContent = C.lineShort(LINE[n]);
      b.style.background = LINE[n].color;
      b.style.color = LINE[n].ink;
      b.setAttribute('aria-label', C.lineName(LINE[n]));
      D.xfer.append(b);
    });
  }
  function showStation(name, lineN, dur, track) {
    const st = STATIONS.get(name);
    const L = LINE[lineN];
    const tr = track || C.trackFor(L, name);
    const { p, q } = C.neighbors(tr, name);
    paintLine(lineN);
    setKo(st.label, dur);
    setEn(st.en);
    setNeighbors(p, q);
    setXfer(st, lineN);
  }

  let cur = null;
  let busy = false;

  async function updateSticker(fresh) {
    D.sticker.replaceChildren();
    if (!cur || busy) return;
    const name = cur.name;
    const st = state.stamps[name];
    if (!st) return;
    const wrap = document.createElement('div');
    wrap.className = 'sticker' + (fresh && !reduced ? ' fresh' : '');
    if (st.p) {
      const u = await C.photoURL(name);
      if (!u || !cur || cur.name !== name) return;
      const img = document.createElement('img');
      img.src = u;
      img.alt = C.label(name) + ' 도장';
      wrap.append(img);
    } else {
      wrap.innerHTML = C.sealSVG(name, st.l || cur.line, st.d);
    }
    if (!cur || cur.name !== name) return;
    D.sticker.replaceChildren(wrap);
  }

  function settle(res) {
    cur = { name: res.name, line: res.line };
    D.sign.dataset.state = 'settled';
    if (!reduced) {
      const wrap = D.sign.parentElement;
      wrap.classList.remove('settle');
      void wrap.offsetWidth;
      wrap.classList.add('settle');
    }
    D.live.textContent = C.lineName(LINE[res.line]) + ' ' + C.stationQuery(res.name) + '이 나왔어요.';
    C.renderInfo(D.board, cur);
    D.board.hidden = false;
    updateSticker(false);
  }

  async function onDraw() {
    if (busy) return;
    busy = true;
    C.unlockVoice();
    D.draw.disabled = true;
    D.draw.textContent = '달리는 중';
    const res = await C.draw({
      begin() {
        D.note.textContent = '';
        D.sign.dataset.state = 'rolling';
        D.board.hidden = true;
        D.sticker.replaceChildren();
        setNeighbors('', '');
        D.xfer.replaceChildren();
      },
      line(n, d) {
        paintLine(n);
        setKo(C.lineName(LINE[n]), d);
        setEn(C.lineEn(LINE[n]));
      },
      station(name, L, tr, d) { showStation(name, L.n, d, tr); },
    });
    busy = false;
    D.draw.disabled = false;
    D.draw.textContent = '다시 뽑기';
    if (!res) {
      D.note.textContent = C.pool().size
        ? '이 범위의 역은 모두 도장을 찍었어요. 아래 옵션을 끄거나 기록 > 뽑기 범위에서 노선을 더 켜 보세요.'
        : '뽑을 노선이 없어요. 기록 > 뽑기 범위에서 노선을 켜 주세요.';
      return;
    }
    settle(res);
  }

  function select(name, lineN, keepScroll) {
    if (busy) return;
    cur = { name, line: lineN };
    C.setCurrent(cur);
    D.sign.dataset.state = 'settled';
    showStation(name, lineN, 0);
    D.live.textContent = C.lineName(LINE[lineN]) + ' ' + C.stationQuery(name);
    C.renderInfo(D.board, cur);
    D.board.hidden = false;
    updateSticker(false);
    D.draw.textContent = '다시 뽑기';
    if (!keepScroll) window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }

  C.on('stamps', (e) => {
    if (cur && (e.bulk || !e.name || e.name === cur.name)) updateSticker(!!e.fresh);
  });

  C.mountDrawer({ button: $('#openRecord'), onSelect: select });
  C.bindCount($('#openRecord'));

  D.unvisited.checked = !!state.unvisited;
  D.unvisited.addEventListener('change', () => { state.unvisited = D.unvisited.checked; C.save(); D.note.textContent = ''; });
  D.draw.addEventListener('click', onDraw);
  document.addEventListener('keydown', (e) => {
    /* 창(서랍·출발역·스티커)이 열려 있으면 뒤에서 뽑기가 돌지 않게 해요 */
    if (e.code === 'Space' && !e.repeat && !document.documentElement.classList.contains('locked')
      && !e.target.closest('input, textarea, button, a, label, select, summary')) {
      e.preventDefault();
      onDraw();
    }
  });

  paintLine(0);
  setNeighbors('', '');
  const last = C.current();
  if (last) select(last.name, last.line, true);
})();
