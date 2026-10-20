import type Phaser from 'phaser';
import { SOUND_KEYS, SOUNDS, soundUrl, type SoundKey } from '../config/audio';
import { settings } from '../settings';

/** Random pitch spread (cents) so repeated sounds don't sound identical. */
const DETUNE_CENTS = 60;

/** When each sound last played (s), shared by all scenes for the rate limits. */
const lastPlayed = new Map<SoundKey, number>();

/** Queues every sound file for loading (call from a scene's preload). */
export function loadSounds(scene: Phaser.Scene): void {
  for (const key of SOUND_KEYS) scene.load.audio(key, soundUrl(key));
}

/**
 * Plays a sound effect at its configured volume × the master volume, unless
 * muted or it played less than its `gap` ago (concept.md §7).
 */
export function playSfx(scene: Phaser.Scene, key: SoundKey): void {
  const s = settings();
  if (s.muted || s.volume <= 0) return;
  if (!scene.cache.audio.exists(key)) return;
  const def = SOUNDS[key];
  const now = performance.now() / 1000;
  if (now - (lastPlayed.get(key) ?? -Infinity) < def.gap) return;
  lastPlayed.set(key, now);
  scene.sound.play(key, {
    volume: def.volume * s.volume,
    detune: (Math.random() * 2 - 1) * DETUNE_CENTS,
  });
}
