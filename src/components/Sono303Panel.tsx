import { SoundControls } from "./SoundControls";
import { StepEditor } from "./StepEditor";
import { StepSequencer } from "./StepSequencer";
import { TransportControls } from "./TransportControls";

const SCREW_CORNERS = ["tl", "tr", "bl", "br"] as const;

/** The instrument: four horizontal zones on one silver panel, in a metal shell. */
export function Sono303Panel() {
  return (
    <div className="panel-shell">
      {SCREW_CORNERS.map((corner) => (
        <span
          key={corner}
          className={`panel-shell__screw panel-shell__screw--${corner}`}
          aria-hidden="true"
        />
      ))}
      <div className="panel">
        <SoundControls />
        <TransportControls />
        <StepSequencer />
        <StepEditor />
      </div>
    </div>
  );
}
