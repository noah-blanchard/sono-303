import { describe, expect, it } from "vitest";
import { isDistPatched } from "../sequencer/patchbay";
import { createInitialState, defaultSonoDistState } from "../sequencer/defaults";
import type { Sono303Action, SonoDistState } from "../sequencer/types";
import { sono303Reducer } from "./sono303Reducer";
import { sonoDistReducer } from "./sonoDistReducer";

function reduce(
  state: SonoDistState,
  ...actions: Sono303Action[]
): SonoDistState {
  return actions.reduce(sonoDistReducer, state);
}

describe("sonoDistReducer", () => {
  it("boots bypassed with the spec's knob positions", () => {
    expect(defaultSonoDistState).toEqual({
      mode: "bypass",
      drive: 0.38,
      tone: 0.58,
      level: 0.67,
    });
  });

  it("selects one mode at a time", () => {
    const state = reduce(
      defaultSonoDistState,
      { type: "dist/setMode", mode: "turbo" },
      { type: "dist/setMode", mode: "overdrive" },
    );
    expect(state.mode).toBe("overdrive");
  });

  it("clamps every knob to 0..1", () => {
    const state = reduce(
      defaultSonoDistState,
      { type: "dist/setDrive", value: 4 },
      { type: "dist/setTone", value: -2 },
      { type: "dist/setLevel", value: 0.25 },
    );
    expect(state.drive).toBe(1);
    expect(state.tone).toBe(0);
    expect(state.level).toBe(0.25);
  });

  it("ignores malformed values", () => {
    const state = reduce(defaultSonoDistState, {
      type: "dist/setDrive",
      value: Number.NaN,
    });
    expect(state).toBe(defaultSonoDistState);
  });

  it("ignores an unknown mode", () => {
    const state = sonoDistReducer(defaultSonoDistState, {
      type: "dist/setMode",
      mode: "fuzz" as never,
    });
    expect(state).toBe(defaultSonoDistState);
  });

  it("keeps knob values through a BYPASS round trip", () => {
    const dialled = reduce(
      defaultSonoDistState,
      { type: "dist/setMode", mode: "turbo" },
      { type: "dist/setDrive", value: 0.9 },
      { type: "dist/setTone", value: 0.2 },
      { type: "dist/setLevel", value: 0.5 },
    );

    const roundTrip = reduce(
      dialled,
      { type: "dist/setMode", mode: "bypass" },
      { type: "dist/setMode", mode: "turbo" },
    );

    expect(roundTrip).toEqual(dialled);
  });

  it("returns the same reference when nothing changes", () => {
    expect(
      sonoDistReducer(defaultSonoDistState, {
        type: "dist/setMode",
        mode: "bypass",
      }),
    ).toBe(defaultSonoDistState);
    expect(
      sonoDistReducer(defaultSonoDistState, {
        type: "dist/setLevel",
        value: defaultSonoDistState.level,
      }),
    ).toBe(defaultSonoDistState);
    expect(
      sonoDistReducer(defaultSonoDistState, { type: "transport/toggle" }),
    ).toBe(defaultSonoDistState);
  });
});

describe("sono303Reducer distortion integration", () => {
  // Wired into the chain on boot, but in BYPASS: the cable is in, and the sound
  // is still a bare SONO-303 until a voicing is chosen.
  it("boots patched into the chain but in bypass", () => {
    const state = createInitialState();
    expect(isDistPatched(state.connections)).toBe(true);
    expect(state.dist).toEqual(defaultSonoDistState);
  });

  it("delegates dist actions and leaves the rest of the state alone", () => {
    const initial = createInitialState();
    const next = sono303Reducer(initial, { type: "dist/setDrive", value: 0.8 });

    expect(next.dist.drive).toBe(0.8);
    expect(next.steps).toBe(initial.steps);
    expect(next.parameters).toBe(initial.parameters);
  });

  it("moves the patch cable without touching the module state", () => {
    const initial = createInitialState();
    const unplugged = sono303Reducer(initial, {
      type: "patch/disconnect",
      port: "dist.in",
    });

    expect(isDistPatched(unplugged.connections)).toBe(false);
    expect(unplugged.dist).toBe(initial.dist);
    // Already unplugged: the identical state comes back.
    expect(
      sono303Reducer(unplugged, { type: "patch/disconnect", port: "dist.in" }),
    ).toBe(unplugged);
  });

  it("does not clone the root state when a dist action changes nothing", () => {
    const initial = createInitialState();
    expect(
      sono303Reducer(initial, { type: "dist/setMode", mode: "bypass" }),
    ).toBe(initial);
  });

  it("keeps the module state serializable", () => {
    const initial = createInitialState();
    const next = sono303Reducer(initial, { type: "dist/setMode", mode: "turbo" });
    expect(JSON.parse(JSON.stringify(next.dist))).toEqual(next.dist);
    // `active` is derived, never stored, so it can never contradict the mode.
    expect(next.dist).not.toHaveProperty("active");
  });
});
