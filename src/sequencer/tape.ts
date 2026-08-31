import type { TapeBars } from "./types";

/**
 * Pure length math for SONO-TAPE, the WAV recorder.
 *
 * This module is shared by the UI — the panel prints the resulting duration
 * next to the bar selector — and by the offline renderer, so it lives here
 * rather than in `src/audio/` and imports neither React nor Tone.js.
 */

/** Bar lengths the recorder offers. */
export const TAPE_BAR_OPTIONS: readonly TapeBars[] = [1, 2, 4, 8];

/** Render rate. 48 kHz is the standard DAW session rate. */
export const EXPORT_SAMPLE_RATE = 48000;

/**
 * One pattern pass is sixteen sixteenth-notes, which is four beats.
 *
 * Expressed in beats rather than through `stepDurationSeconds` so this module
 * stays free of any `src/audio/` import. The two agree exactly, and a test in
 * `src/audio/stepLogic.test.ts` pins them together.
 */
const BEATS_PER_BAR = 4;

/** Wall-clock length of `bars` pattern passes at a given tempo. */
export function barsToSeconds(bars: number, tempoBpm: number): number {
  return (bars * BEATS_PER_BAR * 60) / tempoBpm;
}

/**
 * The same length in whole samples.
 *
 * At most tempos a bar is a fractional number of samples — 137 BPM at 48 kHz
 * is 84087.59 — so the loop point can land up to half a sample away from the
 * ideal grid. That is around ten microseconds, far below anything audible, and
 * an integer count is what both `OfflineAudioContext` and the WAV data chunk
 * require.
 */
export function barsToSamples(
  bars: number,
  tempoBpm: number,
  sampleRate: number,
): number {
  return Math.round(barsToSeconds(bars, tempoBpm) * sampleRate);
}

/**
 * Name for the downloaded file, e.g. `SONO-303_125bpm_2bars_20260831-1432.wav`.
 *
 * The tempo and length are in the name because a sample folder is where this
 * ends up, and a DAW gives no other clue what to set the project tempo to. The
 * timestamp is passed in rather than read from the clock so this stays pure.
 */
export function exportFileName(
  tempoBpm: number,
  bars: number,
  stamp: string,
): string {
  return `SONO-303_${Math.round(tempoBpm)}bpm_${bars}bar${bars === 1 ? "" : "s"}_${stamp}.wav`;
}
