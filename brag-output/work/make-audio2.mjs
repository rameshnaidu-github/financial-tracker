// The film's soundtrack, written as one piece: 22 seconds, 120 BPM, D minor.
// Eleven bars that follow the story — a low question, a riser, a drop while the
// app does its work, a breath, and a resolve. Everything is synthesised here and
// written straight out as a 48kHz stereo WAV.
//
// Arrangement (bars are 2s each, beats 0.5s):
//   1-2  question  kick, bass, hat
//   3    riser     + snare roll and a rising sweep
//   4-8  drop      + clap, arp, lead over Dm Bb F C Dm
//   9    break     pad and shimmer alone
//   10-11 resolve  drums return under the pad, then one hit and a tail
import { writeFileSync } from "node:fs";

const RATE = 48000;
const DURATION = 22;
const BEAT = 0.5;
const N = RATE * DURATION;
const left = new Float64Array(N);
const right = new Float64Array(N);

/** Bar and beat to seconds. Bars and beats are 1-indexed the way a musician counts. */
const at = (bar, beat = 1) => (bar - 1) * 4 * BEAT + (beat - 1) * BEAT;
/** Semitones from A4 to hertz. */
const hz = (semitones) => 440 * Math.pow(2, semitones / 12);

// A fixed-seed noise source, so two renders of this file are identical.
let seed = 0x9e3779b9;
const noise = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return (seed / 0x100000000) * 2 - 1;
};

/**
 * Renders one voice into the mix.
 * @param {number} start seconds
 * @param {number} length seconds
 * @param {(t: number) => number} voice sample at local time t
 * @param {number} pan -1 hard left to 1 hard right
 */
function play(start, length, voice, pan = 0) {
  const from = Math.max(0, Math.round(start * RATE));
  const to = Math.min(N, Math.round((start + length) * RATE));
  const gainL = Math.cos(((pan + 1) * Math.PI) / 4);
  const gainR = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = from; i < to; i += 1) {
    const sample = voice((i - start * RATE) / RATE);
    left[i] += sample * gainL;
    right[i] += sample * gainR;
  }
}

const decay = (t, rate) => Math.exp(-t * rate);
const attack = (t, rate) => 1 - Math.exp(-t * rate);
const saw = (phase) => 2 * (phase - Math.floor(phase)) - 1;

// ---- The kit ----

const kickTimes = [];
function kick(start, level = 1) {
  kickTimes.push(start);
  play(start, 0.75, (t) => {
    // The pitch falls from a knock to a body, which is what makes a kick read as one.
    const freq = 46 + 150 * decay(t, 34);
    const body = Math.sin(2 * Math.PI * freq * t);
    const click = noise() * decay(t, 260) * 0.22;
    return (body * decay(t, 6.5) * attack(t, 900) + click) * 0.95 * level;
  });
}

function hat(start, level = 1, open = false) {
  const rate = open ? 22 : 90;
  play(start, open ? 0.3 : 0.1, (t) => {
    // Bandpassed noise, roughly: high-passed by differencing, then shaped.
    const n = noise();
    return n * decay(t, rate) * 0.09 * level;
  }, 0.25);
}

function clap(start, level = 1) {
  play(start, 0.35, (t) => {
    // Three quick bursts a few milliseconds apart give a clap its width.
    const bursts = (t < 0.011 ? 1 : 0) + (t > 0.013 && t < 0.024 ? 1 : 0) + (t > 0.026 ? decay(t - 0.026, 26) : 0);
    const tone = noise() * 0.8 + Math.sin(2 * Math.PI * 1600 * t) * 0.12;
    return tone * bursts * 0.38 * level;
  });
}

function snare(start, level = 1) {
  play(start, 0.22, (t) => {
    const body = Math.sin(2 * Math.PI * (190 + 90 * decay(t, 40)) * t) * 0.35;
    return (noise() * 0.75 + body) * decay(t, 26) * attack(t, 1200) * 0.34 * level;
  }, -0.15);
}

/** A detuned sawtooth bass with a falling filter, the spine of the track. */
function bass(start, length, semitones, level = 1) {
  const f = hz(semitones);
  play(start, length, (t) => {
    const env = Math.min(attack(t, 260), decay(t, 1.1));
    const voice = saw(f * t) * 0.55 + saw(f * 1.004 * t) * 0.35 + Math.sin(2 * Math.PI * f * 0.5 * t) * 0.5;
    // A one-pole low pass, opening and closing with the note.
    const cutoff = 0.06 + 0.1 * decay(t, 5);
    filterState += cutoff * (voice - filterState);
    return filterState * env * 0.5 * level;
  });
}
let filterState = 0;

/** A short plucked note: the arpeggio and the melody are both built from it. */
function pluck(start, length, semitones, level = 1, pan = 0) {
  const f = hz(semitones);
  play(start, length, (t) => {
    const env = decay(t, 5.5) * attack(t, 420);
    const voice = saw(f * t) * 0.5 + saw(f * 1.006 * t) * 0.5 + Math.sin(2 * Math.PI * f * 2 * t) * 0.15;
    return voice * env * 0.16 * level;
  }, pan);
}

