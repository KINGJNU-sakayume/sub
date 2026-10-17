/* 기록 서랍과 기록 버튼 */
(() => {
  'use strict';
  const C = window.Core;
  const {
    LINES, $, reduced, esc, lineName, isText, lineShort, label, STATIONS, today, on, emit, state, save,
    current, lineOn, inScope, activeLines, pool, photoURL, tts, unlockVoice, announce, exportJSON,
    importJSON, sealSVG, voiceName, dotDate,
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
  <div class="book" id="book"></div>
  <section class="settings">
    <h3>설정</h3>
    <label class="switch"><input type="checkbox" id="optSound"><span class="box" aria-hidden="true"></span><span>소리</span></label>
    <label class="switch"><input type="checkbox" id="optVoice"><span class="box" aria-hidden="true"></span><span>안내방송</span></label>
    <p class="hint" id="voiceInfo"></p>
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
    /* 지금 쓰는 음성과, 더 자연스러운 음성을 받는 방법 */
    const voiceInfo = $('#voiceInfo', dr);
    const paintVoice = () => {
      const n = tts ? voiceName() : '';
      if (!tts) { voiceInfo.textContent = '이 브라우저는 음성 안내를 지원하지 않아요.'; return; }
      voiceInfo.textContent = /premium|enhanced|프리미엄|향상/i.test(n)
        ? `지금 음성: ${n}. 향상된 음성을 쓰고 있어요.`
        : `지금 음성: ${n || '기본'}. 아이폰 설정 › 손쉬운 사용 › 읽기 및 말하기 › 음성 › 한국어에서 '유나'의 향상된 음성을 내려받으면 훨씬 자연스러워요.`;
    };
    if (tts && tts.addEventListener) tts.addEventListener('voiceschanged', paintVoice);
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

    /* 도장첩: 노선을 고르면 그 노선의 역마다 도장 칸이 있고, 다녀온 역은 스티커나 도장으로 채워져요 */
    let bookTurn = 0;
    function renderBook() {
      const box = $('#book', dr);
      const lines = activeLines().filter((L) => L.all.some(inScope));
      if (!lines.length) { box.innerHTML = ''; return; }
      const cur = current();
      const pickN = [state.bookLine, cur && cur.line].find((n) => lines.some((L) => String(L.n) === String(n)));
      const L = lines.find((x) => String(x.n) === String(pickN)) || lines[0];
      const all = L.all.filter(inScope);
      const count = (x) => x.all.filter((n) => inScope(n) && state.stamps[n]).length;
      const tabs = lines.map((x) => {
        const total = x.all.filter(inScope).length;
        return `<button type="button" class="book-tab" data-line="${esc(x.n)}" aria-pressed="${x === L}" aria-label="${esc(lineName(x))}, 도장 ${count(x)} / ${total}">` +
          `<span class="rbadge${isText(x) ? ' txt' : ''}" style="background:${x.color};color:${x.ink}">${esc(lineShort(x))}</span><small>${count(x)}/${total}</small></button>`;
      }).join('');
      const slots = all.map((n) => {
        const st = state.stamps[n];
        const inner = st ? (st.p ? '' : sealSVG(n, L.n, st.d)) : '';
        return `<button type="button" class="slot${st ? ' on' : ''}" data-n="${esc(n)}" aria-label="${esc(label(n))}${st ? ', ' + esc(dotDate(st.d)) + ' 도장' : ', 아직 안 감'}">` +
          `<span class="slot-ring" aria-hidden="true">${inner}</span><span class="slot-name">${esc(label(n))}</span></button>`;
      }).join('');
      box.innerHTML = `<div class="book-tabs" role="group" aria-label="노선 고르기">${tabs}</div>
        <section class="book-page" data-line="${esc(L.n)}" style="--c:${L.color};--k:${L.ink}">
          <h3 class="book-title"><span class="rbadge${isText(L) ? ' txt' : ''}" style="background:${L.color};color:${L.ink}">${esc(lineShort(L))}</span>${esc(lineName(L))} 도장첩<span class="book-cnt">${count(L)} / ${all.length}</span></h3>
          ${count(L) ? '' : '<p class="book-empty">이 노선은 아직 도장이 없어요. 역을 뽑고 다녀와서 도장을 찍으면 여기에 모여요.</p>'}
          <div class="book-grid">${slots}</div>
        </section>`;
      const on = $('.book-tab[aria-pressed="true"]', box);
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
      /* 사진 스티커는 저장소에서 꺼내 와서 채워요 */
      const my = ++bookTurn;
      all.filter((n) => state.stamps[n] && state.stamps[n].p).forEach(async (n) => {
        const u = await photoURL(n);
        if (my !== bookTurn || !u) return;
        const ring = box.querySelector(`.slot[data-n="${CSS.escape(n)}"] .slot-ring`);
        if (ring) ring.innerHTML = `<img src="${u}" alt="">`;
      });
    }
    dr.addEventListener('click', (e) => {
      const tab = e.target.closest('.book-tab');
      if (tab) { state.bookLine = tab.dataset.line; save(); renderBook(); return; }
      const slot = e.target.closest('.slot');
      if (slot) {
        /* 지금 보고 있는 노선으로 그 역을 열어요 */
        const page = LINES.find((x) => String(x.n) === $('.book-page', dr).dataset.line);
        close();
        opts.onSelect(slot.dataset.n, page.n);
      }
    });

    function renderAll() {
      const p = pool();
      const done = [...p].filter((n) => state.stamps[n]).length;
      $('#drawerSum', dr).textContent = '도장 ' + done + ' / ' + p.size + '역' + (p.size ? '' : ' · 설정에서 노선을 켜 주세요');
      renderBook();
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      renderAll();
      paintVoice();
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
