import type {
  Pattern,
  Sono303State,
  Step,
  SynthParameters,
} from "./types";

export const STEP_COUNT = 16;

/** OCT −/+ range: the five keyboard levels C1–B2, C2–B3, … C5–B6. */
export const MIN_OCTAVE = 1;
export const MAX_OCTAVE = 5;

/**
 * The keyboard shows two octaves starting at the step's octave, so its upper
 * row reaches one octave above the top OCT level. Stored pitches may therefore
 * sit on octave 6 even though OCT + stops at 5.
 */
export const MAX_PITCH_OCTAVE = MAX_OCTAVE + 1;

export const defaultStep: Step = {
  active: false,
  note: "C",
  octave: 3,
  accent: false,
  slide: false,
};

export const defaultParameters: SynthParameters = {
  waveform: "sawtooth",
  cutoffHz: 350,
  resonanceQ: 8,
  envMod: 0.65,
  decaySeconds: 0.3,
  accentAmount: 0.6,
  tempoBpm: 125,
  volumeDb: -8,
  transposeSemitones: 0,
};

/** Inclusive ranges for every numeric parameter, shared by the UI and reducer. */
export const parameterRanges = {
  cutoffHz: { min: 80, max: 5000 },
  resonanceQ: { min: 0, max: 20 },
  envMod: { min: 0, max: 1 },
  decaySeconds: { min: 0.05, max: 1.5 },
  accentAmount: { min: 0, max: 1 },
  tempoBpm: { min: 60, max: 200 },
  volumeDb: { min: -36, max: 0 },
  transposeSemitones: { min: -12, max: 12 },
} as const;

export function createDefaultPattern(): Pattern {
  return Array.from({ length: STEP_COUNT }, () => ({ ...defaultStep }));
}

export function createInitialState(): Sono303State {
  return {
    mode: "write",
    transport: "stopped",
    selectedStep: 0,
    currentStep: null,
    keyboardOctave: defaultStep.octave,
    parameters: { ...defaultParameters },
    steps: createDefaultPattern(),
  };
}
