import { useRef } from "react";
import { useSono303Dispatch, useSono303State } from "../state/hooks";
import { PatchCable } from "./PatchCable";
import { Sono303Panel } from "./Sono303Panel";
import { SonoDistPanel } from "./SonoDistPanel";

/**
 * The two devices on one bench, joined by the patch cable.
 *
 * It owns the socket refs because the cable has to measure both units at once
 * to draw itself, and it is the only component that knows where they sit.
 */
export function Workbench() {
  const { patched } = useSono303State();
  const dispatch = useSono303Dispatch();

  const boardRef = useRef<HTMLDivElement | null>(null);
  const outputJackRef = useRef<HTMLButtonElement | null>(null);
  const inputJackRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div className="workbench" ref={boardRef}>
      <Sono303Panel outputJackRef={outputJackRef} />
      <SonoDistPanel inputJackRef={inputJackRef} />
      <PatchCable
        boardRef={boardRef}
        sourceRef={outputJackRef}
        targetRef={inputJackRef}
        patched={patched}
        onPatchedChange={(next) => dispatch({ type: "patch/set", patched: next })}
      />
    </div>
  );
}
