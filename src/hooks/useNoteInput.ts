import { useEffect, useMemo, useRef } from "react";
import { ACCENT_VELOCITY_NORMALIZED } from "../sequencer/velocity";
import { clampToStepOctave, midiToPitch } from "../sequencer/pitch";
import { useNoteGate, useSono303Dispatch, useSono303State } from "../state/hooks";

/**
 * What a note source can do to the instrument, in MIDI numbers.
 *
 * Every source — the mini keyboard, the computer keyboard, a MIDI controller
 * — goes through this so the two modes only have to be implemented once:
 *
 * - **PLAY**: the note sounds and nothing else happens. Free play must never
 *   touch the pattern or move the edit cursor.
 * - **WRITE**: the note sounds *and* is written into the selected step, which
 *   then advances — the same one-gesture contract the mini keyboard has always
 *   had for mouse clicks.
 */
export type NoteInput = {
  /** Sounds a note and holds it until `stop`. */
  start: (midi: number, velocity?: number) => void;
  /** Releases a held note. */
  stop: (midi: number) => void;
  /** Sounds a self-releasing note, for gestures with no release of their own. */
  press: (midi: number, velocity?: number) => void;
  /** Releases everything currently sounding. */
  releaseAll: () => void;
};

export function useNoteInput(): NoteInput {
  const { mode } = useSono303State();
  const dispatch = useSono303Dispatch();
  const gate = useNoteGate();

  // Read through a ref so the returned callbacks keep a stable identity: they
  // are handed to window listeners and to MIDI ports, which must not be torn
  // down and re-attached every time the mode changes.
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  return useMemo<NoteInput>(() => {
    /** The WRITE half: store the pitch on the selected step, then advance. */
    function write(midi: number, velocity: number | undefined): void {
      if (modeRef.current !== "write") return;
      const { note, octave } = midiToPitch(midi);
      dispatch({
        type: "step/setPitch",
        note,
        // A controller reaches further than a step can store, so the written
        // octave folds into range even though the note sounded at true pitch.
        octave: clampToStepOctave(octave),
        accent: velocity !== undefined && velocity >= ACCENT_VELOCITY_NORMALIZED,
      });
      dispatch({ type: "step/advance" });
    }

    return {
      start(midi, velocity) {
        const { note, octave } = midiToPitch(midi);
        gate.noteOn(note, octave, velocity);
        dispatch({ type: "notes/setHeld", midi, held: true });
        write(midi, velocity);
      },
      stop(midi) {
        const { note, octave } = midiToPitch(midi);
        gate.noteOff(note, octave);
        dispatch({ type: "notes/setHeld", midi, held: false });
      },
      press(midi, velocity) {
        const { note, octave } = midiToPitch(midi);
        gate.preview(note, octave, velocity);
        write(midi, velocity);
      },
      releaseAll() {
        gate.releaseAll();
        dispatch({ type: "notes/releaseAll" });
      },
    };
  }, [dispatch, gate]);
}
