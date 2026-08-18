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

  it("clamps octave to 1..5", () => {
    let state = stateWith({ selectedStep: 0 });
    for (let i = 0; i < 10; i += 1) {
      state = sono303Reducer(state, { type: "step/changeOctave", delta: 1 });
    }
    expect(state.steps[0].octave).toBe(5);

    for (let i = 0; i < 10; i += 1) {
      state = sono303Reducer(state, { type: "step/changeOctave", delta: -1 });
    }
    expect(state.steps[0].octave).toBe(1);
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
