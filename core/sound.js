/* 효과음과 안내방송 */
(() => {
  'use strict';
  const C = window.Core;
  const {
    sleep, LINE, lineName, isText, label, ro, STATIONS, stationQuery, state,
  } = C;

  /* ---------- 소리 ---------- */
  let actx = null;
  function audio() {
    if (!state.sound) return null;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  function tone(freq, dur, type, vol, when) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime + (when || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  const tick = (i) => tone(760 + (i % 3) * 45, 0.035, 'square', 0.016, 0);
  const chime = () => { tone(784, 0.55, 'sine', 0.07, 0); tone(587.33, 0.8, 'sine', 0.07, 0.3); };
  const thud = () => { tone(150, 0.12, 'sine', 0.12, 0); tone(90, 0.18, 'sine', 0.1, 0.02); };
  /* 안내방송: 실제 녹음·음악은 저작권이 있어서 못 쓰고, 기기 음성으로 서울 지하철 안내 문장을 따라 해요.
     알림음(환승역은 직접 만든 국악풍 짧은 곡) → 한국어 → 영어 순서로, 문장마다 잠깐 쉬어요. 문 방향은 데이터가 없어 빼요 */
  const tts = 'speechSynthesis' in window ? window.speechSynthesis : null;
  /* 아이폰에 '향상된·프리미엄' 음성을 받아 두었으면 그걸 먼저 써요 (기본 음성보다 훨씬 자연스러워요) */
  const voiceRank = (v, prefer) => (/premium|프리미엄/i.test(v.name) ? 0 : /enhanced|향상/i.test(v.name) ? 1 : prefer.test(v.name) ? 2 : v.localService ? 3 : 4);
  const pickVoice = (lang, prefer) => {
    if (!tts) return null;
    const vs = tts.getVoices().filter((v) => v.lang.replace('_', '-').startsWith(lang));
    return vs.sort((a, b) => voiceRank(a, prefer) - voiceRank(b, prefer))[0] || null;
  };
  const KO_VOICE = /Yuna|유나|Google/, EN_VOICE = /Samantha|Ava|Allison|Google US/;
  const voiceName = () => { const v = pickVoice('ko', KO_VOICE); return v ? v.name : ''; };
  if (tts && tts.addEventListener) tts.addEventListener('voiceschanged', () => {});
  /* iOS는 사용자가 누른 그 순간에 한 번 말해 둬야 나중(뽑기가 끝난 뒤)에도 소리가 나요 */
  function unlockVoice() {
    if (!state.voice || !tts) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    tts.speak(u);
  }
  const andList = (xs, and) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + and + xs[xs.length - 1]);
  function announceText(name, lineN) {
    const st = STATIONS.get(name);
    const base = label(name).replace(/역$/, '');
    const others = st ? st.lines.filter((n) => n !== lineN).map((n) => LINE[n]) : [];
    const ko = ['이번 역은 ' + base + ', ' + stationQuery(name) + '입니다.'];
    if (others.length) ko.push(ro(others.map(lineName).join(', ')) + ' 갈아타실 고객께서는 이번 역에서 내리시기 바랍니다.');
    const en = [];
    if (st && st.en) {
      en.push('This stop is ' + st.en + '.');
      const enLine = (L) => (!isText(L) ? 'Line ' + L.n : /AREX/.test(L.en) ? 'AREX' : 'the ' + L.en.replace(/–/g, ' ') + (/Line$/.test(L.en) ? '' : ' Line'));
      if (others.length) en.push('You can transfer to ' + andList(others.map(enLine), ', and ') + '.');
    }
    return { ko: ko.join(' '), en: en.join(' '), parts: { ko, en }, transfer: others.length > 0 };
  }
  /* 한 문장씩 말하고 끝날 때까지 기다려요 (끝 신호가 안 오는 기기를 위해 길이로 어림한 시간 뒤에는 넘어가요) */
  function speak(text, lang, voice) {
    return new Promise((res) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      if (voice) u.voice = voice;
      u.rate = lang === 'ko-KR' ? 0.9 : 0.88;
      u.pitch = 1.04;
      const t = setTimeout(res, 1500 + text.length * 160);
      u.onend = u.onerror = () => { clearTimeout(t); res(); };
      tts.speak(u);
    });
  }
  let turn = 0;
  async function announce(name, lineN) {
    if (!state.voice || !tts) return;
    const my = ++turn;
    const { parts, transfer } = announceText(name, lineN);
    tts.cancel();
    if (state.sound) await sleep((transfer ? gugak() : dingdong()) * 1000);
    const ko = pickVoice('ko', KO_VOICE), en = pickVoice('en', EN_VOICE);
    for (const t of parts.ko) { if (my !== turn) return; await speak(t, 'ko-KR', ko); await sleep(220); }
    await sleep(350);
    for (const t of parts.en) { if (my !== turn) return; await speak(t, 'en-US', en); await sleep(180); }
  }

  /* 안내방송 앞 알림음 (직접 만든 음, 실제 지하철 음원 아님). 돌려주는 값은 길이(초) */
  const dingdong = () => {
    tone(1046.5, 0.5, 'sine', 0.06, 0); tone(1318.5, 0.5, 'sine', 0.05, 0.18);
    tone(1568, 0.9, 'sine', 0.05, 0.36);
    return 1.3;
  };

  /* 환승역 음악: 직접 만든 국악풍 짧은 곡 (평조 5음계, 가야금처럼 뜯는 소리 + 장구).
     실제 지하철 환승 음악의 가락을 따라 하지 않았어요 */
  /* a: 소리를 낼 AudioContext (미리 듣기 파일을 만들 때는 OfflineAudioContext) */
  function pluck(a, freq, when, dur, vol, bend) {
    const sr = a.sampleRate, n = Math.floor(sr * (dur + 0.4)), p = Math.max(2, Math.round(sr / freq));
    const buf = a.createBuffer(1, n, sr), d = buf.getChannelData(0);
    const ring = new Float32Array(p);
    for (let i = 0; i < p; i++) ring[i] = Math.random() * 2 - 1;
    for (let k = 0, i = 0; k < n; k++) {       // Karplus-Strong 현 뜯는 소리
      const nx = (i + 1) % p;
      d[k] = ring[i];
      ring[i] = 0.4985 * (ring[i] + ring[nx]);
      i = nx;
    }
    const t = a.currentTime + when;
    const src = a.createBufferSource();
    src.buffer = buf;
    if (bend) {                                  // 농현: 줄을 눌러 음을 살짝 흔들어요
      src.playbackRate.setValueAtTime(1, t);
      src.playbackRate.linearRampToValueAtTime(1.035, t + dur * 0.35);
      src.playbackRate.linearRampToValueAtTime(0.995, t + dur * 0.7);
      src.playbackRate.linearRampToValueAtTime(1.02, t + dur);
    }
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35);
    src.connect(lp).connect(g).connect(a.destination);
    src.start(t);
    src.stop(t + dur + 0.4);
  }
  function janggu(a, when, deep) {
    const t = a.currentTime + when;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(deep ? 120 : 210, t);
    o.frequency.exponentialRampToValueAtTime(deep ? 55 : 140, t + 0.18);
    g.gain.setValueAtTime(deep ? 0.22 : 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (deep ? 0.35 : 0.12));
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + 0.4);
  }
  const gugak = (a = audio()) => {
    const G4 = 392, A4 = 440, C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99;
    const b = 0.26;
    const notes = [[D5, 0], [E5, 1], [G5, 2], [E5, 3], [D5, 4], [C5, 5], [D5, 6, 2.6, true], [A4, 9], [C5, 10], [A4, 11], [G4, 12, 3.2, true]];
    if (a) {
      notes.forEach(([f, at, len, bend]) => pluck(a, f, at * b, (len || 1) * b, 0.16, bend));
      [[0, true], [2, false], [3, false], [4, true], [9, true], [11, false], [12, true]].forEach(([at, deep]) => janggu(a, at * b, deep));
    }
    return 12 * b + 1.1;
  };

  Object.assign(C, { audio, tone, tick, chime, thud, tts, pickVoice, voiceName, unlockVoice, announceText, announce, dingdong, gugak });
})();
