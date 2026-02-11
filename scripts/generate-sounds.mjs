#!/usr/bin/env node
/**
 * Generates 5 short notification WAV files for task-completion sounds.
 * Pure Node.js — no external dependencies required.
 *
 * Usage: node scripts/generate-sounds.mjs
 * Output: src/renderer/assets/sounds/{chime,cash,ping,droplet,marimba}.wav
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'renderer', 'assets', 'sounds');
const SAMPLE_RATE = 44100;

mkdirSync(OUT_DIR, { recursive: true });

// ── WAV helpers ──────────────────────────────────────────

function writeWav(filePath, samples) {
  const numSamples = samples.length;
  const byteRate = SAMPLE_RATE * 2; // 16-bit mono
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // sub-chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }

  writeFileSync(filePath, buffer);
  console.log(`  ✓ ${filePath}`);
}

function duration(seconds) {
  return Math.round(seconds * SAMPLE_RATE);
}

function sine(freq, t) {
  return Math.sin(2 * Math.PI * freq * (t / SAMPLE_RATE));
}

/** Exponential decay envelope */
function decay(t, total, speed = 3) {
  return Math.exp((-speed * t) / total);
}

/** Linear attack-decay envelope */
function adsr(t, total, attack = 0.01, decayTime = 0) {
  const attackSamples = attack * SAMPLE_RATE;
  const decaySamples = decayTime > 0 ? decayTime * SAMPLE_RATE : total - attackSamples;
  if (t < attackSamples) return t / attackSamples;
  const elapsed = t - attackSamples;
  return Math.max(0, 1 - elapsed / decaySamples);
}

// ── Sound generators ─────────────────────────────────────

/** Two-tone ascending chime (C6 → E6) */
function generateChime() {
  const len = duration(0.5);
  const samples = new Float64Array(len);
  const f1 = 1047; // C6
  const f2 = 1319; // E6
  const half = len / 2;

  for (let t = 0; t < len; t++) {
    let s = 0;
    if (t < half) {
      // First tone
      s = sine(f1, t) * 0.5;
      s += sine(f1 * 2, t) * 0.15; // harmonic
      s *= decay(t, half, 4);
    }
    // Second tone starts at half
    if (t >= half * 0.8) {
      const t2 = t - Math.floor(half * 0.8);
      const env = adsr(t2, len - half * 0.8, 0.005) * decay(t2, len - half * 0.8, 3);
      s += sine(f2, t) * 0.5 * env;
      s += sine(f2 * 2, t) * 0.12 * env;
    }
    samples[t] = s * 0.7;
  }
  return samples;
}

/** Cash register "ka-ching" — metallic noise burst + high bell ring */
function generateCash() {
  const len = duration(0.6);
  const samples = new Float64Array(len);
  const clickEnd = Math.floor(0.04 * SAMPLE_RATE);
  const ringFreq = 3520; // A7 — bright metallic register bell

  for (let t = 0; t < len; t++) {
    let s = 0;
    // Phase 1: mechanical click/rattle (first 40ms)
    if (t < clickEnd) {
      const clickEnv = decay(t, clickEnd, 5);
      // Filtered noise burst for the "ka" part
      s += (Math.random() * 2 - 1) * 0.5 * clickEnv;
      // Low metallic clunk
      s += sine(280, t) * 0.4 * clickEnv;
      s += sine(560, t) * 0.2 * clickEnv;
    }
    // Phase 2: bell ring "ching" (starts at ~30ms, overlapping slightly)
    if (t >= Math.floor(0.03 * SAMPLE_RATE)) {
      const t2 = t - Math.floor(0.03 * SAMPLE_RATE);
      const ringLen = len - Math.floor(0.03 * SAMPLE_RATE);
      const attack = Math.min(1, t2 / (0.001 * SAMPLE_RATE));
      const env = attack * decay(t2, ringLen, 4);
      // Bright metallic partials
      s += sine(ringFreq, t) * 0.35 * env;
      s += sine(ringFreq * 1.5, t) * 0.2 * env;
      s += sine(ringFreq * 2.2, t) * 0.1 * env;
      // Lower resonance for body
      s += sine(ringFreq * 0.5, t) * 0.15 * env;
    }
    samples[t] = s * 0.65;
  }
  return samples;
}

/** Quick high-frequency ping */
function generatePing() {
  const len = duration(0.25);
  const samples = new Float64Array(len);
  const freq = 2200;

  for (let t = 0; t < len; t++) {
    const attack = Math.min(1, t / (0.001 * SAMPLE_RATE));
    const env = decay(t, len, 6);
    let s = sine(freq, t) * 0.6;
    s += sine(freq * 1.5, t) * 0.15;
    samples[t] = s * env * attack * 0.65;
  }
  return samples;
}

/** Water droplet — descending pitch with resonance */
function generateDroplet() {
  const len = duration(0.35);
  const samples = new Float64Array(len);

  for (let t = 0; t < len; t++) {
    const progress = t / len;
    // Rapid descending frequency (water drop characteristic)
    const freq = 1800 * Math.exp(-6 * progress) + 400;
    const attack = Math.min(1, t / (0.0008 * SAMPLE_RATE));
    const env = attack * decay(t, len, 5);
    // Main tone
    let s = sine(freq, t) * 0.5;
    // Resonant harmonic
    s += sine(freq * 2, t) * 0.15 * decay(t, len, 8);
    // Subtle "splash" noise at the start
    if (t < 0.008 * SAMPLE_RATE) {
      s += (Math.random() * 2 - 1) * 0.15 * (1 - t / (0.008 * SAMPLE_RATE));
    }
    samples[t] = s * env * 0.7;
  }
  return samples;
}

/** Marimba hit — warm wooden mallet strike with quick decay */
function generateMarimba() {
  const len = duration(0.5);
  const samples = new Float64Array(len);
  const fundamental = 523; // C5

  for (let t = 0; t < len; t++) {
    // Sharp attack, quick initial decay then gentle sustain
    const attack = Math.min(1, t / (0.001 * SAMPLE_RATE));
    const env = attack * (0.7 * decay(t, len, 8) + 0.3 * decay(t, len, 3));
    // Marimba: strong fundamental, weak even harmonics, moderate odd harmonics
    let s = sine(fundamental, t) * 0.55;
    s += sine(fundamental * 2, t) * 0.05; // weak 2nd
    s += sine(fundamental * 3, t) * 0.15; // moderate 3rd
    s += sine(fundamental * 4, t) * 0.08 * decay(t, len, 10); // 4th dies fast
    // Sub-octave warmth
    s += sine(fundamental * 0.5, t) * 0.1 * decay(t, len, 6);
    samples[t] = s * env * 0.7;
  }
  return samples;
}

// ── Main ─────────────────────────────────────────────────

console.log('Generating notification sounds...\n');

const sounds = {
  chime: generateChime,
  cash: generateCash,
  ping: generatePing,
  droplet: generateDroplet,
  marimba: generateMarimba,
};

for (const [name, generator] of Object.entries(sounds)) {
  const samples = generator();
  writeWav(join(OUT_DIR, `${name}.wav`), samples);
}

console.log('\nDone! Generated 5 notification sounds.');
