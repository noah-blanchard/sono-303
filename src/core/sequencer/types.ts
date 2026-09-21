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

/** Bar lengths SONO-TAPE can bounce. One bar is the sixteen steps once. */
export type TapeBars = 1 | 2 | 4 | 8;

/**
 * SONO-TAPE state.
 *
 * Only the bar count lives here. Whether an export is currently running is
 * transient business of the one panel that shows it, not application state.
 */
export type TapeState = {
  bars: TapeBars;
};

/** Every jack on the bench. `module.direction` reads as it is wired. */
export type PortId = "sono303.out" | "dist.in" | "dist.out" | "tape.in";

/** One lead, always from an output jack to an input jack. */
export type Connection = { from: PortId; to: PortId };

export type Sono303State = {
  mode: Mode;
  transport: TransportState;
  selectedStep: number;
  currentStep: number | null;
  /** Lowest of the two octaves the mini keyboard shows; moved only by OCT −/+. */
  keyboardOctave: number;
  /** Whether the mini keyboard prints its computer-key bindings on the keys. */
  keyHintsVisible: boolean;
  /**
   * MIDI numbers currently sounding live, from any note source. Purely visual
   * feedback — it lights the keys, and is the only sign a MIDI controller is
   * actually reaching the instrument.
   */
  heldNotes: number[];
  parameters: SynthParameters;
  steps: Pattern;
  /**
   * Every lead currently plugged in. Both the drawn cables and the audio graph
   * are derived from this, so they cannot disagree. Whether SONO-DIST is in the
   * path is never stored — it is `isDistPatched(connections)`.
   */
  connections: Connection[];
  dist: SonoDistState;
  tape: TapeState;
};

export type Sono303Action =
  | { type: "transport/toggle" }
  // Unconditional stop, for callers that must not start a stopped sequencer —
  // SONO-TAPE bounces from step 0 and cannot share the clock with live playback.
  | { type: "transport/stop" }
  | { type: "transport/setCurrentStep"; stepIndex: number | null }
  | { type: "mode/set"; mode: Mode }
  | { type: "parameter/set"; key: keyof SynthParameters; value: number | string }
  | { type: "step/select"; stepIndex: number }
  // `accent: true` forces the flag on — a hard MIDI hit writes an accented
  // step. Omitting it leaves whatever the step already had.
  | { type: "step/setPitch"; note: PitchClass; octave?: number; accent?: boolean }
  | { type: "step/setRest"; rest: boolean }
  | { type: "step/advance" }
  | { type: "step/changeOctave"; delta: -1 | 1 }
  | { type: "step/toggleAccent" }
  | { type: "step/toggleSlide" }
  | { type: "ui/toggleKeyHints" }
  | { type: "notes/setHeld"; midi: number; held: boolean }
  | { type: "notes/releaseAll" }
  | { type: "patch/connect"; from: PortId; to: PortId }
  | { type: "patch/disconnect"; port: PortId }
  | { type: "dist/setMode"; mode: DistortionMode }
  | { type: "dist/setDrive"; value: number }
  | { type: "dist/setTone"; value: number }
  | { type: "dist/setLevel"; value: number }
  | { type: "tape/setBars"; bars: TapeBars };
