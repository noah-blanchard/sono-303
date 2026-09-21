import { describe, expect, it } from "vitest";
import { defaultStep } from "./defaults";
import {
  PITCH_CLASSES,
  clampToStepOctave,
  midiToFrequency,
  midiToPitch,
  pitchClassToSemitone,
  pitchToMidi,
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

describe("pitchToMidi", () => {
  it("puts middle C at 60 and A4 at 69", () => {
    expect(pitchToMidi("C", 4)).toBe(60);
    expect(pitchToMidi("A", 4)).toBe(69);
  });

  it("agrees with stepToMidi at zero transposition", () => {
    const target = step({ note: "F#", octave: 2 });
    expect(stepToMidi(target, 0)).toBe(pitchToMidi("F#", 2));
  });
});

describe("midiToPitch", () => {
  it("inverts pitchToMidi across the whole MIDI range", () => {
    for (let midi = 0; midi <= 127; midi += 1) {
      const { note, octave } = midiToPitch(midi);
      expect(pitchToMidi(note, octave)).toBe(midi);
    }
  });

  it("names middle C", () => {
    expect(midiToPitch(60)).toEqual({ note: "C", octave: 4 });
  });

  it("stays on the chromatic row below C-1", () => {
    // JS `%` keeps the sign of the dividend, so a negative note number is the
    // one case where the naive table lookup would fall off the end.
    expect(midiToPitch(-1)).toEqual({ note: "B", octave: -2 });
    expect(PITCH_CLASSES).toContain(midiToPitch(-13).note);
  });
});

describe("clampToStepOctave", () => {
  it("folds anything a controller can send into the storable range", () => {
    // A full-size MIDI keyboard reaches well past the five OCT levels, but a
    // step can only hold octaves 1..6.
    expect(clampToStepOctave(-1)).toBe(1);
    expect(clampToStepOctave(0)).toBe(1);
    expect(clampToStepOctave(3)).toBe(3);
    expect(clampToStepOctave(6)).toBe(6);
    expect(clampToStepOctave(9)).toBe(6);
  });
});
