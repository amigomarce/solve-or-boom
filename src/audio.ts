// Sound: Web Audio tones and noise, started on the first input, muted with M. No audio files.
// Every sound goes through a limiter (a hard-knee compressor) and then the volume gain, so
// overlapping automatic fire cannot clip. Sound never reads the game's rng(): the noise buffer has
// its own generator, and nothing here touches the game state.
// Gun shots: four layers each (click, noise body, thump, tail with echoes); levels, tails, pan
// strength and the distance filter are the sfx_* values in data/config.json.
import { tune } from './config';
import { audioContext } from './hook';

let audio: { ac: AudioContext; out: GainNode; limit: DynamicsCompressorNode; trim: GainNode } | null = null;
let muted = false, noiseBuf: AudioBuffer | null = null;

/** Sets the limiter from tune.sfx_limit_db and undoes the compressor's automatic makeup gain. */
function setLimiter(): void {
  if (!audio) return;
  const T = Number(tune.sfx_limit_db), R = 20;
  audio.limit.threshold.value = T; audio.limit.ratio.value = R; audio.limit.knee.value = 0;
  audio.limit.attack.value = 0.002; audio.limit.release.value = 0.12;
  // The Web Audio compressor adds makeup gain = (1 / curve(1.0))^0.6; with a hard knee curve(1.0) is
  // T + (0 - T) / R dB. Multiplying by curve(1.0)^0.6 keeps quiet sounds as loud as before.
  audio.trim.gain.value = Math.pow(10, ((T - T / R) / 20) * 0.6);
}

/** Starts (or resumes) the audio context; called on the first key or click. */
export function startAudio(): void {
  if (!audio) {
    const ac = audioContext(); // a check may inject one
    const limit = ac.createDynamicsCompressor(), trim = ac.createGain(), out = ac.createGain();
    out.gain.value = muted ? 0 : tune.volume;
    limit.connect(trim).connect(out).connect(ac.destination); audio = { ac, out, limit, trim };
    setLimiter();
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); let s = 12345;
    for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = s / 0x3fffffff - 1; }
  }
  if (audio.ac.state === 'suspended') audio.ac.resume();
}
/** Mutes or unmutes everything. */
export function setMuted(m: boolean): void { muted = m; if (audio) audio.out.gain.value = m ? 0 : tune.volume; }
/** True while muted. */
export const isMuted = (): boolean => muted;
addEventListener('tune', () => { setMuted(muted); setLimiter(); });

/** Where a layer plays: its start offset (s) and the node it feeds (default: the limiter). */
type Out = { at?: number; to?: AudioNode };
const live = (vol: number): boolean => !!audio && !muted && vol >= 0.005;

/** An oscillator with an exponential decay; `slide` bends the pitch over the sound. */
function osc(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, o: Out = {}): void {
  if (!live(vol)) return;
  const ac = audio!.ac, t = ac.currentTime + (o.at ?? 0), n = ac.createOscillator(), g = ac.createGain();
  n.type = type; n.frequency.setValueAtTime(freq, t);
  if (slide) n.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(g).connect(o.to ?? audio!.limit); n.start(t); n.stop(t + dur + 0.01);
}
/** Filtered noise with an exponential decay; `sweep` moves the filter to that frequency over the sound. */
function nz(dur: number, freq: number, vol: number, q = 1, type: BiquadFilterType = 'bandpass', sweep = 0, o: Out = {}): void {
  if (!live(vol)) return;
  const ac = audio!.ac, t = ac.currentTime + (o.at ?? 0);
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(o.to ?? audio!.limit); s.start(t, (t * 7.3) % 0.5); s.stop(t + dur + 0.01);
}
function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.3, delay = 0, slide = 0): void {
  osc(freq, dur, type, vol, slide, { at: delay });
}
function noise(dur: number, freq: number, vol: number, q = 1, type: BiquadFilterType = 'bandpass'): void {
  nz(dur, freq, vol, q, type);
}

