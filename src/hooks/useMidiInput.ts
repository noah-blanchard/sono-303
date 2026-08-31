import { useCallback, useEffect, useRef, useState } from "react";
import { WebMidi } from "webmidi";
import type { Input, NoteMessageEvent } from "webmidi";
import type { MidiDevice, MidiState, MidiStatus } from "../state/contexts";
import { useNoteInput } from "./useNoteInput";

/** How long the activity LED stays lit after a note arrives. */
const ACTIVITY_MS = 120;

function listDevices(): MidiDevice[] {
  return WebMidi.inputs.map((input) => ({
    id: input.id,
    name: input.name || `Input ${input.id}`,
  }));
}

/** Every input, or just the selected one. */
function selectedInputs(selectedId: string | null): Input[] {
  return selectedId === null
    ? WebMidi.inputs
    : WebMidi.inputs.filter((input) => input.id === selectedId);
}

/**
 * Plays the instrument from a MIDI controller, through WEBMIDI.js.
 *
 * Access is requested from an explicit button rather than on mount: the
 * permission prompt is disruptive, and someone who never plugs anything in
 * should never see it. Notes arrive at their true pitch — a controller is not
 * limited to the two octaves the mini keyboard shows — and velocity carries
 * through to loudness and accent. What a note *does* is the mode's business,
 * handled by `useNoteInput`.
 *
 * Mount once, inside the note gate provider.
 */
export function useMidiInput(): MidiState {
  const noteInput = useNoteInput();

  const [status, setStatus] = useState<MidiStatus>(() =>
    WebMidi.supported ? "idle" : "unsupported",
  );
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activity, setActivity] = useState(false);

  // Notes this hook started, so a device vanishing mid-note can still end it.
  const soundingRef = useRef(new Set<number>());
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enable = useCallback(() => {
    if (!WebMidi.supported) {
      setStatus("unsupported");
      return;
    }
    if (WebMidi.enabled) {
      setStatus("granted");
      setDevices(listDevices());
      return;
    }
    setStatus("requesting");
    // No sysex: it widens the permission for nothing we use, and some
    // browsers prompt more aggressively for it.
    WebMidi.enable({ sysex: false }).then(
      () => {
        setStatus("granted");
        setDevices(listDevices());
      },
      () => {
        // The one case a library cannot paper over: the user, or a stored
        // site setting, refused. Only browser settings can undo it.
        setStatus("denied");
      },
    );
  }, []);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  // Controllers plugged in or unplugged later should just start working.
  useEffect(() => {
    if (status !== "granted") return;
    const onPortsChanged = () => {
      setDevices(listDevices());
    };
    WebMidi.addListener("portschanged", onPortsChanged);
    return () => {
      WebMidi.removeListener("portschanged", onPortsChanged);
    };
  }, [status]);

  // Re-attach whenever the device list or the selection changes. `noteInput`
  // is stable, so this does not run on every note.
  useEffect(() => {
    if (status !== "granted") return;
    const sounding = soundingRef.current;

    function handleNoteOn(event: NoteMessageEvent): void {
      sounding.add(event.note.number);
      // `attack` is already normalized 0..1 — the scale the engine speaks.
      noteInput.start(event.note.number, event.note.attack);
      setActivity(true);
      if (activityTimerRef.current !== null) {
        clearTimeout(activityTimerRef.current);
      }
      activityTimerRef.current = setTimeout(() => {
        setActivity(false);
      }, ACTIVITY_MS);
    }

    function handleNoteOff(event: NoteMessageEvent): void {
      sounding.delete(event.note.number);
      noteInput.stop(event.note.number);
    }

    const attached = selectedInputs(selectedId);
    for (const input of attached) {
      input.addListener("noteon", handleNoteOn);
      input.addListener("noteoff", handleNoteOff);
    }

    return () => {
      for (const input of attached) {
        input.removeListener("noteon", handleNoteOn);
        input.removeListener("noteoff", handleNoteOff);
      }
      // Unplugging a controller, or switching to another one, swallows the
      // note-off — end anything it left sounding.
      for (const midi of sounding) noteInput.stop(midi);
      sounding.clear();
    };
  }, [devices, noteInput, selectedId, status]);

  useEffect(
    () => () => {
      if (activityTimerRef.current !== null) {
        clearTimeout(activityTimerRef.current);
      }
    },
    [],
  );

  return { status, devices, selectedId, activity, enable, select };
}
