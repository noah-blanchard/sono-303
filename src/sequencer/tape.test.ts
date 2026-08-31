import { describe, expect, it } from "vitest";
import {
  EXPORT_SAMPLE_RATE,
  TAPE_BAR_OPTIONS,
  barsToSamples,
  barsToSeconds,
  exportFileName,
} from "./tape";

describe("barsToSeconds", () => {
  it("is four beats per bar at the given tempo", () => {
    expect(barsToSeconds(1, 125)).toBeCloseTo(1.92, 10);
    expect(barsToSeconds(2, 125)).toBeCloseTo(3.84, 10);
    expect(barsToSeconds(4, 125)).toBeCloseTo(7.68, 10);
    expect(barsToSeconds(8, 125)).toBeCloseTo(15.36, 10);
  });

  it("scales inversely with tempo", () => {
    expect(barsToSeconds(1, 60)).toBeCloseTo(4, 10);
    expect(barsToSeconds(1, 120)).toBeCloseTo(2, 10);
    expect(barsToSeconds(8, 60)).toBeCloseTo(32, 10);
  });

  it("is linear in bars", () => {
    for (const bars of TAPE_BAR_OPTIONS) {
      expect(barsToSeconds(bars, 137)).toBeCloseTo(bars * barsToSeconds(1, 137), 10);
    }
  });
});

describe("barsToSamples", () => {
  it("is exact when the bar divides evenly", () => {
    // 1.92 s at 48 kHz is 92160 frames on the nose.
    expect(barsToSamples(1, 125, EXPORT_SAMPLE_RATE)).toBe(92160);
    expect(barsToSamples(4, 125, EXPORT_SAMPLE_RATE)).toBe(92160 * 4);
  });

  // Most tempos do not land on a whole frame; rounding is deliberate and puts
  // the loop point at worst half a sample (~10 µs) off the ideal grid.
  it("rounds to whole frames at awkward tempos", () => {
    const exact = barsToSeconds(1, 137) * EXPORT_SAMPLE_RATE;
    expect(Number.isInteger(exact)).toBe(false);
    const rounded = barsToSamples(1, 137, EXPORT_SAMPLE_RATE);
    expect(Number.isInteger(rounded)).toBe(true);
    expect(Math.abs(rounded - exact)).toBeLessThanOrEqual(0.5);
  });

  it("tracks the sample rate", () => {
    expect(barsToSamples(1, 120, 44100)).toBe(88200);
    expect(barsToSamples(1, 120, 48000)).toBe(96000);
  });
});

describe("exportFileName", () => {
  it("carries the brand, tempo and length", () => {
    expect(exportFileName(125, 2, "20260831-1432")).toBe(
      "SONO-303_125bpm_2bars_20260831-1432.wav",
    );
  });

  it("says bar, not bars, for a single bar", () => {
    expect(exportFileName(125, 1, "20260831-1432")).toBe(
      "SONO-303_125bpm_1bar_20260831-1432.wav",
    );
  });

  it("rounds a fractional tempo so the name stays readable", () => {
    expect(exportFileName(124.6, 4, "20260831-1432")).toBe(
      "SONO-303_125bpm_4bars_20260831-1432.wav",
    );
  });
});
