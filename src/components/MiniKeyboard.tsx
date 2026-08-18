import type { CSSProperties } from "react";
import { MAX_OCTAVE, MIN_OCTAVE } from "../sequencer/defaults";
import { PITCH_CLASSES } from "../sequencer/pitch";
import type { PitchClass } from "../sequencer/types";

type Key = { note: PitchClass; octave: number; position: number };

const WHITE_PER_OCTAVE = 7;
const WHITE_COUNT = 2 * WHITE_PER_OCTAVE;

const WHITE_NOTES = PITCH_CLASSES.filter((note) => !note.includes("#"));

/** Black keys sit between white keys 0-1, 1-2, 3-4, 4-5 and 5-6 of each octave. */
const BLACK_OFFSETS: ReadonlyArray<readonly [PitchClass, number]> = [
  ["C#", 1],
  ["D#", 2],
  ["F#", 4],
  ["G#", 5],
  ["A#", 6],
];

/**
 * The two visible octaves follow the selected step's octave: the keyboard
 * shows `octave − 1` and `octave`, clamped so the window always stays inside
 * the legal 1..5 range. OCT −/+ therefore shifts the key labels.
 */
function visibleOctaves(currentOctave: number): readonly [number, number] {
  const highest = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE + 1, currentOctave));
  return [highest - 1, highest];
}

function buildKeys(octaves: readonly [number, number]): {
  whites: Key[];
  blacks: Key[];
} {
  const [lowest] = octaves;
  return {
    whites: octaves.flatMap((octave) =>
      WHITE_NOTES.map((note, index) => ({
        note,
        octave,
        position: (octave - lowest) * WHITE_PER_OCTAVE + index,
      })),
    ),
    blacks: octaves.flatMap((octave) =>
      BLACK_OFFSETS.map(([note, offset]) => ({
        note,
        octave,
        position: (octave - lowest) * WHITE_PER_OCTAVE + offset,
      })),
    ),
  };
}

function keyLabel(note: PitchClass, octave: number): string {
  return note.includes("#") ? `${note[0]} sharp ${octave}` : `${note}${octave}`;
}

export type MiniKeyboardProps = {
  note: PitchClass;
  octave: number;
  disabled: boolean;
  onSelect: (note: PitchClass, octave: number) => void;
};

/**
 * Two-octave (24 semitone) chromatic pitch selector. It only assigns a pitch
 * class and octave to the selected step — it is never a playable voice.
 */
export function MiniKeyboard({ note, octave, disabled, onSelect }: MiniKeyboardProps) {
  const { whites, blacks } = buildKeys(visibleOctaves(octave));

  function renderKey(key: Key, variant: "white" | "black") {
    const selected = key.note === note && key.octave === octave;
    return (
      <button
        key={`${key.note}${key.octave}`}
        type="button"
        className={`key key--${variant}${selected ? " is-selected" : ""}`}
        style={
          {
            "--key-position": key.position,
            "--white-count": WHITE_COUNT,
          } as CSSProperties
        }
        aria-pressed={selected}
        aria-label={keyLabel(key.note, key.octave)}
        disabled={disabled}
        onClick={() => onSelect(key.note, key.octave)}
      >
        <span className="key__label" aria-hidden="true">
          {key.note}
          {key.octave}
        </span>
      </button>
    );
  }

  return (
    <div className="keyboard" role="group" aria-label="Step pitch">
      <div className="keyboard__whites">
        {whites.map((key) => renderKey(key, "white"))}
      </div>
      <div className="keyboard__blacks">
        {blacks.map((key) => renderKey(key, "black"))}
      </div>
    </div>
  );
}
