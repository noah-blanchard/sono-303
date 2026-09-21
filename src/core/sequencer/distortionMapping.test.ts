import { describe, expect, it } from "vitest";
import {
  DRIVE_PRE_GAIN_DB,
  MODE_COMPENSATION_DB,
  MODE_OVERSAMPLE,
  TONE_MAX_HZ,
  TONE_MIN_HZ,
  clamp01,
  dbToGain,
  lerp,
  mapDriveToPreGainDb,
  mapLevelToDb,
  mapToneToFrequency,
} from "./distortionMapping";
import type { ActiveDistortionMode } from "./types";

const MODES: ActiveDistortionMode[] = ["classic", "turbo", "overdrive"];

describe("mapToneToFrequency", () => {
  it("spans 650 Hz to 16 kHz", () => {
    expect(mapToneToFrequency(0)).toBeCloseTo(TONE_MIN_HZ, 6);
    expect(mapToneToFrequency(1)).toBeCloseTo(TONE_MAX_HZ, 6);
  });

  it("is exponential, so the midpoint is the geometric mean", () => {
    expect(mapToneToFrequency(0.5)).toBeCloseTo(
      Math.sqrt(TONE_MIN_HZ * TONE_MAX_HZ),
      6,
    );
  });

  it("rises monotonically and clamps outside 0..1", () => {
    let previous = 0;
    for (let value = 0; value <= 1; value += 0.05) {
      const hz = mapToneToFrequency(value);
      expect(hz).toBeGreaterThan(previous);
      previous = hz;
    }
    expect(mapToneToFrequency(-3)).toBeCloseTo(TONE_MIN_HZ, 6);
    expect(mapToneToFrequency(4)).toBeCloseTo(TONE_MAX_HZ, 6);
  });
});

describe("mapLevelToDb", () => {
  it("spans -24 dB to +3 dB", () => {
    expect(mapLevelToDb(0)).toBe(-24);
    expect(mapLevelToDb(1)).toBe(3);
  });

  it("puts the default 0.67 near -5.9 dB", () => {
    expect(mapLevelToDb(0.67)).toBeCloseTo(-5.91, 2);
  });

  it("clamps outside 0..1", () => {
    expect(mapLevelToDb(-1)).toBe(-24);
    expect(mapLevelToDb(2)).toBe(3);
  });
});

describe("mapDriveToPreGainDb", () => {
  it.each(MODES)("walks the %s range end to end", (mode) => {
    const { min, max } = DRIVE_PRE_GAIN_DB[mode];
    expect(mapDriveToPreGainDb(mode, 0)).toBeCloseTo(min, 6);
    expect(mapDriveToPreGainDb(mode, 1)).toBeCloseTo(max, 6);
    expect(mapDriveToPreGainDb(mode, 0.5)).toBeCloseTo((min + max) / 2, 6);
  });

  it("keeps TURBO hotter than the other modes at every position", () => {
    for (const drive of [0, 0.5, 1]) {
      expect(mapDriveToPreGainDb("turbo", drive)).toBeGreaterThan(
        mapDriveToPreGainDb("classic", drive),
      );
      expect(mapDriveToPreGainDb("turbo", drive)).toBeGreaterThan(
        mapDriveToPreGainDb("overdrive", drive),
      );
    }
  });

  it("clamps outside 0..1", () => {
    expect(mapDriveToPreGainDb("classic", -2)).toBe(0);
    expect(mapDriveToPreGainDb("classic", 7)).toBe(18);
  });
});

describe("per-mode constants", () => {
  it("cuts TURBO the hardest, so mode switches are not volume jumps", () => {
    expect(MODE_COMPENSATION_DB.turbo).toBeLessThan(
      MODE_COMPENSATION_DB.overdrive,
    );
    expect(MODE_COMPENSATION_DB.overdrive).toBeLessThan(
      MODE_COMPENSATION_DB.classic,
    );
  });

  it("oversamples the hardest-clipping mode the most", () => {
    expect(MODE_OVERSAMPLE.turbo).toBe("4x");
    expect(MODE_OVERSAMPLE.classic).toBe("2x");
    expect(MODE_OVERSAMPLE.overdrive).toBe("2x");
  });
});

describe("helpers", () => {
  it("clamps to 0..1", () => {
    expect(clamp01(-0.4)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(1.4)).toBe(1);
  });

  it("interpolates linearly", () => {
    expect(lerp(2, 10, 0)).toBe(2);
    expect(lerp(2, 10, 0.25)).toBe(4);
    expect(lerp(2, 10, 1)).toBe(10);
  });

  it("converts dB to a linear gain factor", () => {
    expect(dbToGain(0)).toBeCloseTo(1, 10);
    expect(dbToGain(-6)).toBeCloseTo(0.50119, 5);
    expect(dbToGain(6)).toBeCloseTo(1.99526, 5);
    expect(dbToGain(-20)).toBeCloseTo(0.1, 10);
  });
});
