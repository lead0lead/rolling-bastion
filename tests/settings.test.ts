import { describe, expect, it } from 'vitest';
import {
  clampVolume,
  DEFAULT_SETTINGS,
  parseSettings,
  settings,
  updateSettings,
} from '../src/settings';

describe('settings', () => {
  it('falls back to defaults for missing, broken or invalid data', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]').volume).toBe(DEFAULT_SETTINGS.volume);
    expect(parseSettings('{"volume":"loud","muted":1}')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and clamps the volume to 0–1 in steps', () => {
    const s = parseSettings('{"volume":0.33,"muted":true,"reduceEffects":true,"showFps":true}');
    expect(s).toEqual({ volume: 0.3, muted: true, reduceEffects: true, showFps: true });
    expect(clampVolume(7)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
  });

  it('updates in memory even without storage (tests run without localStorage)', () => {
    updateSettings({ muted: true, volume: 0.46 });
    expect(settings().muted).toBe(true);
    expect(settings().volume).toBeCloseTo(0.5);
  });
});
