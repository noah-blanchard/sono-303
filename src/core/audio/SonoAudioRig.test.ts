import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Connection } from "../sequencer/types";
import type { Sono303EngineApi } from "./engineApi";
import type { SonoDistEngineApi } from "./distEngineApi";

/**
 * Rig test with a mocked `tone` module and injected fake engines.
 *
 * The point of this suite is the routing contract: one path to the destination,
 * and a patchbay that cross-ramps gains instead of rewiring. The graph is fixed
 * at construction; only gain values ever change, which is what makes repatching
 * click-free.
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
    reset() {
      gains.length = 0;
      limiters.length = 0;
    },
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
    createAudioWorkletNode: vi.fn(() => ({
      port: { postMessage: vi.fn(), onmessage: null },
      disconnect: vi.fn(),
    })),
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
    input: { name: "dist.input" } as never,
    connect: vi.fn(),
    setState: vi.fn(),
    dispose: vi.fn(),
  } as unknown as SonoDistEngineApi;
}

const FULL_CHAIN: Connection[] = [
  { from: "sono303.out", to: "dist.in" },
  { from: "dist.out", to: "tape.in" },
];

function build(connections: Connection[]) {
  const synth = fakeSynth();
  const dist = fakeDist();
  const rig = new SonoAudioRig({
    createSynth: () => synth,
    createDist: () => dist,
    connections,
  });
  // Constructed in declaration order, so the routing gains are identifiable by
  // position: dry, wet, dryToDist, dryToMonitor, dryToTape, wetToMonitor,
  // wetToTape, monitor, tapeBus.
  const [, , dryToDist, dryToMonitor, dryToTape, wetToMonitor, wetToTape] =
    toneMock.gains;
  return {
    rig,
    synth,
    dist,
    routing: { dryToDist, dryToMonitor, dryToTape, wetToMonitor, wetToTape },
  };
}

beforeEach(() => {
  toneMock.reset();
});

describe("SonoAudioRig routing", () => {
  it("leaves exactly one path to the destination, through the limiter", () => {
    build(FULL_CHAIN);
    const chained = toneMock.gains.filter((gain) => gain.chain.mock.calls.length > 0);
    expect(chained).toHaveLength(1);
    const [limiter, destination] = chained[0].chain.mock.calls[0];
    expect(limiter).toBe(toneMock.limiters[0]);
    expect(destination).toBe(toneMock.destination);
    expect(toneMock.limiters[0].threshold).toBe(-1);
  });

  it("303 through DIST into TAPE: monitor wet, record wet", () => {
    const { routing } = build(FULL_CHAIN);
    expect(routing.dryToDist.gain.value).toBe(1);
    expect(routing.wetToMonitor.gain.value).toBe(1);
    expect(routing.dryToMonitor.gain.value).toBe(0);
    expect(routing.wetToTape.gain.value).toBe(1);
    expect(routing.dryToTape.gain.value).toBe(0);
  });

  it("303 straight into TAPE: monitor dry, record dry", () => {
    const { routing } = build([{ from: "sono303.out", to: "tape.in" }]);
    expect(routing.dryToDist.gain.value).toBe(0);
    expect(routing.dryToMonitor.gain.value).toBe(1);
    expect(routing.wetToMonitor.gain.value).toBe(0);
    expect(routing.dryToTape.gain.value).toBe(1);
    expect(routing.wetToTape.gain.value).toBe(0);
  });

  // The cable is the truth: an unplugged recorder genuinely captures silence.
  it("nothing in TAPE's IN: it records nothing", () => {
    const { routing } = build([{ from: "sono303.out", to: "dist.in" }]);
    expect(routing.wetToMonitor.gain.value).toBe(1);
    expect(routing.dryToTape.gain.value).toBe(0);
    expect(routing.wetToTape.gain.value).toBe(0);
  });

  it("nothing patched at all: the bare instrument is still heard", () => {
    const { routing } = build([]);
    expect(routing.dryToMonitor.gain.value).toBe(1);
    expect(routing.wetToMonitor.gain.value).toBe(0);
  });
});

describe("SonoAudioRig repatching", () => {
  it("cross-ramps gains instead of rewiring", () => {
    const { rig, routing } = build(FULL_CHAIN);
    const connectsBefore = toneMock.gains.reduce(
      (total, gain) => total + gain.connect.mock.calls.length,
      0,
    );

    rig.setConnections([{ from: "sono303.out", to: "tape.in" }]);

    expect(routing.dryToDist.gain.rampTo).toHaveBeenCalledWith(0, 0.03);
    expect(routing.dryToMonitor.gain.rampTo).toHaveBeenCalledWith(1, 0.03);
    expect(routing.dryToTape.gain.rampTo).toHaveBeenCalledWith(1, 0.03);
    expect(routing.wetToTape.gain.rampTo).toHaveBeenCalledWith(0, 0.03);
    // Nothing was connected or disconnected: the graph is fixed at build time.
    const connectsAfter = toneMock.gains.reduce(
      (total, gain) => total + gain.connect.mock.calls.length,
      0,
    );
    expect(connectsAfter).toBe(connectsBefore);
  });

  it("ignores a repatch after dispose", () => {
    const { rig, routing } = build(FULL_CHAIN);
    rig.dispose();
    routing.dryToDist.gain.rampTo.mockClear();
    rig.setConnections([]);
    expect(routing.dryToDist.gain.rampTo).not.toHaveBeenCalled();
  });
});

describe("SonoAudioRig lifecycle", () => {
  it("dispose() releases both engines and every owned node, once", () => {
    const { rig, synth, dist } = build(FULL_CHAIN);
    rig.dispose();
    rig.dispose();

    expect(synth.dispose).toHaveBeenCalledTimes(1);
    expect(dist.dispose).toHaveBeenCalledTimes(1);
    for (const gain of toneMock.gains) {
      expect(gain.dispose).toHaveBeenCalledTimes(1);
    }
    expect(toneMock.limiters[0].dispose).toHaveBeenCalledTimes(1);
  });
});
