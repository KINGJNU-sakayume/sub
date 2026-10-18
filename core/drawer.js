/* 기록 서랍과 기록 버튼 */
(() => {
  'use strict';
  const C = window.Core;
  const {
    LINES, $, reduced, esc, lineName, isText, lineShort, label, STATIONS, today, on, emit, state, save,
    current, lineOn, LINE, photoURL, tts, unlockVoice, announce, exportJSON,
    importJSON, sealSVG, voiceName, dotDate, modal,
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
<nav class="drawer-nav" aria-label="기록 바로가기">
  <button type="button" data-go="secBook">도장첩</button><button type="button" data-go="secSound">소리</button><button type="button" data-go="secScope">뽑기 범위</button><button type="button" data-go="secBackup">백업</button>
</nav>
<div class="drawer-body">
  <h3 class="sr" id="secBook" tabindex="-1">도장첩</h3>
  <p class="sum" id="drawerSum"></p>
  <div class="station-search">
    <label for="stationSearch">역 직접 찾기</label>
    <input id="stationSearch" type="search" placeholder="역 이름 검색" autocomplete="off" spellcheck="false" aria-controls="stationMatches">
    <div class="station-matches" id="stationMatches" role="region" aria-label="역 검색 결과" hidden></div>
  </div>
  <div class="book" id="book"></div>
  <section class="settings">
    <h3 id="secSound" tabindex="-1">설정</h3>
    <label class="switch"><input type="checkbox" id="optSound"><span class="box" aria-hidden="true"></span><span>소리</span></label>
    <label class="switch"><input type="checkbox" id="optVoice"><span class="box" aria-hidden="true"></span><span>안내방송</span></label>
    <p class="hint" id="voiceInfo"></p>
    <button type="button" class="pill" id="voiceTry">안내방송 들어 보기</button>
  </section>
  <section class="settings">
    <h3 id="secScope" tabindex="-1">뽑기 범위</h3>
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
    <h3 id="secBackup" tabindex="-1">백업</h3>
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
    let release = null;

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
      const lines = LINES; // 도장첩은 뽑기 범위와 별개로 모든 역을 보여 줘요.
      if (!lines.length) { box.innerHTML = ''; return; }
      const cur = current();
      const pickN = [state.bookLine, cur && cur.line].find((n) => lines.some((L) => String(L.n) === String(n)));
      const L = lines.find((x) => String(x.n) === String(pickN)) || lines[0];
      const all = L.all;
      const count = (x) => x.all.filter((n) => state.stamps[n]).length;
      const tabs = lines.map((x) => {
        const total = x.all.length;
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
          ${count(L) ? '' : '<p class="book-empty">이 노선은 아직 도장이 없어요. 뽑기로 떠나거나 다녀온 역을 찾아 스티커를 붙여 보세요.</p>'}
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
    /* 역 직접 찾기: 추첨 범위·활성 노선과 무관하게 같은 도장첩으로 연결해요. */
    const stationSearch = $('#stationSearch', dr);
    const stationMatches = $('#stationMatches', dr);
    function renderStationMatches() {
      const q = stationSearch.value.trim().toLocaleLowerCase();
      $('#book', dr).hidden = !!q;
      stationMatches.hidden = !q;
      if (!q) { stationMatches.replaceChildren(); return; }

      const found = [...STATIONS.values()].filter((st) =>
        st.label.toLocaleLowerCase().includes(q) || st.en.toLocaleLowerCase().includes(q));
      found.sort((a, b) => {
        const ap = a.label.toLocaleLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.label.toLocaleLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp || a.label.localeCompare(b.label, 'ko');
      });
      const hits = found.slice(0, 12).map((st) => {
        const L = LINE[st.lines[0]];
        const stamped = !!state.stamps[st.name];
        return `<button type="button" class="station-hit" data-n="${esc(st.name)}" data-line="${esc(L.n)}">
          <span class="lbadge${isText(L) ? ' txt' : ''}" style="background:${L.color};color:${L.ink}" aria-hidden="true">${esc(lineShort(L))}</span>
          <span class="station-hit-name">${esc(st.label)}</span>
          ${stamped ? '<small>도장 있음</small>' : ''}
        </button>`;
      }).join('');
      stationMatches.innerHTML = `<p class="station-match-count">${found.length ? found.length + '개 역 찾음' + (found.length > 12 ? ' · 먼저 12개 표시' : '') : '일치하는 역이 없어요.'}</p>${hits}`;
    }
    stationSearch.addEventListener('input', renderStationMatches);
    stationMatches.addEventListener('click', (e) => {
      const hit = e.target.closest('.station-hit');
      if (!hit) return;
      const name = hit.dataset.n;
      const st = STATIONS.get(name);
      if (!st) return;
      const line = st.lines.find((n) => String(n) === hit.dataset.line);
      if (line === undefined) return;
      close();
      opts.onSelect(name, line);
    });

    /* 바로가기: 긴 도장첩을 지나지 않고 설정·백업으로 */
    $('.drawer-nav', dr).addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      if (!go) return;
      const h = $('#' + go.dataset.go, dr), body = $('.drawer-body', dr);
      const top = go.dataset.go === 'secBook' ? 0 : h.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 14;
      body.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
      h.focus({ preventScroll: true });
    });
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
      const done = [...STATIONS.keys()].filter((n) => state.stamps[n]).length;
      $('#drawerSum', dr).textContent = '방문한 역 ' + done + ' / ' + STATIONS.size + '역';
      renderBook();
      renderStationMatches();
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      stationSearch.value = '';
      renderAll();
      paintVoice();
      scrim.hidden = false;
      dr.hidden = false;
      requestAnimationFrame(() => { scrim.classList.add('on'); dr.classList.add('on'); });
      btn.setAttribute('aria-expanded', 'true');
      release = modal(dr, close);
      $('.drawer-body', dr).scrollTop = 0;
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
      if (release) release();
      release = null;
      btn.focus();
    }

    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', open);
    $('.x', dr).addEventListener('click', close);
    scrim.addEventListener('click', close);
    on('stamps', () => { if (isOpen) renderAll(); });
    on('settings', () => { if (isOpen) renderAll(); });

    $('#export', dr).addEventListener('click', async () => {
      const note = $('#backupNote', dr);
      note.textContent = '내보내는 중…';
      try {
        const r = await exportJSON();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(r.blob);
        a.download = 'metro-stamps-' + today() + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
        /* 사진을 다 못 담았으면 부분 백업이라고 분명히 알려요 */
        if (r.missing.length) {
          const names = r.missing.slice(0, 3).map(label).join(', ') + (r.missing.length > 3 ? ` 외 ${r.missing.length - 3}곳` : '');
          note.textContent = `일부만 내보냈어요. 사진 ${r.total}장 중 ${r.included}장만 들어 있어요 (빠진 역: ${names}). 다시 내보내 보세요.`;
        } else {
          note.textContent = r.total ? `내보냈어요. 사진 ${r.total}장도 함께 들어 있어요.` : '내보냈어요.';
        }
      } catch (e) { note.textContent = '내보내지 못했어요.'; }
    });
    $('#import', dr).addEventListener('click', () => $('#file', dr).click());
    $('#file', dr).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const note = $('#backupNote', dr);
      try {
        const r = await importJSON(f);
        const parts = [`도장 ${r.added}개를 불러왔어요`];
        if (r.photos) parts.push(`있던 도장에 사진 ${r.photos}장을 채웠어요`);
        if (r.skipped) parts.push(`${r.skipped}개는 이미 있거나 없는 역이라 그대로 뒀어요`);
        if (r.photoFail) parts.push(`사진 ${r.photoFail}장은 읽지 못했어요`);
        if (r.invalid) parts.push(`날짜가 잘못된 ${r.invalid}개는 건너뛰었어요`);
        if (!r.saved) parts.push('하지만 기기에 저장하지 못했어요');
        note.textContent = parts.join('. ') + '.';
      } catch (err) {
        note.textContent = '불러오지 못했어요. 이 페이지에서 내보낸 JSON 파일인지 확인해 주세요.';
      }
    });
    return { open, close };
  }

  /* 기록 버튼에 도장 수를 표시 */
  function bindCount(btn) {
    const paint = () => {
      const done = [...STATIONS.keys()].filter((n) => state.stamps[n]).length;
      btn.textContent = '기록 ' + done + ' / ' + STATIONS.size;
    };
    paint();
    on('stamps', paint);
    on('settings', paint);
  }

  Object.assign(C, { mountDrawer, bindCount });
})();
