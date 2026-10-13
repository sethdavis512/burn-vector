import { clamp } from './math';
import { STORAGE_PREFIX } from './storage';

export type SoundId =
  | 'blaster'
  | 'pulse'
  | 'ion'
  | 'neutron'
  | 'mass'
  | 'plasma'
  | 'beam'
  | 'rocket'
  | 'missile'
  | 'torpedo'
  | 'shard'
  | 'lance'
  | 'ripper'
  | 'rail'
  | 'hitShield'
  | 'hitArmor'
  | 'explodeSmall'
  | 'explodeLarge'
  | 'explodeHuge'
  | 'jumpOut'
  | 'jumpIn'
  | 'land'
  | 'takeoff'
  | 'click'
  | 'select'
  | 'buy'
  | 'sell'
  | 'error'
  | 'alert'
  | 'disabled'
  | 'board'
  | 'message'
  | 'mission';

type MusicMood = 'title' | 'space' | 'port' | 'none';

// Chord voicings (Hz) for the ambient pad, one progression per mood.
const PROGRESSIONS: Record<Exclude<MusicMood, 'none'>, number[][]> = {
  title: [
    [110.0, 164.81, 220.0, 261.63, 329.63],
    [87.31, 130.81, 174.61, 220.0, 329.63],
    [98.0, 146.83, 196.0, 246.94, 293.66],
    [82.41, 123.47, 164.81, 196.0, 246.94],
  ],
  space: [
    [73.42, 110.0, 146.83, 174.61, 220.0],
    [65.41, 98.0, 130.81, 164.81, 196.0],
    [58.27, 87.31, 116.54, 146.83, 174.61],
    [69.3, 103.83, 138.59, 164.81, 207.65],
  ],
  port: [
    [130.81, 196.0, 246.94, 329.63],
    [110.0, 164.81, 220.0, 277.18],
    [146.83, 220.0, 261.63, 349.23],
    [123.47, 185.0, 246.94, 293.66],
  ],
};

const PREFS_KEY = `${STORAGE_PREFIX}audio`;
const MASTER_VOLUME = 0.6;

function loadPrefs(): { muted: boolean; music: boolean } {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { muted?: boolean; music?: boolean };
      return { muted: !!p.muted, music: p.music !== false };
    }
  } catch {
    // Storage unavailable; fall back to defaults.
  }
  // Sound starts off until the player turns it on.
  return { muted: true, music: true };
}

const SPARKLE_SCALES: Record<Exclude<MusicMood, 'none'>, number[]> = {
  title: [440, 523.25, 587.33, 659.25, 783.99, 880],
  space: [293.66, 349.23, 392.0, 440, 523.25, 587.33],
  port: [523.25, 587.33, 659.25, 783.99, 880, 987.77],
};

