import { createContext } from "react";
import type { Dispatch } from "react";
import type { PitchClass, Sono303Action, Sono303State } from "../sequencer/types";

/** Sounds a note immediately, so a written pitch is heard as it is entered. */
export type AuditionNote = (note: PitchClass, octave: number) => void;

export const StateContext = createContext<Sono303State | null>(null);
export const DispatchContext = createContext<Dispatch<Sono303Action> | null>(null);

/**
 * Provided by `useSono303`, the one place allowed to reach the audio rig.
 *
 * Unlike state and dispatch this defaults to a no-op rather than throwing:
 * auditioning is a convenience, and a panel rendered without an audio host
 * should still be fully usable in silence.
 */
export const AuditionContext = createContext<AuditionNote>(() => {});
