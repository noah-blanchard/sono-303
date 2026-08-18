import { SoundControls } from "./SoundControls";
import { StepEditor } from "./StepEditor";
import { StepSequencer } from "./StepSequencer";
import { TransportControls } from "./TransportControls";

/** The instrument: four horizontal zones on one silver panel. */
export function Sono303Panel() {
  return (
    <div className="panel">
      <SoundControls />
      <TransportControls />
      <StepSequencer />
      <StepEditor />
    </div>
  );
}
