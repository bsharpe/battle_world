const NOTE = (midi) => 440 * 2 ** ((midi - 69) / 12);
// ponytail: approximated 9-note 1812 Overture fanfare; check against arcade footage of the 100K bonus and retune.
const FANFARE = [[67, 0.15], [67, 0.15], [67, 0.15], [72, 0.3], [71, 0.15], [72, 0.15], [74, 0.3], [76, 0.3], [79, 0.6]];

export function createAudio() {
  let ctx = null, master, noise, engine, saucer, missile;

  function drone(type, freq, cutoff, lfoHz = 0, lfoDepth = 0) {
    const osc = ctx.createOscillator(), lp = ctx.createBiquadFilter(), gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    lp.frequency.value = cutoff;
    gain.gain.value = 0;
    osc.connect(lp).connect(gain).connect(master);
    if (lfoHz) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = lfoHz;
      depth.gain.value = lfoDepth;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start();
    }
    osc.start();
    return { osc, gain };
  }

  function tone(type, freq, at, dur, vol, endFreq = freq) {
    const t = ctx.currentTime + at, osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  function burst(dur, vol, fromHz, toHz) {
    const t = ctx.currentTime, src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noise;
    lp.frequency.setValueAtTime(fromHz, t);
    lp.frequency.exponentialRampToValueAtTime(toHz, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  const SOUNDS = {
    fire: (e) => {
      const v = e.owner === 'player' ? 0.9 : 0.3;
      burst(0.4, v, 3500, 250);
      tone('triangle', 160, 0, 0.25, v * 0.6, 45);
    },
    shellBurst: () => burst(0.3, 0.25, 1800, 200),
    enemyDestroyed: () => burst(1.4, 0.8, 2500, 90),
    saucerHit: () => { burst(1.0, 0.6, 3000, 300); tone('sine', 900, 0, 1.0, 0.3, 200); },
    playerHit: () => burst(2.2, 1.0, 5000, 60),
    blocked: () => tone('square', 160, 0, 0.25, 0.25, 70),
    enemySpawn: () => [0, 1, 2].forEach((i) => tone('sine', 300, i * 0.18, 0.1, 0.3)),
    bonusTank: (e) => (e.big ? SOUNDS.fanfare() : [0, 1, 2, 3].forEach((i) => tone('square', 880, i * 0.16, 0.09, 0.2))),
    radarPing: () => tone('sine', 1250, 0, 0.07, 0.12),
    fanfare: () => {
      let at = 0;
      for (const [n, d] of FANFARE) { tone('square', NOTE(n), at, d * 0.9, 0.2); at += d; }
    },
  };

  const set = (d, vol, freq) => {
    d.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.05);
    if (freq) d.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.1);
  };

  return {
    unlock() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; // ponytail: white noise; a 12 kHz LFSR would add arcade grit
      engine = drone('sawtooth', 30, 260);
      saucer = drone('sine', 600, 4000, 7, 180);
      missile = drone('square', 90, 900, 18, 30);
    },
    handle(events) {
      if (!ctx) return;
      for (const e of events) SOUNDS[e.type]?.(e);
    },
    update({ on, engine: level = 0, saucer: s = false, missile: m = false }) {
      if (!ctx) return;
      set(engine, on ? 0.08 + 0.1 * level : 0, 30 + 28 * level);
      set(saucer, on && s ? 0.08 : 0);
      set(missile, on && m ? 0.1 : 0);
    },
  };
}
