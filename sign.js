/* 방안1: 역명판 화면 */
(() => {
  'use strict';
  const C = window.Core;
  const { LINE, STATIONS, state } = C;
  const $ = (s) => document.querySelector(s);
  const reduced = C.reduced;

  const D = {
    sign: $('#sign'), num: $('#badgeNum'), ko: $('#ko'), en: $('#en'),
    prev: $('#prev'), prevName: $('#prevName'), next: $('#next'), nextName: $('#nextName'),
    xfer: $('#xfer'), draw: $('#draw'), board: $('#board'), note: $('#note'),
    live: $('#live'), unvisited: $('#unvisited'), sticker: $('#stickerSlot'),
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
    const tr = track || C.trackFor(L, name);
    const { p, q } = C.neighbors(tr, name);
    paintLine(lineN);
    setKo(name, dur);
    D.en.textContent = st.en;
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
      img.alt = name + ' 도장';
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
      D.sign.classList.remove('settle');
      void D.sign.offsetWidth;
      D.sign.classList.add('settle');
    }
    D.live.textContent = res.line + '호선 ' + C.stationQuery(res.name) + '이 나왔어요.';
    C.renderInfo(D.board, cur);
    D.board.hidden = false;
    updateSticker(false);
  }

  async function onDraw() {
    if (busy) return;
    busy = true;
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
        setKo(n + '호선', d);
        D.en.textContent = 'Line ' + n;
      },
      station(name, L, tr, d) { showStation(name, L.n, d, tr); },
    });
    busy = false;
    D.draw.disabled = false;
    D.draw.textContent = '다시 뽑기';
    if (!res) {
      D.note.textContent = '모든 역에 도장을 찍었어요. 아래 옵션을 끄면 다시 뽑을 수 있어요.';
      return;
    }
    settle(res);
  }

  function select(name, lineN) {
    if (busy) return;
    cur = { name, line: lineN };
    D.sign.dataset.state = 'settled';
    showStation(name, lineN, 0);
    D.live.textContent = lineN + '호선 ' + C.stationQuery(name);
    C.renderInfo(D.board, cur);
    D.board.hidden = false;
    updateSticker(false);
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
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
    if (e.code === 'Space' && !e.target.closest('input, textarea, button, a, label, select, summary')) {
      e.preventDefault();
      onDraw();
    }
  });

  paintLine(0);
  setNeighbors('', '');
})();
