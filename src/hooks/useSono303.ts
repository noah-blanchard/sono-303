import { useEffect, useMemo, useRef } from "react";
import { renderPattern } from "../audio/renderPattern";
import { SonoAudioRig } from "../audio/SonoAudioRig";
import type { Sono303EngineFactory } from "../audio/engineApi";
import { encodeWavMono24 } from "../audio/wavEncoder";
import { exportFileName } from "../sequencer/tape";
import type { NoteGate, WavExport } from "../state/contexts";
import { useSono303Dispatch, useSono303State } from "../state/hooks";

/** What the host publishes to the tree: live play, and the offline bounce. */
export type Sono303Host = {
  noteGate: NoteGate;
  exportWav: WavExport;
};

/** `20260831-1432` — sorts chronologically and survives a filesystem. */
function timeStamp(now: Date): string {
  const pad = (value: number): string => String(value).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

/** Hands the encoded file to the browser's download machinery. */
function saveWav(bytes: Uint8Array<ArrayBuffer>, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoked on a later task: revoking synchronously after `click()` races the
  // download in some browsers and yields a zero-byte file.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The single integration seam between React state and the audio rig.
 *
 * It creates exactly one `SonoAudioRig` — instrument, effect, master bus and
 * safety limiter — pushes serializable state into it, maps its step callback
 * back onto a reducer action, and disposes it on unmount. No other React
 * module may import from `src/audio/`.
 *
 * Returns the note gate and the WAV export, which the host publishes through
 * their contexts so panels and input hooks can sound notes and bounce the
 * phrase without ever touching the rig.
 */
export function useSono303(createEngine?: Sono303EngineFactory): Sono303Host {
  const state = useSono303State();
  const dispatch = useSono303Dispatch();

  const rigRef = useRef<SonoAudioRig | null>(null);
  // The export needs a stable identity but the *current* state. The note gate
  // solves the same problem by reading through `rigRef`; this is the state half.
  // Synced in an effect rather than during render: the bounce only ever starts
  // from a click, by which time effects have long since flushed.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Lifecycle first: on (re)mount the rig exists before the effects below push
  // the current state into it. The factory is intentionally captured once here
  // — swapping factories requires a remount, which nothing needs.
  useEffect(() => {
    const rig = new SonoAudioRig({ createSynth: createEngine });
    rigRef.current = rig;
    rig.synth.setStepListener((stepIndex) => {
      dispatch({ type: "transport/setCurrentStep", stepIndex });
    });

    return () => {
      rigRef.current = null;
      rig.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    rigRef.current?.synth.setPattern(state.steps);
  }, [state.steps]);

  useEffect(() => {
    rigRef.current?.synth.setParameters(state.parameters);
  }, [state.parameters]);

  useEffect(() => {
    rigRef.current?.dist.setState(state.dist);
  }, [state.dist]);

  useEffect(() => {
    rigRef.current?.setPatched(state.patched);
  }, [state.patched]);

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    if (state.transport === "started") {
      void rig.synth.start();
    } else {
      rig.synth.stop();
    }
  }, [state.transport]);

  // Stable identity: every member reads the rig through the ref, so publishing
  // the gate in a context never re-renders the tree.
  const noteGate = useMemo<NoteGate>(
    () => ({
      noteOn: (note, octave, velocity) => {
        rigRef.current?.synth.noteOn(note, octave, velocity);
      },
      noteOff: (note, octave) => {
        rigRef.current?.synth.noteOff(note, octave);
      },
      releaseAll: () => {
        rigRef.current?.synth.releaseAll();
      },
      preview: (note, octave, velocity) => {
        rigRef.current?.synth.previewNote(note, octave, velocity);
      },
    }),
    [],
  );

  const exportWav = useMemo<WavExport>(
    () => async () => {
      // Stop the live transport before anything can yield. `Tone.Offline` swaps
      // the global context for the duration of its callback, so a `stop()`
      // landing inside that window would stop the *offline* transport and
      // render silence.
      rigRef.current?.synth.stop();
      dispatch({ type: "transport/stop" });
      // Let React flush that dispatch — and the transport effect it triggers —
      // before the offline context takes the global slot. `stop()` is
      // idempotent, so the effect repeating the stop is harmless; it just must
      // not happen mid-render.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      const { steps, parameters, dist, patched, tape } = stateRef.current;
      const { samples, sampleRate } = await renderPattern({
        steps,
        parameters,
        dist,
        patched,
        bars: tape.bars,
      });
      saveWav(
        encodeWavMono24(samples, sampleRate),
        exportFileName(parameters.tempoBpm, tape.bars, timeStamp(new Date())),
      );
    },
    [dispatch],
  );

  return useMemo(() => ({ noteGate, exportWav }), [noteGate, exportWav]);
}