/** Synthesized sound effects and a generative ambient score. No audio files. */
export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private delay!: DelayNode;
  private noise!: AudioBuffer;
  private last = new Map<string, number>();
  private engine: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private mood: MusicMood = 'none';
  private padVoices: { osc: OscillatorNode; gain: GainNode }[] = [];
  private chordIndex = 0;
  private musicTimer: number | null = null;
  private sparkleTimer: number | null = null;
  private listeners: ((muted: boolean) => void)[] = [];
  listenerX = 0;
  listenerY = 0;
  muted: boolean;
  musicOn: boolean;

  constructor() {
    const prefs = loadPrefs();
    this.muted = prefs.muted;
    this.musicOn = prefs.music;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(comp);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.22 : 0;
    this.musicBus.connect(this.master);

    // Feedback delay gives the score its spacious tail.
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = 0.48;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2200;
    this.delay.connect(damp);
    damp.connect(fb);
    fb.connect(this.delay);
    this.delay.connect(this.musicBus);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    if (this.mood !== 'none') {
      const m = this.mood;
      this.mood = 'none';
      this.setMusic(m);
    }
  }

  private savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ muted: this.muted, music: this.musicOn }));
    } catch {
      // Not persisted; the setting still applies for this session.
    }
  }

  /** Master mute for every sound in the game. */
  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.03);
    if (muted) this.setThrust(false, false);
    this.savePrefs();
    for (const l of this.listeners) l(muted);
  }

  toggleMuted() {
    this.init();
    this.setMuted(!this.muted);
    return this.muted;
  }

  onMuteChange(fn: (muted: boolean) => void) {
    this.listeners.push(fn);
  }

  setMusicOn(on: boolean) {
    this.musicOn = on;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.3);
    this.savePrefs();
  }

  private out(x: number | undefined, y: number | undefined, vol: number): AudioNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    let v = vol;
    let pan = 0;
    if (x !== undefined && y !== undefined) {
      const dx = x - this.listenerX;
      const dy = y - this.listenerY;
      const d = Math.hypot(dx, dy);
      const att = 1 / (1 + (d / 650) ** 2);
      if (att < 0.025) return null;
      v *= att;
      pan = clamp(dx / 900, -0.85, 0.85);
    }
    const g = ctx.createGain();
    g.gain.value = v;
    if (Math.abs(pan) > 0.02) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.sfx);
    } else {
      g.connect(this.sfx);
    }
    return g;
  }

  private tone(out: AudioNode, type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, attack = 0.004) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hiss(out: AudioNode, ftype: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, q = 0.8, delay = 0, attack = 0.004) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = ftype;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(out);
    s.start(t, Math.random() * 1.2);
    s.stop(t + dur + 0.05);
  }

  play(id: SoundId, x?: number, y?: number, vol = 1) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const now = ctx.currentTime;
    const prev = this.last.get(id) ?? -1;
    const gap = id === 'beam' ? 0.11 : 0.035;
    if (now - prev < gap) return;
    this.last.set(id, now);
    const o = this.out(x, y, vol);
    if (!o) return;
    switch (id) {
      case 'blaster':
        this.tone(o, 'square', 880, 210, 0.13, 0.09);
        this.hiss(o, 'bandpass', 2400, 700, 0.06, 0.06, 2);
        break;
      case 'pulse':
        this.tone(o, 'sawtooth', 1500, 480, 0.1, 0.07);
        this.tone(o, 'sine', 2100, 900, 0.08, 0.05);
        break;
      case 'ion':
        this.tone(o, 'sine', 320, 1300, 0.16, 0.12);
        this.tone(o, 'triangle', 640, 2500, 0.12, 0.05);
        break;
      case 'neutron':
        this.tone(o, 'sawtooth', 520, 90, 0.24, 0.1);
        this.hiss(o, 'lowpass', 3200, 300, 0.16, 0.09);
        break;
      case 'mass':
        this.hiss(o, 'lowpass', 4200, 200, 0.2, 0.22);
        this.tone(o, 'square', 190, 50, 0.16, 0.09);
        break;
      case 'plasma':
        this.tone(o, 'sawtooth', 240, 60, 0.36, 0.13);
        this.hiss(o, 'bandpass', 900, 200, 0.3, 0.1, 1.2);
        this.tone(o, 'sine', 130, 40, 0.3, 0.16);
        break;
      case 'ripper':
        this.tone(o, 'sawtooth', 760, 160, 0.13, 0.1);
        this.hiss(o, 'bandpass', 1800, 500, 0.1, 0.07, 1.5);
        break;
      case 'rail':
        this.tone(o, 'square', 3200, 120, 0.26, 0.08);
        this.hiss(o, 'highpass', 5000, 900, 0.22, 0.1);
        break;
      case 'beam':
        this.tone(o, 'sawtooth', 170, 160, 0.15, 0.045);
        this.tone(o, 'square', 1250, 1210, 0.15, 0.018);
        break;
      case 'lance':
        this.tone(o, 'sine', 720, 690, 0.16, 0.06);
        this.tone(o, 'triangle', 1440, 1380, 0.16, 0.035);
        break;
      case 'shard':
        this.tone(o, 'triangle', 2300, 1100, 0.08, 0.07);
        this.tone(o, 'sine', 3400, 1700, 0.06, 0.04);
        break;
      case 'rocket':
        this.hiss(o, 'bandpass', 600, 2100, 0.35, 0.12, 1.4);
        this.tone(o, 'square', 120, 260, 0.2, 0.04);
        break;
      case 'missile':
        this.hiss(o, 'bandpass', 420, 1900, 0.55, 0.14, 1.2);
        this.tone(o, 'sawtooth', 200, 620, 0.42, 0.045);
        break;
      case 'torpedo':
        this.tone(o, 'sine', 90, 270, 0.65, 0.22, 0, 0.05);
        this.hiss(o, 'lowpass', 600, 1600, 0.6, 0.12);
        break;
      case 'hitShield':
        this.tone(o, 'sine', 1800, 700, 0.09, 0.07);
        break;
      case 'hitArmor':
        this.hiss(o, 'highpass', 1300, 600, 0.08, 0.14);
        this.tone(o, 'square', 140, 90, 0.06, 0.05);
        break;
      case 'explodeSmall':
        this.hiss(o, 'lowpass', 2600, 90, 0.55, 0.42);
        this.tone(o, 'sine', 150, 40, 0.45, 0.32);
        break;
      case 'explodeLarge':
        this.hiss(o, 'lowpass', 1900, 60, 1.4, 0.6, 0.8, 0, 0.01);
        this.tone(o, 'sine', 95, 25, 1.2, 0.5);
        this.hiss(o, 'bandpass', 600, 120, 0.9, 0.25, 1, 0.12);
        break;
      case 'explodeHuge':
        this.hiss(o, 'lowpass', 1600, 40, 2.6, 0.8, 0.7, 0, 0.02);
        this.tone(o, 'sine', 65, 20, 2.3, 0.6);
        this.hiss(o, 'bandpass', 500, 90, 1.8, 0.35, 1, 0.3);
        break;
      case 'jumpOut':
        this.tone(o, 'sawtooth', 55, 1700, 1.5, 0.08, 0, 0.7);
        this.hiss(o, 'bandpass', 180, 4200, 1.5, 0.22, 1.2, 0, 0.9);
        break;
      case 'jumpIn':
        this.hiss(o, 'bandpass', 4200, 160, 0.9, 0.24, 1.2);
        this.tone(o, 'sine', 900, 70, 0.8, 0.14);
        break;
      case 'land':
        this.tone(o, 'sine', 523, 523, 0.3, 0.09);
        this.tone(o, 'sine', 784, 784, 0.4, 0.08, 0.13);
        break;
      case 'takeoff':
        this.hiss(o, 'lowpass', 260, 1300, 0.9, 0.2, 0.8, 0, 0.2);
        this.tone(o, 'sawtooth', 70, 190, 0.9, 0.05, 0, 0.2);
        break;
      case 'click':
        this.tone(o, 'square', 1250, 1000, 0.03, 0.035);
        break;
      case 'select':
        this.tone(o, 'sine', 880, 1320, 0.07, 0.06);
        break;
      case 'buy':
        this.tone(o, 'sine', 1320, 1320, 0.08, 0.06);
        this.tone(o, 'sine', 1760, 1760, 0.12, 0.06, 0.07);
        break;
      case 'sell':
        this.tone(o, 'sine', 1760, 1760, 0.08, 0.06);
        this.tone(o, 'sine', 1320, 1320, 0.12, 0.06, 0.07);
        break;
      case 'error':
        this.tone(o, 'square', 170, 120, 0.2, 0.06);
        break;
      case 'alert':
        this.tone(o, 'square', 880, 880, 0.08, 0.05);
        this.tone(o, 'square', 880, 880, 0.08, 0.05, 0.14);
        break;
      case 'disabled':
        this.tone(o, 'sawtooth', 420, 60, 0.9, 0.1);
        this.hiss(o, 'lowpass', 900, 100, 0.8, 0.12);
        break;
      case 'board':
        this.tone(o, 'square', 210, 180, 0.08, 0.08);
        this.tone(o, 'square', 190, 160, 0.1, 0.08, 0.15);
        this.hiss(o, 'highpass', 3000, 1500, 0.3, 0.06, 1, 0.3);
        break;
      case 'message':
        this.tone(o, 'sine', 1500, 1500, 0.06, 0.035);
        break;
      case 'mission':
        this.tone(o, 'triangle', 660, 660, 0.12, 0.07);
        this.tone(o, 'triangle', 880, 880, 0.12, 0.07, 0.1);
        this.tone(o, 'triangle', 1320, 1320, 0.25, 0.07, 0.2);
        break;
    }
  }

  /** Continuous engine rumble for the player ship. */
  setThrust(on: boolean, afterburner: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    if (!this.engine) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 160;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfx);
      src.start();
      this.engine = { gain, filter };
    }
    const target = on && !this.muted ? (afterburner ? 0.22 : 0.12) : 0;
    this.engine.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    this.engine.filter.frequency.setTargetAtTime(afterburner ? 420 : 170, ctx.currentTime, 0.1);
  }

  setMusic(mood: MusicMood) {
    if (mood === this.mood) return;
    this.mood = mood;
    const ctx = this.ctx;
    if (!ctx) return;
    this.stopPad();
    if (this.musicTimer) window.clearInterval(this.musicTimer);
    if (this.sparkleTimer) window.clearTimeout(this.sparkleTimer);
    this.musicTimer = null;
    this.sparkleTimer = null;
    if (mood === 'none') return;
    this.chordIndex = 0;
    this.playChord();
    this.musicTimer = window.setInterval(() => this.playChord(), mood === 'port' ? 7000 : 9000);
    this.scheduleSparkle();
  }

  private stopPad() {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const v of this.padVoices) {
      v.gain.gain.cancelScheduledValues(ctx.currentTime);
      v.gain.gain.setTargetAtTime(0, ctx.currentTime, 1.2);
      v.osc.stop(ctx.currentTime + 5);
    }
    this.padVoices = [];
  }

  private playChord() {
    const ctx = this.ctx;
    if (!ctx || this.mood === 'none') return;
    const prog = PROGRESSIONS[this.mood];
    const chord = prog[this.chordIndex % prog.length]!;
    this.chordIndex++;
    this.stopPad();
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.mood === 'port' ? 1400 : 900;
    filter.Q.value = 0.6;
    filter.connect(this.musicBus);
    filter.connect(this.delay);
    chord.forEach((f, i) => {
      for (const detune of [-6, 5]) {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? 'sine' : this.mood === 'port' ? 'triangle' : 'sine';
        osc.frequency.value = f;
        osc.detune.value = detune + (Math.random() - 0.5) * 4;
        const gain = ctx.createGain();
        const peak = (i === 0 ? 0.11 : 0.06) / (1 + i * 0.15);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(peak, t + 3);
        osc.connect(gain);
        gain.connect(filter);
        osc.start(t);
        this.padVoices.push({ osc, gain });
      }
    });
  }

  private scheduleSparkle() {
    if (this.mood === 'none') return;
    const wait = 1800 + Math.random() * 4200;
    this.sparkleTimer = window.setTimeout(() => {
      const ctx = this.ctx;
      if (!ctx || this.mood === 'none') return;
      const scale = SPARKLE_SCALES[this.mood];
      const f = scale[Math.floor(Math.random() * scale.length)]!;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      osc.connect(g);
      g.connect(this.musicBus);
      g.connect(this.delay);
      osc.start(t);
      osc.stop(t + 2.5);
      this.scheduleSparkle();
    }, wait);
  }
}

export const audio = new AudioEngine();
