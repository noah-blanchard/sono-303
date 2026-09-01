import { useCallback, useEffect, useState } from "react";
import { framesToClock } from "../sequencer/liveTake";
import { TAPE_BAR_OPTIONS, barsToSeconds } from "../sequencer/tape";
import {
  useLiveRecord,
  useSono303Dispatch,
  useSono303State,
  useWavExport,
} from "../state/hooks";
import { Module } from "./Module";
import { formatSeconds } from "./knobScales";

/** How often the running time and the recorder's state are re-read. */
const CLOCK_POLL_MS = 100;

/** Where a bounce has got to. */
type ExportStatus = "idle" | "rendering" | "done" | "error";

/** What the recorder is doing. `error` is local: the recorder never reports it. */
type RecordState = "idle" | "armed" | "recording" | "error";

const EXPORT_TEXT: Record<ExportStatus, string> = {
  idle: "READY",
  rendering: "RENDERING…",
  done: "SAVED",
  error: "EXPORT FAILED",
};

const RECORD_TEXT: Record<RecordState, string> = {
  idle: "READY",
  armed: "ARMED · WAITING FOR DOWNBEAT",
  recording: "RECORDING",
  error: "CAPTURE UNAVAILABLE",
};

const RECORD_ACTION: Record<RecordState, string> = {
  idle: "REC",
  armed: "CANCEL",
  recording: "STOP",
  error: "REC",
};

/**
 * SONO-TAPE: the recorder, standing under SONO-DIST.
 *
 * Its IN jack is the truth about what it captures: patch SONO-DIST's OUT into
 * it to record the processed sound, or SONO-303's OUT straight in to record the
 * bare instrument while still monitoring through the distortion. With nothing
 * plugged in it records silence, exactly as the hardware would.
 *
 * Two ways out, because they answer different questions. **LIVE** taps the
 * real-time bus, so a CUTOFF sweep, a hand-played note or the cable going in
 * mid-phrase all end up in the take. **BOUNCE** re-renders the pattern offline,
 * faster than real time and perfectly grid-aligned, but against one frozen set
 * of knob positions — a sweep cannot exist in it.
 */
export function SonoTapePanel() {
  const { parameters, tape } = useSono303State();
  const dispatch = useSono303Dispatch();
  const exportWav = useWavExport();
  const liveRecord = useLiveRecord();

  const [exportStatus, setExportStatus] = useState<ExportStatus>("idle");
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [recordClock, setRecordClock] = useState("00:00.0");
  const [recordRate, setRecordRate] = useState<number | null>(null);

  const rendering = exportStatus === "rendering";
  const capturing = recordState !== "idle";
  const seconds = barsToSeconds(tape.bars, parameters.tempoBpm);
  // Live capture runs at whatever rate the hardware gave the AudioContext,
  // which is not always the 48 kHz the offline bounce can insist on.
  const rateLabel =
    recordRate === null ? "48K" : `${Math.round(recordRate / 1000)}K`;

  const handleExport = useCallback(async (): Promise<void> => {
    setExportStatus("rendering");
    try {
      await exportWav();
      setExportStatus("done");
    } catch {
      setExportStatus("error");
    }
  }, [exportWav]);

  const handleRecordToggle = useCallback((): void => {
    if (recordState === "idle" || recordState === "error") {
      // Optimistically armed: loading the worklet is async, so the recorder
      // itself still reads `idle` for a moment and the poll below has to know
      // not to believe it yet.
      setRecordState("armed");
      liveRecord.arm().catch((error: unknown) => {
        // Worth a console entry: the likely cause is a browser without
        // AudioWorklet, and the panel alone cannot say which.
        console.error("SONO-TAPE: live capture unavailable", error);
        setRecordState("error");
      });
      return;
    }
    void liveRecord.stop().finally(() => {
      setRecordState("idle");
      setRecordClock("00:00.0");
    });
  }, [liveRecord, recordState]);

  // The recorder's state lives on the audio side, so the panel polls it. That
  // keeps audio-thread bookkeeping out of React's render cycle, and the clock
  // has to repaint on a timer anyway.
  useEffect(() => {
    if (recordState === "idle" || recordState === "error") return;
    // An `idle` reading before the recorder has ever gone active is the arm
    // still in flight, not a finished take. Believing it would knock the panel
    // straight back to idle and the take would never start.
    let seenActive = false;
    const id = window.setInterval(() => {
      const reading = liveRecord.read();
      setRecordClock(framesToClock(reading.frames, reading.sampleRate));
      if (reading.sampleRate > 0) setRecordRate(reading.sampleRate);
      if (reading.state !== "idle") {
        seenActive = true;
        // Covers the arm→record transition on the downbeat.
        setRecordState(reading.state);
      } else if (seenActive) {
        // The recorder stopped itself — the length cap.
        setRecordState("idle");
      }
    }, CLOCK_POLL_MS);
    return () => window.clearInterval(id);
  }, [liveRecord, recordState]);

  return (
    <Module
      name="SONO-TAPE"
      subtitle="WAV RECORDER"
      ports={["tape.in"]}
      className="tape-shell"
      panelClassName="tape-panel"
    >
        <div className="tape-controls">
          <div className="tape-row">
            <span className="tape-row__title">LIVE</span>
            {/* Blink distinguishes armed from rolling, but never alone: the
                status line spells both out. */}
            <span
              className={`led led--transport${recordState === "recording" ? " is-on" : ""}${
                recordState === "armed" ? " is-blinking" : ""
              }`}
              aria-hidden="true"
            />
            <button
              type="button"
              className={`panel-button panel-button--tape${capturing ? " is-live" : ""}`}
              onClick={handleRecordToggle}
            >
              {RECORD_ACTION[recordState]}
            </button>
            {/* Counts only what will end up in the file: it stays at zero while
                armed, then runs from the downbeat the take actually opens on. */}
            <span className="tape-clock" aria-hidden="true">
              {recordClock}
            </span>
          </div>

          <p className="tape-status" role="status">
            {RECORD_TEXT[recordState]} · {rateLabel} 24-BIT MONO
          </p>

          <span className="tape-divider" aria-hidden="true" />

          <div className="tape-row">
            <span className="tape-row__title" id="tape-bars-label">
              BOUNCE
            </span>
            <div
              className="segmented segmented--tape"
              role="group"
              aria-labelledby="tape-bars-label"
            >
              {TAPE_BAR_OPTIONS.map((bars) => (
                <button
                  key={bars}
                  type="button"
                  className="segmented__option"
                  aria-pressed={tape.bars === bars}
                  onClick={() => dispatch({ type: "tape/setBars", bars })}
                >
                  {bars}
                </button>
              ))}
            </div>
            <span className="tape-clock" aria-hidden="true">
              {formatSeconds(seconds)}
            </span>
          </div>

          <div className="tape-row">
            <span
              className={`led led--transport${rendering ? " is-on" : ""}`}
              aria-hidden="true"
            />
            {/* Disabled while rendering, which doubles as the guard against a
                second bounce starting on top of the first. */}
            <button
              type="button"
              className="panel-button panel-button--tape panel-button--grow"
              disabled={rendering}
              onClick={() => {
                void handleExport();
              }}
            >
              {rendering ? "RENDERING" : "EXPORT WAV"}
            </button>
          </div>

          <p className="tape-status" role="status">
            {EXPORT_TEXT[exportStatus]} · 48K 24-BIT MONO
          </p>
        </div>
    </Module>
  );
}
