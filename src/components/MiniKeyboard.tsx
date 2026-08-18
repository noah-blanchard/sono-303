import type { CSSProperties } from "react";
import { PITCH_CLASSES } from "../sequencer/pitch";
import type { PitchClass } from "../sequencer/types";

type Key = { note: PitchClass; position: number };

const WHITE_KEYS: Key[] = PITCH_CLASSES.filter((note) => !note.includes("#")).map(
  (note, index) => ({ note, position: index }),
);

/** Black keys sit between white keys 0-1, 1-2, 3-4, 4-5 and 5-6. */
const BLACK_KEYS: Key[] = [
  { note: "C#", position: 1 },
  { note: "D#", position: 2 },
  { note: "F#", position: 4 },
  { note: "G#", position: 5 },
  { note: "A#", position: 6 },
];

function keyLabel(note: PitchClass): string {
  return note.includes("#") ? `${note[0]} sharp` : note;
}

export type MiniKeyboardProps = {
  value: PitchClass;
  disabled: boolean;
  onSelect: (note: PitchClass) => void;
};

/**
 * One-octave chromatic pitch selector. It only assigns a pitch class to the
 * selected step — it is never a playable voice.
 */
export function MiniKeyboard({ value, disabled, onSelect }: MiniKeyboardProps) {
  function renderKey(key: Key, variant: "white" | "black") {
    const selected = key.note === value;
    return (
      <button
        key={key.note}
        type="button"
        className={`key key--${variant}${selected ? " is-selected" : ""}`}
        style={{ "--key-position": key.position } as CSSProperties}
        aria-pressed={selected}
        aria-label={keyLabel(key.note)}
        disabled={disabled}
        onClick={() => onSelect(key.note)}
      />
    );
  }

  return (
    <div className="keyboard" role="group" aria-label="Step pitch">
      <div className="keyboard__whites">
        {WHITE_KEYS.map((key) => renderKey(key, "white"))}
      </div>
      <div className="keyboard__blacks">
        {BLACK_KEYS.map((key) => renderKey(key, "black"))}
      </div>
    </div>
  );
}
