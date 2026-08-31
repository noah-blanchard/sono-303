import { describe, expect, it } from "vitest";
import {
  ACCENT_VELOCITY,
  ACCENT_VELOCITY_NORMALIZED,
  isAccentVelocity,
} from "./velocity";

describe("isAccentVelocity", () => {
  it("accents only a hard hit", () => {
    expect(isAccentVelocity(127)).toBe(true);
    expect(isAccentVelocity(ACCENT_VELOCITY)).toBe(true);
    expect(isAccentVelocity(ACCENT_VELOCITY - 1)).toBe(false);
    expect(isAccentVelocity(1)).toBe(false);
    expect(isAccentVelocity(0)).toBe(false);
  });
});

describe("ACCENT_VELOCITY_NORMALIZED", () => {
  it("is the same threshold on the engine's 0..1 scale", () => {
    expect(ACCENT_VELOCITY_NORMALIZED).toBeCloseTo(0.787, 3);
    expect(ACCENT_VELOCITY_NORMALIZED * 127).toBeCloseTo(ACCENT_VELOCITY, 6);
  });

  it("sits above the velocity a keyless source plays at", () => {
    // The mouse and the computer keyboard are not velocity sensitive: they
    // play at the unaccented sequencer velocity, which must stay below the
    // threshold or every typed note would accent.
    expect(ACCENT_VELOCITY_NORMALIZED).toBeGreaterThan(0.65);
  });
});
