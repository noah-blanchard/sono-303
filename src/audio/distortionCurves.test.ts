import { describe, expect, it } from "vitest";
import type { ActiveDistortionMode } from "../sequencer/types";
import {
  CURVE_SIZE,
  buildDistortionCurve,
  classicCurve,
  overdriveCurve,
  softClip,
  turboCurve,
} from "./distortionCurves";

const MODES: ActiveDistortionMode[] = ["classic", "turbo", "overdrive"];

/** Index of the sample nearest to input `x` in a CURVE_SIZE table. */
function indexFor(x: number): number {
  return Math.round(((x + 1) / 2) * (CURVE_SIZE - 1));
}

/**
 * The index holding exactly `-x` for the sample at `index`. Mirroring by index
 * rather than by input value keeps the pair exact: `indexFor(x)` and
 * `indexFor(-x)` can round the same way and land one sample apart.
 */
function mirrorOf(index: number): number {
  return CURVE_SIZE - 1 - index;
}

/** Fraction of samples sitting at (or beyond) the rails. */
function railRatio(curve: Float32Array): number {
  let count = 0;
  for (const value of curve) if (Math.abs(value) >= 0.999) count += 1;
  return count / curve.length;
}

describe("buildDistortionCurve", () => {
  it.each(MODES)("produces a legal %s table at every drive", (mode) => {
    for (const drive of [0, 0.25, 0.5, 0.75, 1]) {
      const curve = buildDistortionCurve(mode, drive);
      expect(curve).toHaveLength(CURVE_SIZE);
      expect(curve.every(Number.isFinite)).toBe(true);
      expect(curve.every((value) => value >= -1 && value <= 1)).toBe(true);
    }
  });

  it.each(MODES)("maps silence to silence in %s", (mode) => {
    const curve = buildDistortionCurve(mode, 1);
    // The table has an even sample count, so no sample lands exactly on 0:
    // the two straddling it must both be small.
    const middle = CURVE_SIZE / 2;
    expect(Math.abs(curve[middle - 1])).toBeLessThan(0.01);
    expect(Math.abs(curve[middle])).toBeLessThan(0.01);
  });

  it.each(MODES)("is monotonic in %s, so the waveform is never folded", (mode) => {
    const curve = buildDistortionCurve(mode, 0.7);
    for (let index = 1; index < CURVE_SIZE; index += 1) {
      expect(curve[index]).toBeGreaterThanOrEqual(curve[index - 1]);
    }
  });

  it("clamps out-of-range drive instead of producing garbage", () => {
    expect(buildDistortionCurve("turbo", -5)).toEqual(
      buildDistortionCurve("turbo", 0),
    );
    expect(buildDistortionCurve("turbo", 9)).toEqual(
      buildDistortionCurve("turbo", 1),
    );
  });

  it.each(["classic", "turbo"] as const)("is symmetric for %s", (mode) => {
    const curve = buildDistortionCurve(mode, 0.8);
    for (const x of [0.15, 0.4, 0.65, 0.9]) {
      const index = indexFor(x);
      expect(curve[index]).toBeCloseTo(-curve[mirrorOf(index)], 5);
    }
  });

  it("is deliberately asymmetric for O-DRIVE", () => {
    const curve = buildDistortionCurve("overdrive", 0.8);
    // The negative half is both quieter and softer than the positive half,
    // which is where its even harmonics come from.
    for (const x of [0.25, 0.5, 0.75]) {
      const index = indexFor(x);
      expect(curve[index]).toBeGreaterThan(Math.abs(curve[mirrorOf(index)]));
    }
  });

  it("drives TURBO into the rails harder than CLASSIC at equal drive", () => {
    const drive = 0.75;
    expect(railRatio(buildDistortionCurve("turbo", drive))).toBeGreaterThan(
      railRatio(buildDistortionCurve("classic", drive)),
    );
    // ... and TURBO clips at a far lower input level than CLASSIC does.
    const x = indexFor(0.4);
    expect(buildDistortionCurve("turbo", drive)[x]).toBeGreaterThan(
      buildDistortionCurve("classic", drive)[x],
    );
  });

  it("makes every mode saturate more as drive rises", () => {
    for (const mode of MODES) {
      const x = indexFor(0.3);
      expect(buildDistortionCurve(mode, 1)[x]).toBeGreaterThan(
        buildDistortionCurve(mode, 0)[x],
      );
    }
  });
});

describe("curve building blocks", () => {
  it("normalizes softClip so full scale stays full scale", () => {
    for (const k of [1, 2.5, 6]) {
      expect(softClip(1, k)).toBeCloseTo(1, 10);
      expect(softClip(-1, k)).toBeCloseTo(-1, 10);
      expect(softClip(0, k)).toBe(0);
    }
  });

  it("rails TURBO at its threshold while CLASSIC never rails early", () => {
    const drive = 0.5; // threshold 0.5
    expect(turboCurve(0.5, drive)).toBeCloseTo(1, 10);
    expect(turboCurve(0.9, drive)).toBeCloseTo(1, 10);
    // CLASSIC only reaches full scale at full-scale input, so it keeps some
    // dynamics everywhere below that.
    expect(classicCurve(0.9, drive)).toBeLessThan(1);
    expect(classicCurve(1, drive)).toBeCloseTo(1, 10);
  });

  it("keeps O-DRIVE's two halves at different gains", () => {
    const drive = 0.6;
    // Positive half is louder and stiffer than the negative half — that offset
    // is the mode's whole personality.
    expect(overdriveCurve(0.35, drive)).toBeGreaterThan(
      Math.abs(overdriveCurve(-0.35, drive)),
    );
    expect(overdriveCurve(1, drive)).toBeCloseTo(0.96, 10);
    expect(overdriveCurve(-1, drive)).toBeCloseTo(-0.82, 10);
  });
});
