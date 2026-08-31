import { TAPE_BAR_OPTIONS, barsToSeconds } from "../sequencer/tape";
import { useSono303Dispatch, useSono303State } from "../state/hooks";
import { formatSeconds } from "./knobScales";

const SCREW_CORNERS = ["tl", "tr", "bl", "br"] as const;

/** Where a bounce has got to. Owned by the drawer, which also lights its LED. */
export type ExportStatus = "idle" | "rendering" | "done" | "error";

const STATUS_TEXT: Record<ExportStatus, string> = {
  idle: "READY",
  rendering: "RENDERING…",
  done: "SAVED",
  error: "EXPORT FAILED",
};

export type SonoTapePanelProps = {
  status: ExportStatus;
  onExport: () => void;
};

/**
 * SONO-TAPE: the recorder that bounces the phrase to a `.wav`.
 *
 * It sits at the end of the chain rather than on the patch cable, so it has no
 * jack: whatever the instrument is making — through SONO-DIST or not — is what
 * lands in the file, at the level the VOLUME knob and the limiter set.
 *
 * Presentational, like the rest of `src/components/`: the bar count goes to the
 * reducer, and the export lifecycle belongs to `SonoTapeDrawer`, which needs it
 * to light the drawer handle while the render runs behind a closed drawer.
 */
export function SonoTapePanel({ status, onExport }: SonoTapePanelProps) {
  const { parameters, tape } = useSono303State();
  const dispatch = useSono303Dispatch();

  const rendering = status === "rendering";
  const seconds = barsToSeconds(tape.bars, parameters.tempoBpm);

  return (
    <div className="panel-shell tape-shell">
      {SCREW_CORNERS.map((corner) => (
        <span
          key={corner}
          className={`panel-shell__screw panel-shell__screw--${corner}`}
          aria-hidden="true"
        />
      ))}

      <section className="panel tape-panel">
        <header className="tape-header">
          <h2 className="tape-brand">SONO-TAPE</h2>
          <p className="tape-subtitle">WAV RECORDER</p>
        </header>

        <div className="tape-controls">
          <div className="control-group">
            <span className="control-label" id="tape-bars-label">
              BARS
            </span>
            <div className="segmented" role="group" aria-labelledby="tape-bars-label">
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
          </div>

          {/* Announced through the button's own label instead: a live duration
              read out on every tempo tweak would be noise. */}
          <div className="tape-display" aria-hidden="true">
            <span className="tape-display__value">{formatSeconds(seconds)}</span>
            <span className="tape-display__unit">48K · 24-BIT · MONO</span>
          </div>

          <div className="control-group">
            <span className="control-label" id="tape-export-label">
              EXPORT
            </span>
            <span
              className={`led led--transport${rendering ? " is-on" : ""}`}
              aria-hidden="true"
            />
            {/* Disabled while rendering, which doubles as the guard against a
                second bounce starting on top of the first. */}
            <button
              type="button"
              className="panel-button panel-button--wide"
              aria-labelledby="tape-export-label"
              disabled={rendering}
              onClick={onExport}
            >
              {rendering ? "RENDERING" : "EXPORT WAV"}
            </button>
          </div>

          <p className="tape-status" role="status">
            {STATUS_TEXT[status]}
          </p>
        </div>
      </section>
    </div>
  );
}
