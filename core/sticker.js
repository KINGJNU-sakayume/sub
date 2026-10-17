/* 사진 → 스티커 도장, 스티커 다듬기 창 */
(() => {
  'use strict';
  const C = window.Core;
  const {
    $, today, emit, state, save, modal, DB, dropURL, thud,
  } = C;

  /* ---------- 사진 → 스티커 도장 ---------- */
  async function fileToCanvas(file, maxSide) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bmp.width * s));
    c.height = Math.max(1, Math.round(bmp.height * s));
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return c;
  }
  const toBlob = (c, type) => new Promise((res) => c.toBlob(res, type || 'image/png'));

  function trimCanvas(src) {
    const w = src.width, h = src.height;
    const d = src.getContext('2d').getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 16) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return src;
    const c = document.createElement('canvas');
    c.width = x1 - x0 + 1;
    c.height = y1 - y0 + 1;
    c.getContext('2d').drawImage(src, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
    return c;
  }

  /* 오려낸 이미지에 흰 테두리를 둘러 스티커처럼 만들어요 */
  function stickerFromCutout(cut) {
    const trimmed = trimCanvas(cut);
    const maxSide = 600;
    const sc = Math.min(1, maxSide / Math.max(trimmed.width, trimmed.height));
    const w = Math.max(1, Math.round(trimmed.width * sc)), h = Math.max(1, Math.round(trimmed.height * sc));
    const r = Math.max(6, Math.round(Math.max(w, h) * 0.025));
    const out = document.createElement('canvas');
    out.width = w + r * 2 + 2;
    out.height = h + r * 2 + 2;
    const ctx = out.getContext('2d');
    const sil = document.createElement('canvas');
    sil.width = w;
    sil.height = h;
    const sctx = sil.getContext('2d');
    sctx.drawImage(trimmed, 0, 0, w, h);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = '#fff';
    sctx.fillRect(0, 0, w, h);
    for (let a = 0; a < 360; a += 12) {
      const rad = (a * Math.PI) / 180;
      ctx.drawImage(sil, r + 1 + Math.cos(rad) * r, r + 1 + Math.sin(rad) * r);
    }
    ctx.drawImage(sil, r + 1, r + 1);
    ctx.drawImage(trimmed, 0, 0, trimmed.width, trimmed.height, r + 1, r + 1, w, h);
    return out;
  }

  /* 배경을 못 지웠을 때: 사진을 둥근 사각형 스티커로 */
  function stickerFromPhoto(photo) {
    const maxSide = 560;
    const sc = Math.min(1, maxSide / Math.max(photo.width, photo.height));
    const w = Math.round(photo.width * sc), h = Math.round(photo.height * sc);
    const b = 12;
    const out = document.createElement('canvas');
    out.width = w + b * 2;
    out.height = h + b * 2;
    const ctx = out.getContext('2d');
    const rr = (x, y, ww, hh, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + ww, y, x + ww, y + hh, r);
      ctx.arcTo(x + ww, y + hh, x, y + hh, r);
      ctx.arcTo(x, y + hh, x, y, r);
      ctx.arcTo(x, y, x + ww, y, r);
      ctx.closePath();
    };
    ctx.fillStyle = '#fff';
    rr(0, 0, out.width, out.height, 26);
    ctx.fill();
    ctx.save();
    rr(b, b, w, h, 16);
    ctx.clip();
    ctx.drawImage(photo, b, b, w, h);
    ctx.restore();
    return out;
  }

  let bgLib = null;
  async function loadBG() {
    if (bgLib) return bgLib;
    const sources = [
      'https://esm.sh/@imgly/background-removal@1.5.8',
      'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.8/+esm',
    ];
    let last = null;
    for (const u of sources) {
      try {
        const m = await Promise.race([
          import(u),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000)),
        ]);
        if (m && m.removeBackground) { bgLib = m; return m; }
      } catch (e) { last = e; }
    }
    throw last || new Error('load-failed');
  }

  /* 배경 제거 전체가 이보다 오래 걸리면 포기하고 사진 그대로 써요 */
  const CUT_LIMIT = 90000;
  async function cutOut(photoCanvas, onStatus) {
    const say = onStatus || (() => {});
    say('배경 지우는 도구 불러오는 중…');
    const lib = await loadBG();
    const blob = await toBlob(photoCanvas, 'image/png');
    say('배경 지우는 중… 폰에서는 20~40초쯤 걸려요');
    const out = await Promise.race([
      lib.removeBackground(blob, {
        model: 'isnet_quint8',
        output: { format: 'image/png' },
        progress: (key, cur, total) => {
          if (!total) return;
          if (String(key).startsWith('fetch')) say('모델 내려받는 중 ' + Math.round((cur / total) * 100) + '% (처음 한 번만)');
          else say('배경 지우는 중… 폰에서는 20~40초쯤 걸려요');
        },
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), CUT_LIMIT)),
    ]);
    const bmp = await createImageBitmap(out);
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    return c;
  }

  async function savePhoto(name, canvas) {
    const blob = await toBlob(canvas, 'image/png');
    await DB.put(name, blob);
    dropURL(name);
  }

  /* 배경 제거 결과의 흐릿한 잔상을 지워요. level 0~0.9: 이보다 옅은 부분은 투명, 나머지는 다시 진하게 */
  function cleanCut(cut, level) {
    const c = document.createElement('canvas');
    c.width = cut.width;
    c.height = cut.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(cut, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
    const t = level * 255;
    let ink = 0;
    for (let i = 3; i < d.length; i += 4) {
      const a = d[i] <= t ? 0 : Math.round(((d[i] - t) * 255) / (255 - t));
      d[i] = a;
      if (a > 16) ink++;
    }
    ctx.putImageData(img, 0, 0);
    return { canvas: c, ink };
  }

  /* 이미 배경이 투명한 이미지인지 (아이폰 사진 앱에서 복사한 피사체, 투명 PNG) */
  function hasAlpha(canvas) {
    const { width: w, height: h } = canvas;
    const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    let clear = 0, n = 0;
    const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 20000)));
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) { n++; if (d[(y * w + x) * 4 + 3] < 200) clear++; }
    }
    return clear / n > 0.02;
  }

  /* 사진 → 스티커. choose가 있으면 다듬기 창을 바로 열고, 배경 제거는 그 창 안에서 따로 돌려요.
     choose({ photo, cut, ready, make, cutOut }) → { canvas, cut, failed } 또는 null(취소) */
  async function stampWithFile(name, lineN, file, onStatus, choose) {
    const say = onStatus || (() => {});
    say('사진 줄이는 중…');
    const photo = await fileToCanvas(file, 1024);
    const ready = hasAlpha(photo);   // 이미 누끼가 따져 있으면 모델을 건너뛰어요
    const make = (mode, level, cut) => {
      if (mode === 'photo' || !cut) return { canvas: stickerFromPhoto(photo), ink: 1 };
      const c = cleanCut(cut, level);
      return { canvas: c.ink ? stickerFromCutout(c.canvas) : c.canvas, ink: c.ink };
    };
    let pick;
    if (choose) {
      say('스티커 모양을 골라 주세요');
      pick = await choose({ photo, cut: ready ? photo : null, ready, make, cutOut: ready ? null : (st) => cutOut(photo, st) });
      if (!pick) return { cancelled: true };
    } else {
      let cut = ready ? photo : null;
      if (!cut) {
        try { cut = await cutOut(photo, say); } catch (e) { console.warn('배경 제거 실패, 사진 그대로 사용', e); }
      }
      pick = { canvas: make(cut ? 'cut' : 'photo', DEFAULT_CLEAN, cut).canvas, cut: !!cut, failed: !cut };
    }
    try {
      await savePhoto(name, pick.canvas);
    } catch (e) {
      console.error(e);
      throw new Error('photo-save');
    }
    const prev = state.stamps[name];
    state.stamps[name] = { d: prev ? prev.d : today(), l: prev && prev.l ? prev.l : lineN, p: 1 };
    const saved = save();
    thud();
    emit('stamps', { name, fresh: !prev, cut: pick.cut });
    return { cut: pick.cut, failed: pick.failed, saved };
  }

  /* ---------- 스티커 다듬기 창 ---------- */
  const DEFAULT_CLEAN = 0.2;
  function editSticker({ cut, make, ready, cutOut: runCut }) {
    return new Promise((resolve) => {
      const scrim = document.createElement('div');
      scrim.className = 'scrim on';
      scrim.style.zIndex = 2999;
      const box = document.createElement('div');
      box.className = 'editor';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-labelledby', 'edTitle');
      box.innerHTML = `
<h2 id="edTitle">스티커 다듬기</h2>
<div class="ed-stage"><canvas class="ed-canvas" role="img" aria-label="스티커 미리보기"></canvas></div>
<div class="ed-seg" role="group" aria-label="스티커 모양">
  <button type="button" data-mode="cut">배경 지우기</button>
  <button type="button" data-mode="photo">사진 그대로</button>
</div>
<p class="ed-job" hidden><span id="edJob" role="status"></span><button type="button" class="link-btn" data-act="stop">멈추기</button></p>
<label class="ed-slider"><span>잔상 지우기</span><input type="range" id="edLevel" min="0" max="85" step="5" value="${ready ? 0 : DEFAULT_CLEAN * 100}"><output id="edOut"></output></label>
<p class="ed-hint" id="edHint"></p>
<div class="ed-actions"><button type="button" class="pill" data-act="cancel">취소</button><button type="button" class="ed-ok" data-act="ok">붙이기</button></div>`;
      document.body.append(scrim, box);
      const cv = $('.ed-canvas', box), range = $('#edLevel', box), out = $('#edOut', box), ok = $('[data-act="ok"]', box), hint = $('#edHint', box);
      const cutBtn = $('[data-mode="cut"]', box), jobRow = $('.ed-job', box), jobMsg = $('#edJob', box);
      const HINT = {
        cut: ready ? '누끼를 그대로 붙여요. 가장자리가 흐릿하면 슬라이더를 오른쪽으로 옮겨 보세요.'
          : '흐릿하게 남은 부분이 있으면 오른쪽으로 옮겨 보세요. 더 깔끔한 누끼는 아이폰 사진 앱에서 피사체를 길게 눌러 복사한 뒤 누끼 붙여넣기로 가져올 수 있어요.',
        photo: '사진을 자르지 않고 둥근 스티커로 붙여요. 역명판처럼 판이 사진을 꽉 채우면 이쪽이 잘 맞아요.',
        working: '지금 붙이면 사진 그대로 붙어요. 배경이 다 지워지면 바로 바꿔 보여 드려요.',
        failed: '배경을 지우지 못했어요. 사진을 둥근 스티커로 붙여요.',
        stopped: '배경 지우기를 멈췄어요. 배경 지우기를 누르면 다시 해요.',
      };
      /* job: 'done'(누끼 있음) | 'working' | 'failed' | 'stopped' */
      let job = cut ? 'done' : runCut ? 'working' : 'failed';
      let mode = cut ? 'cut' : 'photo', cur = null, queued = false, touched = false, closed = false, turn = 0;
      const paintSeg = () => {
        cutBtn.disabled = job === 'working' || job === 'failed';
        cutBtn.textContent = job === 'working' ? '배경 지우는 중…' : '배경 지우기';
        box.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.mode === mode)));
        $('.ed-slider', box).hidden = mode !== 'cut';
        jobRow.hidden = job !== 'working';
      };
      const paint = () => {
        queued = false;
        cur = make(mode, Number(range.value) / 100, cut);
        out.textContent = range.value + '%';
        cv.width = cur.canvas.width;
        cv.height = cur.canvas.height;
        cv.getContext('2d').drawImage(cur.canvas, 0, 0);
        ok.disabled = !cur.ink;
        hint.textContent = !cur.ink ? '다 지워졌어요. 슬라이더를 왼쪽으로 옮겨 주세요.'
          : mode === 'cut' ? HINT.cut : job === 'done' ? HINT.photo : HINT[job];
      };
      const later = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
      const setMode = (m) => { mode = m; paintSeg(); later(); };
      function startCut() {
        const my = ++turn;
        job = 'working';
        jobMsg.textContent = '배경 지우는 중…';
        paintSeg();
        later();
        runCut((t) => { if (my === turn && !closed) jobMsg.textContent = t; }).then((c) => {
          if (my !== turn || closed) return;
          cut = c;
          job = 'done';
          if (!touched) setMode('cut'); else { paintSeg(); later(); }
        }, (e) => {
          if (my !== turn || closed) return;
          console.warn('배경 제거 실패, 사진 그대로 사용', e);
          job = 'failed';
          paintSeg();
          later();
        });
      }
      box.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.mode === 'cut' && !cut) { if (job === 'stopped') startCut(); return; }
        touched = true;
        setMode(b.dataset.mode);
      }));
      /* 모델 계산 자체는 멈출 수 없어서, 결과를 기다리지 않고 버려요 */
      $('[data-act="stop"]', box).addEventListener('click', () => {
        turn++;
        job = 'stopped';
        paintSeg();
        later();
        ok.focus();
      });
      range.addEventListener('input', later);
      const done = (v) => {
        if (closed) return;
        closed = true;
        release();
        scrim.remove();
        box.remove();
        resolve(v);
      };
      const release = modal(box, () => done(null));
      scrim.addEventListener('click', () => done(null));
      $('[data-act="cancel"]', box).addEventListener('click', () => done(null));
      ok.addEventListener('click', () => {
        if (cur && cur.ink) done({ canvas: cur.canvas, cut: mode === 'cut', failed: mode === 'photo' && job === 'failed' });
      });
      paintSeg();
      paint();
      if (job === 'working') startCut();
      ok.focus();
    });
  }

  /* 기기에 저장했으면 true */
  function stampPlain(name, lineN) {
    if (state.stamps[name]) return true;
    state.stamps[name] = { d: today(), l: lineN };
    const saved = save();
    thud();
    emit('stamps', { name, fresh: true });
    return saved;
  }

  async function unstamp(name) {
    delete state.stamps[name];
    save();
    try { await DB.del(name); } catch (e) { /* 무시 */ }
    dropURL(name);
    emit('stamps', { name, removed: true });
  }

  Object.assign(C, { hasAlpha, fileToCanvas, toBlob, trimCanvas, stickerFromCutout, stickerFromPhoto, loadBG, cutOut, savePhoto, cleanCut, stampWithFile, DEFAULT_CLEAN, editSticker, stampPlain, unstamp });
})();
