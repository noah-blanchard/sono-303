import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import { MAX_OCTAVE, MIN_OCTAVE } from "../sequencer/defaults";
import { semitoneToKeyLabel } from "../sequencer/keyMap";
import { PITCH_CLASSES, pitchToMidi } from "../sequencer/pitch";
import type { PitchClass } from "../sequencer/types";

type Key = {
  note: PitchClass;
  octave: number;
  position: number;
  /** Semitones above the bottom of the window — what a computer key plays. */
  semitone: number;
  midi: number;
};

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
 * The two visible octaves start at the window the OCT buttons point at, so
 * each level owns a distinct span: 1 → C1–B2, 2 → C2–B3, … 5 → C5–B6.
 */
function visibleOctaves(baseOctave: number): readonly [number, number] {
  const lowest = Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, baseOctave));
  return [lowest, lowest + 1];
}

function buildKeys(octaves: readonly [number, number]): {
  whites: Key[];
  blacks: Key[];
} {
  const [lowest] = octaves;
  const base = pitchToMidi("C", lowest);
  const key = (note: PitchClass, octave: number, position: number): Key => {
    const midi = pitchToMidi(note, octave);
    return { note, octave, position, semitone: midi - base, midi };
  };

  return {
    whites: octaves.flatMap((octave) =>
      WHITE_NOTES.map((note, index) =>
        key(note, octave, (octave - lowest) * WHITE_PER_OCTAVE + index),
      ),
    ),
    blacks: octaves.flatMap((octave) =>
      BLACK_OFFSETS.map(([note, offset]) =>
        key(note, octave, (octave - lowest) * WHITE_PER_OCTAVE + offset),
      ),
    ),
  };
}

function keyLabel(note: PitchClass, octave: number): string {
  return note.includes("#") ? `${note[0]} sharp ${octave}` : `${note}${octave}`;
}

export type MiniKeyboardProps = {
  /** Pitch of the selected step, highlighted when it falls inside the window. */
  note: PitchClass;
  octave: number;
  /** Lowest of the two octaves on screen. */
  baseOctave: number;
  /** Whether to print each key's computer-keyboard binding on it. */
  showKeyHints: boolean;
  /** MIDI numbers currently sounding, from any note source. */
  heldNotes: readonly number[];
  /** Press and release, in MIDI numbers. */
  onNoteOn: (midi: number) => void;
  onNoteOff: (midi: number) => void;
  /** Keyboard-activated press, which never gets a release of its own. */
  onNotePress: (midi: number) => void;
};

/**
 * Two-octave (24 semitone) chromatic keyboard.
 *
 * It is a real playable voice: pressing a key gates a note for as long as the
 * pointer is down, in both modes. What that press *means* — free play in PLAY,
 * writing the selected step in WRITE — is decided upstream, so this component
 * stays presentational. Picking a key never scrolls the window.
 */
export function MiniKeyboard({
  note,
  octave,
  baseOctave,
  showKeyHints,
  heldNotes,
  onNoteOn,
  onNoteOff,
  onNotePress,
}: MiniKeyboardProps) {
  const { whites, blacks } = buildKeys(visibleOctaves(baseOctave));

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>, key: Key) {
    // Capture so a pointer dragged off the key still delivers its release
    // here, instead of leaving the note hanging.
    event.currentTarget.setPointerCapture(event.pointerId);
    onNoteOn(key.midi);
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>, key: Key) {
    // `detail === 0` means Enter/Space on a focused key: no pointer events
    // fired, so nothing has sounded and nothing will release it.
    if (event.detail === 0) onNotePress(key.midi);
  }

  function renderKey(key: Key, variant: "white" | "black") {
    const selected = key.note === note && key.octave === octave;
    const held = heldNotes.includes(key.midi);
    const hint = showKeyHints ? semitoneToKeyLabel(key.semitone) : null;
    const classes = [
      "key",
      `key--${variant}`,
      selected ? "is-selected" : "",
      held ? "is-held" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        key={`${key.note}${key.octave}`}
        type="button"
        className={classes}
        style={
          {
            "--key-position": key.position,
            "--white-count": WHITE_COUNT,
          } as CSSProperties
        }
        aria-pressed={selected}
        aria-label={keyLabel(key.note, key.octave)}
        onPointerDown={(event) => handlePointerDown(event, key)}
        onPointerUp={() => onNoteOff(key.midi)}
        onPointerCancel={() => onNoteOff(key.midi)}
        onClick={(event) => handleClick(event, key)}
      >
        {hint !== null && (
          <span className="key__hint" aria-hidden="true">
            {hint}
          </span>
        )}
        <span className="key__label" aria-hidden="true">
          {key.note}
          {key.octave}
        </span>
      </button>
    );
  }

  return (
    <div className="keyboard" role="group" aria-label="Keyboard">
      <div className="keyboard__whites">
        {whites.map((key) => renderKey(key, "white"))}
      </div>
      <div className="keyboard__blacks">
        {blacks.map((key) => renderKey(key, "black"))}
      </div>
    </div>
  );
}
