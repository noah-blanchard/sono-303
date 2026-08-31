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
  const gainInstances: FakeGain[] = [];

  class FakeGain {
    connect = vi.fn();
    disconnect = vi.fn();
    dispose = vi.fn();
    value: number;
    constructor(value: number) {
      this.value = value;
      gainInstances.push(this);
    }
  }

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
    triggerAttackRelease = vi.fn();
    setNote = vi.fn();
    connect = vi.fn();
    dispose = vi.fn();
    toDestination = vi.fn(() => this);
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
    gainInstances,
    FakeMonoSynth,
    FakeEnvelope,
    FakeMultiply,
    FakeSequence,
    FakeGain,
    transport: {
      start: vi.fn(),
      stop: vi.fn(),
      bpm: { rampTo: vi.fn() },
    },
    draw: { schedule: vi.fn() },
    // Preview releases ride Tone's own clock. The fake runs them immediately
    // so a test can assert the release without waiting out the duration.
    context: {
      setTimeout: vi.fn((fn: () => void, seconds: number) => {
        void seconds; // asserted on via the call args, not used here
        fn();
      }),
    },
    start: vi.fn(() => Promise.resolve()),
    // Live notes bypass the scheduling lookAhead; both clocks read 0 here.
    now: vi.fn(() => 0),
    immediate: vi.fn(() => 0),
  };
});