/** Each gun's character (the sound design itself; the levels and tails are in config). */
const GUN: Record<string, {
  click: [hz: number, dur: number]; body: [hz: number, q: number, dur: number];
  thump: [hz: number, toHz: number, dur: number]; tailHz: number; bodyVol: number;
}> = {
  pistol: { click: [5200, 0.006], body: [1700, 0.9, 0.09], thump: [160, 60, 0.07], tailHz: 1300, bodyVol: 0.55 },
  smg: { click: [6500, 0.004], body: [2600, 1.3, 0.055], thump: [200, 95, 0.04], tailHz: 1800, bodyVol: 0.45 },
  rifle: { click: [4200, 0.006], body: [1100, 0.7, 0.13], thump: [115, 45, 0.11], tailHz: 900, bodyVol: 0.6 },
  sniper: { click: [3600, 0.009], body: [650, 0.5, 0.3], thump: [72, 32, 0.32], tailHz: 600, bodyVol: 0.75 },
};

/** A shot's bus: level, then a low-pass that darkens with distance, then the stereo pan. */
function shotBus(vol: number, pan: number, dist: number): AudioNode {
  const ac = audio!.ac, g = ac.createGain(), f = ac.createBiquadFilter(), p = ac.createStereoPanner();
  const near = Number(tune.sfx_near_cutoff), far = Number(tune.sfx_far_cutoff);
  const k = Math.min(1, Math.max(0, dist / Number(tune.sfx_far_dist)));
  g.gain.value = vol;
  f.type = 'lowpass'; f.Q.value = 0.5; f.frequency.value = Math.min(ac.sampleRate / 2 - 100, near * Math.pow(far / near, k));
  p.pan.value = Math.max(-1, Math.min(1, pan * Number(tune.sfx_pan_strength)));
  g.connect(f).connect(p).connect(audio!.limit);
  return g;
}

