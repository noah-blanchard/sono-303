/**
 * Transfer curves for the three SONO-DIST voicings (spec §6/§7).
 *
 * Pure maths: no Tone.js, no DOM, no state. `buildDistortionCurve` produces the
 * `Float32Array` a `Tone.WaveShaper` reads, which is why the whole character of
 * the module is unit-testable without an AudioContext.
 *
 * The three modes are genuinely different functions rather than three amounts
 * of one function — that is the difference between three colours and one effect
 * with a bigger knob.
 */

import { clamp01, lerp } from "../sequencer/distortionMapping";
import type { ActiveDistortionMode } from "../sequencer/types";

/** Sample count of every generated curve. */
export const CURVE_SIZE = 4096;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Normalized soft clip. Dividing by `tanh(k)` keeps full-scale input mapped to
 * full-scale output, so raising `k` adds harmonics instead of just volume.
 */
export function softClip(x: number, k: number): number {
  return Math.tanh(k * x) / Math.tanh(k);
}

/** CLASSIC: symmetric, progressive warmth. Mostly odd harmonics. */
export function classicCurve(x: number, drive: number): number {
  return softClip(x, lerp(1.0, 4.5, drive));
}

/**
 * TURBO: near-hard clipping. The threshold collapses as DRIVE rises, so the
 * curve reaches the rails far earlier than CLASSIC and squashes transients.
 */
export function turboCurve(x: number, drive: number): number {
  const threshold = lerp(0.78, 0.22, drive);
  return clamp(x / threshold, -1, 1);
}

/**
 * O-DRIVE: asymmetric soft clipping — the negative half saturates sooner and
 * quieter than the positive half. That asymmetry is what generates the even
 * harmonics behind its thicker, more organic body, and also what makes the
 * engine's DC blocker mandatory.
 */
export function overdriveCurve(x: number, drive: number): number {
  const positiveK = lerp(1.0, 6.0, drive);
  const negativeK = lerp(0.7, 3.8, drive);

  return x >= 0 ? 0.96 * softClip(x, positiveK) : 0.82 * softClip(x, negativeK);
}

const CURVES = {
  classic: classicCurve,
  turbo: turboCurve,
  overdrive: overdriveCurve,
} as const satisfies Record<
  ActiveDistortionMode,
  (x: number, drive: number) => number
>;

/**
 * Samples the mode's transfer function across the full -1..1 input range.
 * Output is clamped, so no curve can ever hand the graph a value outside the
 * legal range no matter how the shaping functions are tuned later.
 */
export function buildDistortionCurve(
  mode: ActiveDistortionMode,
  drive: number,
): Float32Array {
  const safeDrive = clamp01(drive);
  const shape = CURVES[mode];
  const curve = new Float32Array(CURVE_SIZE);

  for (let index = 0; index < CURVE_SIZE; index += 1) {
    const x = (index / (CURVE_SIZE - 1)) * 2 - 1;
    curve[index] = clamp(shape(x, safeDrive), -1, 1);
  }

  return curve;
}
