import type Phaser from 'phaser';
import { SOUND_KEYS, SOUNDS, soundUrl, synthOf, type SoundKey, type Synth } from '../config/audio';
import { settings } from '../settings';

/** Random pitch spread (cents) so repeated sounds don't sound identical. */
const DETUNE_CENTS = 60;

/** When each sound last played (s), shared by all scenes for the rate limits. */
const lastPlayed = new Map<SoundKey, number>();

/** Queues every sound file for loading (call from a scene's preload). */
export function loadSounds(scene: Phaser.Scene): void {
  for (const key of SOUND_KEYS) if (!synthOf(key)) scene.load.audio(key, soundUrl(key));
}

/**
 * Plays a sound effect at its configured volume × the master volume, unless
 * muted or it played less than its `gap` ago (concept.md §7).
 */
export function playSfx(scene: Phaser.Scene, key: SoundKey, detune?: number): void {
  const s = settings();
  if (s.muted || s.volume <= 0) return;
  const synth = synthOf(key);
  if (!synth && !scene.cache.audio.exists(key)) return;
  const def = SOUNDS[key];
  const now = performance.now() / 1000;
  if (now - (lastPlayed.get(key) ?? -Infinity) < def.gap) return;
  lastPlayed.set(key, now);
  const cents = detune ?? (Math.random() * 2 - 1) * DETUNE_CENTS;
  if (synth) {
    playSynth(scene, synth, def.volume * s.volume, cents);
    return;
  }
  scene.sound.play(key, { volume: def.volume * s.volume, detune: cents });
}

/** Plays a synthesised sound: an oscillator glide with a quick decay, plus a noise burst if asked. */
function playSynth(scene: Phaser.Scene, synth: Synth, volume: number, cents: number): void {
  const ctx = (scene.sound as Phaser.Sound.WebAudioSoundManager).context;
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const t1 = t0 + synth.dur;
  const ratio = 2 ** (cents / 1200);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t1);
  gain.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.type = synth.wave;
  osc.frequency.setValueAtTime(synth.from * ratio, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, synth.to * ratio), t1);
  osc.connect(gain);
  osc.start(t0);
  osc.stop(t1);
  if (synth.noise) {
    const frames = Math.ceil(ctx.sampleRate * synth.dur);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    src.start(t0);
  }
}

/** Says a short phrase aloud with the browser's speech synthesis (kill streak calls), unless muted. */
export function announce(text: string): void {
  const s = settings();
  if (s.muted || s.volume <= 0 || typeof speechSynthesis === 'undefined') return;
  const u = new SpeechSynthesisUtterance(text);
  u.volume = s.volume;
  u.pitch = 1.4;
  u.rate = 1.15;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
