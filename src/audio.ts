// Sound: Web Audio tones and noise, started on the first input, muted with M.
import { tune } from './config';
import { audioContext } from './hook';

let audio: { ac: AudioContext; out: GainNode } | null = null, muted = false, noiseBuf: AudioBuffer | null = null;

/** Starts (or resumes) the audio context; called on the first key or click. */
export function startAudio(): void {
  if (!audio) {
    const ac = audioContext(); // a check may inject one
    const out = ac.createGain(); out.gain.value = muted ? 0 : tune.volume;
    out.connect(ac.destination); audio = { ac, out };
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
addEventListener('tune', () => setMuted(muted));
function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.3, delay = 0, slide = 0): void {
  if (!audio || muted || vol < 0.005) return;
  const t = audio.ac.currentTime + delay, o = audio.ac.createOscillator(), g = audio.ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(audio.out); o.start(t); o.stop(t + dur);
}
function noise(dur: number, freq: number, vol: number, q = 1, type: BiquadFilterType = 'bandpass'): void {
  if (!audio || muted || vol < 0.005) return;
  const t = audio.ac.currentTime, s = audio.ac.createBufferSource(), f = audio.ac.createBiquadFilter(), g = audio.ac.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(audio.out); s.start(t, (t * 7.3) % 0.5); s.stop(t + dur);
}
/** Every sound the game plays. */
export const SFX = {
  shot(w: string, v = 1) {
    if (w === 'pistol') { noise(0.12, 1800, 0.5 * v, 0.8); tone(220, 0.06, 'square', 0.12 * v, 0, -120); }
    if (w === 'smg') { noise(0.08, 2600, 0.38 * v, 1.2); tone(330, 0.04, 'square', 0.08 * v); }
    if (w === 'rifle') { noise(0.14, 1200, 0.5 * v, 0.7); tone(140, 0.09, 'sawtooth', 0.15 * v, 0, -60); }
    if (w === 'sniper') { noise(0.4, 700, 0.7 * v, 0.5); tone(90, 0.3, 'sawtooth', 0.25 * v, 0, -50); }
  },
  empty() { tone(1400, 0.03, 'square', 0.12); },
  lowAmmo() { tone(900, 0.04, 'triangle', 0.12); },
  reload() { tone(500, 0.05, 'square', 0.1); tone(700, 0.05, 'square', 0.1, 0.25); tone(400, 0.07, 'square', 0.12, 0.9); },
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
};
