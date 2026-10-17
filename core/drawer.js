/* 기록 서랍과 기록 버튼 */
(() => {
  'use strict';
  const C = window.Core;
  const {
    LINES, $, reduced, esc, lineName, isText, lineShort, label, STATIONS, today, on, emit, state, save,
    current, lineOn, inScope, activeLines, pool, photoURL, tts, unlockVoice, announce, exportJSON,
    importJSON, sealSVG,
  } = C;

  /* ---------- 기록 서랍 ---------- */
  function mountDrawer(opts) {
    const btn = opts.button;
    const scrim = document.createElement('div');
    scrim.className = 'scrim';
    scrim.hidden = true;
    const dr = document.createElement('aside');
    dr.className = 'drawer';
    dr.hidden = true;
    dr.setAttribute('role', 'dialog');
    dr.setAttribute('aria-modal', 'true');
    dr.setAttribute('aria-labelledby', 'drawerTitle');
    dr.innerHTML = `
<div class="drawer-head"><h2 id="drawerTitle">도장 기록</h2><button type="button" class="x" aria-label="닫기">닫기</button></div>
<div class="drawer-body">
  <p class="sum" id="drawerSum"></p>
  <div class="gallery" id="gallery"></div>
  <div id="record"></div>
  <section class="settings">
    <h3>설정</h3>
    <label class="switch"><input type="checkbox" id="optSound"><span class="box" aria-hidden="true"></span><span>소리</span></label>
    <label class="switch"><input type="checkbox" id="optVoice"><span class="box" aria-hidden="true"></span><span>안내방송 (기기 음성으로 흉내)</span></label>
    <button type="button" class="pill" id="voiceTry">안내방송 들어 보기</button>
  </section>
  <section class="settings">
    <h3>뽑기 범위</h3>
    <fieldset class="scope">
      <legend class="sr">뽑을 역의 지역</legend>
      <label class="radio"><input type="radio" name="scope" value="seoul"><span class="dot" aria-hidden="true"></span><span>서울</span></label>
      <label class="radio"><input type="radio" name="scope" value="all"><span class="dot" aria-hidden="true"></span><span>수도권 전체</span></label>
    </fieldset>
    <fieldset class="linepick" id="linePick">
      <legend>뽑기에 넣을 노선</legend>
    </fieldset>
    <p class="hint">끈 노선과 범위 밖 역의 도장도 지워지지 않고 남아요. 길 안내는 모든 노선으로 찾아요.</p>
  </section>
  <section class="settings">
    <h3>백업</h3>
    <p class="hint">기록은 이 브라우저에만 저장돼요. 기기를 바꾸기 전에 내보내 두세요.</p>
    <div class="backup-actions">
      <button type="button" class="pill" id="export">기록 내보내기</button>
      <button type="button" class="pill" id="import">기록 불러오기</button>
      <input type="file" id="file" accept="application/json,.json" hidden>
    </div>
    <p class="note" id="backupNote" role="status"></p>
  </section>
</div>`;
    document.body.append(scrim, dr);

    const openLines = new Set();
    let isOpen = false;

    const optSound = $('#optSound', dr), optVoice = $('#optVoice', dr);
    optSound.checked = !!state.sound;
    optVoice.checked = !!state.voice;
    optSound.addEventListener('change', () => { state.sound = optSound.checked; save(); });
    optVoice.addEventListener('change', () => {
      state.voice = optVoice.checked;
      save();
      if (!state.voice && tts) tts.cancel();
    });
    const voiceTry = $('#voiceTry', dr);
    if (!tts) voiceTry.hidden = true;
    voiceTry.addEventListener('click', () => {
      const c = current() || { name: '왕십리', line: 2 };
      const was = state.voice;
      state.voice = true;
      unlockVoice();
      announce(c.name, c.line);
      state.voice = was;
    });

    /* 뽑기 범위: 지역(서울/수도권 전체)과 노선별 켜기 */
    dr.querySelectorAll('input[name="scope"]').forEach((r) => {
      r.checked = r.value === state.scope;
      r.addEventListener('change', () => { if (r.checked) { state.scope = r.value; save(); emit('settings'); } });
    });
    const linePick = $('#linePick', dr);
    LINES.forEach((L) => {
      const lab = document.createElement('label');
      lab.className = 'switch lp';
      lab.innerHTML = `<input type="checkbox" data-line="${esc(L.n)}"><span class="box" aria-hidden="true"></span>` +
        `<span class="lbadge${isText(L) ? ' txt' : ''}" style="background:${L.color};color:${L.ink}" aria-hidden="true">${esc(lineShort(L))}</span><span>${esc(lineName(L))}</span>`;
      const cb = $('input', lab);
      cb.checked = lineOn(L);
      cb.addEventListener('change', () => { state.lines[L.n] = cb.checked; save(); emit('settings'); });
      linePick.append(lab);
    });

    async function renderGallery() {
      const box = $('#gallery', dr);
      const names = Object.keys(state.stamps).filter((n) => STATIONS.has(n));
      if (!names.length) { box.innerHTML = '<p class="empty">아직 도장이 없어요. 역을 뽑고 다녀오세요.</p>'; return; }
      names.sort((a, b) => String(state.stamps[b].d).localeCompare(String(state.stamps[a].d)));
      box.replaceChildren();
      for (const n of names) {
        const st = state.stamps[n];
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'tile';
        const u = st.p ? await photoURL(n) : null;
        tile.innerHTML = `<span class="tile-img">${u ? `<img src="${u}" alt="">` : sealSVG(n, st.l || STATIONS.get(n).lines[0], st.d)}</span><span class="tile-name">${esc(label(n))}</span>`;
        tile.addEventListener('click', () => { close(); opts.onSelect(n, st.l || STATIONS.get(n).lines[0]); });
        box.append(tile);
      }
    }

    function renderRecord() {
      const box = $('#record', dr);
      box.replaceChildren();
      activeLines().forEach((L) => {
        const all = L.all.filter(inScope);
        if (!all.length) return;
        const stamped = all.filter((n) => state.stamps[n]).length;
        const wrap = document.createElement('div');
        wrap.className = 'rline';
        wrap.style.setProperty('--c', L.color);
        wrap.style.setProperty('--k', L.ink);
        const o = openLines.has(L.n);
        wrap.innerHTML = `
          <button type="button" class="rhead" aria-expanded="${o}" aria-controls="rc${L.n}">
            <span class="rbadge${isText(L) ? ' txt' : ''}" style="background:${L.color};color:${L.ink}" aria-label="${esc(lineName(L))}">${esc(lineShort(L))}</span>
            <span class="rbar" aria-hidden="true">${all.map((n) => `<i class="${state.stamps[n] ? 'on' : ''}"></i>`).join('')}</span>
            <span class="rcnt">${stamped} / ${all.length}</span>
          </button>
          <div class="rchips" id="rc${L.n}" ${o ? '' : 'hidden'}>
            ${all.map((n) => `<button type="button" class="chip ${state.stamps[n] ? 'on' : ''}" data-n="${esc(n)}">${esc(label(n))}</button>`).join('')}
          </div>`;
        const head = $('.rhead', wrap), chipsBox = $('.rchips', wrap);
        head.addEventListener('click', () => {
          const open = chipsBox.hidden;
          chipsBox.hidden = !open;
          head.setAttribute('aria-expanded', String(open));
          if (open) openLines.add(L.n); else openLines.delete(L.n);
        });
        chipsBox.addEventListener('click', (e) => {
          const b = e.target.closest('.chip');
          if (b) { close(); opts.onSelect(b.dataset.n, L.n); }
        });
        box.append(wrap);
      });
    }

    function renderAll() {
      const p = pool();
      const done = [...p].filter((n) => state.stamps[n]).length;
      $('#drawerSum', dr).textContent = '도장 ' + done + ' / ' + p.size + '역' + (p.size ? '' : ' · 설정에서 노선을 켜 주세요');
      renderRecord();
      renderGallery();
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      renderAll();
      scrim.hidden = false;
      dr.hidden = false;
      requestAnimationFrame(() => { scrim.classList.add('on'); dr.classList.add('on'); });
      btn.setAttribute('aria-expanded', 'true');
      $('.x', dr).focus();
    }
    function close() {
      if (!isOpen) return;
      isOpen = false;
      scrim.classList.remove('on');
      dr.classList.remove('on');
      btn.setAttribute('aria-expanded', 'false');
      const done = () => { if (!isOpen) { scrim.hidden = true; dr.hidden = true; } };
      if (reduced) done(); else setTimeout(done, 260);
      btn.focus();
    }

    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', open);
    $('.x', dr).addEventListener('click', close);
    scrim.addEventListener('click', close);
    /* 열려 있는 동안 Tab은 서랍 안에서만 돌아요 */
    const FOCUSABLE = 'button:not([disabled]), a[href], input:not([hidden]):not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
    document.addEventListener('keydown', (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      const items = [...dr.querySelectorAll(FOCUSABLE)].filter((x) => x.getClientRects().length);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dr.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dr.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    });
    on('stamps', () => { if (isOpen) renderAll(); });
    on('settings', () => { if (isOpen) renderAll(); });

    $('#export', dr).addEventListener('click', async () => {
      const note = $('#backupNote', dr);
      note.textContent = '내보내는 중…';
      try {
        const blob = await exportJSON();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'metro-stamps-' + today() + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
        note.textContent = '내보냈어요. 사진도 함께 들어 있어요.';
      } catch (e) { note.textContent = '내보내지 못했어요.'; }
    });
    $('#import', dr).addEventListener('click', () => $('#file', dr).click());
    $('#file', dr).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const note = $('#backupNote', dr);
      try {
        const n = await importJSON(f);
        note.textContent = '도장 ' + n + '개를 불러왔어요. 이미 있던 도장은 그대로 뒀어요.';
      } catch (err) {
        note.textContent = '불러오지 못했어요. 이 페이지에서 내보낸 JSON 파일인지 확인해 주세요.';
      }
    });
    return { open, close };
  }

  /* 기록 버튼에 도장 수를 표시 */
  function bindCount(btn) {
    const paint = () => {
      const p = pool();
      const done = [...p].filter((n) => state.stamps[n]).length;
      btn.textContent = '기록 ' + done + ' / ' + p.size;
    };
    paint();
    on('stamps', paint);
    on('settings', paint);
  }

  Object.assign(C, { mountDrawer, bindCount });
})();
