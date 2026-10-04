/* ============ sound cues (synthesized, no files) ============ */
import { tierRank } from './data.js';
import { app } from './app.js';

let audioCtx = null;
export function audioInit() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    // no audio on this device, or not allowed yet: the game plays silently
  }
}
export function bindSound() {
  document.addEventListener('pointerdown', audioInit, { passive: true }); // audio may only start after a gesture
}
function soundOn() {
  return app.settings.sound !== false && !app.settings.discreet && audioCtx && audioCtx.state === 'running';
}
function tone(f, t0, dur, { type = 'sine', vol = 0.18, slide = null, attack = 0.01 } = {}) {
  const o = audioCtx.createOscillator(),
    g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
function brass(f, t0, dur, vol = 0.12) {
  const c = audioCtx,
    fl = c.createBiquadFilter();
  fl.type = 'lowpass';
  fl.frequency.setValueAtTime(900, t0);
  fl.frequency.linearRampToValueAtTime(2600, t0 + 0.08);
  fl.frequency.exponentialRampToValueAtTime(700, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.03);
  g.gain.setValueAtTime(vol, t0 + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  fl.connect(g).connect(c.destination);
  [-7, 0, 7].forEach(d => {
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t0);
    o.detune.setValueAtTime(d, t0);
    o.connect(fl);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  });
}
function chord(fs, t0, dur, vol) {
  fs.forEach(f => brass(f, t0, dur, vol));
}
function noiseHit(t0, dur = 0.12, vol = 0.08) {
  const c = audioCtx,
    n = Math.floor(c.sampleRate * dur),
    buf = c.createBuffer(1, n, c.sampleRate),
    d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 1500;
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}
export function cueBlip() {
  if (!soundOn()) return;
  const t = audioCtx.currentTime;
  tone(660, t, 0.12, { type: 'triangle', vol: 0.12 });
}
export function cueFanfare() {
  if (!soundOn()) return;
  const t = audioCtx.currentTime,
    G4 = 392,
    C5 = 523,
    E5 = 659,
    G5 = 784,
    C6 = 1047;
  brass(G4, t, 0.14, 0.1);
  brass(G4, t + 0.16, 0.14, 0.1);
  brass(G4, t + 0.32, 0.14, 0.1);
  chord([C5, E5, G5], t + 0.5, 0.55, 0.09);
  chord([G4, C5, E5, G5, C6], t + 1.05, 1.3, 0.09);
  tone(98, t + 0.5, 0.5, { type: 'sine', vol: 0.18, slide: 60 });
  tone(98, t + 1.05, 0.9, { type: 'sine', vol: 0.2, slide: 55 });
  noiseHit(t + 0.5);
  noiseHit(t + 1.05, 0.2, 0.1);
  [2093, 2637, 1568].forEach((f, i) => tone(f, t + 1.1 + i * 0.06, 1.2, { type: 'sine', vol: 0.04 }));
}
export function cueReveal(tier) {
  if (!soundOn()) return;
  const t = audioCtx.currentTime,
    r = tierRank(tier);
  if (r <= 1) {
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
      tone(f, t + i * 0.07, 0.9, { type: 'triangle', vol: 0.14 });
      tone(f * 2, t + i * 0.07 + 0.02, 0.6, { type: 'sine', vol: 0.05 });
    });
    tone(2093, t + 0.5, 1.6, { type: 'sine', vol: 0.08 });
  } else if (r <= 3) {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.08, 0.7, { type: 'triangle', vol: 0.13 }));
  } else if (r <= 5) {
    tone(440, t, 0.25, { type: 'triangle', vol: 0.12 });
    tone(659, t + 0.12, 0.35, { type: 'triangle', vol: 0.12 });
  } else {
    tone(220, t, 0.3, { type: 'square', vol: 0.06, slide: 180 });
  }
}
export function cueDeath() {
  if (!soundOn()) return;
  const t = audioCtx.currentTime;
  tone(196, t, 1.4, { type: 'sawtooth', vol: 0.12, slide: 49, attack: 0.05 });
  tone(98, t + 0.1, 1.3, { type: 'sine', vol: 0.15, slide: 40 });
  tone(1200, t + 0.9, 0.4, { type: 'sine', vol: 0.04, slide: 300 });
}
// a doom roll, or a critical failure: two falling tones
export function cueDoom() {
  if (!soundOn()) return;
  const t = audioCtx && audioCtx.currentTime;
  tone(220, t, 0.5, { type: 'sawtooth', vol: 0.1, slide: 80 });
  tone(110, t + 0.05, 0.7, { type: 'sine', vol: 0.14, slide: 50 });
}
export function cueRealm() {
  cueFanfare();
}
export function cueSkill() {
  if (!soundOn()) return;
  const t = audioCtx.currentTime;
  [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => {
    tone(f, t + i * 0.045, 0.5, { type: 'triangle', vol: 0.1 });
    tone(f * 2, t + i * 0.045, 0.35, { type: 'sine', vol: 0.035 });
  });
}
export function cueItem() {
  if (!soundOn()) return;
  const t = audioCtx.currentTime;
  tone(1319, t, 0.09, { type: 'square', vol: 0.07 });
  tone(1976, t + 0.09, 0.25, { type: 'square', vol: 0.07 });
  tone(2637, t + 0.16, 0.5, { type: 'triangle', vol: 0.06 });
  tone(659, t + 0.16, 0.5, { type: 'triangle', vol: 0.05 });
}
export function cueQuest() {
  if (!soundOn()) return;
  const t = audioCtx.currentTime;
  [523, 659, 784].forEach((f, i) => brass(f, t + i * 0.12, 0.16, 0.08));
  chord([784, 1047, 1319], t + 0.4, 0.7, 0.07);
  noiseHit(t + 0.4, 0.15, 0.06);
}
export function cueScore(score) {
  if (!soundOn()) return;
  const t = audioCtx.currentTime;
  for (let i = 0; i < 6; i++) tone(300 + i * 40, t + i * 0.06, 0.08, { type: 'square', vol: 0.05 });
  const f = score >= 80 ? 1047 : score >= 50 ? 784 : 523;
  tone(f, t + 0.42, 0.9, { type: 'triangle', vol: 0.16 });
  tone(f * 1.5, t + 0.46, 0.8, { type: 'sine', vol: 0.08 });
}
