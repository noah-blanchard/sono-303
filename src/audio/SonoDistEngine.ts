import * as Tone from "tone";
import { defaultSonoDistState } from "../sequencer/defaults";
import {
  MODE_COMPENSATION_DB,
  MODE_OVERSAMPLE,
  clamp01,
  dbToGain,
  mapDriveToPreGainDb,
  mapLevelToDb,
  mapToneToFrequency,
} from "../sequencer/distortionMapping";
import type {
  ActiveDistortionMode,
  DistortionMode,
  SonoDistState,
} from "../sequencer/types";
import type { SonoDistEngineApi } from "./distEngineApi";
import { buildDistortionCurve } from "./distortionCurves";

/** Ramp lengths, in seconds. Short enough to feel instant, long enough to hide the step. */
const PARAM_RAMP = 0.02;
const TONE_RAMP = 0.025;
const FADE_IN = 0.02;
const FADE_OUT = 0.015;

/**
 * Milliseconds the dry path is held while a live mode swap happens behind it.
 * Slightly longer than `FADE_OUT` so the crossfade has actually landed before
 * the curve underneath it changes.
 */
const SWAP_DELAY_MS = 18;

/**
 * The SONO-DIST effect engine (concept/SONO_DIST_ARCHITECTURE.md).
 *
 * Framework-free: no React, no DOM. Every node is built once in the
 * constructor and lives for the whole session — mode changes swap a curve and
 * a few gains, they never rebuild the graph:
 *
 *     input ─┬──────────────────────────────────────────► crossFade.a  (dry)
 *            └► preGain ► shaper ► dcBlocker ► toneFilter ►
 *               modeCompensation ► levelGain ───────────► crossFade.b  (wet)
 *                                             crossFade ► output
 *
 * BYPASS is that dry `a` input, not a distortion turned down: even the gentlest
 * curve and a wide-open filter still colour the signal.
 *
 * Constructing `Tone.Gain`/`Filter`/`WaveShaper` needs no user gesture — they
 * attach to the suspended global context and stay silent until `Tone.start()`.
 */
export class SonoDistEngine implements SonoDistEngineApi {
  readonly input = new Tone.Gain(1);
  readonly output = new Tone.Gain(1);