/** A sustained lead over the drop, a little wider and brighter than the arp. */
function lead(start, length, semitones, level = 1) {
  const f = hz(semitones);
  for (const [detune, pan] of [[0.997, -0.45], [1.003, 0.45]]) {
    play(start, length, (t) => {
      const env = Math.min(attack(t, 26), decay(t, 1.6)) * (1 - 0.12 * Math.sin(2 * Math.PI * 5.5 * t));
      const voice = saw(f * detune * t) * 0.6 + Math.sin(2 * Math.PI * f * detune * t) * 0.4;
      return voice * env * 0.115 * level;
    }, pan);
  }
}

/** A slow chord that swells and fades: the breath in bar 9 and the bed under the resolve. */
function pad(start, length, chord, level = 1) {
  chord.forEach((semitones, index) => {
    const f = hz(semitones);
    const pan = (index / Math.max(chord.length - 1, 1) - 0.5) * 0.7;
    play(start, length, (t) => {
      const env = Math.min(attack(t, 2.6), (length - t) / 0.9, 1);
      const drift = 0.3 * Math.sin(2 * Math.PI * (0.07 + index * 0.017) * t);
      const voice = Math.sin(2 * Math.PI * f * t + drift) + 0.22 * Math.sin(4 * Math.PI * f * t);
      return voice * Math.max(env, 0) * (index === 0 ? 0.2 : 0.11) * level;
    }, pan);
  });
}

function shimmer(start, semitones, level = 1, pan = 0) {
  const f = hz(semitones);
  play(start, 1.6, (t) => {
    const env = decay(t, 2.6) * attack(t, 300);
    return (Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(2 * Math.PI * f * 2.01 * t)) * env * 0.075 * level;
  }, pan);
}

function riser(start, length) {
  play(start, length, (t) => {
    const p = t / length;
    const sweep = Math.sin(2 * Math.PI * (220 + 1500 * p * p) * t);
    const air = noise() * p * p;
    return (sweep * 0.5 + air * 0.5) * p * 0.3;
  });
}

function crash(start, level = 1) {
  play(start, 2.2, (t) => {
    const env = decay(t, 2.2) * attack(t, 700);
    return noise() * env * 0.16 * level;
  });
}

function boom(start, semitones, level = 1) {
  play(start, 2.4, (t) => {
    const f = hz(semitones) * (1 + 0.3 * decay(t, 12));
    return Math.sin(2 * Math.PI * f * t) * decay(t, 1.7) * attack(t, 500) * 0.5 * level;
  });
}

// ---- The arrangement ----

const D2 = -29, F2 = -26, A2 = -24, Bb1 = -35, C2 = -31;
// Bar roots for bars 1..11: Dm Dm Dm | Dm Bb F C Dm | Bb | C Dm
const ROOTS = [D2, D2, D2, D2, Bb1, F2, C2, D2, Bb1, C2, D2];
const CHORD_TONES = [
  [5, 8, 12], [5, 8, 12], [5, 8, 12],          // Dm
  [5, 8, 12], [1, 5, 8], [8, 12, 15], [3, 7, 10], [5, 8, 12], // Dm Bb F C Dm
  [1, 5, 8], [3, 7, 10], [5, 8, 12]            // Bb C Dm
];

// Bars 1-2: the question. Sparse, so the drop has somewhere to come from.
kick(at(1, 1), 0.85);
kick(at(1, 3), 0.85);
kick(at(2, 1), 0.9);
kick(at(2, 2), 0.55);
kick(at(2, 3), 0.9);
kick(at(2, 4), 0.7);
for (const bar of [1, 2]) {
  bass(at(bar, 1), 1.0, ROOTS[bar - 1], 0.8);
  bass(at(bar, 3), 1.0, ROOTS[bar - 1], 0.8);
  for (let beat = 1; beat <= 4; beat += 1) hat(at(bar, beat + 0.5), 0.5);
}

// Bar 3: the riser under "Where did it go?".
riser(at(3, 1), 2.0);
for (let beat = 1; beat <= 4; beat += 1) {
  kick(at(3, beat), 0.95);
  hat(at(3, beat + 0.5), 0.7);
}
bass(at(3, 1), 1.0, ROOTS[2], 0.9);
bass(at(3, 3), 1.0, ROOTS[2], 0.9);
// A roll that halves its spacing into the drop.
for (const [offset, level] of [[0, 0.5], [0.5, 0.6], [1.0, 0.7], [1.25, 0.75], [1.5, 0.85], [1.75, 0.95], [1.875, 1.0]]) {
  snare(at(3, 1) + offset, level);
}

