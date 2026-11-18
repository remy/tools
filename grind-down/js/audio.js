// Tiny WebAudio chip synth: sound effects plus a looping minor-key tune.
import { store } from './util.js';

let ac = null, master, sfxBus, musBus, noiseBuf;
let muted = store.get('muted', false);
let timer = 0, nextT = 0, step = 0, tempo = 132, musicOn = false;

export function initAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ac.destination);
    sfxBus = ac.createGain();
    sfxBus.gain.value = 0.8;
    sfxBus.connect(master);
    musBus = ac.createGain();
    musBus.gain.value = 0.2;
    musBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
}

export const isMuted = () => muted;

export function toggleMute() {
  muted = !muted;
  store.set('muted', muted);
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ac.currentTime, 0.02);
  return muted;
}

function env(g, t, dur, vol) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone(type, f0, f1, dur, vol, at = 0, bus = sfxBus) {
  if (!ac) return;
  const t = at || ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  env(g, t, dur, vol);
  o.connect(g).connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur, vol, type = 'lowpass', f0 = 1000, f1 = f0, at = 0, bus = sfxBus) {
  if (!ac) return;
  const t = at || ac.currentTime;
  const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf;
  s.loop = true;
  f.type = type;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, dur, vol);
  s.connect(f).connect(g).connect(bus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

export const sfx = {
  jump: () => tone('square', 260, 620, 0.1, 0.18),
  land: () => noise(0.06, 0.25, 'lowpass', 500),
  tick: () => { tone('triangle', 1320, 1320, 0.05, 0.15); tone('triangle', 1760, 1760, 0.06, 0.12, ac && ac.currentTime + 0.06); },
  warn: () => tone('square', 880, 880, 0.05, 0.08),
  laser: () => { tone('sawtooth', 1500, 1100, 0.25, 0.06); noise(0.2, 0.08, 'bandpass', 3000); },
  splat() {
    noise(0.35, 0.7, 'lowpass', 1800, 200);
    tone('square', 140, 40, 0.3, 0.3);
  },
  slice() {
    noise(0.12, 0.5, 'highpass', 4000, 1500);
    tone('sawtooth', 1400, 180, 0.22, 0.2);
    this.splat();
  },
  squish() {
    tone('square', 110, 28, 0.5, 0.4);
    noise(0.6, 0.8, 'lowpass', 900, 120);
    noise(0.25, 0.4, 'bandpass', 2200, 400);
  },
  fry() {
    tone('sawtooth', 900, 90, 0.4, 0.25);
    noise(0.5, 0.4, 'bandpass', 5000, 800);
    this.splat();
  },
  start: () => [0, 4, 7, 12].forEach((n, i) => tone('square', 440 * 2 ** (n / 12), 440 * 2 ** (n / 12), 0.08, 0.12, ac && ac.currentTime + i * 0.07)),
};

// --- Music -------------------------------------------------------------------------
const A2 = 110;
const ROOTS = [0, -4, -2, -5]; // Am, F, G, E
const CHORDS = [[12, 15, 19, 24], [8, 12, 15, 20], [10, 14, 17, 22], [7, 11, 14, 19]];
const BASS = [0, null, 12, 0, null, 0, 12, null, 0, null, 12, 0, 7, null, 12, 10];
const ARP = [0, 1, 2, 3, 2, 1, 0, 2];
const hz = (semi) => A2 * 2 ** (semi / 12);

function playStep(s, t) {
  const bar = Math.floor(s / 16) % 4, i = s % 16;
  const root = ROOTS[bar];
  const b = BASS[i];
  const len = 60 / tempo / 4;
  if (b !== null) tone('square', hz(root + b), hz(root + b), len * 0.9, 0.35, t, musBus);
  if (i % 2 === 0) {
    const n = CHORDS[bar][ARP[(i / 2) % ARP.length]];
    tone('square', hz(n + 12), hz(n + 12), len * 0.7, 0.12, t, musBus);
  }
  if (i % 4 === 0) {
    tone('sine', 150, 40, 0.12, 0.6, t, musBus);
  }
  if (i % 4 === 2) noise(0.03, 0.15, 'highpass', 7000, 7000, t, musBus);
  if (i === 4 || i === 12) noise(0.1, 0.3, 'bandpass', 1800, 900, t, musBus);
}

function schedule() {
  if (!ac) return;
  while (nextT < ac.currentTime + 0.12) {
    playStep(step, nextT);
    nextT += 60 / tempo / 4;
    step = (step + 1) % 64;
  }
}

export function startMusic() {
  if (!ac || musicOn) return;
  musicOn = true;
  nextT = ac.currentTime + 0.05;
  timer = setInterval(schedule, 25);
}

export function stopMusic() {
  musicOn = false;
  clearInterval(timer);
}

export function setTempo(bpm) { tempo = bpm; }
