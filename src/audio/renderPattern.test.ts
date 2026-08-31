import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPattern, defaultParameters, defaultSonoDistState } from "../sequencer/defaults";
import { barsToSamples } from "../sequencer/tape";

/**
 * The render itself cannot be unit tested — there is no `OfflineAudioContext`
 * in the node test environment, so Tone falls back to a dummy context and
 * produces nothing. What *can* be pinned here is everything that made the
 * render subtly wrong on the way to working, because each of these is silent
 * when it breaks: the file still exists, it is just off the grid, faded to dry,
 * or the wrong length.
 */

const RATE = 48000;

const toneMock = vi.hoisted(() => {
  const bpmParam = { value: 0, rampTo: vi.fn() };
  const transport = { bpm: bpmParam, start: vi.fn(), stop: vi.fn() };

  /** Records the order of every call that has to happen in a specific order. */
  const calls: string[] = [];

  const offline = vi.fn(
    async (
      callback: () => Promise<void> | void,
      duration: number,
      channels: number,
      sampleRate: number,
    ) => {
      await callback();
      // A ramp is a whole flat buffer here; the slice offsets are what matter.
      const frames = Math.round(duration * sampleRate);
      const data = new Float32Array(frames);
      for (let i = 0; i < frames; i += 1) data[i] = i;
      return {
        sampleRate,
        numberOfChannels: channels,
        length: frames,
        getChannelData: () => data,
      };
    },
  );

  return {
    bpmParam,
    transport,
    calls,
    offline,
    getTransport: vi.fn(() => transport),
    reset() {
      bpmParam.value = 0;
      bpmParam.rampTo.mockClear();
      transport.start.mockClear();
      transport.stop.mockClear();
      offline.mockClear();
      calls.length = 0;
    },
  };
});

vi.mock("tone", () => ({
  Offline: toneMock.offline,
  getTransport: toneMock.getTransport,
}));

const rigMock = vi.hoisted(() => {
  const constructed: { patched: boolean; dist: unknown }[] = [];
  return {
    constructed,
    setPattern: vi.fn(),
    setParameters: vi.fn(),
    setStepListener: vi.fn(),
    setState: vi.fn(),
    start: vi.fn(async () => {}),
    dispose: vi.fn(),
    reset() {
      constructed.length = 0;
      rigMock.setPattern.mockClear();
      rigMock.setParameters.mockClear();
      rigMock.setStepListener.mockClear();
      rigMock.setState.mockClear();
      rigMock.start.mockClear();
      rigMock.dispose.mockClear();
    },
  };
});

vi.mock("./SonoAudioRig", () => ({
  SonoAudioRig: class {
    synth = {
      setPattern: rigMock.setPattern,
      setParameters: rigMock.setParameters,
      setStepListener: rigMock.setStepListener,
      start: rigMock.start,
    };
    dist = { setState: rigMock.setState };
    dispose = rigMock.dispose;
    constructor(options: { patched: boolean; dist: unknown }) {
      rigMock.constructed.push(options);
      toneMock.calls.push("construct");
    }
  },
}));

const { renderPattern } = await import("./renderPattern");

function request(overrides: { bars?: number; tempoBpm?: number } = {}) {
  return {
    steps: createDefaultPattern(),
    parameters: {
      ...defaultParameters,
      tempoBpm: overrides.tempoBpm ?? defaultParameters.tempoBpm,
    },
    dist: { ...defaultSonoDistState, mode: "turbo" as const },
    patched: true,
    bars: overrides.bars ?? 1,
  };
}

beforeEach(() => {
  toneMock.reset();
  rigMock.reset();
  rigMock.setParameters.mockImplementation(() => {
    toneMock.calls.push("setParameters");
  });
});

describe("renderPattern", () => {
  it("renders mono at the export rate, one bar longer than it keeps", () => {
    const bars = 2;
    const bpm = defaultParameters.tempoBpm;
    void renderPattern(request({ bars, tempoBpm: bpm }));

    const [, duration, channels, sampleRate] = toneMock.offline.mock.calls[0];
    expect(channels).toBe(1);
    expect(sampleRate).toBe(RATE);
    const keep = barsToSamples(bars, bpm, RATE);
    const preRoll = barsToSamples(1, bpm, RATE);
    expect(duration).toBeCloseTo((preRoll + keep) / RATE, 12);
  });

  it("keeps exactly the requested bars, taken after the pre-roll", async () => {
    const bars = 4;
    const bpm = 137; // deliberately not a whole number of frames per bar
    const { samples, sampleRate } = await renderPattern(
      request({ bars, tempoBpm: bpm }),
    );

    const keep = barsToSamples(bars, bpm, RATE);
    const preRoll = barsToSamples(1, bpm, RATE);
    expect(samples.length).toBe(keep);
    expect(sampleRate).toBe(RATE);
    // The fake buffer holds its own index at every frame, so the first kept
    // sample proves the slice starts where the pre-roll ends.
    expect(samples[0]).toBe(preRoll);
    expect(samples[samples.length - 1]).toBe(preRoll + keep - 1);
  });

  // Tone.Draw schedules on requestAnimationFrame. Faster than real time there
  // is nothing to draw, and outside a browser there is no rAF at all.
  it("never attaches a step listener", async () => {
    await renderPattern(request());
    expect(rigMock.setStepListener).not.toHaveBeenCalled();
  });

  // `setParameters` ramps the transport BPM over 50 ms from Tone's default 120,
  // and integrating that ramp shifts every later step off the grid.
  it("overrides the tempo ramp with a hard value after setParameters", async () => {
    await renderPattern(request({ tempoBpm: 143 }));
    expect(toneMock.bpmParam.value).toBe(143);
    expect(toneMock.calls).toEqual(["construct", "setParameters"]);
  });

  // `SonoDistEngine.setMode` cross-fades an active-to-active swap around a real
  // setTimeout(18), which would fire long after the render had finished.
  it("passes the distortion state through the rig constructor, not setState", async () => {
    const input = request();
    await renderPattern(input);
    expect(rigMock.constructed).toEqual([
      { patched: true, dist: input.dist },
    ]);
    expect(rigMock.setState).not.toHaveBeenCalled();
  });

  it("starts the transport and tears the offline rig down afterwards", async () => {
    await renderPattern(request());
    expect(rigMock.start).toHaveBeenCalledTimes(1);
    expect(rigMock.dispose).toHaveBeenCalledTimes(1);
  });

  it("reports the rate the buffer came back at, not the one requested", async () => {
    // Safari has historically ignored the requested offline rate.
    toneMock.offline.mockImplementationOnce(async (callback) => {
      await callback();
      return {
        sampleRate: 44100,
        numberOfChannels: 1,
        length: 4,
        getChannelData: () => new Float32Array(4),
      };
    });
    const { sampleRate } = await renderPattern(request());
    expect(sampleRate).toBe(44100);
  });
});
