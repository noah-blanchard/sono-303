import type { InputNode } from "tone";
import type { Pattern, PitchClass, SynthParameters } from "../sequencer/types";

/**
 * The engine's only back-channel to a host. Receives the current step index
 * while playing and `null` when playback stops.
 */
export type StepListener = (stepIndex: number | null) => void;

/**
 * Complete public contract of the SONO-303 sound engine (docs/ENGINE_API.md).
 * Implementations are framework-free: no React, no DOM, no reducer actions.
 */
export type Sono303EngineApi = {
  /** Creates audio resources exactly once. Idempotent. Needs a user gesture. */
  initialize(): Promise<void>;
  /** Initializes if needed, then starts the looping 16-step transport. */
  start(): Promise<void>;
  /** Stops playback, releases held notes, emits `stepListener(null)`. */
  stop(): void;
  /** Stops and disposes every owned resource. Idempotent. */
  dispose(): void;
  /** Replaces the pattern read by the sequencer; applies on the next step. */
  setPattern(pattern: Pattern): void;
  /** Replaces the full parameter set; safe at any time. */
  setParameters(parameters: SynthParameters): void;
  /** Registers the single step callback, replacing any previous listener. */
  setStepListener(listener: StepListener): void;
  /**
   * Sounds one note immediately, held until the matching `noteOff`.
   *
   * This is the live-play gate, driven by the computer keyboard, a MIDI
   * controller or a pointer held on a key. Fire-and-forget: it unlocks audio
   * and initializes on its own, because the gesture that triggers it is itself
   * a valid user gesture. It uses the audition voice, so playing live never
   * interrupts a running pattern.
   *
   * The audition voice is monophonic, so overlapping notes follow **last-note
   * priority**: a new note takes the voice, and releasing it falls back to
   * whichever note is still held.
   *
   * @param velocity Normalized 0..1. Scales loudness, and at or above the
   *                 accent threshold also fires the audition accent bus.
   */
  noteOn(note: PitchClass, octave: number, velocity?: number): void;
  /** Releases a held note. Releasing a note that is not held is a no-op. */
  noteOff(note: PitchClass, octave: number): void;
  /** Releases every held note at once — used on blur, stop and dispose. */
  releaseAll(): void;
  /**
   * Sounds one note that releases itself shortly after.
   *
   * The right primitive for a gesture with no natural release — a click, or a
   * key activated with Enter/Space — where no `noteOff` will ever arrive.
   */
  previewNote(note: PitchClass, octave: number, velocity?: number): void;
  /**
   * Routes the instrument's output onward. The engine never reaches
   * `Tone.Destination` by itself — `SonoAudioRig` owns the only path there, so
   * an effect can be inserted without the dry signal leaking out alongside it.
   * May be called more than once to fan out to several destinations.
   */
  connectOutput(destination: InputNode): void;
  /** Detaches every output connection without destroying anything. */
  disconnectOutput(): void;
};

export type Sono303EngineFactory = () => Sono303EngineApi;
