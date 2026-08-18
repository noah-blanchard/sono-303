import { describe, expect, it } from "vitest";
import { STEP_COUNT, createInitialState } from "../sequencer/defaults";
import type { Sono303State } from "../sequencer/types";
import { sono303Reducer } from "./sono303Reducer";

function stateWith(overrides: Partial<Sono303State> = {}): Sono303State {
  return { ...createInitialState(), ...overrides };
}

describe("sono303Reducer invariants", () => {
  it("always keeps exactly 16 steps", () => {
    const state = sono303Reducer(createInitialState(), {
      type: "step/setPitch",
      note: "E",
    });
    expect(state.steps).toHaveLength(STEP_COUNT);
  });

  it("clamps envMod and accentAmount to 0..1", () => {
    let state = sono303Reducer(createInitialState(), {
      type: "parameter/set",
      key: "envMod",
      value: 4,
    });
    expect(state.parameters.envMod).toBe(1);

    state = sono303Reducer(state, {
      type: "parameter/set",
      key: "accentAmount",
      value: -2,
    });
    expect(state.parameters.accentAmount).toBe(0);
  });

  it("clamps selectedStep to 0..15", () => {
    let state = sono303Reducer(createInitialState(), {
      type: "step/select",
      stepIndex: 99,
    });
    expect(state.selectedStep).toBe(15);

    state = sono303Reducer(state, { type: "step/select", stepIndex: -5 });
    expect(state.selectedStep).toBe(0);
  });

  it("clamps the OCT buttons to the five keyboard levels", () => {
    let state = stateWith({ selectedStep: 0 });
    for (let i = 0; i < 10; i += 1) {
      state = sono303Reducer(state, { type: "step/changeOctave", delta: 1 });
    }
    expect(state.keyboardOctave).toBe(5);
    expect(state.steps[0].octave).toBe(6);

    for (let i = 0; i < 10; i += 1) {
      state = sono303Reducer(state, { type: "step/changeOctave", delta: -1 });
    }
    expect(state.keyboardOctave).toBe(1);
    expect(state.steps[0].octave).toBe(1);
  });

  it("carries the selected pitch along with the window", () => {
    let state = stateWith({ selectedStep: 0, keyboardOctave: 3 });
    state = sono303Reducer(state, {
      type: "step/setPitch",
      note: "C",
      octave: 4,
    });

    // C4 sits in the upper row of the C3-B4 window and must stay there.
    state = sono303Reducer(state, { type: "step/changeOctave", delta: -1 });
    expect(state.keyboardOctave).toBe(2);
    expect(state.steps[0].octave).toBe(3);
  });

  it("never moves the window when a key is picked", () => {
    let state = stateWith({ selectedStep: 0, keyboardOctave: 4 });
    state = sono303Reducer(state, {
      type: "step/setPitch",
      note: "C",
      octave: 5,
    });
    expect(state.steps[0].octave).toBe(5);
    expect(state.keyboardOctave).toBe(4);
  });

  it("re-centres the window only when the selected step is off screen", () => {
    let state = stateWith({ selectedStep: 0, keyboardOctave: 3 });

    // Every default step is on octave 3, still inside the C3-B4 window.
    state = sono303Reducer(state, { type: "step/select", stepIndex: 1 });
    expect(state.keyboardOctave).toBe(3);

    const steps = state.steps.slice();
    steps[2] = { ...steps[2], octave: 1 };
    state = sono303Reducer(
      { ...state, steps },
      { type: "step/select", stepIndex: 2 },
    );
    expect(state.keyboardOctave).toBe(1);
  });

  it("accepts octave 6 from the keyboard's upper row and clamps beyond it", () => {
    let state = sono303Reducer(
      stateWith({ selectedStep: 0, keyboardOctave: 5 }),
      { type: "step/setPitch", note: "C", octave: 6 },
    );
    expect(state.steps[0].octave).toBe(6);

    // Window and pitch are both at their top, so OCT + does nothing.
    state = sono303Reducer(state, { type: "step/changeOctave", delta: 1 });
    expect(state.keyboardOctave).toBe(5);
    expect(state.steps[0].octave).toBe(6);

    state = sono303Reducer(state, {
      type: "step/setPitch",
      note: "C",
      octave: 9,
    });
    expect(state.steps[0].octave).toBe(6);
  });

  it("clamps transpose to ±12 and rounds it", () => {
    let state = sono303Reducer(createInitialState(), {
      type: "parameter/set",
      key: "transposeSemitones",
      value: 30,
    });
    expect(state.parameters.transposeSemitones).toBe(12);

    state = sono303Reducer(state, {
      type: "parameter/set",
      key: "transposeSemitones",
      value: -30,
    });
    expect(state.parameters.transposeSemitones).toBe(-12);

    state = sono303Reducer(state, {
      type: "parameter/set",
      key: "transposeSemitones",
      value: 3.6,
    });
    expect(state.parameters.transposeSemitones).toBe(4);
  });

  it("enabling REST resets accent and slide to false", () => {
    let state = stateWith({ selectedStep: 2 });
    state = sono303Reducer(state, { type: "step/setPitch", note: "G" });
    state = sono303Reducer(state, { type: "step/toggleAccent" });
    state = sono303Reducer(state, { type: "step/toggleSlide" });
    expect(state.steps[2].accent).toBe(true);
    expect(state.steps[2].slide).toBe(true);

    state = sono303Reducer(state, { type: "step/setRest", rest: true });
    expect(state.steps[2].active).toBe(false);
    expect(state.steps[2].accent).toBe(false);
    expect(state.steps[2].slide).toBe(false);
  });

  it("keeps mode and transport independent", () => {
    let state = sono303Reducer(createInitialState(), {
      type: "transport/toggle",
    });
    expect(state.transport).toBe("started");
    expect(state.mode).toBe("write");

    state = sono303Reducer(state, { type: "mode/set", mode: "play" });
    expect(state.transport).toBe("started");
    expect(state.mode).toBe("play");

    state = sono303Reducer(state, { type: "transport/toggle" });
    expect(state.transport).toBe("stopped");
    expect(state.mode).toBe("play");
  });

  it("clears the playhead when transport stops", () => {
    let state = stateWith({ transport: "started", currentStep: 7 });
    state = sono303Reducer(state, { type: "transport/toggle" });
    expect(state.currentStep).toBeNull();
  });

  it("does not toggle accent or slide on a rest step", () => {
    let state = stateWith({ selectedStep: 1 });
    state = sono303Reducer(state, { type: "step/toggleAccent" });
    state = sono303Reducer(state, { type: "step/toggleSlide" });
    expect(state.steps[1].accent).toBe(false);
    expect(state.steps[1].slide).toBe(false);
  });
});
