#!/usr/bin/env node
/**
 * Generates the native game-audio assets (WAV) that mirror the web Web-Audio
 * synth in gridclan-frontend/src/services/sound.ts.
 *
 * On web we synthesize tones live; native (expo-av) can only play files, so we
 * render the exact same tones/progression to bundled WAVs once, here.
 *
 *   node scripts/gen-sounds.js
 *
 * Outputs 16-bit PCM mono WAVs into gridclan-frontend/assets/sounds/.
 */
const fs = require('fs');
const path = require('path');

const SR = 44100;                 // sample rate
const OUT = path.join(__dirname, '..', 'gridclan-frontend', 'assets', 'sounds');
fs.mkdirSync(OUT, { recursive: true });

// --- oscillator shapes (one cycle, phase in [0,1)) -------------------------
function wave(type, phase) {
  const x = phase - Math.floor(phase);
  switch (type) {
    case 'square':   return x < 0.5 ? 1 : -1;
    case 'sawtooth': return 2 * x - 1;
    case 'triangle': return 4 * Math.abs(x - 0.5) - 1;
    default:         return Math.sin(2 * Math.PI * x);   // sine
  }
}

// Render one note into `buf` (Float32) starting at `start` seconds. Envelope
// mirrors the web ramp: fast attack to peak, exponential decay to silence.
function renderNote(buf, start, freq, type, dur, peak) {
  const n0 = Math.floor(start * SR);
  const n1 = Math.min(buf.length, Math.floor((start + dur) * SR));
  const attack = Math.max(1, Math.floor(0.01 * SR));
  for (let n = n0; n < n1; n++) {
    const tt = (n - n0) / SR;
    const env = n - n0 < attack
      ? (n - n0) / attack * peak                          // linear attack
      : peak * Math.pow(0.0002 / peak, (tt - attack / SR) / (dur - attack / SR)); // exp decay
    buf[n] += wave(type, freq * tt) * env;
  }
}

function writeWav(name, buf) {
  // soft-clip to [-1,1] so summed voices never wrap
  const pcm = Buffer.alloc(buf.length * 2);
  for (let i = 0; i < buf.length; i++) {
    let s = Math.max(-1, Math.min(1, buf[i]));
    pcm.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);            // PCM
  header.writeUInt16LE(1, 22);            // mono
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2, 28);       // byte rate
  header.writeUInt16LE(2, 32);            // block align
  header.writeUInt16LE(16, 34);           // bits/sample
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(path.join(OUT, name), Buffer.concat([header, pcm]));
  console.log('wrote', name, (pcm.length / 1024).toFixed(1) + 'KB');
}

// --- SFX (mirror TONES in sound.ts) ----------------------------------------
const SFX = {
  tap:  [{ freq: 440, dur: 0.05, type: 'square' }],
  move: [{ freq: 560, dur: 0.07, type: 'triangle' }],
  hit:  [{ freq: 200, dur: 0.13, type: 'sawtooth' }],
  win:  [{ freq: 523, dur: 0.11, type: 'triangle' }, { freq: 659, dur: 0.11, type: 'triangle' }, { freq: 784, dur: 0.18, type: 'triangle' }],
  lose: [{ freq: 300, dur: 0.16, type: 'sawtooth' }, { freq: 170, dur: 0.24, type: 'sawtooth' }],
};
for (const [name, notes] of Object.entries(SFX)) {
  const total = notes.reduce((s, n) => s + n.dur, 0) + 0.02;
  const buf = new Float32Array(Math.ceil(total * SR));
  let t = 0;
  for (const note of notes) { renderNote(buf, t, note.freq, note.type, note.dur, 0.6); t += note.dur; }
  writeWav(`${name}.wav`, buf);
}

// --- Background music loop (mirror BARS in sound.ts) ------------------------
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const BARS = [
  { bass: 45, chord: [69, 72, 76] },  // Am
  { bass: 41, chord: [65, 69, 72] },  // F
  { bass: 48, chord: [72, 76, 79] },  // C
  { bass: 43, chord: [67, 71, 74] },  // G
];
const STEP = 0.30, STEPS_PER_BAR = 4, STEPS = BARS.length * STEPS_PER_BAR;
const loopLen = STEPS * STEP;                       // 4.8s, loops seamlessly
const music = new Float32Array(Math.ceil(loopLen * SR));
for (let step = 0; step < STEPS; step++) {
  const bar = BARS[Math.floor(step / STEPS_PER_BAR) % BARS.length];
  const inBar = step % STEPS_PER_BAR;
  const time = step * STEP;
  if (inBar === 0) renderNote(music, time, mtof(bar.bass), 'sine', STEP * STEPS_PER_BAR * 0.9, 0.18);
  const melody = bar.chord[inBar % bar.chord.length];
  renderNote(music, time, mtof(melody), 'triangle', STEP * 0.85, 0.12);
}
writeWav('music.wav', music);
