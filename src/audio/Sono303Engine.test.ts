import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPattern, defaultParameters } from "../sequencer/defaults";
import type { Step } from "../sequencer/types";

/**
 * Engine test with a fully mocked `tone` module: no AudioContext exists in
 * the test environment, so every Tone.js touchpoint is replaced by a spy.
 * The assertions verify the engine translates `computeStepEvent` output into
 * the correct synth calls and honors the lifecycle contract.
 */

type SequenceCallback = (time: number, stepIndex: number) => void;

const toneMock = vi.hoisted(() => {
  const synthInstances: Array<Record<string, unknown>> = [];
  const sequenceInstances: Array<{
    callback: SequenceCallback;
    events: number[];
    subdivision: string;
    loop: boolean;
    start: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];

  class FakeMonoSynth {
    oscillator = { type: "sawtooth" };
    filter = { Q: { rampTo: vi.fn() } };
    filterEnvelope = {
      baseFrequency: 350,
      decay: 0.3,
      octaves: 3.25,
    };
    volume = { rampTo: vi.fn() };
    portamento = 0;
    triggerAttack = vi.fn();
    triggerRelease = vi.fn();
    setNote = vi.fn();
    dispose = vi.fn();
    toDestination() {
      return this;
    }
    options: unknown;
    constructor(options: unknown) {
      this.options = options;
      synthInstances.push(this as unknown as Record<string, unknown>);
    }
  }

  class FakeSequence {
    loop = false;
    start = vi.fn(() => this);
    dispose = vi.fn();
    callback: SequenceCallback;
    events: number[];
    subdivision: string;
    constructor(
      callback: SequenceCallback,
      events: number[],
      subdivision: string,
    ) {
      this.callback = callback;
      this.events = events;
      this.subdivision = subdivision;
      sequenceInstances.push(this);
    }
  }

  return {
    synthInstances,
    sequenceInstances,
    FakeMonoSynth,
    FakeSequence,
    transport: {
      start: vi.fn(),
      stop: vi.fn(),
      bpm: { rampTo: vi.fn() },
    },
    draw: { schedule: vi.fn() },
    start: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("tone", () => ({
  MonoSynth: toneMock.FakeMonoSynth,
  Sequence: toneMock.FakeSequence,
  getTransport: () => toneMock.transport,
  getDraw: () => toneMock.draw,
  start: toneMock.start,
}));

// Imported after the mock is registered.
const { Sono303Engine } = await import("./Sono303Engine");

function step(overrides: Partial<Step> = {}): Step {
  return {
    active: false,
    note: "C",
    octave: 3,
    accent: false,
    slide: false,
    ...overrides,
  };
}

function synth() {
  return toneMock.synthInstances[0] as unknown as InstanceType<
    typeof toneMock.FakeMonoSynth
  >;
}

function playStepAt(index: number, time = 0.5) {
  toneMock.sequenceInstances[0].callback(time, index);
}

beforeEach(() => {
  toneMock.synthInstances.length = 0;
  toneMock.sequenceInstances.length = 0;
  vi.clearAllMocks();
});

describe("Sono303Engine lifecycle", () => {
  it("creates exactly one synth and one sequence on initialize", async () => {
    const engine = new Sono303Engine();
    await engine.initialize();
    await engine.initialize();
    expect(toneMock.synthInstances).toHaveLength(1);
    expect(toneMock.sequenceInstances).toHaveLength(1);
    expect(toneMock.sequenceInstances[0].events).toHaveLength(16);
    expect(toneMock.sequenceInstances[0].subdivision).toBe("16n");
    expect(toneMock.sequenceInstances[0].loop).toBe(true);
    engine.dispose();
  });

  it("start() unlocks audio, initializes once, and starts the transport", async () => {
    const engine = new Sono303Engine();
    await engine.start();
    await engine.start();
    expect(toneMock.start).toHaveBeenCalled();
    expect(toneMock.synthInstances).toHaveLength(1);
    expect(toneMock.transport.start).toHaveBeenCalledTimes(2);
    engine.dispose();
  });

  it("stop() stops the transport, releases held notes, and emits null", async () => {
    const engine = new Sono303Engine();
    const listener = vi.fn();
    engine.setStepListener(listener);
    await engine.start();
    engine.stop();
    expect(toneMock.transport.stop).toHaveBeenCalled();
    expect(synth().triggerRelease).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith(null);
    engine.dispose();
  });

  it("stop() invalidates playhead updates already scheduled on the audio clock", async () => {
    const engine = new Sono303Engine();
    const listener = vi.fn();
    engine.setStepListener(listener);
    engine.setPattern(createDefaultPattern());
    await engine.start();
    playStepAt(6, 0.75);
    engine.stop();
    listener.mockClear();
    // A draw callback scheduled before stop fires afterwards: it must no-op.
    toneMock.draw.schedule.mock.calls[0][0]();
    expect(listener).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("dispose() is idempotent and tears down synth and sequence", async () => {
    const engine = new Sono303Engine();
    await engine.start();
    engine.dispose();
    engine.dispose();
    expect(synth().dispose).toHaveBeenCalledTimes(1);
    expect(toneMock.sequenceInstances[0].dispose).toHaveBeenCalledTimes(1);
  });
});

describe("Sono303Engine playback", () => {
  it("triggers a note with accent velocity and 80% release", async () => {
    const engine = new Sono303Engine();
    const pattern = createDefaultPattern();
    pattern[0] = step({ active: true, note: "C", octave: 3, accent: true });
    engine.setPattern(pattern);
    engine.setParameters({ ...defaultParameters, tempoBpm: 120 });
    await engine.start();

    playStepAt(0, 1);

    const duration = 60 / 120 / 4;
    expect(synth().triggerAttack).toHaveBeenCalledWith(
      expect.closeTo(130.81, 1),
      1,
      expect.closeTo(0.65 + 0.6 * 0.35),
    );
    expect(synth().triggerRelease).toHaveBeenCalledWith(
      expect.closeTo(1 + duration * 0.8),
    );
    engine.dispose();
  });

  it("releases held notes on a rest", async () => {
    const engine = new Sono303Engine();
    engine.setPattern(createDefaultPattern()); // all rests
    await engine.start();

    playStepAt(3, 0.75);

    expect(synth().triggerRelease).toHaveBeenCalledWith(0.75);
    expect(synth().triggerAttack).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("slides with setNote and no retrigger across a slide chain", async () => {
    const engine = new Sono303Engine();
    const pattern = createDefaultPattern();
    pattern[0] = step({ active: true, note: "C", octave: 3, slide: true });
    pattern[1] = step({ active: true, note: "E", octave: 3 });
    engine.setPattern(pattern);
    engine.setParameters({ ...defaultParameters, tempoBpm: 120 });
    await engine.start();

    playStepAt(0, 0);
    playStepAt(1, 0.125);

    const duration = 60 / 120 / 4;
    // Step 0 triggers normally and holds (slide into step 1).
    expect(synth().triggerAttack).toHaveBeenCalledTimes(1);
    // Step 1 glides in: setNote with portamento, no second attack.
    expect(synth().setNote).toHaveBeenCalledWith(expect.closeTo(164.81, 1), 0.125);
    expect(synth().portamento).toBeCloseTo(duration * 0.6);
    // The chain ends at step 1 (step 2 is a rest) ⇒ release at 80%.
    expect(synth().triggerRelease).toHaveBeenCalledWith(
      expect.closeTo(0.125 + duration * 0.8),
    );
    engine.dispose();
  });

  it("slides across the 16→1 loop boundary", async () => {
    const engine = new Sono303Engine();
    const pattern = createDefaultPattern();
    pattern[15] = step({ active: true, note: "C", octave: 3, slide: true });
    pattern[0] = step({ active: true, note: "G", octave: 2 });
    engine.setPattern(pattern);
    await engine.start();

    playStepAt(15, 1.875);
    playStepAt(0, 2);

    expect(synth().triggerAttack).toHaveBeenCalledTimes(1);
    expect(synth().setNote).toHaveBeenCalledWith(expect.closeTo(98.0, 1), 2);
    engine.dispose();
  });

  it("schedules the playhead on the audio clock via Tone.Draw", async () => {
    const engine = new Sono303Engine();
    const listener = vi.fn();
    engine.setStepListener(listener);
    engine.setPattern(createDefaultPattern());
    await engine.start();

    playStepAt(5, 0.625);

    expect(toneMock.draw.schedule).toHaveBeenCalledWith(expect.any(Function), 0.625);
    // The listener fires only when the scheduled draw callback runs.
    expect(listener).not.toHaveBeenCalledWith(5);
    toneMock.draw.schedule.mock.calls[0][0]();
    expect(listener).toHaveBeenCalledWith(5);
    engine.dispose();
  });

  it("reads live pattern edits without recreating the sequence", async () => {
    const engine = new Sono303Engine();
    engine.setPattern(createDefaultPattern());
    await engine.start();

    const edited = createDefaultPattern();
    edited[7] = step({ active: true, note: "A", octave: 2 });
    engine.setPattern(edited);

    playStepAt(7, 0.875);

    expect(toneMock.sequenceInstances).toHaveLength(1);
    expect(synth().triggerAttack).toHaveBeenCalledWith(
      expect.closeTo(110, 1),
      0.875,
      expect.closeTo(0.65),
    );
    engine.dispose();
  });
});

describe("Sono303Engine parameters", () => {
  it("ramps continuous parameters and assigns waveform directly", async () => {
    const engine = new Sono303Engine();
    await engine.start();

    engine.setParameters({
      ...defaultParameters,
      waveform: "square",
      cutoffHz: 1200,
      resonanceQ: 14,
      envMod: 0.5,
      decaySeconds: 0.8,
      tempoBpm: 140,
      volumeDb: -12,
    });

    expect(synth().oscillator.type).toBe("square");
    expect(synth().filterEnvelope.baseFrequency).toBe(1200);
    expect(synth().filter.Q.rampTo).toHaveBeenCalledWith(14, 0.02);
    expect(synth().filterEnvelope.decay).toBe(0.8);
    expect(synth().filterEnvelope.octaves).toBeCloseTo(2.5);
    expect(synth().volume.rampTo).toHaveBeenCalledWith(-12, 0.05);
    expect(toneMock.transport.bpm.rampTo).toHaveBeenCalledWith(140, 0.05);
    engine.dispose();
  });

  it("applies transpose to playback pitch without mutating the pattern", async () => {
    const engine = new Sono303Engine();
    const pattern = createDefaultPattern();
    pattern[0] = step({ active: true, note: "C", octave: 3 });
    engine.setPattern(pattern);
    engine.setParameters({ ...defaultParameters, transposeSemitones: 12 });
    await engine.start();

    playStepAt(0, 0);

    expect(synth().triggerAttack).toHaveBeenCalledWith(
      expect.closeTo(261.63, 1),
      0,
      expect.any(Number),
    );
    expect(pattern[0].octave).toBe(3);
    engine.dispose();
  });
});
