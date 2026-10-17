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
  /* 안내방송: 실제 녹음은 저작권이 있어서 못 쓰고, 기기 TTS로 서울 지하철 안내 문장을 흉내 내요.
     한국어 → 영어 순서, 앞에 짧은 알림음. 문 방향은 데이터가 없어 빼요 */
  const tts = 'speechSynthesis' in window ? window.speechSynthesis : null;
  const pickVoice = (lang, prefer) => {
    if (!tts) return null;
    const vs = tts.getVoices().filter((v) => v.lang.replace('_', '-').startsWith(lang));
    return vs.find((v) => prefer.test(v.name)) || vs.find((v) => v.localService) || vs[0] || null;
  };
  if (tts && tts.addEventListener) tts.addEventListener('voiceschanged', () => {});
  /* iOS는 사용자가 누른 그 순간에 한 번 말해 둬야 나중(뽑기가 끝난 뒤)에도 소리가 나요 */
  function unlockVoice() {
    if (!state.voice || !tts) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    tts.speak(u);
  }
  function announceText(name, lineN) {
    const st = STATIONS.get(name);
    const base = label(name).replace(/역$/, '');
    const others = st ? st.lines.filter((n) => n !== lineN).map((n) => LINE[n]) : [];
    let ko = '이번 역은 ' + base + ', ' + stationQuery(name) + '입니다.';
    if (others.length) ko += ' ' + ro(others.map(lineName).join(', ')) + ' 갈아타실 수 있습니다.';
    let en = '';
    if (st && st.en) {
      en = 'This stop is ' + st.en + '.';
      const enLine = (L) => (isText(L) ? L.en.replace(/–/g, ' ') + (/Line$|AREX/.test(L.en) ? '' : ' Line') : 'Line ' + L.n);
      if (others.length) en += ' You can transfer to ' + others.map(enLine).join(', ') + '.';
    }
    return { ko, en };
  }
  async function announce(name, lineN) {
    if (!state.voice || !tts) return;
    const { ko, en } = announceText(name, lineN);
    tts.cancel();
    if (state.sound) { dingdong(); await sleep(1300); }
    const say = (text, lang, voice) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      if (voice) u.voice = voice;
      u.rate = lang === 'ko-KR' ? 0.92 : 0.9;
      u.pitch = 1.05;
      tts.speak(u);
    };
    say(ko, 'ko-KR', pickVoice('ko', /Yuna|유나|Google/));
    if (en) say(en, 'en-US', pickVoice('en', /Samantha|Google US|Ava|Allison/));
  }
  /* 안내방송 앞 알림음 (직접 만든 음, 실제 지하철 음원 아님) */
  const dingdong = () => {
    tone(1046.5, 0.5, 'sine', 0.06, 0); tone(1318.5, 0.5, 'sine', 0.05, 0.18);
    tone(1568, 0.9, 'sine', 0.05, 0.36);
  };

  Object.assign(C, { actx, audio, tone, tick, chime, thud, tts, pickVoice, unlockVoice, announceText, announce, dingdong });
})();
