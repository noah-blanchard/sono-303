import { STEP_COUNT, defaultParameters } from "../sequencer/defaults";
import type { Pattern, SynthParameters } from "../sequencer/types";
import type { Sono303EngineApi, StepListener } from "./engineApi";

function stepIntervalMs(tempoBpm: number): number {
  return 60000 / (tempoBpm * 4);
}

/**
 * Milestone 1 stand-in for the real engine: it produces no sound and imports
 * no Tone.js. It advances a wall-clock playhead at the sixteenth-note rate so
 * the interface can be built and verified before audio exists — and it doubles
 * as a reference implementation of `Sono303EngineApi` (docs/ENGINE_API.md).
 */
export class MockSono303Engine implements Sono303EngineApi {
  #pattern: Pattern | null = null;
  #parameters: SynthParameters = { ...defaultParameters };
  #listener: StepListener | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  #stepIndex = 0;
  #initialized = false;
  #disposed = false;

  async initialize(): Promise<void> {
    if (this.#disposed || this.#initialized) return;
    this.#initialized = true;
  }

  async start(): Promise<void> {
    if (this.#disposed) return;
    await this.initialize();
    if (this.#timer !== null) return;

    this.#stepIndex = 0;
    this.#emit(this.#stepIndex);
    this.#schedule();
  }

  stop(): void {
    this.#clearTimer();
    this.#stepIndex = 0;
    this.#emit(null);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#clearTimer();
    this.#emit(null);
    this.#listener = null;
    this.#pattern = null;
    this.#disposed = true;
  }

  setPattern(pattern: Pattern): void {
    this.#pattern = pattern;
  }

  setParameters(parameters: SynthParameters): void {
    const tempoChanged = parameters.tempoBpm !== this.#parameters.tempoBpm;
    this.#parameters = parameters;
    // Only the tempo affects a silent engine, and only while it is running.
    if (tempoChanged && this.#timer !== null) this.#schedule();
  }

  setStepListener(listener: StepListener): void {
    this.#listener = listener;
  }

  /**
   * No-ops: a silent engine has nothing to route and nothing to audition.
   * They exist so the mock still satisfies the contract and can be dropped
   * into `SonoAudioRig` unchanged.
   */
  connectOutput(): void {}

  disconnectOutput(): void {}

  previewNote(): void {}

  /** The pattern the real engine will read on every step callback. */
  getPattern(): Pattern | null {
    return this.#pattern;
  }

  #schedule(): void {
    this.#clearTimer();
    this.#timer = setInterval(() => {
      this.#stepIndex = (this.#stepIndex + 1) % STEP_COUNT;
      this.#emit(this.#stepIndex);
    }, stepIntervalMs(this.#parameters.tempoBpm));
  }

  #clearTimer(): void {
    if (this.#timer === null) return;
    clearInterval(this.#timer);
    this.#timer = null;
  }

  #emit(stepIndex: number | null): void {
    this.#listener?.(stepIndex);
  }
}
