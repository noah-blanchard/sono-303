import { PatchBay } from "./PatchBay";
import { Sono303Panel } from "../../modules/sono303/Sono303Panel";
import { SonoDistPanel } from "../../modules/distortion/SonoDistPanel";
import { SonoTapePanel } from "../../modules/tape/SonoTapePanel";

/**
 * The three devices on one bench.
 *
 * It no longer owns socket refs or cable state: `PatchBay` wraps the bench,
 * collects every jack the modules declare, and draws the leads. Adding a fourth
 * module means adding it here and giving it ports — nothing else.
 *
 * SONO-DIST and SONO-TAPE share a rack in the right-hand column, sized so the
 * pair stands about as tall as the instrument beside them.
 */
export function Workbench() {
  return (
    <PatchBay>
      <Sono303Panel />
      <div className="workbench__rack">
        <SonoDistPanel />
        <SonoTapePanel />
      </div>
    </PatchBay>
  );
}