vi.mock("tone", () => ({
  MonoSynth: toneMock.FakeMonoSynth,
  Envelope: toneMock.FakeEnvelope,
  Multiply: toneMock.FakeMultiply,
  Sequence: toneMock.FakeSequence,
  Gain: toneMock.FakeGain,
  getTransport: () => toneMock.transport,
  getDraw: () => toneMock.draw,
  getContext: () => toneMock.context,
  start: toneMock.start,
  now: toneMock.now,
  immediate: toneMock.immediate,
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

/** The audition voice, created right after the sequencer voice. */
function previewSynth() {
  return toneMock.synthInstances[1] as unknown as InstanceType<
    typeof toneMock.FakeMonoSynth
  >;
}

function accentEnv() {
  return toneMock.envelopeInstances[0];
}

function accentDepth() {
  return toneMock.multiplyInstances[0];
}

/** The audition accent bus, created right after the sequencer's. */
function previewAccentEnv() {
  return toneMock.envelopeInstances[1];
}

function playStepAt(index: number, time = 0.5) {
  toneMock.sequenceInstances[0].callback(time, index);
}

beforeEach(() => {
  toneMock.synthInstances.length = 0;
  toneMock.envelopeInstances.length = 0;
  toneMock.multiplyInstances.length = 0;
  toneMock.sequenceInstances.length = 0;
  toneMock.gainInstances.length = 0;
  vi.clearAllMocks();
});

describe("Sono303Engine lifecycle", () => {
  it("creates one sequencer voice, one audition voice and one sequence", async () => {
    const engine = new Sono303Engine();
    await engine.initialize();
    await engine.initialize();
    // Two voices, never more: the sequencer's and the one used to audition
    // notes as they are written. Initialization stays idempotent.
    expect(toneMock.synthInstances).toHaveLength(2);
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
    expect(toneMock.synthInstances).toHaveLength(2);
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

  it("dispose() is idempotent and tears down synth, sequence and output", async () => {
    const engine = new Sono303Engine();
    await engine.start();
    engine.dispose();
    engine.dispose();
    expect(synth().dispose).toHaveBeenCalledTimes(1);
    expect(toneMock.sequenceInstances[0].dispose).toHaveBeenCalledTimes(1);
    expect(toneMock.gainInstances[0].dispose).toHaveBeenCalledTimes(1);
  });
});

describe("Sono303Engine note audition", () => {
  it("sounds the note on its own voice, unlocking audio on the way", async () => {
    const engine = new Sono303Engine();
    engine.previewNote("A", 3);
    await vi.waitFor(() =>
      expect(previewSynth().triggerAttack).toHaveBeenCalled(),
    );

    // A click is a valid user gesture, so the first preview may also be the
    // moment audio is unlocked — no need to press START first.
    expect(toneMock.start).toHaveBeenCalled();
    expect(previewSynth().triggerAttack).toHaveBeenCalledWith(
      expect.closeTo(220, 1),
      expect.any(Number),
      expect.any(Number),
    );
    // Played by hand, so it must skip Tone's 100 ms scheduling lookAhead
    // rather than arriving a tenth of a second after the key went down.
    expect(toneMock.immediate).toHaveBeenCalled();
    engine.dispose();
  });

  it("never disturbs the sequencer voice", async () => {
    const engine = new Sono303Engine();
    const pattern = createDefaultPattern();
    pattern[0] = step({ active: true, note: "C", octave: 3 });
    engine.setPattern(pattern);
    await engine.start();
    playStepAt(0, 1);
    vi.clearAllMocks();

    engine.previewNote("E", 4);
    await vi.waitFor(() =>
      expect(previewSynth().triggerAttack).toHaveBeenCalled(),
    );

    // Auditioning while a pattern runs must not steal or cut the running note.
    expect(synth().triggerAttack).not.toHaveBeenCalled();
    expect(synth().triggerRelease).not.toHaveBeenCalled();
    expect(synth().triggerAttackRelease).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("auditions through the current transposition", async () => {
    const engine = new Sono303Engine();
    engine.setParameters({ ...defaultParameters, transposeSemitones: 12 });
    engine.previewNote("A", 3);
    await vi.waitFor(() =>
      expect(previewSynth().triggerAttack).toHaveBeenCalled(),
    );

    expect(previewSynth().triggerAttack).toHaveBeenCalledWith(
      expect.closeTo(440, 1),
      expect.any(Number),
      expect.any(Number),
    );
    engine.dispose();
  });

  it("releases a preview on its own, unlike a held note", async () => {
    const engine = new Sono303Engine();
    engine.setParameters({ ...defaultParameters, tempoBpm: 200 });
    engine.previewNote("C", 3);
    await vi.waitFor(() =>
      expect(previewSynth().triggerRelease).toHaveBeenCalled(),
    );

    // A sixteenth at 200 BPM is 75 ms — below the audible floor, so the
    // preview is stretched rather than becoming a click.
    const [, duration] = toneMock.context.setTimeout.mock.calls[0];
    expect(duration).toBeCloseTo(0.18, 5);
    engine.dispose();
  });

  it("does not accent a note played without a velocity", async () => {
    const engine = new Sono303Engine();
    engine.noteOn("C", 3);
    await vi.waitFor(() =>
      expect(previewSynth().triggerAttack).toHaveBeenCalled(),
    );

    // The mouse and the computer keyboard are not velocity sensitive, so they
    // must never accidentally trip the accent bus.
    expect(previewAccentEnv().triggerAttack).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("accents a hard-hit live note on the audition bus only", async () => {
    const engine = new Sono303Engine();
    engine.noteOn("C", 3, 1);
    await vi.waitFor(() =>
      expect(previewAccentEnv().triggerAttack).toHaveBeenCalled(),
    );

    // The pattern playing underneath must not brighten with it.
    expect(accentEnv().triggerAttack).not.toHaveBeenCalled();
    engine.dispose();
  });
});

describe("Sono303Engine held notes", () => {
  it("holds a note until it is released", async () => {
    const engine = new Sono303Engine();
    engine.noteOn("C", 3);
    await vi.waitFor(() =>
      expect(previewSynth().triggerAttack).toHaveBeenCalled(),
    );
    expect(previewSynth().triggerRelease).not.toHaveBeenCalled();

    engine.noteOff("C", 3);
    expect(previewSynth().triggerRelease).toHaveBeenCalled();
    engine.dispose();
  });

  it("falls back to the note still held, without retriggering", async () => {
    const engine = new Sono303Engine();
    engine.noteOn("C", 3);
    await vi.waitFor(() =>
      expect(previewSynth().triggerAttack).toHaveBeenCalledTimes(1),
    );
    engine.noteOn("E", 3);
    await vi.waitFor(() =>
      expect(previewSynth().triggerAttack).toHaveBeenCalledTimes(2),
    );

    // Last-note priority: releasing the newer note hands the mono voice back
    // to the one still down rather than cutting to silence.
    engine.noteOff("E", 3);
    expect(previewSynth().triggerRelease).not.toHaveBeenCalled();
    expect(previewSynth().setNote).toHaveBeenCalledWith(
      expect.closeTo(130.81, 1),
      expect.any(Number),
    );

    engine.noteOff("C", 3);
    expect(previewSynth().triggerRelease).toHaveBeenCalled();
    engine.dispose();
  });

  it("ignores the release of a note that is not held", async () => {
    const engine = new Sono303Engine();
    await engine.initialize();
    engine.noteOff("C", 3);
    expect(previewSynth().triggerRelease).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("leaves a note buried in the stack sounding when it is released", async () => {
    const engine = new Sono303Engine();
    engine.noteOn("C", 3);
    await vi.waitFor(() =>
      expect(previewSynth().triggerAttack).toHaveBeenCalledTimes(1),
    );
    engine.noteOn("E", 3);
    await vi.waitFor(() =>
      expect(previewSynth().triggerAttack).toHaveBeenCalledTimes(2),
    );

    // Releasing the older note changes nothing audible — the newer one still
    // owns the voice.
    engine.noteOff("C", 3);
    expect(previewSynth().triggerRelease).not.toHaveBeenCalled();
    expect(previewSynth().setNote).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("releases everything held when playback stops", async () => {
    const engine = new Sono303Engine();
    await engine.start();
    engine.noteOn("C", 3);
    await vi.waitFor(() =>
      expect(previewSynth().triggerAttack).toHaveBeenCalled(),
    );
    vi.clearAllMocks();

    engine.stop();
    expect(previewSynth().triggerRelease).toHaveBeenCalled();

    // The stack is empty afterwards, so a late release is a no-op.
    vi.clearAllMocks();
    engine.noteOff("C", 3);
    expect(previewSynth().triggerRelease).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("does not strand a note released while audio is still unlocking", async () => {
    const engine = new Sono303Engine();
    engine.noteOn("C", 3);
    // The key comes back up before `Tone.start()` has resolved.
    engine.noteOff("C", 3);
    await vi.waitFor(() => expect(toneMock.start).toHaveBeenCalled());

    expect(previewSynth().triggerAttack).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("tracks the sound knobs so a preview matches the step", async () => {
    const engine = new Sono303Engine();
    await engine.initialize();
    engine.setParameters({
      ...defaultParameters,
      waveform: "square",
      cutoffHz: 900,
      decaySeconds: 0.7,
    });

    expect(previewSynth().oscillator.type).toBe("square");
    expect(previewSynth().filterEnvelope.baseFrequency).toBe(900);
    expect(previewSynth().filterEnvelope.decay).toBe(0.7);
    engine.dispose();
  });

  it("stays silent once disposed", async () => {
    const engine = new Sono303Engine();
    await engine.initialize();
    const voice = previewSynth();
    engine.dispose();
    engine.previewNote("C", 3);
    await Promise.resolve();
    expect(voice.triggerAttackRelease).not.toHaveBeenCalled();
    expect(voice.dispose).toHaveBeenCalledTimes(1);
  });
});

describe("Sono303Engine routing", () => {
  it("owns an output bus that exists before the synth does", () => {
    const engine = new Sono303Engine();
    expect(toneMock.gainInstances).toHaveLength(1);
    expect(engine.output).toBe(toneMock.gainInstances[0]);
    engine.dispose();
  });

  it("routes the voice to its output bus and never to the destination", async () => {
    const engine = new Sono303Engine();
    await engine.initialize();

    // Reaching Tone.Destination here would double the dry signal alongside
    // whatever SONO-DIST sends, and would make BYPASS a lie.
    expect(synth().toDestination).not.toHaveBeenCalled();
    expect(synth().connect).toHaveBeenCalledWith(engine.output);
    engine.dispose();
  });

  it("connects and detaches its output on request", async () => {
    const engine = new Sono303Engine();
    const destination = { name: "effect input" };
    engine.connectOutput(destination as never);
    expect(engine.output.connect).toHaveBeenCalledWith(destination);

    engine.disconnectOutput();
    expect(engine.output.disconnect).toHaveBeenCalled();
    engine.dispose();
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
