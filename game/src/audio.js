// Sound, fully procedural: every effect is a short WebAudio burst, so the game needs
// no audio assets and no network. Audio starts only after the first user gesture,
// which is also when the pointer lock is requested.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    return ctx;
  }
  function resume() {
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
  }

  function noiseBurst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }
  function tone(freq, duration, gainValue, type = 'sine', slideTo = null) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    resume,
    shot(weaponId) {
      ensure();
      if (weaponId === 'pistol') noiseBurst(0.09, 2400, 0.5, 'bandpass');
      else if (weaponId === 'smg') noiseBurst(0.07, 3000, 0.42, 'bandpass');
      else noiseBurst(0.12, 1800, 0.6, 'bandpass');
      tone(180, 0.06, 0.25, 'square', 60);
    },
    // A distant shot: same crack, quieter and duller.
    distantShot() {
      ensure();
      noiseBurst(0.08, 900, 0.14, 'bandpass');
    },
    reload() {
      ensure();
      tone(900, 0.05, 0.12, 'square');
      setTimeout(() => tone(620, 0.05, 0.12, 'square'), 160);
    },
    hit() {
      ensure();
      tone(1400, 0.05, 0.18, 'sine');
    },
    kill() {
      ensure();
      tone(880, 0.07, 0.2, 'sine');
      setTimeout(() => tone(1320, 0.09, 0.2, 'sine'), 70);
    },
    hurt() {
      ensure();
      tone(160, 0.12, 0.3, 'sawtooth', 90);
    },
    explosion() {
      ensure();
      noiseBurst(0.7, 400, 0.9);
      tone(70, 0.5, 0.5, 'sine', 35);
    },
    plantBeep() {
      ensure();
      tone(1200, 0.08, 0.15, 'square');
    },
    defuseBeep() {
      ensure();
      tone(1000, 0.08, 0.15, 'square');
    },
    roundStart() {
      ensure();
      tone(660, 0.1, 0.2, 'sine');
      setTimeout(() => tone(990, 0.12, 0.2, 'sine'), 110);
    },
    roundEnd(won) {
      ensure();
      if (won) {
        tone(523, 0.12, 0.22, 'sine');
        setTimeout(() => tone(784, 0.16, 0.22, 'sine'), 130);
      } else {
        tone(392, 0.14, 0.22, 'sine');
        setTimeout(() => tone(262, 0.2, 0.22, 'sine'), 150);
      }
    },
    buy() {
      ensure();
      tone(1046, 0.06, 0.15, 'sine');
    },
    denied() {
      ensure();
      tone(220, 0.09, 0.18, 'square');
    },
  };
}
