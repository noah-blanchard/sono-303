import { describe, expect, it } from "vitest";
import { defaultParameters, defaultStep } from "../sequencer/defaults";
import { barsToSeconds } from "../sequencer/tape";
import { STEP_COUNT } from "../sequencer/defaults";
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

  /*
   * SONO-TAPE computes its bounce length in beats, in `src/sequencer/tape.ts`,
   * because `src/sequencer/` may not import from `src/audio/`. That leaves two
   * independent expressions of the same musical fact, and if they ever drift
   * the export silently stops landing on the sequencer's grid. This is the pin.
   */
  it.each([60, 125, 137, 200])(
    "agrees with one bar of SONO-TAPE at %i bpm",
    (bpm) => {
      expect(barsToSeconds(1, bpm)).toBeCloseTo(
        STEP_COUNT * stepDurationSeconds(bpm),
        12,
      );
    },
  );
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
  it("requires prev active and cur active + slide", () => {
    // The SLIDE flag lives on the destination step.
    const slideTarget = step({ active: true, note: "E", octave: 3, slide: true });
    expect(isSlideInto(noteC3, slideTarget)).toBe(true);
    // Nothing to glide from: the predecessor is a rest.
    expect(isSlideInto(rest, slideTarget)).toBe(false);
    // Unflagged destination never slides, whatever the source says.
    expect(isSlideInto(noteC3, noteE3)).toBe(false);
    expect(isSlideInto(step({ active: true, slide: true }), noteE3)).toBe(false);
    // A rest is never a slide destination.
    expect(isSlideInto(noteC3, step({ slide: true }))).toBe(false);
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
    expect(event.accent).toBe(true);
    expect(event.portamento).toBe(0);
  });

  it("holds a triggered note's gate open when the next step slides in", () => {
    // The user-facing case: step 3 = C3, step 4 = C3 flagged SLIDE. Step 3 is
    // a fresh trigger, so this is the path that must not schedule a release —
    // otherwise the gate closes before the glide and step 4 is silent.
    const next = step({ active: true, note: "C", octave: 3, slide: true });
    const event = computeStepEvent(rest, noteC3, next, params, duration);
    expect(event.kind).toBe("trigger");
    expect(event.releaseAfter).toBeNull();
  });

  it("slides in without retrigger when cur is flagged and prev is a note", () => {
    const cur = step({ active: true, note: "E", octave: 3, slide: true });
    const event = computeStepEvent(noteC3, cur, rest, params, duration);
    expect(event.kind).toBe("slideIn");
    expect(event.frequency).toBeCloseTo(164.81, 1); // E3
    expect(event.portamento).toBeCloseTo(duration * 0.6);
    // Slide chain ends here (next is a rest) ⇒ release at 80%.
    expect(event.releaseAfter).toBeCloseTo(duration * 0.8);
  });

  it("carries accent into a slid-into note", () => {
    const cur = step({ active: true, slide: true, accent: true });
    const event = computeStepEvent(noteC3, cur, rest, params, duration);
    expect(event.kind).toBe("slideIn");
    expect(event.accent).toBe(true);
  });

  it("holds the gate across a continuing slide chain", () => {
    const cur = step({ active: true, note: "E", octave: 3, slide: true });
    const next = step({ active: true, slide: true });
    const event = computeStepEvent(noteC3, cur, next, params, duration);
    expect(event.kind).toBe("slideIn");
    expect(event.releaseAfter).toBeNull();
  });

  it("ignores a slide flag on a rest", () => {
    const event = computeStepEvent(
      noteC3,
      step({ slide: true }),
      noteC3,
      params,
      duration,
    );
    expect(event.kind).toBe("rest");
  });

  it("ignores a slide flag when the previous step is a rest", () => {
    const cur = step({ active: true, note: "E", octave: 3, slide: true });
    const event = computeStepEvent(rest, cur, rest, params, duration);
    expect(event.kind).toBe("trigger");
    expect(event.portamento).toBe(0);
  });

  it("supports the 16→1 wrap slide (indices are the caller's concern)", () => {
    // Step 1 (cur) is flagged, so step 16 (prev) glides into it.
    const step16 = step({ active: true });
    const step1 = step({ active: true, note: "G", octave: 2, slide: true });
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
