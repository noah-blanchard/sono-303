import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSonoDistState } from "../sequencer/defaults";
import {
  MODE_COMPENSATION_DB,
  dbToGain,
  mapDriveToPreGainDb,
  mapLevelToDb,
  mapToneToFrequency,
} from "../sequencer/distortionMapping";

/**
 * Engine test with a fully mocked `tone` module, in the same style as
 * `Sono303Engine.test.ts`: no AudioContext exists here, so every Tone.js
 * touchpoint is a spy. The assertions cover the graph shape, the anti-click
 * transitions and the lifecycle — the *sound* itself is covered by the pure
 * curve tests in `distortionCurves.test.ts`.
 */

const toneMock = vi.hoisted(() => {
  class FakeParam {
    value: number;
    rampTo = vi.fn((value: number) => {
      this.value = value;
    });
    constructor(value: number) {
      this.value = value;
    }
  }

  const gains: FakeGain[] = [];
  const filters: FakeFilter[] = [];
  const shapers: FakeWaveShaper[] = [];
  const crossFades: FakeCrossFade[] = [];

  class FakeGain {
    gain: FakeParam;
    connect = vi.fn();
    disconnect = vi.fn();
    chain = vi.fn();
    dispose = vi.fn();
    constructor(value = 1) {
      this.gain = new FakeParam(value);
      gains.push(this);
    }
  }

  class FakeFilter {
    frequency: FakeParam;
    type: string;
    Q: number;
    rolloff: number;
    connect = vi.fn();
    dispose = vi.fn();
    constructor(options: {
      type: string;
      frequency: number;
      Q: number;
      rolloff: number;
    }) {
      this.frequency = new FakeParam(options.frequency);
      this.type = options.type;
      this.Q = options.Q;
      this.rolloff = options.rolloff;
      filters.push(this);
    }
  }

  class FakeWaveShaper {
    curve: Float32Array | null = null;
    oversample = "none";
    connect = vi.fn();
    dispose = vi.fn();
    constructor() {
      shapers.push(this);
    }
  }

  class FakeCrossFade {
    a = { name: "crossFade.a" };
    b = { name: "crossFade.b" };
    fade: FakeParam;
    connect = vi.fn();
    dispose = vi.fn();
    constructor(fade = 0.5) {
      this.fade = new FakeParam(fade);
      crossFades.push(this);
    }
  }

  return {
    gains,
    filters,
    shapers,
    crossFades,
    FakeGain,
    FakeFilter,
    FakeWaveShaper,
    FakeCrossFade,
  };
});

vi.mock("tone", () => ({
  Gain: toneMock.FakeGain,
  Filter: toneMock.FakeFilter,
  WaveShaper: toneMock.FakeWaveShaper,
  CrossFade: toneMock.FakeCrossFade,
}));

const { SonoDistEngine } = await import("./SonoDistEngine");

function shaper() {
  return toneMock.shapers[0];
}

function crossFade() {
  return toneMock.crossFades[0];
}

/** The engine builds its gains in a fixed order; name them for readability. */
function preGain() {
  return toneMock.gains[2];
}

function modeCompensation() {
  return toneMock.gains[3];
}

function levelGain() {
  return toneMock.gains[4];
}

function toneFilter() {
  // filters[0] is the DC blocker, filters[1] is TONE.
  return toneMock.filters[1];
}

