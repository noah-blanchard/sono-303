import { useSono303Dispatch, useSono303State } from "../state/hooks";
import { StepButton } from "./StepButton";

const GROUP_SIZE = 4;

/** Zone 3: the fixed 16-step grid, grouped 1-4 / 5-8 / 9-12 / 13-16. */
export function StepSequencer() {
  const { steps, selectedStep, currentStep } = useSono303State();
  const dispatch = useSono303Dispatch();

  const groups = Array.from(
    { length: steps.length / GROUP_SIZE },
    (_, groupIndex) => groupIndex * GROUP_SIZE,
  );

  return (
    <section className="zone zone--sequencer" aria-label="16 step sequencer">
      <header className="sequencer__header">16 STEP SEQUENCER</header>
      <div className="sequencer__grid">
        {groups.map((start) => (
          <div className="step-group" key={start}>
            {steps.slice(start, start + GROUP_SIZE).map((step, offset) => {
              const index = start + offset;
              return (
                <StepButton
                  key={index}
                  index={index}
                  step={step}
                  selected={index === selectedStep}
                  playing={index === currentStep}
                  onSelect={(stepIndex) =>
                    dispatch({ type: "step/select", stepIndex })
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
