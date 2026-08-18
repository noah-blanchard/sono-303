import type { InputNode } from "tone";
import type { Pattern, SynthParameters } from "../sequencer/types";

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
