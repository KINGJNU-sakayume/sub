/* 보드 목록을 Life Hub에 올려요: PUT /sub/v1/board (스코프 sub:board, life-hub docs/P7_BOARD.md 5장)
   - 빈도: 타일에 영향을 주는 변화가 생기면 마지막 시도에서 10분이 지났으면 바로, 아니면 10분이 찰 때 한 번.
     닫히기 전에 못 보낸 것('보낼 것 있음')은 다음에 앱을 열 때 보내요. 내용은 generated_at을 뺀 본문의 sha256으로 비교하고,
     마지막 성공이 하루보다 오래됐으면 같아도 한 번 보내요(보드의 '오래됨'은 Hub가 받은 시각 기준).
   - 올리지 않을 때: Life Hub 미연결, '이 기기에서 보드에 올리기' 꺼짐, 도장이 하나도 없음(새 기기가 빈 목록으로 덮지 않게).
   - 권한: 403 + insufficient_scope면 토큰을 지우지 않고 '다시 연결' 안내만. 토큰 갱신 뒤에도 401이거나 다른 403이면
     기존 규칙대로 연결을 끊어요. 400·413은 이 앱의 버그라 같은 내용을 다시 보내지 않고 콘솔에만 남겨요.
   - 실패는 모두 여기서 삼켜 다른 기능을 막지 않아요. 저장 키(localStorage)에는 개인 데이터가 없어요.
   - 의존성을 주입받아 Node 테스트에서 가짜 fetch·시계로 돌려요(tests/board.mjs). */
(function (root) {
  'use strict';

  const URL_BOARD = 'https://life-hub-api.213303.workers.dev/sub/v1/board';
  const STATE_KEY = 'metro-stamp.board.v1';          // { sha, at, tried, dirty, badSha }
  const DEVICE_KEY = 'metro-stamp.board.device.v1';  // 'off'이면 이 기기에서 올리지 않아요(기본 켬)
  const SCOPE_KEY = 'metro-stamp.board.scope.v1';    // '1' = sub:board 권한이 없어 다시 연결이 필요
  const GAP_MS = 10 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  /* generated_at을 뺀 본문: 같은 내용인지 비교하는 기준 */
  const contentOf = (m) => JSON.stringify({ ...m, generated_at: undefined });

  /**
   * deps: fetch, storage, now() ms, setTimer(fn, ms) / clearTimer(id), getToken(force) → 토큰(없으면 throw),
   *       dropTokens(), build(Date) → manifest, hasRecords(), connected(), onChange(), log(...)
   */
  function createBoardUploader(deps) {
    const sha256 = deps.sha256 || sha256Hex;
    const log = deps.log || ((...a) => console.warn(...a));
    const read = () => { try { const v = JSON.parse(deps.storage.getItem(STATE_KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } };
    const write = (v) => { try { deps.storage.setItem(STATE_KEY, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 계속 */ } };
    const patch = (p) => write({ ...read(), ...p });
    const changed = () => { try { if (deps.onChange) deps.onChange(); } catch (e) { /* 화면 갱신 실패는 무시 */ } };

    const enabled = () => deps.storage.getItem(DEVICE_KEY) !== 'off';
    const scopeNeeded = () => deps.storage.getItem(SCOPE_KEY) === '1';
    let timer = null, busy = false, again = false, force = false;

    function schedule() {
      if (timer !== null) return;
      if (busy) { again = true; return; }
      const st = read();
      const wait = Math.max(0, (st.tried || 0) + GAP_MS - deps.now());
      timer = deps.setTimer(() => { timer = null; flush(); }, wait);
    }

    /** 보낼 조건이 맞으면 보내요. 결과: 'skipped' | 'same' | 'stored' | 'scope' | 'disconnected' | 'rejected' | 'retry' */
    async function flush() {
      if (busy) { again = true; return 'busy'; }
      busy = true;
      try { return await attempt(); } catch (e) { log('보드 업로드 실패', e); return 'retry'; } finally {
        busy = false;
        if (again) { again = false; schedule(); }
      }
    }

    async function attempt() {
      if (!deps.connected() || !enabled() || scopeNeeded() || !deps.hasRecords()) return 'skipped';
      const st = read();
      const manifest = deps.build(new Date(deps.now()));
      const sha = await sha256(contentOf(manifest));
      const stale = !st.at || deps.now() - st.at > DAY_MS;
      if (sha === st.badSha) { patch({ dirty: false }); return 'rejected'; }
      if (sha === st.sha && !stale && !force) { patch({ dirty: false }); return 'same'; }
      const body = JSON.stringify(manifest);
      patch({ tried: deps.now() });
      const send = async (token) => deps.fetch(URL_BOARD, { method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body });
      let res;
      try {
        res = await send(await deps.getToken(false));
        if (res.status === 401) res = await send(await deps.getToken(true));
      } catch (e) {
        if (e && e.kind === 'not_connected') { changed(); return 'skipped'; }
        return 'retry';   // 네트워크: 다음 기회에
      }
      if (res.status === 403) {
        /* 헤더를 먼저 보고, 다른 출처에서 헤더를 못 읽는 경우를 위해 본문(OAuth 오류 JSON)도 봐요 */
        const www = (res.headers && res.headers.get && res.headers.get('WWW-Authenticate')) || '';
        const text = /insufficient_scope/.test(www) ? '' : await (res.text ? res.text().catch(() => '') : '');
        if (/insufficient_scope/.test(www) || /"error"\s*:\s*"insufficient_scope"/.test(text)) {   // 토큰은 그대로: 수신함·뽑기 연결은 계속 써요
          deps.storage.setItem(SCOPE_KEY, '1');
          changed();
          return 'scope';
        }
      }
      if (res.status === 401 || res.status === 403) { deps.dropTokens(); changed(); return 'disconnected'; }
      if (res.ok) {   // 저장됨, { unchanged: true }, { ignored: true } 모두 성공
        force = false;
        write({ sha, at: deps.now(), tried: deps.now(), dirty: false });
        return 'stored';
      }
      if (res.status === 400 || res.status === 413 || res.status === 415) {
        log(`보드 목록을 Life Hub가 거절했어요 (${res.status}). 같은 내용은 다시 보내지 않아요.`);
        patch({ badSha: sha, dirty: false });
        return 'rejected';
      }
      return 'retry';   // 5xx 등: '보낼 것 있음'을 남겨 다음 기회에
    }

    return {
      /** 타일에 영향을 주는 변화가 생겼어요 */
      markDirty() { patch({ dirty: true }); schedule(); },
      /** 앱을 열 때(또는 다시 연결한 뒤): 남은 것, 하루 지난 것, 바뀐 내용을 보내요 */
      onStart() {
        const st = read();
        if (!st.at || deps.now() - st.at > DAY_MS) force = true;
        schedule();
      },
      flush,
      enabled,
      setEnabled(on) {
        if (on) deps.storage.removeItem(DEVICE_KEY); else deps.storage.setItem(DEVICE_KEY, 'off');
        if (on) { patch({ dirty: true }); schedule(); }
      },
      scopeNeeded,
      clearScopeNeeded() { deps.storage.removeItem(SCOPE_KEY); },
      state: read,
      stop() { if (timer !== null) deps.clearTimer(timer); timer = null; },
    };
  }

  const api = { createBoardUploader, boardContentOf: contentOf, BOARD_KEYS: { STATE_KEY, DEVICE_KEY, SCOPE_KEY } };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.Core) Object.assign(root.Core, api);
})(typeof window !== 'undefined' ? window : globalThis);
