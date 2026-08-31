import { MAX_PITCH_OCTAVE, MIN_OCTAVE } from "./defaults";
import type { PitchClass, Step } from "./types";

/** Chromatic pitch classes, index === semitone offset from C. */
export const PITCH_CLASSES: readonly PitchClass[] = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

export function pitchClassToSemitone(note: PitchClass): number {
  return PITCH_CLASSES.indexOf(note);
}

/**
 * MIDI note number for a pitch class in an octave, on the convention that
 * middle C (C4) is 60. Untransposed: callers add their own offset.
 */
export function pitchToMidi(note: PitchClass, octave: number): number {
  return (octave + 1) * 12 + pitchClassToSemitone(note);
}

/**
 * Inverse of `pitchToMidi`. A MIDI keyboard spans further than the instrument's
 * own octave range, so the octave this returns may fall outside 1..6 — the
 * caller decides whether to sound it as-is or fold it with
 * `clampToStepOctave`.
 */
export function midiToPitch(midi: number): { note: PitchClass; octave: number } {
  const rounded = Math.round(midi);
  // JS `%` keeps the sign of the dividend, so negative MIDI numbers (below C-1)
  // would index out of the table without the extra wrap.
  const semitone = ((rounded % 12) + 12) % 12;
  return {
    note: PITCH_CLASSES[semitone],
    octave: Math.floor(rounded / 12) - 1,
  };
}

/** Folds any octave into the range a step is allowed to store. */
export function clampToStepOctave(octave: number): number {
  return Math.min(MAX_PITCH_OCTAVE, Math.max(MIN_OCTAVE, Math.trunc(octave)));
}

/**
 * Final MIDI note number for a step: stored pitch class + octave + global
 * transposition. Stored step data is never modified by transposition.
 */
export function stepToMidi(step: Step, transposeSemitones: number): number {
  return pitchToMidi(step.note, step.octave) + transposeSemitones;
}

/** Readout name for the selected-step display, e.g. `C4`. Ignores transpose. */
export function stepToNoteName(step: Step): string {
  return `${step.note}${step.octave}`;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
