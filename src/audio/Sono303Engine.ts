import * as Tone from "tone";
import { STEP_COUNT, defaultParameters } from "../sequencer/defaults";
import type { Pattern, SynthParameters } from "../sequencer/types";
import type { Sono303EngineApi, StepListener } from "./engineApi";
import { computeStepEvent, stepDurationSeconds } from "./stepLogic";

const STEP_INDICES = Array.from({ length: STEP_COUNT }, (_, index) => index);

/** ENV MOD (0..1) spans five octaves of filter-envelope range. */
const ENV_MOD_OCTAVE_RANGE = 5;

/**
 * The real SONO-303 sound engine (docs/ENGINE_API.md).
 *
 * Framework-free: no React, no DOM. It owns exactly one `Tone.MonoSynth`
 * voice and one looping 16-step `Tone.Sequence`, both created once in
 * `initialize()`. All musical decisions are delegated to the pure functions
 * in `stepLogic.ts`; this class only translates them into Tone.js calls.
 */
export class Sono303Engine implements Sono303EngineApi {
  #synth: Tone.MonoSynth | null = null;
  #sequence: Tone.Sequence<number> | null = null;
  #pattern: Pattern | null = null;
  #parameters: SynthParameters = { ...defaultParameters };
  #listener: StepListener | null = null;
  #disposed = false;
  /**
   * Incremented on every stop/dispose. Playhead callbacks scheduled on the
   * audio clock capture the current generation and no-op once it changes, so
   * a callback already inside the Draw lookahead window can never revive the
   * playhead after stop.
   */
  #playbackGeneration = 0;

  async initialize(): Promise<void> {
    if (this.#disposed || this.#synth !== null) return;

    // Spec §5 configuration, verbatim.
    this.#synth = new Tone.MonoSynth({
      oscillator: {
        type: "sawtooth",
      },
      filter: {
        type: "lowpass",
        rolloff: -24,
        Q: 8,
      },
      envelope: {
        attack: 0.003,
        decay: 0.05,
        sustain: 0.8,
        release: 0.03,
      },
      filterEnvelope: {
        attack: 0.003,
        decay: 0.3,
        sustain: 0,
        release: 0.05,
        baseFrequency: 350,
        octaves: 3.25,
      },
      volume: -8,
    }).toDestination();

    this.#sequence = new Tone.Sequence<number>(
      (time, stepIndex) => {
        this.#playStep(time, stepIndex);
      },
      STEP_INDICES,
      "16n",
    ).start(0);
    this.#sequence.loop = true;

    // Push any parameters that arrived before initialization.
    this.#applyParameters(this.#parameters);
  }

  async start(): Promise<void> {
    if (this.#disposed) return;
    await Tone.start();
    await this.initialize();
    Tone.getTransport().start();
  }

  stop(): void {
    if (this.#disposed) return;
    this.#playbackGeneration += 1;
    Tone.getTransport().stop();
    // Silence any note held across a slide, then clear the playhead.
    this.#synth?.triggerRelease();
    this.#listener?.(null);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.stop();
    this.#sequence?.dispose();
    this.#synth?.dispose();
    this.#sequence = null;
    this.#synth = null;
    this.#listener = null;
    this.#pattern = null;
    this.#disposed = true;
  }

  setPattern(pattern: Pattern): void {
    // Swap the reference only — the sequence is never rebuilt, so live edits
    // during playback are glitch-free.
    this.#pattern = pattern;
  }

  setParameters(parameters: SynthParameters): void {
    this.#parameters = parameters;
    this.#applyParameters(parameters);
  }

  setStepListener(listener: StepListener): void {
    this.#listener = listener;
  }

  /** Applies the full parameter set; no-ops until the synth exists. */
  #applyParameters(parameters: SynthParameters): void {
    const synth = this.#synth;
    if (synth === null || this.#disposed) return;

    // Continuous parameters ramp to avoid zipper noise (spec §12).
    synth.filterEnvelope.baseFrequency = parameters.cutoffHz;
    synth.filter.Q.rampTo(parameters.resonanceQ, 0.02);
    synth.filterEnvelope.decay = parameters.decaySeconds;
    synth.filterEnvelope.octaves = parameters.envMod * ENV_MOD_OCTAVE_RANGE;
    synth.volume.rampTo(parameters.volumeDb, 0.05);
    Tone.getTransport().bpm.rampTo(parameters.tempoBpm, 0.05);

    // Discrete parameters are assigned directly, never ramped.
    synth.oscillator.type = parameters.waveform;
  }

  /** Executes one scheduled step on the audio clock (spec §9.1). */
  #playStep(time: number, stepIndex: number): void {
    const synth = this.#synth;
    const pattern = this.#pattern;
    if (synth === null || pattern === null || this.#disposed) return;

    const prev = pattern[(stepIndex + STEP_COUNT - 1) % STEP_COUNT];
    const cur = pattern[stepIndex];
    const next = pattern[(stepIndex + 1) % STEP_COUNT];
    const event = computeStepEvent(
      prev,
      cur,
      next,
      this.#parameters,
      stepDurationSeconds(this.#parameters.tempoBpm),
    );

    switch (event.kind) {
      case "rest":
        synth.triggerRelease(time);
        break;
      case "trigger":
        synth.portamento = 0;
        synth.triggerAttack(event.frequency, time, event.velocity);
        synth.triggerRelease(time + event.releaseAfter);
        break;
      case "slideIn":
        synth.portamento = event.portamento;
        synth.setNote(event.frequency, time);
        if (event.releaseAfter !== null) {
          synth.triggerRelease(time + event.releaseAfter);
        }
        break;
    }

    // Rule 10: the visual playhead follows the audio clock, not a timer.
    const listener = this.#listener;
    if (listener !== null) {
      const generation = this.#playbackGeneration;
      Tone.getDraw().schedule(() => {
        if (generation === this.#playbackGeneration) listener(stepIndex);
      }, time);
    }
  }
}
