/**
 * Pure data model for SONO-303.
 *
 * This module must never import React or Tone.js: it is shared by the UI, the
 * reducer and the sound engine.
 */

export type PitchClass =
  | "C"
  | "C#"
  | "D"
  | "D#"
  | "E"
  | "F"
  | "F#"
  | "G"
  | "G#"
  | "A"
  | "A#"
  | "B";

export type Waveform = "sawtooth" | "square";

export type Step = {
  active: boolean;
  note: PitchClass;
  octave: number;
  accent: boolean;
  slide: boolean;
};

/** Must always contain exactly 16 steps. */
export type Pattern = Step[];

export type SynthParameters = {
  waveform: Waveform;
  cutoffHz: number;
  resonanceQ: number;
  envMod: number;
  decaySeconds: number;
  accentAmount: number;
  tempoBpm: number;
  volumeDb: number;
  transposeSemitones: number;
};

export type Mode = "play" | "write";

export type TransportState = "started" | "stopped";

/** The four SONO-DIST voicings. `bypass` is a real dry path, not zero drive. */
export type DistortionMode = "classic" | "turbo" | "overdrive" | "bypass";

/** The three modes that actually shape the signal. */
export type ActiveDistortionMode = Exclude<DistortionMode, "bypass">;

/**
 * SONO-DIST state. The three knobs are normalized 0..1 and keep their value
 * through BYPASS, so re-engaging a mode restores the sound instantly.
 *
 * There is deliberately no `active` flag: it is always derived as
 * `patched && mode !== "bypass"`, so it can never contradict the mode.
 */
export type SonoDistState = {
  mode: DistortionMode;
  drive: number;
  tone: number;
  level: number;
};

export type Sono303State = {
  mode: Mode;
  transport: TransportState;
  selectedStep: number;
  currentStep: number | null;
  /** Lowest of the two octaves the mini keyboard shows; moved only by OCT −/+. */
  keyboardOctave: number;
  parameters: SynthParameters;
  steps: Pattern;
  /** Whether the patch cable routes SONO-303 through SONO-DIST. */
  patched: boolean;
  dist: SonoDistState;
};

export type Sono303Action =
  | { type: "transport/toggle" }
  | { type: "transport/setCurrentStep"; stepIndex: number | null }
  | { type: "mode/set"; mode: Mode }
  | { type: "parameter/set"; key: keyof SynthParameters; value: number | string }
  | { type: "step/select"; stepIndex: number }
  | { type: "step/setPitch"; note: PitchClass; octave?: number }
  | { type: "step/setRest"; rest: boolean }
  | { type: "step/advance" }
  | { type: "step/changeOctave"; delta: -1 | 1 }
  | { type: "step/toggleAccent" }
  | { type: "step/toggleSlide" }
  | { type: "patch/set"; patched: boolean }
  | { type: "dist/setMode"; mode: DistortionMode }
  | { type: "dist/setDrive"; value: number }
  | { type: "dist/setTone"; value: number }
  | { type: "dist/setLevel"; value: number };
