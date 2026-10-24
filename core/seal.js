/* 사진 없이 찍는 도장 SVG */
(() => {
  'use strict';
  const C = window.Core;
  const {
    LINES, esc, LINE, isText, lineShort, label, dotDate,
  } = C;

  /* ---------- 도장 SVG (사진 없이 찍었을 때) ---------- */
  let sealId = 0;
  function sealSVG(name, lineN, date) {
    const id = 'r' + (++sealId);
    const L = LINE[lineN] || LINES[0];
    /* 밝은 노선색(9호선·수인분당·우이신설)은 종이 위에서 잘 보이게 진하게 찍어요 */
    const color = { '#BDB092': '#8f8160', '#FABE00': '#c08f00', '#B7C452': '#7f8a2a' }[L.color] || L.color;
    const shown = label(name);
    const chars = [...shown];
    const two = chars.length > 5;
    const half = Math.ceil(chars.length / 2);
    const rows = two ? [chars.slice(0, half).join(''), chars.slice(half).join('')] : [shown];
    const longest = Math.max(...rows.map((r) => [...r].length));
    const fs = Math.min(30, 108 / longest);
    const y0 = two ? 100 : 108;
    const text = rows.map((r, i) => `<text x="100" y="${y0 + i * (fs + 4)}" text-anchor="middle" font-size="${fs.toFixed(1)}" font-weight="900" fill="${color}" stroke="none">${esc(r)}</text>`).join('');
    const tag = lineShort(L);
    const tagSize = isText(L) ? Math.min(13, 44 / Math.max(1, [...tag].length)) : 16;
    return `<svg class="seal" viewBox="0 0 200 200" role="img" aria-label="${esc(shown)} 도장" font-family="Gothic A1, sans-serif">
  <defs>
    <filter id="f${id}" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="7" result="t"/>
      <feDisplacementMap in="SourceGraphic" in2="t" scale="2.6"/>
    </filter>
    <path id="t${id}" d="M 30 100 A 70 70 0 0 1 170 100"/>
    <path id="b${id}" d="M 24 100 A 76 76 0 0 0 176 100"/>
  </defs>
  <g filter="url(#f${id})" fill="none" stroke="${color}">
    <circle cx="100" cy="100" r="93" stroke-width="5"/>
    <circle cx="100" cy="100" r="84" stroke-width="1.5"/>
    <circle cx="100" cy="100" r="59" stroke-width="1.5"/>
    <text font-size="13" font-weight="800" fill="${color}" stroke="none" letter-spacing="2"><textPath href="#t${id}" startOffset="50%" text-anchor="middle">수도권 전철</textPath></text>
    <text font-size="13" font-weight="800" fill="${color}" stroke="none" letter-spacing="1"><textPath href="#b${id}" startOffset="50%" text-anchor="middle">${esc(dotDate(date))}</textPath></text>
    ${isText(L) ? `<rect x="70" y="51" width="60" height="26" rx="8" fill="${color}" stroke="none"/>` : `<circle cx="100" cy="64" r="14" fill="${color}" stroke="none"/>`}
    <text x="100" y="${(64 + tagSize * 0.36).toFixed(1)}" text-anchor="middle" font-size="${tagSize.toFixed(1)}" font-weight="800" fill="${L.ink === '#fff' ? '#fff' : L.ink}" stroke="none">${esc(tag)}</text>
    ${text}
  </g>
</svg>`;
  }

  Object.assign(C, { sealSVG });
})();