  readonly #preGain = new Tone.Gain(1);
  readonly #shaper = new Tone.WaveShaper();
  /**
   * O-DRIVE's asymmetric curve leaves a DC offset behind. Left in place it
   * eats headroom and thumps on note transitions, so it is removed before the
   * signal reaches the tone filter.
   */
  readonly #dcBlocker = new Tone.Filter({
    type: "highpass",
    frequency: 20,
    Q: 0.7,
    rolloff: -12,
  });
  readonly #toneFilter = new Tone.Filter({
    type: "lowpass",
    frequency: mapToneToFrequency(defaultSonoDistState.tone),
    Q: 0.7,
    rolloff: -12,
  });
  /** Fixed per-mode trim, so switching voicing is not a jump in loudness. */
  readonly #modeCompensation = new Tone.Gain(1);
  readonly #levelGain = new Tone.Gain(1);
  readonly #crossFade = new Tone.CrossFade(0);

  #state: SonoDistState = { ...defaultSonoDistState };
  /**
   * The voicing currently loaded into the shaper. It keeps its value through
   * BYPASS so knob moves stay meaningful while the dry path is up, and so
   * re-engaging a mode has nothing to rebuild.
   */
  #shapedMode: ActiveDistortionMode = "classic";
  /**
   * Bumped by every mode change and by `dispose()`. A pending swap captures the
   * value and aborts if it no longer matches, so hammering the mode buttons can
   * never let a stale transition fade the wrong voicing back in.
   */
  #transitionRevision = 0;
  #swapTimer: ReturnType<typeof setTimeout> | null = null;
  #disposed = false;

  constructor(initial: SonoDistState = defaultSonoDistState) {
    this.input.connect(this.#crossFade.a);
    this.input.chain(
      this.#preGain,
      this.#shaper,
      this.#dcBlocker,
      this.#toneFilter,
      this.#modeCompensation,
      this.#levelGain,
      this.#crossFade.b,
    );
    this.#crossFade.connect(this.output);

    // Load the initial voicing without any ramp: nothing is sounding yet.
    this.#state = { ...initial };
    this.#shapedMode = isActive(initial.mode) ? initial.mode : "classic";
    this.#applyModeConfig(this.#shapedMode, 0);
    this.#applyTone(this.#state.tone, 0);
    this.#applyLevel(this.#state.level, 0);
    this.#crossFade.fade.value = isActive(initial.mode) ? 1 : 0;
  }

  setDrive(value: number): void {
    if (this.#disposed) return;
    const drive = clamp01(value);
    if (drive === this.#state.drive) return;
    this.#state = { ...this.#state, drive };
    // DRIVE moves two things at once: how hard the signal hits the shaper, and
    // how severe the shaper's curve is. Rebuilding 4096 samples per knob event
    // is cheap; doing it per animation frame would not be.
    this.#shaper.curve = buildDistortionCurve(this.#shapedMode, drive);
    this.#preGain.gain.rampTo(
      dbToGain(mapDriveToPreGainDb(this.#shapedMode, drive)),
      PARAM_RAMP,
    );
  }

  setTone(value: number): void {
    if (this.#disposed) return;
    const tone = clamp01(value);
    if (tone === this.#state.tone) return;
    this.#state = { ...this.#state, tone };
    this.#applyTone(tone, TONE_RAMP);
  }

  setLevel(value: number): void {
    if (this.#disposed) return;
    const level = clamp01(value);
    if (level === this.#state.level) return;
    this.#state = { ...this.#state, level };
    this.#applyLevel(level, PARAM_RAMP);
  }

  /**
   * Selects a voicing without a click (spec §8). Three cases:
   *
   * - to BYPASS: fade to the dry path and leave everything else alone;
   * - from BYPASS: load the voicing while the dry path is still up, then fade in;
   * - active to active: dip to dry, swap underneath, fade back.
   */
  setMode(mode: DistortionMode): void {
    if (this.#disposed || mode === this.#state.mode) return;
    const previous = this.#state.mode;
    this.#state = { ...this.#state, mode };

    const revision = this.#cancelPendingSwap();

    if (!isActive(mode)) {
      this.#crossFade.fade.rampTo(0, FADE_OUT);
      return;
    }

    if (!isActive(previous)) {
      // The dry path is already up: the swap is inaudible, so no dip needed.
      this.#loadMode(mode, 0);
      this.#crossFade.fade.rampTo(1, FADE_IN);
      return;
    }

    this.#crossFade.fade.rampTo(0, FADE_OUT);
    this.#swapTimer = setTimeout(() => {
      this.#swapTimer = null;
      if (this.#disposed || revision !== this.#transitionRevision) return;
      this.#loadMode(mode, 0);
      this.#crossFade.fade.rampTo(1, FADE_IN);
    }, SWAP_DELAY_MS);
  }

  setState(state: SonoDistState): void {
    if (this.#disposed) return;
    this.setDrive(state.drive);
    this.setTone(state.tone);
    this.setLevel(state.level);
    this.setMode(state.mode);
  }

  connect(destination: Tone.InputNode): void {
    if (this.#disposed) return;
    this.output.connect(destination);
  }

  disconnect(): void {
    if (this.#disposed) return;
    this.output.disconnect();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelPendingSwap();

    this.input.dispose();
    this.#preGain.dispose();
    this.#shaper.dispose();
    this.#dcBlocker.dispose();
    this.#toneFilter.dispose();
    this.#modeCompensation.dispose();
    this.#levelGain.dispose();
    this.#crossFade.dispose();
    this.output.dispose();
  }

  /** Invalidates any in-flight transition and returns the new revision. */
  #cancelPendingSwap(): number {
    if (this.#swapTimer !== null) {
      clearTimeout(this.#swapTimer);
      this.#swapTimer = null;
    }
    this.#transitionRevision += 1;
    return this.#transitionRevision;
  }

  /** Points the shaper at `mode` and applies everything that depends on it. */
  #loadMode(mode: ActiveDistortionMode, ramp: number): void {
    this.#shapedMode = mode;
    this.#applyModeConfig(mode, ramp);
  }

  #applyModeConfig(mode: ActiveDistortionMode, ramp: number): void {
    this.#shaper.curve = buildDistortionCurve(mode, this.#state.drive);
    // Oversampling is a discrete resampler swap, never ramped, and only ever
    // touched here — changing it during a knob move would glitch.
    this.#shaper.oversample = MODE_OVERSAMPLE[mode];
    setGain(
      this.#preGain,
      dbToGain(mapDriveToPreGainDb(mode, this.#state.drive)),
      ramp,
    );
    setGain(this.#modeCompensation, dbToGain(MODE_COMPENSATION_DB[mode]), ramp);
  }

  #applyTone(tone: number, ramp: number): void {
    const hz = mapToneToFrequency(tone);
    if (ramp === 0) this.#toneFilter.frequency.value = hz;
    else this.#toneFilter.frequency.rampTo(hz, ramp);
  }

  #applyLevel(level: number, ramp: number): void {
    setGain(this.#levelGain, dbToGain(mapLevelToDb(level)), ramp);
  }
}

function isActive(mode: DistortionMode): mode is ActiveDistortionMode {
  return mode !== "bypass";
}

/** Ramps a gain, or sets it outright when nothing is sounding yet. */
function setGain(node: Tone.Gain, value: number, ramp: number): void {
  if (ramp === 0) node.gain.value = value;
  else node.gain.rampTo(value, ramp);
}
