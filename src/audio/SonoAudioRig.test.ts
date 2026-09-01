import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sono303EngineApi } from "./engineApi";
import type { SonoDistEngineApi } from "./distEngineApi";

/**
 * Rig test with a mocked `tone` module and injected fake engines. The point of
 * this suite is the routing contract: one path to the destination, and a patch
 * cable that cross-ramps instead of rewiring.
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
  const limiters: FakeLimiter[] = [];
  const destination = { name: "destination" };

  class FakeGain {
    gain: FakeParam;
    connect = vi.fn();
    chain = vi.fn();
    dispose = vi.fn();
    constructor(value = 1) {
      this.gain = new FakeParam(value);
      gains.push(this);
    }
  }

  class FakeLimiter {
    threshold: number;
    dispose = vi.fn();
    constructor(threshold: number) {
      this.threshold = threshold;
      limiters.push(this);
    }
  }

  // The rig hangs SONO-TAPE's capture tap off the limiter, and disposing that
  // tap clears anything it scheduled — so the transport has to exist here now.
  const transport = { schedule: vi.fn(() => 1), clear: vi.fn(), state: "stopped" };

  return {
    gains,
    limiters,
    destination,
    transport,
    FakeGain,
    FakeLimiter,
    getDestination: vi.fn(() => destination),
    getTransport: vi.fn(() => transport),
  };
});

vi.mock("tone", () => ({
  Gain: toneMock.FakeGain,
  Limiter: toneMock.FakeLimiter,
  getDestination: toneMock.getDestination,
  getTransport: toneMock.getTransport,
  start: vi.fn(async () => {}),
  getContext: vi.fn(() => ({
    sampleRate: 48000,
    rawContext: {},
    addAudioWorkletModule: vi.fn(async () => {}),
  })),
}));

const { SonoAudioRig } = await import("./SonoAudioRig");

function fakeSynth(): Sono303EngineApi {
  return {
    initialize: vi.fn(async () => {}),
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    dispose: vi.fn(),
    setPattern: vi.fn(),
    setParameters: vi.fn(),
    setStepListener: vi.fn(),
    connectOutput: vi.fn(),
    disconnectOutput: vi.fn(),
    noteOn: vi.fn(),
    noteOff: vi.fn(),
    releaseAll: vi.fn(),
    previewNote: vi.fn(),
  };
}

function fakeDist(): SonoDistEngineApi {
  return {
    input: { name: "dist.input" } as unknown as SonoDistEngineApi["input"],
    output: { name: "dist.output" } as unknown as SonoDistEngineApi["output"],
    setDrive: vi.fn(),
    setTone: vi.fn(),
    setLevel: vi.fn(),
    setMode: vi.fn(),
    setState: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    dispose: vi.fn(),
  };
}

function createRig(patched = false) {
  const synth = fakeSynth();
  const dist = fakeDist();
  const rig = new SonoAudioRig({
    createSynth: () => synth,
    createDist: () => dist,
    patched,
  });
  // Construction order: direct, patched, master.
  const [direct, patchedGain, master] = toneMock.gains;
  return { rig, synth, dist, direct, patchedGain, master };
}

beforeEach(() => {
  toneMock.gains.length = 0;
  toneMock.limiters.length = 0;
  vi.clearAllMocks();
});

describe("SonoAudioRig routing", () => {
  it("feeds both branches and joins them at the master bus", () => {
    const { rig, synth, dist, direct, patchedGain, master } = createRig();

    expect(synth.connectOutput).toHaveBeenCalledWith(direct);
    expect(synth.connectOutput).toHaveBeenCalledWith(dist.input);
    expect(dist.connect).toHaveBeenCalledWith(patchedGain);
    expect(direct.connect).toHaveBeenCalledWith(master);
    expect(patchedGain.connect).toHaveBeenCalledWith(master);
    rig.dispose();
  });

  it("leaves exactly one path to the destination, through the limiter", () => {
    const { rig, master } = createRig();

    expect(master.chain).toHaveBeenCalledTimes(1);
    expect(master.chain).toHaveBeenCalledWith(
      toneMock.limiters[0],
      toneMock.destination,
    );
    expect(toneMock.limiters).toHaveLength(1);
    expect(toneMock.limiters[0].threshold).toBe(-1);
    // Nothing else may reach the destination, or the dry signal would double.
    for (const gain of toneMock.gains) {
      expect(gain.connect).not.toHaveBeenCalledWith(toneMock.destination);
    }
    rig.dispose();
  });

  it("starts unplugged: dry branch open, effect branch muted", () => {
    const { rig, direct, patchedGain } = createRig(false);
    expect(direct.gain.value).toBe(1);
    expect(patchedGain.gain.value).toBe(0);
    rig.dispose();
  });

  it("honours an initial patched flag", () => {
    const { rig, direct, patchedGain } = createRig(true);
    expect(direct.gain.value).toBe(0);
    expect(patchedGain.gain.value).toBe(1);
    rig.dispose();
  });
});

describe("SonoAudioRig patch cable", () => {
  it("cross-ramps the two branches instead of rewiring", () => {
    const { rig, synth, dist, direct, patchedGain } = createRig();

    rig.setPatched(true);

    expect(direct.gain.rampTo).toHaveBeenCalledWith(0, 0.03);
    expect(patchedGain.gain.rampTo).toHaveBeenCalledWith(1, 0.03);
    // No connect/disconnect while audio may be running: that is what would click.
    expect(synth.disconnectOutput).not.toHaveBeenCalled();
    expect(dist.disconnect).not.toHaveBeenCalled();
    expect(synth.connectOutput).toHaveBeenCalledTimes(2); // constructor only
    rig.dispose();
  });

  it("unplugs symmetrically", () => {
    const { rig, direct, patchedGain } = createRig(true);

    rig.setPatched(false);

    expect(direct.gain.rampTo).toHaveBeenCalledWith(1, 0.03);
    expect(patchedGain.gain.rampTo).toHaveBeenCalledWith(0, 0.03);
    rig.dispose();
  });

  it("ignores a redundant patch change", () => {
    const { rig, direct } = createRig(false);
    rig.setPatched(false);
    expect(direct.gain.rampTo).not.toHaveBeenCalled();
    rig.dispose();
  });
});

describe("SonoAudioRig lifecycle", () => {
  it("dispose() releases both engines and every owned node, once", () => {
    const { rig, synth, dist } = createRig();

    rig.dispose();
    rig.dispose();

    expect(synth.dispose).toHaveBeenCalledTimes(1);
    expect(dist.dispose).toHaveBeenCalledTimes(1);
    for (const gain of toneMock.gains) {
      expect(gain.dispose).toHaveBeenCalledTimes(1);
    }
    expect(toneMock.limiters[0].dispose).toHaveBeenCalledTimes(1);
  });

  it("ignores a patch change after dispose", () => {
    const { rig, direct } = createRig();
    rig.dispose();
    rig.setPatched(true);
    expect(direct.gain.rampTo).not.toHaveBeenCalled();
  });
});
