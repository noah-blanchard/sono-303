import { describe, expect, it } from "vitest";
import { defaultParameters, defaultStep } from "../sequencer/defaults";
import type { Step } from "../sequencer/types";
import {
  computeStepEvent,
  isSlideInto,
  stepDurationSeconds,
  stepVelocity,
} from "./stepLogic";

const params = {
  accentAmount: defaultParameters.accentAmount,
  transposeSemitones: 0,
};

function step(overrides: Partial<Step> = {}): Step {
  return { ...defaultStep, ...overrides };
}

const rest = step();
const noteC3 = step({ active: true, note: "C", octave: 3 });
const noteE3 = step({ active: true, note: "E", octave: 3 });

describe("stepDurationSeconds", () => {
  it("is a sixteenth note at the given tempo", () => {
    expect(stepDurationSeconds(120)).toBeCloseTo(0.125);
    expect(stepDurationSeconds(60)).toBeCloseTo(0.25);
  });
});

describe("stepVelocity", () => {
  it("returns the normal velocity for unaccented steps", () => {
    expect(stepVelocity(noteC3, 0.6)).toBeCloseTo(0.65);
  });

  it("adds up to +0.35 for accented steps", () => {
    expect(stepVelocity(step({ active: true, accent: true }), 1)).toBeCloseTo(1);
    expect(stepVelocity(step({ active: true, accent: true }), 0.6)).toBeCloseTo(
      0.65 + 0.6 * 0.35,
    );
  });

  it("produces identical velocities when accentAmount is 0", () => {
    const accented = stepVelocity(step({ active: true, accent: true }), 0);
    const plain = stepVelocity(noteC3, 0);
    expect(accented).toBe(plain);
  });
});

describe("isSlideInto", () => {
  it("requires prev active + slide and cur active", () => {
    const sliding = step({ active: true, slide: true });
    expect(isSlideInto(sliding, noteC3)).toBe(true);
    expect(isSlideInto(sliding, rest)).toBe(false);
    expect(isSlideInto(noteC3, noteE3)).toBe(false);
    expect(isSlideInto(rest, noteC3)).toBe(false);
  });
});

describe("computeStepEvent", () => {
  const duration = stepDurationSeconds(125);

  it("releases held notes on a rest", () => {
    const event = computeStepEvent(noteC3, rest, noteE3, params, duration);
    expect(event.kind).toBe("rest");
    expect(event.releaseAfter).toBeNull();
  });

  it("triggers a fresh note with accent velocity and 80% release", () => {
    const cur = step({ active: true, note: "C", octave: 3, accent: true });
    const event = computeStepEvent(rest, cur, rest, params, duration);
    expect(event.kind).toBe("trigger");
    expect(event.frequency).toBeCloseTo(130.81, 1); // C3
    expect(event.velocity).toBeCloseTo(0.65 + 0.6 * 0.35);
    expect(event.releaseAfter).toBeCloseTo(duration * 0.8);
    expect(event.portamento).toBe(0);
  });

  it("slides in without retrigger when prev slides into cur", () => {
    const prev = step({ active: true, slide: true });
    const event = computeStepEvent(prev, noteE3, rest, params, duration);
    expect(event.kind).toBe("slideIn");
    expect(event.frequency).toBeCloseTo(164.81, 1); // E3
    expect(event.portamento).toBeCloseTo(duration * 0.6);
    // Slide chain ends here (next is a rest) ⇒ release at 80%.
    expect(event.releaseAfter).toBeCloseTo(duration * 0.8);
  });

  it("holds the gate across a continuing slide chain", () => {
    const prev = step({ active: true, slide: true });
    const cur = step({ active: true, note: "E", octave: 3, slide: true });
    const next = step({ active: true });
    const event = computeStepEvent(prev, cur, next, params, duration);
    expect(event.kind).toBe("slideIn");
    expect(event.releaseAfter).toBeNull();
  });

  it("ignores a slide flag before a rest", () => {
    const prev = step({ active: true, slide: true });
    const event = computeStepEvent(prev, rest, noteC3, params, duration);
    expect(event.kind).toBe("rest");
  });

  it("supports the 16→1 wrap slide (indices are the caller's concern)", () => {
    // Step 16 (prev) slides into step 1 (cur): same logic as any boundary.
    const step16 = step({ active: true, slide: true });
    const step1 = step({ active: true, note: "G", octave: 2 });
    const event = computeStepEvent(step16, step1, rest, params, duration);
    expect(event.kind).toBe("slideIn");
    expect(event.frequency).toBeCloseTo(98.0, 1); // G2
  });

  it("applies global transpose without touching stored step data", () => {
    const transposed = { ...params, transposeSemitones: 12 };
    const event = computeStepEvent(rest, noteC3, rest, transposed, duration);
    expect(event.kind).toBe("trigger");
    expect(event.frequency).toBeCloseTo(261.63, 1); // C4
    expect(noteC3.octave).toBe(3);
  });
});