// Bars 4-8: the drop. Four on the floor, claps on 2 and 4, an arp and a lead.
const MELODY = [
  [5, 8, 12, 8],
  [10, 13, 10, 8],
  [8, 12, 15, 12],
  [7, 12, 15, 17],
  [17, 15, 12, 10]
];
crash(at(4, 1), 1.0);
for (let bar = 4; bar <= 8; bar += 1) {
  const root = ROOTS[bar - 1];
  const tones = CHORD_TONES[bar - 1];
  for (let beat = 1; beat <= 4; beat += 1) {
    kick(at(bar, beat), 1.0);
    hat(at(bar, beat + 0.5), 0.85, beat === 4);
    bass(at(bar, beat), 0.5, root, 1.0);
  }
  clap(at(bar, 2), 1.0);
  clap(at(bar, 4), 1.0);
  // Eighth-note arpeggio, alternating sides so it sits either side of the lead.
  for (let step = 0; step < 8; step += 1) {
    const time = at(bar, 1) + step * 0.25;
    pluck(time, 0.3, tones[step % tones.length] + (step >= 4 ? 12 : 0), 0.9, step % 2 === 0 ? -0.35 : 0.35);
  }
  MELODY[bar - 4].forEach((semitones, index) => {
    lead(at(bar, 1 + index), 0.55, semitones, index === 0 ? 1.0 : 0.85);
  });
}

// Bar 9: the break. Everything drops away to a chord and one bell.
pad(at(9, 1), 2.2, [Bb1 + 12, -7, -4, 0], 1.0);
shimmer(at(9, 1), 20, 0.9, -0.3);
shimmer(at(9, 3), 24, 0.7, 0.3);

// Bars 10-11: the resolve. The drums come back under the pad, then one hit and a tail.
pad(at(10, 1), 2.1, [C2 + 12, -5, -2, 3], 0.9);
for (let beat = 1; beat <= 4; beat += 1) {
  kick(at(10, beat), 0.95);
  hat(at(10, beat + 0.5), 0.6);
  bass(at(10, beat), 0.5, ROOTS[9], 0.9);
}
clap(at(10, 2), 0.8);
clap(at(10, 4), 0.8);
for (let step = 0; step < 8; step += 1) {
  pluck(at(10, 1) + step * 0.25, 0.3, CHORD_TONES[9][step % 3] + (step >= 4 ? 12 : 0), 0.7, step % 2 === 0 ? -0.3 : 0.3);
}

// The landing: one hit on the downbeat of the last bar, then the chord rings out.
crash(at(11, 1), 0.85);
boom(at(11, 1), D2, 0.9);
kick(at(11, 1), 0.9);
kick(at(11, 3), 0.55);
bass(at(11, 1), 1.6, ROOTS[10], 0.8);
pad(at(11, 1), 2.0, [D2 + 12, -4, 0, 5], 0.95);
shimmer(at(11, 1), 17, 0.6, 0.2);

// ---- Mix ----

// Sidechain: everything ducks under each kick, which is what makes a track pump.
const duck = new Float64Array(N).fill(1);
for (const time of kickTimes) {
  const from = Math.round(time * RATE);
  const span = Math.round(0.28 * RATE);
  for (let i = 0; i < span && from + i < N; i += 1) {
    const p = i / span;
    const amount = 0.42 * (1 - p) * (1 - p);
    duck[from + i] = Math.min(duck[from + i], 1 - amount);
  }
}
for (let i = 0; i < N; i += 1) {
  left[i] *= duck[i];
  right[i] *= duck[i];
}

// A gentle top-end trim, so nothing is harsh, then a soft limiter and the tail fade.
let lowL = 0;
let lowR = 0;
for (let i = 0; i < N; i += 1) {
  lowL += 0.62 * (left[i] - lowL);
  lowR += 0.62 * (right[i] - lowR);
  left[i] = lowL;
  right[i] = lowR;
}

let peak = 0;
for (let i = 0; i < N; i += 1) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
const drive = peak > 0 ? 1.05 / peak : 1;

const bytes = Buffer.alloc(N * 4);
let finalPeak = 0;
const shaped = new Float64Array(N * 2);
for (let i = 0; i < N; i += 1) {
  const fadeIn = Math.min(i / (RATE * 0.02), 1);
  const fadeOut = Math.min((N - i) / (RATE * 0.45), 1);
  const gain = drive * fadeIn * fadeOut;
  const l = Math.tanh(left[i] * gain);
  const r = Math.tanh(right[i] * gain);
  shaped[i * 2] = l;
  shaped[i * 2 + 1] = r;
  finalPeak = Math.max(finalPeak, Math.abs(l), Math.abs(r));
}
// Land the peak at -0.9 dBFS: under the ceiling the audit sets, with room for the encoder.
const trim = finalPeak > 0 ? 0.902 / finalPeak : 1;
let sumSquares = 0;
for (let i = 0; i < N; i += 1) {
  const l = shaped[i * 2] * trim;
  const r = shaped[i * 2 + 1] * trim;
  sumSquares += l * l + r * r;
  bytes.writeInt16LE(Math.round(l * 32767), i * 4);
  bytes.writeInt16LE(Math.round(r * 32767), i * 4 + 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + bytes.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(bytes.length, 40);

writeFileSync("brag-output/work/soundtrack.wav", Buffer.concat([header, bytes]));
const rms = Math.sqrt(sumSquares / (N * 2));
console.log(
  `wrote soundtrack.wav: ${DURATION}s, ${kickTimes.length} kicks, peak ${(20 * Math.log10(0.902)).toFixed(2)} dBFS, RMS ${(20 * Math.log10(rms)).toFixed(2)} dBFS`
);
