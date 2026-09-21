import type { ReactNode } from "react";
import { useComputerKeyboard } from "./useComputerKeyboard";
import { useMidiInput } from "./useMidiInput";
import { MidiContext } from "../state/contexts";

/**
 * Mounts the two live note sources — the computer keyboard and MIDI — and
 * publishes the MIDI connection state so the panel can offer its picker.
 *
 * It must sit inside `NoteGateContext`, which is where both hooks reach the
 * instrument. The computer keyboard needs no context of its own: it has no
 * state a control could show.
 */
export function LiveInputProvider({ children }: { children: ReactNode }) {
  useComputerKeyboard();
  const midi = useMidiInput();

  return <MidiContext.Provider value={midi}>{children}</MidiContext.Provider>;
}
