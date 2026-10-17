/* 기록 내보내기·불러오기 */
(() => {
  'use strict';
  const C = window.Core;
  const {
    RENAMED, STATIONS, emit, state, save, DB, photosReady,
  } = C;

  /* ---------- 기록 백업 ---------- */
  const blobToDataURL = (b) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

  async function exportJSON() {
    await photosReady;
    const photos = {};
    for (const name of Object.keys(state.stamps)) {
      if (!state.stamps[name].p) continue;
      try {
        const b = await DB.get(name);
        if (b) photos[name] = await blobToDataURL(b);
      } catch (e) { /* 사진 하나쯤은 건너뛰어요 */ }
    }
    const data = { version: 2, stamps: state.stamps, photos };
    return new Blob([JSON.stringify(data)], { type: 'application/json' });
  }

  async function importJSON(file) {
    const data = JSON.parse(await file.text());
    if (!data || typeof data.stamps !== 'object') throw new Error('형식');
    let added = 0;
    for (const [old, v] of Object.entries(data.stamps)) {
      const n = RENAMED[old] || old;
      if (!STATIONS.has(n) || !v || typeof v.d !== 'string' || state.stamps[n]) continue;
      state.stamps[n] = { d: v.d, l: v.l };
      const url = data.photos && data.photos[old];
      if (url) {
        try {
          const blob = await (await fetch(url)).blob();
          await DB.put(n, blob);
          state.stamps[n].p = 1;
        } catch (e) { /* 사진 없이 가져와요 */ }
      }
      added++;
    }
    save();
    emit('stamps', { bulk: true });
    return added;
  }

  Object.assign(C, { blobToDataURL, exportJSON, importJSON });
})();
