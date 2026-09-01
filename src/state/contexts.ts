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
 * Bounces the current phrase offline and hands the browser a `.wav` download.
 *
 * Takes no arguments: the bar count lives in the reducer, and `useSono303`
 * reads it there, so there is exactly one source of truth for the length.
 */
export type WavExport = () => Promise<void>;

/**
 * Provided by `useSono303`, like the note gate.
 *
 * Unlike `NoteGateContext` the fallback throws rather than doing nothing. A
 * silent no-op would report a successful export with no file on disk, which is
 * a lie; a panel rendered without an audio host should say EXPORT FAILED.
 */
export const WavExportContext = createContext<WavExport>(async () => {
  throw new Error("Wav export used outside an audio host");
});

/** What the recorder is doing, as the panel needs to show it. */
export type LiveRecordState = "idle" | "armed" | "recording";

/** One poll of the recorder, for the running timer and the state lamp. */
export type LiveRecordReading = {
  state: LiveRecordState;
  /** Frames captured since the take opened; zero while merely armed. */
  frames: number;
  sampleRate: number;
};

/**
 * Live capture of the master bus.
 *
 * `read` is a poll rather than a subscription on purpose: the only consumer is
 * a running clock that repaints ten times a second anyway, and polling keeps
 * audio-thread state out of React's render cycle entirely.
 */
export type LiveRecord = {
  /** Opens a take. Snaps to the next downbeat when the sequencer is running. */
  arm: () => Promise<void>;
  /** Closes the take and saves the `.wav`. */
  stop: () => Promise<void>;
  read: () => LiveRecordReading;
};

/** Provided by `useSono303`, like the note gate and the bounce. */
export const LiveRecordContext = createContext<LiveRecord>({
  arm: async () => {
    throw new Error("Live record used outside an audio host");
  },
  stop: async () => {
    throw new Error("Live record used outside an audio host");
  },
  read: () => ({ state: "idle", frames: 0, sampleRate: 0 }),
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
