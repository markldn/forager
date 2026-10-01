// Procedural sound: wing-beat buzz (~230 Hz), hive hum, waggle-run pulses, wind, birdsong, bee-eater calls and a pad score.
export function createAudio() {
  const A = new (window.AudioContext || window.webkitAudioContext)();
  const out = A.createDynamicsCompressor(); out.connect(A.destination);
  const master = A.createGain(); master.gain.value = .8; master.connect(out);
  // reverb from decaying noise
  const ir = A.createBuffer(2, A.sampleRate * 2.5, A.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
  const rev = A.createConvolver(); rev.buffer = ir; const revG = A.createGain(); revG.gain.value = .35; rev.connect(revG); revG.connect(master);
  const noise = A.createBuffer(1, A.sampleRate * 2, A.sampleRate); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const g = (v, to = master) => { const x = A.createGain(); x.gain.value = v; x.connect(to); return x; };
  const osc = (type, f, to) => { const o = A.createOscillator(); o.type = type; o.frequency.value = f; o.connect(to); o.start(); return o; };
  // hero buzz: two saws through a resonant band
  const buzzF = A.createBiquadFilter(); buzzF.type = 'bandpass'; buzzF.Q.value = 1.2; buzzF.frequency.value = 900;
  const buzzG = g(0); buzzF.connect(buzzG);
  const am = A.createGain(); am.connect(buzzF); const b1 = osc('sawtooth', 230, am), b2 = osc('sawtooth', 461, am);
  const lfo = osc('sine', 7, g(.25, am.gain));
  // swarm
  const swF = A.createBiquadFilter(); swF.type = 'lowpass'; swF.frequency.value = 1200; const swG = g(0); swF.connect(swG); swG.connect(rev);
  const sw = [205, 219, 233, 247, 262].map(f => osc('sawtooth', f, g(.12, swF)));
  // hive hum
  const hF = A.createBiquadFilter(); hF.type = 'lowpass'; hF.frequency.value = 500; const hG = g(0); hF.connect(hG); hG.connect(rev);
  [118, 121, 236, 241, 248, 355].forEach(f => osc('sawtooth', f, g(.08, hF)));
  // waggle-run sound: 250 Hz pulses
  const wgG = g(0); const wg = osc('square', 260, A.createBiquadFilter()); wg.disconnect(); const wgF = A.createBiquadFilter(); wgF.type = 'bandpass'; wgF.frequency.value = 260; wgF.Q.value = 3; wg.connect(wgF); wgF.connect(wgG);
  // wind
  const wn = A.createBufferSource(); wn.buffer = noise; wn.loop = true; const wF = A.createBiquadFilter(); wF.type = 'lowpass'; wF.frequency.value = 400; const wG = g(0); wn.connect(wF); wF.connect(wG); wn.start();
  // pad
  const padG = g(0); const padF = A.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 1400; padF.connect(padG); padG.connect(rev);
  const chords = [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 55, 59, 66], [45, 52, 57, 61, 64]];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  let nextChord = 0, ci = 0, nextBird = 0, nextNote = 0;
  function chord(t) {
    for (const m of chords[ci % 4]) for (const det of [-3, 3]) {
      const o = A.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m); o.detune.value = det;
      const e = A.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(.035, t + 3); e.gain.linearRampToValueAtTime(0, t + 9.5);
      o.connect(e); e.connect(padF); o.start(t); o.stop(t + 10);
    }
    ci++;
  }
  function pluck(t, m, v = .05) {
    const o = A.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m); const e = A.createGain();
    e.gain.setValueAtTime(v, t); e.gain.exponentialRampToValueAtTime(.0005, t + 2.5); o.connect(e); e.connect(padG); e.connect(rev); o.start(t); o.stop(t + 2.6);
  }
  function bird(t, eater) { // skylark-ish trill or bee-eater "prruip"
    const o = A.createOscillator(), e = A.createGain(), m = A.createOscillator(), mg = A.createGain();
    const f0 = eater ? 2300 : 3000 + Math.random() * 2500, n = eater ? 2 : 3 + Math.floor(Math.random() * 6);
    o.type = 'sine'; m.frequency.value = eater ? 60 : 30 + Math.random() * 40; mg.gain.value = eater ? 500 : 600 + Math.random() * 900; m.connect(mg); mg.connect(o.frequency);
    o.frequency.setValueAtTime(f0, t); e.gain.setValueAtTime(0, t);
    for (let i = 0; i < n; i++) { const s = t + i * (eater ? .22 : .09); e.gain.linearRampToValueAtTime(eater ? .05 : .02, s + .02); e.gain.linearRampToValueAtTime(0, s + (eater ? .18 : .07)); o.frequency.linearRampToValueAtTime(f0 * (eater ? 1.15 : 1 + .3 * Math.random()), s + .05); }
    const p = A.createStereoPanner(); p.pan.value = Math.random() * 2 - 1; o.connect(e); e.connect(p); p.connect(master); p.connect(rev);
    o.start(t); m.start(t); o.stop(t + n * .25 + .3); m.stop(t + n * .25 + .3);
  }
  const set = (p, v, k = .08) => p.setTargetAtTime(v, A.currentTime, k);
  return {
    ctx: A,
    update(s) {
      for (const k in s) if (typeof s[k] === 'number' && !isFinite(s[k])) s[k] = 0;
      const t = A.currentTime;
      set(buzzG.gain, s.buzz * .22); set(b1.frequency, 225 + s.pitch * 30); set(b2.frequency, 452 + s.pitch * 60); set(buzzF.frequency, 700 + s.pitch * 900);
      set(swG.gain, s.swarm * .1); set(hG.gain, s.inside ? .5 : 0, .5); set(wG.gain, s.inside ? 0 : .05 + s.wind * .12, .3); set(wF.frequency, 300 + s.wind * 900);
      set(wgG.gain, s.waggle * .12, .02); set(padG.gain, s.music * .9, 1);
      if (t > nextChord) { chord(t + .05); nextChord = t + 8; }
      if (s.music > .3 && t > nextNote) { const sc = [62, 64, 66, 69, 71, 74, 76, 78]; pluck(t + .05, sc[Math.floor(Math.random() * sc.length)], .03); nextNote = t + 1.5 + Math.random() * 3; }
      if (!s.inside && t > nextBird) { bird(t + .05, false); nextBird = t + 2 + Math.random() * 6; }
      if (s.eater) { bird(t + .02, true); }
    },
    mute(m) { master.gain.value = m ? 0 : .8; }
  };
}
