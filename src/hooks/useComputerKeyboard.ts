import { useEffect, useRef } from "react";
import { codeToSemitone } from "../sequencer/keyMap";
import { pitchToMidi } from "../sequencer/pitch";
import { useSono303State } from "../state/hooks";
import { useNoteInput } from "./useNoteInput";

/** Elements that own their keystrokes; note keys must not steal from them. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Plays the instrument from the computer keyboard, FL Studio style.
 *
 * Two rows of physical keys form two octaves starting at the window the OCT
 * −/+ buttons point at, so moving the window moves what the rows play. Notes
 * are held for as long as the key is, and what a press *does* is the mode's
 * business — see `useNoteInput`.
 *
 * Mount once, inside the note gate provider.
 */
export function useComputerKeyboard(): void {
  const { keyboardOctave } = useSono303State();
  const noteInput = useNoteInput();

  // Which MIDI note each physical key started, so the release is guaranteed to
  // end the same note even if OCT moved the window while the key was down.
  const soundingRef = useRef(new Map<string, number>());
  const octaveRef = useRef(keyboardOctave);
  useEffect(() => {
    octaveRef.current = keyboardOctave;
  }, [keyboardOctave]);

  useEffect(() => {
    const sounding = soundingRef.current;

    function releaseAll(): void {
      if (sounding.size === 0) return;
      sounding.clear();
      noteInput.releaseAll();
    }

    function handleKeyDown(event: KeyboardEvent): void {
      // Never swallow a shortcut, and never fight a text field for its keys.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextEntry(event.target)) return;

      const semitone = codeToSemitone(event.code);
      if (semitone === null) return;

      // The key is ours from here: `/` opens quick-find and `,`/`.` scroll in
      // some browsers, and auto-repeat would machine-gun the note.
      event.preventDefault();
      if (event.repeat || sounding.has(event.code)) return;

      const midi = pitchToMidi("C", octaveRef.current) + semitone;
      sounding.set(event.code, midi);
      noteInput.start(midi);
    }

    function handleKeyUp(event: KeyboardEvent): void {
      const midi = sounding.get(event.code);
      if (midi === undefined) return;
      sounding.delete(event.code);
      noteInput.stop(midi);
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    // Leaving the window swallows the keyup, which would leave the note
    // droning until the user came back and pressed it again.
    window.addEventListener("blur", releaseAll);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", releaseAll);
      releaseAll();
    };
  }, [noteInput]);
}
