/* Life Hub 연결: Claude가 제안한 역 방문을 기록 서랍에서 확인하고 도장을 찍어요.
   - 연결: OAuth 2.1 인증 코드 + PKCE(S256). 이 페이지는 lifehub-client.json으로 자신을 밝히는 공개 클라이언트이고
     `sub:inbox` 권한만 받아요. Life Hub는 lifehub/ 페이지로 돌아오고, 그 페이지가 결과를 이 탭에 넘겨요.
   - 제안(`station_visit`)은 받아 올 때마다 형식을 다시 검사해요. 승인해야 도장이 찍혀요(뽑기만으로는 찍지 않는 원칙 그대로).
   - 승인·거절 결과는 이 기기에 적어 두고, 동기화할 때 Life Hub에 알려요(응답이 올 때까지 다시 보내요). */
(() => {
  'use strict';
  const C = window.Core;
  const { esc, label, STATIONS, LINE, lineName, isText, lineShort, state, save, emit, on, validDate, dotDate, RENAMED } = C;

  const LIFEHUB_ORIGIN = 'https://life-hub-api.213303.workers.dev';
  const APP_URL = 'https://kingjnu-sakayume.github.io/sub/';
  const CALLBACK_URL = APP_URL + 'lifehub/';
  const CLIENT_ID = APP_URL + 'lifehub-client.json';
  const RESOURCE = LIFEHUB_ORIGIN + '/sub';
  const SCOPE = 'sub:inbox';
  const API = LIFEHUB_ORIGIN + '/sub/v1';
  const CALLBACK_KEY = 'metro-stamp.lifehub.callback.v1';   // lifehub/index.html이 적어요
  const TOKENS_KEY = 'metro-stamp.lifehub.tokens.v1';
  const PENDING_KEY = 'metro-stamp.lifehub.pending-auth.v1';
  const OUTCOMES_KEY = 'metro-stamp.lifehub.outcomes.v1';
  const REJECTIONS_KEY = 'metro-stamp.lifehub.rejections.v1';
  const RECEIPTS_KEY = 'metro-stamp.lifehub.receipts.v1';
  const AUTH_MAX_AGE_MS = 10 * 60 * 1000;
  const KEY = /^(claude|chatgpt|manual):[A-Za-z0-9_.:-]{8,128}$/;

  class LifeHubError extends Error {
    constructor(kind, message) { super(message); this.kind = kind; }   // not_connected | denied | state | network | server
  }

  function browserDeps() {
    return {
      fetch: (u, i) => fetch(u, i), storage: localStorage, session: sessionStorage, now: () => Date.now(),
      random: (n) => crypto.getRandomValues(new Uint8Array(n)),
      sha256: async (d) => new Uint8Array(await crypto.subtle.digest('SHA-256', d)),
    };
  }
  const readJson = (store, key) => { try { const raw = store.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };
  const b64url = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };

  /* ---------- 제안 형식 (life-hub src/adapters/sub.js와 같아요) ---------- */
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const only = (v, keys) => Object.keys(v).every((k) => keys.includes(k));
  const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
  const optText = (v, max) => v === undefined || text(v, max);
  function parseProposal(item) {
    if (!isObj(item) || typeof item.key !== 'string' || !KEY.test(item.key) || !isObj(item.candidate)) return null;
    const c = item.candidate;
    if (c.schema_version !== 1 || c.candidate_type !== 'station_visit' || typeof c.source !== 'string' ||
      `${c.source}:${String(c.idempotency_key)}` !== item.key || typeof c.created_at !== 'string' || !isObj(c.payload)) return null;
    const p = c.payload;
    if (!only(p, ['station', 'line', 'date', 'note']) || !text(p.station, 40) || !optText(p.line, 20) || !validDate(p.date) || !optText(p.note, 300)) return null;
    return { key: item.key, station: p.station.trim(), line: p.line ? p.line.trim() : null, date: p.date, note: p.note ? p.note.trim() : null };
  }

  /* ---------- 역 찾기: 하나로 맞을 때만 고르고, 나머지는 고르게 해요 ---------- */
  const norm = (s) => String(s).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  const bare = (s) => norm(label(s)).replace(/역$/, '');
  function lineMatches(L, line) {
    const q = norm(line).replace(/선$/, '');
    return [lineName(L), lineShort(L), String(L.n) + '호선', String(L.n), L.en || ''].some((x) => {
      const n = norm(x).replace(/선$/, '');
      return n && n === q;
    });
  }
  /** [{ name, lines }] 후보와, 하나로 정해지면 그 역 */
  function findStations(p) {
    const wanted = bare(RENAMED[p.station] || p.station);
    let hits = [...STATIONS.values()].filter((st) => bare(st.name) === wanted || bare(st.label) === wanted);
    if (p.line) {
      const onLine = hits.filter((st) => st.lines.some((n) => LINE[n] && lineMatches(LINE[n], p.line)));
      if (onLine.length) hits = onLine;
    }
    return { choices: hits, exact: hits.length === 1 ? hits[0] : null };
  }
  function lineFor(st, p) {
    if (p.line) { const n = st.lines.find((x) => LINE[x] && lineMatches(LINE[x], p.line)); if (n !== undefined) return n; }
    return st.lines[0];
  }
  const entityIdFor = (stationKey) => 'st_' + b64url(new TextEncoder().encode(stationKey));

  /* ---------- OAuth ---------- */
  const isConnected = (deps) => typeof (readJson(deps.storage, TOKENS_KEY) || {}).refresh_token === 'string';
  function connectAvailable(loc) { const app = new URL(APP_URL); return loc.origin === app.origin && loc.pathname.startsWith(app.pathname); }
  async function beginConnect(deps) {
    const verifier = b64url(deps.random(32)), stateValue = b64url(deps.random(16));
    const challenge = b64url(await deps.sha256(new TextEncoder().encode(verifier)));
    deps.session.setItem(PENDING_KEY, JSON.stringify({ state: stateValue, verifier, created_at: deps.now() }));
    const q = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID, redirect_uri: CALLBACK_URL, scope: SCOPE, state: stateValue,
      code_challenge: challenge, code_challenge_method: 'S256', resource: RESOURCE });
    return LIFEHUB_ORIGIN + '/authorize?' + q.toString();
  }
  async function tokenRequest(deps, params) {
    let res;
    try {
      res = await deps.fetch(LIFEHUB_ORIGIN + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CLIENT_ID, ...params }).toString() });
    } catch (e) { throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.'); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (body.error === 'invalid_grant') { deps.storage.removeItem(TOKENS_KEY); throw new LifeHubError('not_connected', 'Life Hub 연결이 만료됐어요. 다시 연결해 주세요.'); }
      throw new LifeHubError('server', `Life Hub 인증 서버 오류 (${res.status})`);
    }
    if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string' || String(body.token_type).toLowerCase() !== 'bearer')
      throw new LifeHubError('server', 'Life Hub 응답 형식이 올바르지 않아요.');
    const tokens = { access_token: body.access_token, refresh_token: body.refresh_token,
      access_expires_at: deps.now() + (typeof body.expires_in === 'number' ? body.expires_in : 300) * 1000 };
    deps.storage.setItem(TOKENS_KEY, JSON.stringify(tokens));
    return tokens;
  }
  async function completeStoredCallback(deps) {
    const search = deps.session.getItem(CALLBACK_KEY);
    if (search === null) return false;
    deps.session.removeItem(CALLBACK_KEY);
    const q = new URLSearchParams(search);
    const pending = readJson(deps.session, PENDING_KEY);
    deps.session.removeItem(PENDING_KEY);
    if (!pending || q.get('state') !== pending.state || deps.now() - pending.created_at > AUTH_MAX_AGE_MS)
      throw new LifeHubError('state', '연결 요청이 만료됐거나 이 브라우저에서 시작되지 않았어요. 다시 연결해 주세요.');
    if (q.has('iss') && q.get('iss') !== LIFEHUB_ORIGIN) throw new LifeHubError('state', '다른 서버의 응답이라 연결하지 않았어요.');
    if (q.has('error')) throw new LifeHubError('denied', q.get('error') === 'access_denied' ? 'Life Hub 연결을 거절했어요.' : 'Life Hub 연결에 실패했어요.');
    const code = q.get('code');
    if (!code) throw new LifeHubError('state', '인증 코드가 없어요.');
    await tokenRequest(deps, { grant_type: 'authorization_code', code, redirect_uri: CALLBACK_URL, code_verifier: pending.verifier, resource: RESOURCE });
    return true;
  }
  async function accessToken(deps, force) {
    const t = readJson(deps.storage, TOKENS_KEY);
    if (!t || !t.refresh_token) throw new LifeHubError('not_connected', 'Life Hub에 연결되어 있지 않아요.');
    if (!force && t.access_expires_at - 60000 > deps.now()) return t.access_token;
    return (await tokenRequest(deps, { grant_type: 'refresh_token', refresh_token: t.refresh_token })).access_token;
  }
  async function api(deps, method, path, body) {
    const send = async (token) => {
      try {
        return await deps.fetch(API + path, { method, headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      } catch (e) { throw new LifeHubError('network', 'Life Hub에 연결할 수 없어요. 네트워크를 확인해 주세요.'); }
    };
    let res = await send(await accessToken(deps, false));
    if (res.status === 401) res = await send(await accessToken(deps, true));
    if (res.status === 401 || res.status === 403) { deps.storage.removeItem(TOKENS_KEY); throw new LifeHubError('not_connected', 'Life Hub 연결이 더 이상 유효하지 않아요. 다시 연결해 주세요.'); }
    return res;
  }
  function disconnect(deps) {
    const t = readJson(deps.storage, TOKENS_KEY);
    deps.storage.removeItem(TOKENS_KEY);
    if (t && t.refresh_token) deps.fetch(LIFEHUB_ORIGIN + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: t.refresh_token, token_type_hint: 'refresh_token', client_id: CLIENT_ID }).toString() }).catch(() => {});
  }

  /* ---------- 승인·거절과 동기화 ---------- */
  function rejectLocally(key, deps) {
    const list = readJson(deps.storage, REJECTIONS_KEY) || [];
    if (!list.includes(key)) deps.storage.setItem(REJECTIONS_KEY, JSON.stringify([...list, key]));
  }
  function rememberReceipt(key, entityId, deps) {
    const map = readJson(deps.storage, RECEIPTS_KEY) || {};
    map[key] = entityId;
    deps.storage.setItem(RECEIPTS_KEY, JSON.stringify(map));
  }
  async function sync(deps) {
    const done = readJson(deps.storage, OUTCOMES_KEY) || {};
    const result = { proposals: [], receiptsSent: 0, rejectionsSent: 0, conflicts: 0, waiting: 0 };
    const record = (key, res, ok) => {
      if (res.ok) done[key] = ok; else if (res.status === 409) done[key] = 'conflict'; else if (res.status === 404) done[key] = 'missing';
      else { result.waiting++; return false; }
      deps.storage.setItem(OUTCOMES_KEY, JSON.stringify(done));
      return res.ok;
    };
    const decided = new Set();
    for (const [key, entityId] of Object.entries(readJson(deps.storage, RECEIPTS_KEY) || {})) {
      if (!KEY.test(key) || !/^[A-Za-z0-9_-]{1,128}$/.test(entityId)) continue;
      decided.add(key);
      if (done[key]) continue;
      if (record(key, await api(deps, 'POST', '/receipts', { key, entity_type: 'station_visit', entity_id: entityId }), 'confirmed')) result.receiptsSent++;
    }
    for (const key of readJson(deps.storage, REJECTIONS_KEY) || []) {
      decided.add(key);
      if (done[key]) continue;
      if (record(key, await api(deps, 'POST', '/rejections', { key }), 'rejected')) result.rejectionsSent++;
    }
    const res = await api(deps, 'GET', '/candidates?status=pending&limit=100');
    if (!res.ok) throw new LifeHubError('server', `Life Hub 제안을 가져오지 못했어요 (${res.status})`);
    const body = await res.json().catch(() => null);
    if (!body || !Array.isArray(body.candidates)) throw new LifeHubError('server', 'Life Hub 응답 형식이 올바르지 않아요.');
    for (const item of body.candidates) { const p = parseProposal(item); if (p && !decided.has(p.key)) result.proposals.push(p); }
    result.conflicts = Object.values(done).filter((v) => v === 'conflict').length;
    return result;
  }

  /** 승인: 그 날짜로 기본 도장을 찍어요. 이미 도장이 있으면 날짜·사진을 그대로 둬요. 저장했으면 true */
  function stampFromProposal(p, stationKey, lineN) {
    const had = state.stamps[stationKey];
    if (!had) {
      state.stamps[stationKey] = { d: p.date, l: lineN };
      if (!save()) { delete state.stamps[stationKey]; return { ok: false }; }
      emit('stamps', { name: stationKey, fresh: true });
    }
    return { ok: true, existed: !!had, date: had ? had.d : p.date };
  }

  /* ---------- 기록 서랍 안의 화면 ---------- */
  let proposals = [];
  let syncing = false;
  let message = '';
  let justStamped = null;   // { key, lineN }: 사진을 붙이러 그 역을 열 수 있게
  let callbackOnce = null;

  function badge(L) {
    return `<span class="lbadge${isText(L) ? ' txt' : ''}" style="background:${L.color};color:${L.ink}" aria-hidden="true">${esc(lineShort(L))}</span>`;
  }

  function mountLifeHub(box, opts) {
    const deps = browserDeps();
    const hint = document.createElement('button');
    hint.type = 'button';
    hint.className = 'hub-hint';
    hint.hidden = true;
    opts.button.after(hint);
    hint.addEventListener('click', () => opts.openAt());

    async function runSync() {
      if (!isConnected(deps)) { paint(); return; }
      syncing = true; paint();
      try {
        const r = await sync(deps);
        proposals = r.proposals;
        if (r.conflicts) message = `${r.conflicts}개 제안은 Life Hub와 상태가 달라요. 도장첩은 그대로예요.`;
      } catch (e) {
        if (e.kind === 'not_connected') proposals = [];
        message = e.message || '동기화하지 못했어요.';
      } finally { syncing = false; paint(); }
    }

    function paint() {
      const connected = isConnected(deps);
      hint.hidden = proposals.length === 0;
      hint.textContent = '제안 ' + proposals.length;
      hint.setAttribute('aria-label', 'Claude가 제안한 역 방문 ' + proposals.length + '개 보기');
      const rows = proposals.map((p) => {
        const { choices, exact } = findStations(p);
        const pickName = 'hub-' + p.key.replace(/[^A-Za-z0-9]/g, '');
        const options = choices.map((st) => {
          const n = lineFor(st, p);
          return `<label class="radio hub-choice"><input type="radio" name="${pickName}" value="${esc(st.name)}" data-line="${esc(n)}"${exact ? ' checked' : ''}><span class="dot" aria-hidden="true"></span>${badge(LINE[n])}<span>${esc(st.label)}${state.stamps[st.name] ? ' <small>도장 있음</small>' : ''}</span></label>`;
        }).join('');
        return `<li class="hub-item" data-key="${esc(p.key)}">
  <p class="hub-what"><strong>${esc(p.station)}</strong>${p.line ? ' · ' + esc(p.line) : ''} · ${esc(dotDate(p.date))}</p>
  ${p.note ? `<p class="hint">“${esc(p.note)}”</p>` : ''}
  ${choices.length ? `<div class="hub-choices">${options}</div>` : '<p class="hint">이 이름의 역을 찾지 못했어요. 맞지 않으면 거절해 주세요.</p>'}
  <div class="backup-actions">
    <button type="button" class="pill" data-act="stamp"${choices.length ? '' : ' disabled'}>도장 찍기</button>
    <button type="button" class="pill" data-act="reject">거절</button>
  </div>
</li>`;
      }).join('');
      box.innerHTML = `
<p class="hint">Claude에게 다녀온 역을 말하면 여기에 제안으로 와요. 확인하고 「도장 찍기」를 눌러야 기록돼요. 사진 스티커는 찍은 뒤 그 역을 열어 붙일 수 있어요.</p>
${connected ? `<div class="backup-actions"><button type="button" class="pill" data-act="sync"${syncing ? ' disabled' : ''}>${syncing ? '동기화 중…' : '지금 동기화'}</button><button type="button" class="pill" data-act="disconnect">연결 해제</button></div>`
    : `<div class="backup-actions"><button type="button" class="pill" data-act="connect"${connectAvailable(location) ? '' : ' disabled'}>Life Hub 연결</button></div>${connectAvailable(location) ? '' : '<p class="hint">배포된 주소에서만 연결할 수 있어요.</p>'}`}
${connected && !proposals.length && !syncing ? '<p class="hint">검토할 제안이 없어요.</p>' : ''}
${rows ? `<ul class="hub-list">${rows}</ul>` : ''}
<p class="note" role="status">${esc(message)}</p>
${justStamped ? `<button type="button" class="pill" data-act="open">${esc(label(justStamped.key))}역 열어서 사진 붙이기</button>` : ''}`;
    }

    box.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'connect') {
        beginConnect(deps).then((u) => location.assign(u)).catch((err) => { message = err.message; paint(); });
        return;
      }
      if (act === 'disconnect') { disconnect(deps); proposals = []; message = 'Life Hub 연결을 해제했어요.'; paint(); return; }
      if (act === 'sync') { runSync(); return; }
      if (act === 'open' && justStamped) { const j = justStamped; justStamped = null; paint(); opts.close(); opts.onSelect(j.key, j.lineN); return; }
      const li = btn.closest('.hub-item');
      const p = li && proposals.find((x) => x.key === li.dataset.key);
      if (!p) return;
      if (act === 'reject') {
        rejectLocally(p.key, deps);
        justStamped = null;
        proposals = proposals.filter((x) => x.key !== p.key);
        message = `${p.station} 제안을 거절했어요. 도장첩은 바뀌지 않았어요.`;
        paint(); runSync();
        return;
      }
      if (act === 'stamp') {
        const picked = li.querySelector('input[type=radio]:checked');
        if (!picked) { message = '도장을 찍을 역을 골라 주세요.'; paint(); return; }
        const key = picked.value, lineN = LINE[picked.dataset.line] ? LINE[picked.dataset.line].n : STATIONS.get(key).lines[0];
        const r = stampFromProposal(p, key, lineN);
        if (!r.ok) { message = '기기에 저장하지 못했어요. 기록 › 백업에서 내보내 두세요.'; paint(); return; }
        rememberReceipt(p.key, entityIdFor(key), deps);
        proposals = proposals.filter((x) => x.key !== p.key);
        message = r.existed ? `${label(key)}역은 이미 ${dotDate(r.date)} 도장이 있어서 그대로 뒀어요.` : `${label(key)}역에 ${dotDate(r.date)} 도장을 찍었어요.`;
        justStamped = { key, lineN };
        paint();
        runSync();
      }
    });

    on('stamps', () => { if (proposals.length) paint(); });
    paint();
    (callbackOnce = callbackOnce || completeStoredCallback(deps))
      .then((done) => { if (done) { message = 'Life Hub에 연결했어요.'; opts.openAt(); } runSync(); })
      .catch((e) => { message = e.message || 'Life Hub에 연결하지 못했어요.'; paint(); });
  }

  Object.assign(C, { mountLifeHub, lifehub: { parseProposal, findStations, lineFor, entityIdFor, sync, beginConnect, completeStoredCallback, stampFromProposal } });
})();
