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
 * Final MIDI note number for a step: stored pitch class + octave + global
 * transposition. Stored step data is never modified by transposition.
 */
export function stepToMidi(step: Step, transposeSemitones: number): number {
  return (
    (step.octave + 1) * 12 + pitchClassToSemitone(step.note) + transposeSemitones
  );
}

/** Readout name for the selected-step display, e.g. `C4`. Ignores transpose. */
export function stepToNoteName(step: Step): string {
  return `${step.note}${step.octave}`;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
