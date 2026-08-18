import { describe, expect, it } from "vitest";
import { defaultStep } from "./defaults";
import {
  midiToFrequency,
  pitchClassToSemitone,
  stepToMidi,
  stepToNoteName,
} from "./pitch";
import type { Step } from "./types";

function step(overrides: Partial<Step> = {}): Step {
  return { ...defaultStep, ...overrides };
}

describe("pitchClassToSemitone", () => {
  it("maps the chromatic row onto 0..11", () => {
    expect(pitchClassToSemitone("C")).toBe(0);
    expect(pitchClassToSemitone("C#")).toBe(1);
    expect(pitchClassToSemitone("B")).toBe(11);
  });
});

describe("stepToMidi", () => {
  it("combines octave and pitch class (C4 = 60)", () => {
    expect(stepToMidi(step({ note: "C", octave: 4 }), 0)).toBe(60);
    expect(stepToMidi(step({ note: "A", octave: 4 }), 0)).toBe(69);
  });

  it("applies transpose on top of the stored pitch", () => {
    const c4 = step({ note: "C", octave: 4 });
    expect(stepToMidi(c4, 12)).toBe(72);
    expect(stepToMidi(c4, -12)).toBe(48);
    expect(stepToMidi(c4, 3)).toBe(63);
  });
});

describe("stepToNoteName", () => {
  it("renders the stored note and octave, ignoring transpose", () => {
    expect(stepToNoteName(step({ note: "F#", octave: 2 }))).toBe("F#2");
  });
});

describe("midiToFrequency", () => {
  it("maps A4 to 440 Hz and C4 to ~261.63 Hz", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440);
    expect(midiToFrequency(60)).toBeCloseTo(261.63, 2);
  });
});
