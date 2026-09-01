import { useEffect, useRef } from "react";
import { PORTS } from "../sequencer/patchbay";
import type { PortId } from "../sequencer/types";
import { usePatchBay } from "./patchBayContext";

export type JackSocketProps = {
  port: PortId;
  /** Human name of the module, for the socket's accessible label. */
  moduleName: string;
};

/**
 * A quarter-inch jack socket on a panel edge.
 *
 * It is a real button, so patching works by click, Enter and Space alike —
 * there is no drag-only path that a keyboard could not reach. It knows nothing
 * about cables: it registers itself with the patchbay and reports clicks.
 */
export function JackSocket({ port, moduleName }: JackSocketProps) {
  const bay = usePatchBay();
  const ref = useRef<HTMLButtonElement>(null);
  const { registerPort } = bay;
  const { direction, label } = PORTS[port];

  useEffect(() => {
    registerPort(port, ref.current);
    return () => registerPort(port, null);
  }, [registerPort, port]);

  const patched = bay.isPatched(port);
  const armed = bay.armed === port;
  const target = bay.canLandOn(port);

  const action = armed
    ? `Put the lead back down`
    : target
      ? `Plug the lead into ${moduleName} ${label}`
      : patched
        ? `Unplug the lead from ${moduleName} ${label}`
        : `Pick up a lead from ${moduleName} ${label}`;

  return (
    <div className={`jack jack--${direction}`}>
      <span className="jack__label" aria-hidden="true">
        {label}
      </span>
      <button
        type="button"
        ref={ref}
        className={`jack__socket${patched ? " is-connected" : ""}${
          armed ? " is-armed" : ""
        }${target ? " is-target" : ""}`}
        aria-pressed={patched}
        aria-label={action}
        onClick={() => bay.selectPort(port)}
      >
        <span className="jack__ring" aria-hidden="true" />
        <span className="jack__hole" aria-hidden="true" />
      </button>
    </div>
  );
}
