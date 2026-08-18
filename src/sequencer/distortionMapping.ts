/**
 * Knob -> audio-parameter mappings for SONO-DIST.
 *
 * Pure and dependency-free on purpose: the engine converts these numbers into
 * Tone.js calls, the reducer clamps against them and the panel prints them in
 * the knob readouts. Keeping them in `src/sequencer/` is what lets the UI show
 * "1.2 kHz" under TONE without importing from `src/audio/` (AGENTS.md rule 2).
 *
 * Every knob is normalized 0..1 in application state; the ranges below are the
 * only place those numbers acquire a physical meaning.
 */

import type { ActiveDistortionMode } from "./types";

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function lerp(min: number, max: number, value: number): number {
  return min + (max - min) * value;
}

/** dB -> linear gain factor. Local, so this module stays Tone-free. */
export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

/** TONE low-pass sweep, exponential so the knob feels even (spec §5.2). */
export const TONE_MIN_HZ = 650;
export const TONE_MAX_HZ = 16_000;

export function mapToneToFrequency(value: number): number {
  return TONE_MIN_HZ * (TONE_MAX_HZ / TONE_MIN_HZ) ** clamp01(value);
}

/** LEVEL output trim of the processed path, -24 dB .. +3 dB (spec §5.3). */
export function mapLevelToDb(value: number): number {
  return -24 + clamp01(value) * 27;
}

/**
 * Pre-gain hitting the waveshaper, per mode (spec §5.1). TURBO starts hotter
 * and ends hotter, which is half of why it is the aggressive one; the other
 * half is its near-hard clipping curve.
 */
export const DRIVE_PRE_GAIN_DB = {
  classic: { min: 0, max: 18 },
  turbo: { min: 6, max: 28 },
  overdrive: { min: 0, max: 22 },
} as const satisfies Record<ActiveDistortionMode, { min: number; max: number }>;

export function mapDriveToPreGainDb(
  mode: ActiveDistortionMode,
  drive: number,
): number {
  const range = DRIVE_PRE_GAIN_DB[mode];
  return lerp(range.min, range.max, clamp01(drive));
}

/**
 * Fixed level trim per mode, applied inside the processed path and independent
 * of the LEVEL knob (spec §9.2). It exists so switching modes is a change of
 * character, not a jump in loudness; TURBO always takes the deepest cut.
 */
export const MODE_COMPENSATION_DB = {
  classic: -4,
  turbo: -10,
  overdrive: -6.5,
} as const satisfies Record<ActiveDistortionMode, number>;

/**
 * Waveshaper oversampling per mode (spec §3.3). Harder curves alias harder, so
 * TURBO gets 4x. Only ever changed on a mode switch, never during a knob move.
 */
export const MODE_OVERSAMPLE = {
  classic: "2x",
  turbo: "4x",
  overdrive: "2x",
} as const satisfies Record<ActiveDistortionMode, "2x" | "4x">;
