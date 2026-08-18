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

export type Sono303State = {
  mode: Mode;
  transport: TransportState;
  selectedStep: number;
  currentStep: number | null;
  /** Lowest of the two octaves the mini keyboard shows; moved only by OCT −/+. */
  keyboardOctave: number;
  parameters: SynthParameters;
  steps: Pattern;
};

export type Sono303Action =
  | { type: "transport/toggle" }
  | { type: "transport/setCurrentStep"; stepIndex: number | null }
  | { type: "mode/set"; mode: Mode }
  | { type: "parameter/set"; key: keyof SynthParameters; value: number | string }
  | { type: "step/select"; stepIndex: number }
  | { type: "step/setPitch"; note: PitchClass; octave?: number }
  | { type: "step/setRest"; rest: boolean }
  | { type: "step/changeOctave"; delta: -1 | 1 }
  | { type: "step/toggleAccent" }
  | { type: "step/toggleSlide" };
