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
  const envelopeInstances: Array<{
    decay: number;
    triggerAttack: ReturnType<typeof vi.fn>;
    connect: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];
  const multiplyInstances: Array<{
    factor: { rampTo: ReturnType<typeof vi.fn> };
    connect: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];
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
    filter = {
      Q: {
        rampTo: vi.fn(),
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      frequency: { name: "filter.frequency" },
    };
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

  class FakeEnvelope {
    decay: number;
    triggerAttack = vi.fn();
    connect = vi.fn();
    dispose = vi.fn();
    constructor(options: { decay: number }) {
      this.decay = options.decay;
      envelopeInstances.push(this);
    }
  }

  class FakeMultiply {
    factor = { rampTo: vi.fn() };
    connect = vi.fn();
    dispose = vi.fn();
    value: number;
    constructor(value: number) {
      this.value = value;
      multiplyInstances.push(this);
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
    envelopeInstances,
    multiplyInstances,
    sequenceInstances,
    FakeMonoSynth,
    FakeEnvelope,
    FakeMultiply,
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
  Envelope: toneMock.FakeEnvelope,
  Multiply: toneMock.FakeMultiply,
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

function accentEnv() {
  return toneMock.envelopeInstances[0];
}

function accentDepth() {
  return toneMock.multiplyInstances[0];
}

function playStepAt(index: number, time = 0.5) {
  toneMock.sequenceInstances[0].callback(time, index);
}

beforeEach(() => {
  toneMock.synthInstances.length = 0;
  toneMock.envelopeInstances.length = 0;
  toneMock.multiplyInstances.length = 0;
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
    // The SLIDE flag sits on the destination: step 1 pulls step 0 into it.
    pattern[0] = step({ active: true, note: "C", octave: 3 });
    pattern[1] = step({ active: true, note: "E", octave: 3, slide: true });
    engine.setPattern(pattern);
    engine.setParameters({ ...defaultParameters, tempoBpm: 120 });
    await engine.start();

    playStepAt(0, 0);
    // Step 0 triggers and must hold its gate open — asserted before step 1
    // runs, so a spurious early release cannot hide behind a later call.
    expect(synth().triggerAttack).toHaveBeenCalledTimes(1);
    expect(synth().triggerRelease).not.toHaveBeenCalled();

    playStepAt(1, 0.125);

    const duration = 60 / 120 / 4;
    // Step 1 glides in: setNote with portamento, no second attack.
    expect(synth().triggerAttack).toHaveBeenCalledTimes(1);
    expect(synth().setNote).toHaveBeenCalledWith(expect.closeTo(164.81, 1), 0.125);
    expect(synth().portamento).toBeCloseTo(duration * 0.6);
    // The chain ends at step 1 (step 2 is a rest) ⇒ exactly one release, at 80%.
    expect(synth().triggerRelease).toHaveBeenCalledTimes(1);
    expect(synth().triggerRelease).toHaveBeenCalledWith(
      expect.closeTo(0.125 + duration * 0.8),
    );
    engine.dispose();
  });

  it("holds one continuous note when a slide targets the same pitch", async () => {
    const engine = new Sono303Engine();
    const pattern = createDefaultPattern();
    pattern[2] = step({ active: true, note: "C", octave: 3 });
    pattern[3] = step({ active: true, note: "C", octave: 3, slide: true });
    engine.setPattern(pattern);
    engine.setParameters({ ...defaultParameters, tempoBpm: 120 });
    await engine.start();

    playStepAt(2, 0.25);
    playStepAt(3, 0.375);

    // One attack total and no release until the chain ends: the two steps sound
    // as a single sustained C3.
    expect(synth().triggerAttack).toHaveBeenCalledTimes(1);
    expect(synth().triggerRelease).toHaveBeenCalledTimes(1);
    expect(synth().triggerRelease).toHaveBeenCalledWith(
      expect.closeTo(0.375 + (60 / 120 / 4) * 0.8),
    );
    engine.dispose();
  });

  it("slides across the 16→1 loop boundary", async () => {
    const engine = new Sono303Engine();
    const pattern = createDefaultPattern();
    pattern[15] = step({ active: true, note: "C", octave: 3 });
    pattern[0] = step({ active: true, note: "G", octave: 2, slide: true });
    engine.setPattern(pattern);
    await engine.start();

    playStepAt(15, 1.875);
    playStepAt(0, 2);

    expect(synth().triggerAttack).toHaveBeenCalledTimes(1);
    expect(synth().setNote).toHaveBeenCalledWith(expect.closeTo(98.0, 1), 2);
    engine.dispose();
  });

  it("ignores a slide flag when the previous step is a rest", async () => {
    const engine = new Sono303Engine();
    const pattern = createDefaultPattern();
    pattern[1] = step({ active: true, note: "E", octave: 3, slide: true });
    engine.setPattern(pattern);
    await engine.start();

    playStepAt(1, 0.125);

    expect(synth().triggerAttack).toHaveBeenCalledTimes(1);
    expect(synth().setNote).not.toHaveBeenCalled();
    engine.dispose();
  });
});

describe("Sono303Engine accent", () => {
  it("fires the accent envelope and a resonance bump on accented steps", async () => {
    const engine = new Sono303Engine();
    const pattern = createDefaultPattern();
    pattern[0] = step({ active: true, note: "C", octave: 3, accent: true });
    engine.setPattern(pattern);
    engine.setParameters(defaultParameters);
    await engine.start();

    playStepAt(0, 1);

    expect(accentEnv().triggerAttack).toHaveBeenCalledWith(1);
    const accentDecay = defaultParameters.decaySeconds * 0.45;
    const q = synth().filter.Q;
    expect(q.setValueAtTime).toHaveBeenCalledWith(
      defaultParameters.resonanceQ + defaultParameters.accentAmount * 10,
      1,
    );
    expect(q.linearRampToValueAtTime).toHaveBeenCalledWith(
      defaultParameters.resonanceQ,
      expect.closeTo(1 + accentDecay),
    );
    engine.dispose();
  });

  it("leaves unaccented steps untouched", async () => {
    const engine = new Sono303Engine();
    const pattern = createDefaultPattern();
    pattern[0] = step({ active: true, note: "C", octave: 3 });
    engine.setPattern(pattern);
    await engine.start();

    playStepAt(0, 1);

    expect(accentEnv().triggerAttack).not.toHaveBeenCalled();
    expect(synth().filter.Q.setValueAtTime).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("accents a slid-into note even though it never re-attacks", async () => {
    const engine = new Sono303Engine();
    const pattern = createDefaultPattern();
    pattern[0] = step({ active: true, note: "C", octave: 3 });
    pattern[1] = step({ active: true, note: "E", octave: 3, slide: true, accent: true });
    engine.setPattern(pattern);
    await engine.start();

    playStepAt(0, 0);
    playStepAt(1, 0.12);

    expect(synth().triggerAttack).toHaveBeenCalledTimes(1);
    expect(accentEnv().triggerAttack).toHaveBeenCalledWith(0.12);
    engine.dispose();
  });

  it("scales accent depth with ACCENT and ENV MOD, and is a no-op at zero", async () => {
    const engine = new Sono303Engine();
    await engine.start();

    engine.setParameters({
      ...defaultParameters,
      accentAmount: 1,
      envMod: 1,
    });
    expect(accentDepth().factor.rampTo).toHaveBeenLastCalledWith(
      expect.closeTo(4000),
      0.02,
    );

    engine.setParameters({ ...defaultParameters, accentAmount: 0 });
    expect(accentDepth().factor.rampTo).toHaveBeenLastCalledWith(0, 0.02);
    engine.dispose();
  });

  it("does not touch the accent path at all when ACCENT is 0", async () => {
    const engine = new Sono303Engine();
    const pattern = createDefaultPattern();
    pattern[0] = step({ active: true, note: "C", octave: 3, accent: true });
    engine.setPattern(pattern);
    engine.setParameters({ ...defaultParameters, accentAmount: 0 });
    await engine.start();

    playStepAt(0, 1);

    expect(accentEnv().triggerAttack).not.toHaveBeenCalled();
    expect(synth().filter.Q.cancelScheduledValues).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("shortens the accent decay relative to DECAY", async () => {
    const engine = new Sono303Engine();
    await engine.start();

    engine.setParameters({ ...defaultParameters, decaySeconds: 1 });
    expect(accentEnv().decay).toBeCloseTo(0.45);
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
