/* 도장 카드: 역명판 + 스티커(또는 도장) + 날짜를 4:5 이미지로 그려 공유해요 */
(() => {
  'use strict';
  const C = window.Core;
  const { LINE, STATIONS, isText, lineShort, label, dotDate, state, photoURL, sealSVG, trackFor, neighbors, today } = C;

  const W = 1080, H = 1350;
  const FONT = '"Gothic A1", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  const font = (w, px) => `${w} ${px}px ${FONT}`;

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  /* 글자가 maxW 안에 들어가는 가장 큰 크기 */
  function fit(g, text, weight, start, min, maxW) {
    let px = start;
    for (; px > min; px -= 2) { g.font = font(weight, px); if (g.measureText(text).width <= maxW) break; }
    g.font = font(weight, px);
    return px;
  }
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  async function stickerImage(name, st, lineN) {
    if (st.p) {
      const u = await photoURL(name);
      if (u) return loadImg(u);
    }
    /* 이미지로 쓰려면 xmlns와 크기가 있어야 해요 */
    const svg = sealSVG(name, st.l || lineN, st.d).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" ');
    return loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  }

  /* 몇 번째 도장인지: 날짜순, 같은 날은 찍은 순서(기록에 들어간 순서)대로. 아직 안 찍은 역은 다음 번호 */
  function stampOrder(name) {
    const list = Object.entries(state.stamps).map(([n, s], i) => [n, String(s.d), i])
      .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : a[2] - b[2]));
    const i = list.findIndex((x) => x[0] === name);
    return i < 0 ? list.length + 1 : i + 1;
  }

  async function makeCard(name, lineN) {
    const st = state.stamps[name] || { d: today(), l: lineN };
    const L = LINE[lineN];
    const info = STATIONS.get(name);
    try { await Promise.all([document.fonts.load(font(900, 100)), document.fonts.load(font(600, 40))]); } catch (e) { /* 시스템 글꼴로 */ }
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');

    /* 타일 벽 */
    g.fillStyle = '#e2e7e4';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#cdd3cf';
    for (let x = 0; x < W; x += 90) g.fillRect(x, 0, 3, H);
    for (let y = 0; y < H; y += 90) g.fillRect(0, y, W, 3);

    /* 역명판 */
    const sx = 60, sy = 250, sw = W - 120, sh = 500;
    g.save();
    g.shadowColor = 'rgba(25, 35, 40, .35)';
    g.shadowBlur = 40;
    g.shadowOffsetY = 18;
    roundRect(g, sx, sy, sw, sh, 10);
    g.fillStyle = '#fdfdfb';
    g.fill();
    g.restore();
    g.lineWidth = 8;
    g.strokeStyle = '#b9c0c2';
    roundRect(g, sx, sy, sw, sh, 10);
    g.stroke();
    g.save();
    roundRect(g, sx, sy, sw, sh, 10);
    g.clip();
    g.fillStyle = L.color;
    g.fillRect(sx, sy, sw, 30);
    g.restore();

    /* 노선 배지 + 역 이름 */
    const tag = lineShort(L);
    const bh = 150, cy = sy + 210;
    g.font = font(800, isText(L) ? 46 : 84);
    const bw = isText(L) ? Math.max(bh, g.measureText(tag).width + 56) : bh;
    const ko = label(name);
    const en = info ? info.en : '';
    g.font = font(900, 150);
    const nameW = Math.min(g.measureText(ko).width, sw - bw - 140);
    const x0 = sx + (sw - (bw + 40 + nameW)) / 2;
    g.fillStyle = L.color;
    if (isText(L)) { roundRect(g, x0, cy - bh / 2, bw, bh, bh * 0.3); g.fill(); } else { g.beginPath(); g.arc(x0 + bh / 2, cy, bh / 2, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = L.ink;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = font(800, isText(L) ? 46 : 84);
    g.fillText(tag, x0 + bw / 2, cy + 4);
    g.textAlign = 'left';
    g.fillStyle = '#1c2125';
    fit(g, ko, 900, 150, 70, sw - bw - 140);
    g.fillText(ko, x0 + bw + 40, cy - 14);
    if (en) {
      g.fillStyle = '#566067';
      fit(g, en, 600, 46, 26, sw - bw - 140);
      g.fillText(en, x0 + bw + 44, cy + 78);
    }

    /* 스티커 (역명판 오른쪽 아래에 비스듬히) */
    try {
      const img = await stickerImage(name, st, lineN);
      const max = 380;
      const k = Math.min(max / img.width, max / img.height);
      const iw = img.width * k, ih = img.height * k;
      g.save();
      g.translate(sx + sw - 190, sy + sh + 110);
      g.rotate(-7 * Math.PI / 180);
      g.shadowColor = 'rgba(0, 0, 0, .3)';
      g.shadowBlur = 18;
      g.shadowOffsetY = 10;
      g.drawImage(img, -iw / 2, -ih / 2, iw, ih);
      g.restore();
    } catch (e) { /* 스티커 없이 */ }

    /* 이전역 · 다음역: 스티커 위에 그려서 사이트처럼 스티커가 이름 뒤로 가요 */
    const halo = (t, x, y) => {
      g.lineJoin = 'round';
      g.lineWidth = 12;
      g.strokeStyle = '#fdfdfb';
      g.strokeText(t, x, y);
      g.fillStyle = '#30373c';
      g.fillText(t, x, y);
    };
    const tr = trackFor(L, name);
    if (tr) {
      const { p, q } = neighbors(tr, name);
      const ny = sy + sh - 80;
      g.fillStyle = L.color;
      g.font = font(700, 40);
      g.textBaseline = 'middle';
      if (p) {
        g.beginPath(); g.moveTo(sx + 60, ny); g.lineTo(sx + 90, ny - 18); g.lineTo(sx + 90, ny + 18); g.closePath(); g.fill();
        g.textAlign = 'left'; halo(label(p), sx + 108, ny);
      }
      if (q) {
        g.fillStyle = L.color;
        g.beginPath(); g.moveTo(sx + sw - 60, ny); g.lineTo(sx + sw - 90, ny - 18); g.lineTo(sx + sw - 90, ny + 18); g.closePath(); g.fill();
        g.textAlign = 'right'; halo(label(q), sx + sw - 108, ny);
      }
    }

    /* 날짜와 몇 번째 도장인지 */
    const order = stampOrder(name);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#1c2125';
    g.font = font(900, 92);
    g.fillText(dotDate(st.d), 70, 1080);
    g.fillStyle = '#566067';
    g.font = font(700, 40);
    g.fillText(`${order}번째 도장 · ${C.lineName(L)} ${C.stationQuery(name)}`, 74, 1150);
    g.fillStyle = '#23292d';
    g.font = font(900, 40);
    g.fillText('역 도장깨기', 74, 1260);

    return new Promise((res) => c.toBlob(res, 'image/png'));
  }

  /* 공유 시트가 되면 그걸로, 아니면 파일로 저장 */
  async function shareCard(name, lineN) {
    const blob = await makeCard(name, lineN);
    const st = state.stamps[name];
    const file = new File([blob], `metro-stamp-${String(st ? st.d : today()).replace(/-/g, '')}.png`, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `${C.stationQuery(name)} 도장` });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    return 'saved';
  }

  Object.assign(C, { stampOrder, makeCard, shareCard });
})();
