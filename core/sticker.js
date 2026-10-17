/* 사진 → 스티커 도장, 스티커 다듬기 창 */
(() => {
  'use strict';
  const C = window.Core;
  const {
    $, today, emit, state, save, DB, dropURL, thud,
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

  async function cutOut(photoCanvas, onStatus) {
    const lib = await loadBG();
    const blob = await toBlob(photoCanvas, 'image/png');
    const out = await lib.removeBackground(blob, {
      model: 'isnet_quint8',
      output: { format: 'image/png' },
      progress: (key, cur, total) => {
        if (String(key).startsWith('fetch') && total) onStatus('모델 내려받는 중 ' + Math.round((cur / total) * 100) + '% (처음 한 번만)');
      },
    });
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

  /* 사진 → 스티커. choose({ photo, cut, make })가 있으면 사용자가 고른 스티커를 써요(null이면 취소) */
  async function stampWithFile(name, lineN, file, onStatus, choose) {
    const say = onStatus || (() => {});
    say('사진 줄이는 중…');
    const photo = await fileToCanvas(file, 1024);
    let cut = null;
    try {
      say('배경 지우는 중… 폰에서는 20~40초쯤 걸려요');
      cut = await cutOut(photo, say);
    } catch (e) {
      console.warn('배경 제거 실패, 사진 그대로 사용', e);
    }
    const make = (mode, level) => {
      if (mode === 'photo' || !cut) return { canvas: stickerFromPhoto(photo), ink: 1 };
      const c = cleanCut(cut, level);
      return { canvas: c.ink ? stickerFromCutout(c.canvas) : c.canvas, ink: c.ink };
    };
    let sticker;
    if (choose) {
      say('스티커 모양을 골라 주세요');
      sticker = await choose({ photo, cut, make });
      if (!sticker) return { cancelled: true, cut: !!cut };
    } else {
      sticker = make(cut ? 'cut' : 'photo', DEFAULT_CLEAN).canvas;
    }
    await savePhoto(name, sticker);
    const prev = state.stamps[name];
    state.stamps[name] = { d: prev ? prev.d : today(), l: prev && prev.l ? prev.l : lineN, p: 1 };
    save();
    thud();
    emit('stamps', { name, fresh: !prev, cut: !!cut });
    return { cut: !!cut };
  }

  /* ---------- 스티커 다듬기 창 ---------- */
  const DEFAULT_CLEAN = 0.2;
  function editSticker({ cut, make }) {
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
  <button type="button" data-mode="cut" aria-pressed="${cut ? 'true' : 'false'}" ${cut ? '' : 'disabled'}>배경 지우기</button>
  <button type="button" data-mode="photo" aria-pressed="${cut ? 'false' : 'true'}">사진 그대로</button>
</div>
<label class="ed-slider" ${cut ? '' : 'hidden'}><span>잔상 지우기</span><input type="range" id="edLevel" min="0" max="85" step="5" value="${DEFAULT_CLEAN * 100}"><output id="edOut"></output></label>
<p class="ed-hint" id="edHint">${cut ? '흐릿하게 남은 부분이 있으면 오른쪽으로, 필요한 부분까지 지워지면 왼쪽으로 옮겨 보세요. 역명판처럼 판이 사진을 꽉 채우면 사진 그대로가 잘 맞아요.' : '배경을 지우지 못했어요. 사진을 둥근 스티커로 붙여요.'}</p>
<div class="ed-actions"><button type="button" class="pill" data-act="cancel">취소</button><button type="button" class="ed-ok" data-act="ok">붙이기</button></div>`;
      document.body.append(scrim, box);
      const cv = $('.ed-canvas', box), range = $('#edLevel', box), out = $('#edOut', box), ok = $('[data-act="ok"]', box), hint = $('#edHint', box);
      const HINT = {
        cut: '흐릿하게 남은 부분이 있으면 오른쪽으로, 필요한 부분까지 지워지면 왼쪽으로 옮겨 보세요. 역명판처럼 판이 사진을 꽉 채우면 사진 그대로가 잘 맞아요.',
        photo: cut ? '사진을 자르지 않고 둥근 스티커로 붙여요.' : '배경을 지우지 못했어요. 사진을 둥근 스티커로 붙여요.',
      };
      let mode = cut ? 'cut' : 'photo', cur = null, queued = false;
      const paint = () => {
        queued = false;
        cur = make(mode, Number(range.value) / 100);
        out.textContent = range.value + '%';
        cv.width = cur.canvas.width;
        cv.height = cur.canvas.height;
        cv.getContext('2d').drawImage(cur.canvas, 0, 0);
        ok.disabled = !cur.ink;
        hint.textContent = cur.ink ? HINT[mode] : '다 지워졌어요. 슬라이더를 왼쪽으로 옮겨 주세요.';
      };
      const later = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
      box.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
        mode = b.dataset.mode;
        box.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        $('.ed-slider', box).hidden = mode !== 'cut';
        later();
      }));
      range.addEventListener('input', later);
      const done = (v) => {
        document.removeEventListener('keydown', onKey);
        scrim.remove();
        box.remove();
        resolve(v);
      };
      const onKey = (e) => { if (e.key === 'Escape') done(null); };
      document.addEventListener('keydown', onKey);
      scrim.addEventListener('click', () => done(null));
      $('[data-act="cancel"]', box).addEventListener('click', () => done(null));
      ok.addEventListener('click', () => { if (cur && cur.ink) done(cur.canvas); });
      paint();
      ok.focus();
    });
  }

  function stampPlain(name, lineN) {
    if (state.stamps[name]) return;
    state.stamps[name] = { d: today(), l: lineN };
    save();
    thud();
    emit('stamps', { name, fresh: true });
  }

  async function unstamp(name) {
    delete state.stamps[name];
    save();
    try { await DB.del(name); } catch (e) { /* 무시 */ }
    dropURL(name);
    emit('stamps', { name, removed: true });
  }

  Object.assign(C, { fileToCanvas, toBlob, trimCanvas, stickerFromCutout, stickerFromPhoto, bgLib, loadBG, cutOut, savePhoto, cleanCut, stampWithFile, DEFAULT_CLEAN, editSticker, stampPlain, unstamp });
})();
