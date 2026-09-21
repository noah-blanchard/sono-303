import type {
  Connection,
  Pattern,
  Sono303State,
  SonoDistState,
  Step,
  SynthParameters,
  TapeState,
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

/**
 * SONO-DIST boot state. The knob positions are the spec's musical defaults, but
 * the module starts in BYPASS and the cable starts unplugged: the instrument
 * sounds exactly like a bare SONO-303 until the user patches it in.
 */
export const defaultSonoDistState: SonoDistState = {
  mode: "bypass",
  drive: 0.38,
  tone: 0.58,
  level: 0.67,
};

/**
 * SONO-TAPE boot state. One bar is the honest default: it is the phrase the
 * sequencer actually holds, and a DAW can duplicate the clip from there.
 */
export const defaultTapeState: TapeState = {
  bars: 1,
};

/**
 * Boot patching: the full chain, 303 through SONO-DIST into SONO-TAPE.
 *
 * Everything is wired on purpose. An unpatched bench would be silent on load,
 * and a recorder with nothing plugged into it records nothing — neither is a
 * good first impression. SONO-DIST still boots in BYPASS, so the sound is a
 * bare SONO-303 until a voicing is chosen.
 */
export const defaultConnections: Connection[] = [
  { from: "sono303.out", to: "dist.in" },
  { from: "dist.out", to: "tape.in" },
];

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
    keyHintsVisible: true,
    heldNotes: [],
    parameters: { ...defaultParameters },
    steps: createDefaultPattern(),
    connections: defaultConnections.map((cable) => ({ ...cable })),
    dist: { ...defaultSonoDistState },
    tape: { ...defaultTapeState },
  };
}