beforeEach(() => {
  toneMock.gains.length = 0;
  toneMock.filters.length = 0;
  toneMock.shapers.length = 0;
  toneMock.crossFades.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SonoDistEngine graph", () => {
  it("builds every node exactly once and wires the dry and wet paths", () => {
    const engine = new SonoDistEngine();

    expect(toneMock.gains).toHaveLength(5); // input, output, pre, compensation, level
    expect(toneMock.shapers).toHaveLength(1);
    expect(toneMock.crossFades).toHaveLength(1);

    // Dry path: input straight into the crossfader's `a` input.
    expect(engine.input.connect).toHaveBeenCalledWith(crossFade().a);
    // Wet path: the full chain, ending on `b`.
    expect(engine.input.chain).toHaveBeenCalledWith(
      preGain(),
      shaper(),
      toneMock.filters[0],
      toneFilter(),
      modeCompensation(),
      levelGain(),
      crossFade().b,
    );
    expect(crossFade().connect).toHaveBeenCalledWith(engine.output);
    engine.dispose();
  });

  it("high-passes at 20 Hz right after the shaper to kill O-DRIVE's DC offset", () => {
    const engine = new SonoDistEngine();
    expect(toneMock.filters[0].type).toBe("highpass");
    expect(toneMock.filters[0].frequency.value).toBe(20);
    expect(toneFilter().type).toBe("lowpass");
    expect(toneFilter().rolloff).toBe(-12);
    engine.dispose();
  });

  it("starts on the dry path when the initial mode is bypass", () => {
    const engine = new SonoDistEngine(defaultSonoDistState);
    expect(crossFade().fade.value).toBe(0);
    engine.dispose();
  });

  it("starts on the processed path when the initial mode is active", () => {
    const engine = new SonoDistEngine({
      ...defaultSonoDistState,
      mode: "classic",
    });
    expect(crossFade().fade.value).toBe(1);
    // Loading the initial voicing must not ramp — nothing is sounding yet.
    expect(preGain().gain.rampTo).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("never recreates a node when the mode changes", () => {
    const engine = new SonoDistEngine();
    const nodeCount = toneMock.gains.length;
    engine.setMode("classic");
    engine.setMode("turbo");
    engine.setMode("bypass");
    expect(toneMock.gains).toHaveLength(nodeCount);
    expect(toneMock.shapers).toHaveLength(1);
    engine.dispose();
  });
});

describe("SonoDistEngine knobs", () => {
  it("ramps pre-gain and rebuilds the curve on DRIVE", () => {
    const engine = new SonoDistEngine({ ...defaultSonoDistState, mode: "classic" });
    const before = shaper().curve;

    engine.setDrive(0.9);

    expect(shaper().curve).not.toBe(before);
    expect(preGain().gain.rampTo).toHaveBeenCalledWith(
      expect.closeTo(dbToGain(mapDriveToPreGainDb("classic", 0.9)), 6),
      0.02,
    );
    engine.dispose();
  });

  it("sweeps the TONE filter exponentially", () => {
    const engine = new SonoDistEngine();
    engine.setTone(1);
    expect(toneFilter().frequency.rampTo).toHaveBeenCalledWith(
      expect.closeTo(16_000, 3),
      0.025,
    );
    engine.setTone(0);
    expect(toneFilter().frequency.rampTo).toHaveBeenLastCalledWith(
      expect.closeTo(650, 6),
      0.025,
    );
    engine.dispose();
  });

  it("ramps LEVEL across -24..+3 dB", () => {
    const engine = new SonoDistEngine();
    engine.setLevel(1);
    expect(levelGain().gain.rampTo).toHaveBeenCalledWith(
      expect.closeTo(dbToGain(3), 6),
      0.02,
    );
    engine.dispose();
  });

  it("clamps every knob to 0..1", () => {
    const engine = new SonoDistEngine();

    engine.setDrive(4);
    expect(preGain().gain.rampTo).toHaveBeenLastCalledWith(
      expect.closeTo(dbToGain(mapDriveToPreGainDb("classic", 1)), 6),
      0.02,
    );

    engine.setTone(-3);
    expect(toneFilter().frequency.rampTo).toHaveBeenLastCalledWith(
      expect.closeTo(mapToneToFrequency(0), 6),
      0.025,
    );

    engine.setLevel(9);
    expect(levelGain().gain.rampTo).toHaveBeenLastCalledWith(
      expect.closeTo(dbToGain(mapLevelToDb(1)), 6),
      0.02,
    );
    engine.dispose();
  });

  it("ignores a knob move that changes nothing", () => {
    const engine = new SonoDistEngine();
    engine.setLevel(defaultSonoDistState.level);
    expect(levelGain().gain.rampTo).not.toHaveBeenCalled();
    engine.dispose();
  });
});

describe("SonoDistEngine mode transitions", () => {
  it("fades to the dry path on BYPASS without touching the knobs", () => {
    const engine = new SonoDistEngine({ ...defaultSonoDistState, mode: "classic" });
    engine.setMode("bypass");

    expect(crossFade().fade.rampTo).toHaveBeenCalledWith(0, 0.015);
    expect(levelGain().gain.rampTo).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("loads the voicing before fading in from BYPASS", () => {
    const engine = new SonoDistEngine();
    engine.setMode("turbo");

    // No dip first: the dry path is already up, so the swap is inaudible.
    expect(crossFade().fade.rampTo).toHaveBeenCalledTimes(1);
    expect(crossFade().fade.rampTo).toHaveBeenCalledWith(1, 0.02);
    expect(shaper().oversample).toBe("4x");
    expect(modeCompensation().gain.value).toBeCloseTo(
      dbToGain(MODE_COMPENSATION_DB.turbo),
      6,
    );
    engine.dispose();
  });

  it("dips to dry, swaps, then fades back when switching between active modes", () => {
    vi.useFakeTimers();
    const engine = new SonoDistEngine({ ...defaultSonoDistState, mode: "classic" });

    engine.setMode("turbo");
    // Nothing has changed under the still-audible signal yet.
    expect(crossFade().fade.rampTo).toHaveBeenCalledWith(0, 0.015);
    expect(shaper().oversample).toBe("2x");

    vi.advanceTimersByTime(20);

    expect(shaper().oversample).toBe("4x");
    expect(crossFade().fade.rampTo).toHaveBeenLastCalledWith(1, 0.02);
    engine.dispose();
  });

  it("lets the last of several rapid mode changes win", () => {
    vi.useFakeTimers();
    const engine = new SonoDistEngine({ ...defaultSonoDistState, mode: "classic" });

    engine.setMode("turbo");
    engine.setMode("overdrive");
    engine.setMode("classic");
    vi.advanceTimersByTime(50);

    // A stale transition must not reinstate turbo or overdrive behind us.
    expect(shaper().oversample).toBe("2x");
    expect(modeCompensation().gain.value).toBeCloseTo(
      dbToGain(MODE_COMPENSATION_DB.classic),
      6,
    );
    engine.dispose();
  });

  it("aborts a pending swap that lands after BYPASS was selected", () => {
    vi.useFakeTimers();
    const engine = new SonoDistEngine({ ...defaultSonoDistState, mode: "classic" });

    engine.setMode("turbo");
    engine.setMode("bypass");
    vi.advanceTimersByTime(50);

    // The final ramp must be the one to dry, not the aborted fade-in.
    expect(crossFade().fade.rampTo).toHaveBeenLastCalledWith(0, 0.015);
    engine.dispose();
  });

  it("ignores selecting the mode that is already active", () => {
    const engine = new SonoDistEngine({ ...defaultSonoDistState, mode: "classic" });
    engine.setMode("classic");
    expect(crossFade().fade.rampTo).not.toHaveBeenCalled();
    engine.dispose();
  });
});

describe("SonoDistEngine lifecycle", () => {
  it("applies a whole state object at once", () => {
    const engine = new SonoDistEngine();
    engine.setState({ mode: "overdrive", drive: 0.7, tone: 0.2, level: 0.4 });

    expect(shaper().oversample).toBe("2x");
    expect(crossFade().fade.rampTo).toHaveBeenCalledWith(1, 0.02);
    expect(preGain().gain.value).toBeCloseTo(
      dbToGain(mapDriveToPreGainDb("overdrive", 0.7)),
      6,
    );
    expect(levelGain().gain.rampTo).toHaveBeenCalledWith(
      expect.closeTo(dbToGain(mapLevelToDb(0.4)), 6),
      0.02,
    );
    engine.dispose();
  });

  it("dispose() is idempotent and releases every node", () => {
    const engine = new SonoDistEngine();
    engine.dispose();
    engine.dispose();

    for (const gain of toneMock.gains) {
      expect(gain.dispose).toHaveBeenCalledTimes(1);
    }
    expect(shaper().dispose).toHaveBeenCalledTimes(1);
    expect(crossFade().dispose).toHaveBeenCalledTimes(1);
  });

  it("dispose() cancels a pending mode swap", () => {
    vi.useFakeTimers();
    const engine = new SonoDistEngine({ ...defaultSonoDistState, mode: "classic" });

    engine.setMode("turbo");
    engine.dispose();
    const rampsBefore = crossFade().fade.rampTo.mock.calls.length;
    vi.advanceTimersByTime(50);

    // The timer must not fire into a disposed graph.
    expect(crossFade().fade.rampTo.mock.calls).toHaveLength(rampsBefore);
  });

  it("ignores setters after dispose", () => {
    const engine = new SonoDistEngine();
    engine.dispose();
    engine.setDrive(1);
    engine.setMode("turbo");
    expect(preGain().gain.rampTo).not.toHaveBeenCalled();
    expect(crossFade().fade.rampTo).not.toHaveBeenCalled();
  });
});
