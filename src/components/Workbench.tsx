import { useRef } from "react";
import { useSono303Dispatch, useSono303State } from "../state/hooks";
import { PatchCable } from "./PatchCable";
import { Sono303Panel } from "./Sono303Panel";
import { SonoDistPanel } from "./SonoDistPanel";
import { SonoTapePanel } from "./SonoTapePanel";

/**
 * The three devices on one bench, two of them joined by the patch cable.
 *
 * It owns the socket refs because the cable has to measure both units at once
 * to draw itself, and it is the only component that knows where they sit.
 *
 * SONO-DIST and SONO-TAPE share a rack in the right-hand column, sized so the
 * pair stands about as tall as the instrument beside them. The rack is a
 * wrapper rather than a third grid column, so the cable geometry — measured
 * against the board — is unchanged.
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
      <div className="workbench__rack">
        <SonoDistPanel inputJackRef={inputJackRef} />
        <SonoTapePanel />
      </div>
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
