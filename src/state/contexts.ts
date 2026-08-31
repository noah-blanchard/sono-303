import { createContext } from "react";
import type { Dispatch } from "react";
import type { PitchClass, Sono303Action, Sono303State } from "../sequencer/types";

/** Sounds a note immediately, so a written pitch is heard as it is entered. */
export type AuditionNote = (note: PitchClass, octave: number) => void;

/**
 * The instrument's live-play gate, as the UI sees it.
 *
 * Every note source — the mini keyboard, the computer keyboard and MIDI —
 * goes through this one object, so none of them needs to know the audio rig
 * exists. `velocity` is normalized 0..1.
 */
export type NoteGate = {
  /** Starts a note and holds it until `noteOff`. */
  noteOn: (note: PitchClass, octave: number, velocity?: number) => void;
  /** Releases a held note. Releasing an unheld note is a no-op. */
  noteOff: (note: PitchClass, octave: number) => void;
  /** Releases everything — used on window blur and on unmount. */
  releaseAll: () => void;
  /** Sounds a note that releases itself, for gestures with no natural end. */
  preview: (note: PitchClass, octave: number, velocity?: number) => void;
};

export const StateContext = createContext<Sono303State | null>(null);
export const DispatchContext = createContext<Dispatch<Sono303Action> | null>(null);

/**
 * Provided by `useSono303`, the one place allowed to reach the audio rig.
 *
 * Unlike state and dispatch this defaults to no-ops rather than throwing:
 * sounding notes is a convenience, and a panel rendered without an audio host
 * should still be fully usable in silence.
 */
export const NoteGateContext = createContext<NoteGate>({
  noteOn: () => {},
  noteOff: () => {},
  releaseAll: () => {},
  preview: () => {},
});

/**
 * Where the browser is in the Web MIDI permission dance.
 *
 * `unsupported` is a first-class state, not an error: Safari has no Web MIDI
 * at all, and the panel has to say so rather than offering a button that can
 * never work.
 */
export type MidiStatus =
  | "unsupported"
  | "idle"
  | "requesting"
  | "granted"
  | "denied";

/** One connected MIDI input, reduced to what the picker needs. */
export type MidiDevice = { id: string; name: string };

export type MidiState = {
  status: MidiStatus;
  devices: MidiDevice[];
  /** Selected input id, or `null` for "every input at once". */
  selectedId: string | null;
  /** True for a moment after each incoming note, to blink an activity LED. */
  activity: boolean;
  /** Asks for MIDI access. Must be called from a real user gesture. */
  enable: () => void;
  select: (id: string | null) => void;
};

export const MidiContext = createContext<MidiState>({
  status: "idle",
  devices: [],
  selectedId: null,
  activity: false,
  enable: () => {},
  select: () => {},
});
