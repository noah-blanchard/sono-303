import { describe, expect, it } from "vitest";
import {
  MIN_LEAD_SECONDS,
  barsBetween,
  framesToClock,
  liveFileName,
  nextBarSeconds,
} from "./liveTake";
import { barsToSeconds } from "./tape";

const BAR_125 = barsToSeconds(1, 125); // 1.92 s

describe("nextBarSeconds", () => {
  it("returns the upcoming bar boundary", () => {
    expect(nextBarSeconds(0.5, 125)).toBeCloseTo(BAR_125, 10);
    expect(nextBarSeconds(2.0, 125)).toBeCloseTo(BAR_125 * 2, 10);
    expect(nextBarSeconds(BAR_125 * 3 + 0.1, 125)).toBeCloseTo(BAR_125 * 4, 10);
  });

  it("always lands on a whole multiple of a bar", () => {
    for (const seconds of [0.01, 0.9, 3.3, 7.7, 19.4]) {
      const boundary = nextBarSeconds(seconds, 125);
      expect(boundary / BAR_125).toBeCloseTo(Math.round(boundary / BAR_125), 9);
    }
  });

  // Transport.schedule silently drops an event already in the past, and hitting
  // REC a millisecond before a downbeat is exactly how that happens.
  it("skips a boundary too close to be scheduled", () => {
    const justBefore = BAR_125 - MIN_LEAD_SECONDS / 2;
    expect(nextBarSeconds(justBefore, 125)).toBeCloseTo(BAR_125 * 2, 10);
  });

  it("keeps a boundary that is comfortably ahead", () => {
    const wellBefore = BAR_125 - MIN_LEAD_SECONDS * 4;
    expect(nextBarSeconds(wellBefore, 125)).toBeCloseTo(BAR_125, 10);
  });

  it("tracks tempo", () => {
    expect(nextBarSeconds(0.1, 60)).toBeCloseTo(4, 10);
    expect(nextBarSeconds(0.1, 200)).toBeCloseTo(1.2, 10);
  });
});

describe("barsBetween", () => {
  it("counts whole bars", () => {
    expect(barsBetween(0, BAR_125 * 4, 125)).toBe(4);
    expect(barsBetween(BAR_125, BAR_125 * 3, 125)).toBe(2);
  });

  it("never reports less than one bar", () => {
    expect(barsBetween(0, 0, 125)).toBe(1);
    expect(barsBetween(0, 0.01, 125)).toBe(1);
  });
});

describe("framesToClock", () => {
  it("formats as MM:SS.T", () => {
    expect(framesToClock(0, 48000)).toBe("00:00.0");
    expect(framesToClock(48000, 48000)).toBe("00:01.0");
    expect(framesToClock(48000 * 4.7, 48000)).toBe("00:04.7");
    expect(framesToClock(48000 * 65, 48000)).toBe("01:05.0");
    expect(framesToClock(48000 * 600, 48000)).toBe("10:00.0");
  });

  it("tracks the sample rate", () => {
    expect(framesToClock(44100, 44100)).toBe("00:01.0");
  });

  it("is safe before a rate is known", () => {
    expect(framesToClock(0, 0)).toBe("00:00.0");
    expect(framesToClock(-5, 48000)).toBe("00:00.0");
    expect(framesToClock(Number.NaN, 48000)).toBe("00:00.0");
  });
});

describe("liveFileName", () => {
  it("marks the take as live so it is not mistaken for a bounce", () => {
    expect(liveFileName(125, "20260831-1955")).toBe(
      "SONO-303_live_125bpm_20260831-1955.wav",
    );
  });

  it("rounds a fractional tempo", () => {
    expect(liveFileName(124.6, "20260831-1955")).toBe(
      "SONO-303_live_125bpm_20260831-1955.wav",
    );
  });
});
