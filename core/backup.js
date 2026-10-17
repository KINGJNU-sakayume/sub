/* 기록 내보내기·불러오기 */
(() => {
  'use strict';
  const C = window.Core;
  const {
    RENAMED, STATIONS, emit, state, isObj, cleanStamp, save, DB, photosReady, dropURL,
  } = C;

  /* ---------- 기록 백업 ---------- */
  const blobToDataURL = (b) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

  /* 사진을 하나라도 못 읽으면 missing에 이름이 남아요 (부분 백업) */
  async function exportJSON() {
    await photosReady;
    const photos = {}, missing = [];
    let total = 0;
    for (const name of Object.keys(state.stamps)) {
      if (!state.stamps[name].p) continue;
      total++;
      try {
        const b = await DB.get(name);
        if (b) photos[name] = await blobToDataURL(b);
        else missing.push(name);
      } catch (e) { missing.push(name); }
    }
    const data = { version: 2, stamps: state.stamps, photos };
    return { blob: new Blob([JSON.stringify(data)], { type: 'application/json' }), total, included: total - missing.length, missing };
  }

  /* 내보낸 파일의 사진(data URL)만 받아요. 이미지로 열리는지까지 확인해요 */
  const PHOTO_MAX = 8 * 1024 * 1024;
  async function photoBlob(url) {
    if (typeof url !== 'string' || url.length > PHOTO_MAX || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(url)) throw new Error('사진 형식');
    const blob = await (await fetch(url)).blob();
    if (!/^image\//.test(blob.type)) throw new Error('사진 형식');
    if (window.createImageBitmap) { const bmp = await createImageBitmap(blob); if (bmp.close) bmp.close(); }
    return blob;
  }
  async function hasPhoto(name) {
    if (!state.stamps[name].p) return false;
    try { return !!(await DB.get(name)); } catch (e) { return false; }
  }

  /* 없던 도장은 더하고, 있던 도장은 그대로 둬요. 있던 도장에 사진이 빠져 있으면 백업 사진으로 채워요 */
  async function importJSON(file) {
    const data = JSON.parse(await file.text());
    if (!isObj(data) || (data.version !== 1 && data.version !== 2) || !isObj(data.stamps)) throw new Error('형식');
    const photos = isObj(data.photos) ? data.photos : {};
    await photosReady;
    const r = { added: 0, skipped: 0, photos: 0, photoFail: 0, invalid: 0, saved: true };
    for (const [old, v] of Object.entries(data.stamps)) {
      const n = RENAMED[old] || old;
      const st = cleanStamp(n, v);
      if (!st) { r.invalid++; continue; }
      if (!STATIONS.has(n)) { r.skipped++; continue; }
      const had = !!state.stamps[n];
      const url = photos[old];
      if (had && (!url || await hasPhoto(n))) { r.skipped++; continue; }
      if (!had) { state.stamps[n] = { d: st.d, l: st.l }; r.added++; }
      if (url) {
        try {
          await DB.put(n, await photoBlob(url));
          state.stamps[n].p = 1;
          dropURL(n);
          if (had) r.photos++;
        } catch (e) { r.photoFail++; }
      }
    }
    r.saved = save();
    emit('stamps', { bulk: true });
    return r;
  }

  Object.assign(C, { blobToDataURL, exportJSON, importJSON });
})();