/** Every sound the game plays. */
export const SFX = {
  /**
   * A gun shot. `v` is the loudness (1 for the player, the distance volume for a bot), `pan` is
   * -1 (left) to 1 (right) relative to where the camera faces, `dist` the distance in metres
   * (0: the player's own gun, no dulling).
   */
  shot(w: string, v = 1, pan = 0, dist = 0) {
    const g = GUN[w], level = Number(tune['sfx_' + w + '_level']) * v;
    if (!g || !live(level)) return;
    const to = shotBus(level, pan, dist), tail = Number(tune['sfx_' + w + '_tail']);
    const click = Number(tune.sfx_click_mix), thump = Number(tune.sfx_thump_mix);
    nz(g.click[1], g.click[0], 0.6 * click, 0.7, 'bandpass', 0, { to });           // the crack
    osc(g.click[0] / 2, g.click[1], 'triangle', 0.15 * click, 0, { to });
    nz(g.body[2], g.body[0], g.bodyVol, g.body[1], 'bandpass', g.body[0] * 0.6, { to }); // the body
    osc(g.thump[0], g.thump[2], 'sine', 0.7 * thump, g.thump[1] - g.thump[0], { to }); // the thump
    nz(tail, g.tailHz, 0.16, 0.6, 'lowpass', g.tailHz * 0.4, { to, at: 0.015 });     // the room tail
    const delay = Number(tune.sfx_echo_delay), fb = Number(tune.sfx_echo_gain);
    for (let i = 1; i <= Math.min(4, Math.floor(tail / delay)); i++) {           // the echoes
      nz(g.body[2] * 1.5, g.tailHz, g.bodyVol * Math.pow(fb, i), 0.8, 'bandpass', 0, { to, at: i * delay });
    }
  },
  /** A dry trigger: a small tick and the hammer falling on nothing. */
  empty() {
    const v = Number(tune.sfx_empty_level);
    nz(0.012, 4200, 0.35 * v, 2, 'bandpass'); osc(1900, 0.02, 'triangle', 0.08 * v);
    nz(0.02, 2400, 0.25 * v, 3, 'bandpass', 0, { at: 0.035 }); osc(700, 0.03, 'sine', 0.1 * v, -200, { at: 0.035 });
  },
  lowAmmo() { tone(900, 0.04, 'triangle', 0.12); },
  /** Mag out, mag in, then the slide (or the sniper's bolt), timed over tune.reload_time. */
  reload(w = 'pistol') {
    const v = Number(tune.sfx_reload_level), T = Number(tune.reload_time);
    const out = 0.08 * T, inn = 0.55 * T, rack = 0.8 * T;
    nz(0.015, 3500, 0.3 * v, 2, 'bandpass', 0, { at: out });                         // release button
    nz(0.09, 900, 0.3 * v, 1, 'bandpass', 600, { at: out + 0.03 });                  // mag slides out
    osc(240, 0.06, 'sine', 0.12 * v, -80, { at: out + 0.03 });
    nz(0.06, 1500, 0.25 * v, 1.2, 'bandpass', 2400, { at: inn });                    // mag scrapes in
    nz(0.025, 2600, 0.45 * v, 2, 'bandpass', 0, { at: inn + 0.07 });                 // and seats: clack
    osc(170, 0.06, 'sine', 0.2 * v, -60, { at: inn + 0.07 });
    if (w === 'sniper') {                                                              // bolt: up, back, forward, down
      [0, 0.09, 0.2, 0.29].forEach((d, i) => {
        nz(i % 3 ? 0.06 : 0.02, i % 3 ? 1800 : 3200, (i % 3 ? 0.25 : 0.35) * v, 1.5, 'bandpass', i === 1 ? 1200 : i === 2 ? 2600 : 0, { at: rack + d });
      });
      osc(300, 0.05, 'sine', 0.12 * v, -100, { at: rack + 0.29 });
    } else {                                                                           // slide back, then snaps home
      nz(0.07, 1400, 0.3 * v, 1.2, 'bandpass', 3000, { at: rack });
      nz(0.02, 4000, 0.45 * v, 1.5, 'bandpass', 0, { at: rack + 0.11 });
      osc(900, 0.03, 'triangle', 0.1 * v, 0, { at: rack + 0.11 }); osc(200, 0.05, 'sine', 0.15 * v, -70, { at: rack + 0.11 });
    }
  },
  hit() { tone(1900, 0.05, 'triangle', 0.22); },
  kill() { tone(880, 0.08, 'triangle', 0.25); tone(1320, 0.12, 'triangle', 0.25, 0.07); },
  hurt() { noise(0.15, 300, 0.4, 0.7, 'lowpass'); },
  right() { tone(660, 0.1, 'triangle', 0.3); tone(990, 0.18, 'triangle', 0.3, 0.09); },
  wrong() { tone(160, 0.25, 'sawtooth', 0.25); tone(120, 0.3, 'sawtooth', 0.22, 0.08); },
  buy() { tone(1200, 0.06, 'square', 0.12); tone(1600, 0.08, 'square', 0.12, 0.06); },
  beep(v: number, loud: boolean) { tone(loud ? 1500 : 1250, 0.07, 'square', (loud ? 0.35 : 0.15) * v); },
  plant() { tone(700, 0.1, 'square', 0.2); tone(940, 0.1, 'square', 0.2, 0.12); tone(1250, 0.2, 'square', 0.2, 0.24); },
  boom() { noise(1.6, 120, 1.0, 0.5, 'lowpass'); tone(60, 1.2, 'sawtooth', 0.4, 0, -30); },
  defused() { tone(520, 0.12, 'triangle', 0.3); tone(780, 0.12, 'triangle', 0.3, 0.12); tone(1040, 0.3, 'triangle', 0.3, 0.24); },
  gate() { noise(0.5, 400, 0.3, 0.6, 'lowpass'); tone(200, 0.4, 'triangle', 0.15, 0, 200); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.2, 'triangle', 0.25, i * 0.12)); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.22, i * 0.15)); },
  click() { tone(900, 0.03, 'square', 0.1); },
  /** A melee swing through the air (story 016); a strike that lands also plays hit(). */
  swing() { noise(0.12, 900, 0.25, 1.2, 'bandpass'); },
  /** Something taken from the floor, or a medkit used (story 016). */
  pickup() { tone(780, 0.06, 'triangle', 0.2); tone(1170, 0.1, 'triangle', 0.2, 0.05); },
};
