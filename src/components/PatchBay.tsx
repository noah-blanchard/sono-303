import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { PORTS, canConnect, connectionAt } from "../sequencer/patchbay";
import type { PortId } from "../sequencer/types";
import { useSono303Dispatch, useSono303State } from "../state/hooks";
import { PatchBayContext } from "./patchBayContext";
import type { PatchBayApi } from "./patchBayContext";

type Point = { x: number; y: number };
type Board = { width: number; height: number };

/** Where a loose end hangs below the jack holding it. */
const DANGLE = { x: 26, y: 58 };

function centerIn(element: Element, board: DOMRect): Point {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - board.left,
    y: rect.top + rect.height / 2 - board.top,
  };
}

/** A hanging lead rather than a taut wire: the sag grows with the span. */
function cablePath(from: Point, to: Point): string {
  const span = Math.hypot(from.x - to.x, from.y - to.y);
  const sag = Math.max(26, span * 0.2);
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2 + sag;
  return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
}

export type PatchBayProps = {
  children: ReactNode;
};

/**
 * The patchbay: every jack on the bench, and every lead between them.
 *
 * It owns the socket geometry so the modules do not have to. Each `JackSocket`
 * registers itself here on mount, and this component measures them all and
 * draws one cable per connection in `state.connections` — the same list the
 * audio rig derives its routing from, so a drawn cable and a real one can never
 * disagree.
 *
 * Patching is two deliberate clicks: pick a jack up, then land it on another.
 * The sockets are ordinary buttons, so that works by keyboard and on touch
 * without any special handling.
 */
export function PatchBay({ children }: PatchBayProps) {
  const { connections } = useSono303State();
  const dispatch = useSono303Dispatch();

  const boardRef = useRef<HTMLDivElement>(null);
  const portsRef = useRef(new Map<PortId, HTMLButtonElement>());
  const [armed, setArmed] = useState<PortId | null>(null);
  const [points, setPoints] = useState<Map<PortId, Point>>(new Map());
  const [board, setBoard] = useState<Board>({ width: 0, height: 0 });

  const measure = useCallback(() => {
    const element = boardRef.current;
    if (element === null) return;
    const rect = element.getBoundingClientRect();
    const next = new Map<PortId, Point>();
    for (const [id, socket] of portsRef.current) {
      next.set(id, centerIn(socket, rect));
    }
    setPoints(next);
    setBoard({ width: rect.width, height: rect.height });
  }, []);

  const registerPort = useCallback(
    (id: PortId, element: HTMLButtonElement | null) => {
      if (element === null) portsRef.current.delete(id);
      else portsRef.current.set(id, element);
      measure();
    },
    [measure],
  );

  // The sockets move whenever the layout reflows — a knob readout changing
  // width is enough — so the anchors are re-measured rather than cached once.
  useEffect(() => {
    measure();
    const element = boardRef.current;
    if (element === null) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const selectPort = useCallback(
    (id: PortId) => {
      const existing = connectionAt(connections, id);

      if (armed === null) {
        // A jack with a lead in it hands that lead back rather than starting a
        // second one: pulling a plug and moving it is the common gesture.
        if (existing !== null) {
          dispatch({ type: "patch/disconnect", port: id });
          const other = existing.from === id ? existing.to : existing.from;
          setArmed(PORTS[other].direction === "out" ? other : null);
          return;
        }
        setArmed(id);
        return;
      }

      if (armed === id) {
        setArmed(null);
        return;
      }

      const from = PORTS[armed].direction === "out" ? armed : id;
      const to = from === armed ? id : armed;
      if (canConnect(from, to)) {
        dispatch({ type: "patch/connect", from, to });
        setArmed(null);
        return;
      }
      // Not a legal pairing — treat the click as picking that jack up instead
      // of silently doing nothing.
      setArmed(id);
    },
    [armed, connections, dispatch],
  );

  // Escape drops the loose end, the same as clicking it again.
  useEffect(() => {
    if (armed === null) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setArmed(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [armed]);

  const api = useMemo<PatchBayApi>(
    () => ({
      registerPort,
      armed,
      selectPort,
      isPatched: (id) => connectionAt(connections, id) !== null,
      canLandOn: (id) => {
        if (armed === null || armed === id) return false;
        const from = PORTS[armed].direction === "out" ? armed : id;
        const to = from === armed ? id : armed;
        return canConnect(from, to);
      },
    }),
    [registerPort, armed, selectPort, connections],
  );

  const armedPoint = armed === null ? null : (points.get(armed) ?? null);

  return (
    <PatchBayContext.Provider value={api}>
      <div className="workbench" ref={boardRef}>
        {children}
        <div className="patch" aria-hidden="true">
          <svg
            className="patch__svg"
            width={board.width}
            height={board.height}
            viewBox={`0 0 ${board.width} ${board.height}`}
          >
            {connections.map((cable) => {
              const from = points.get(cable.from);
              const to = points.get(cable.to);
              if (from === undefined || to === undefined) return null;
              const path = cablePath(from, to);
              return (
                // Drawn twice: a dark core under a lighter highlight, so the
                // lead reads as round rubber rather than a flat stroke.
                <g key={`${cable.from}->${cable.to}`}>
                  <path className="patch__cable" d={path} />
                  <path className="patch__sheen" d={path} />
                </g>
              );
            })}
            {armedPoint !== null && (
              <path
                className="patch__cable patch__cable--loose"
                d={cablePath(armedPoint, {
                  x: armedPoint.x + DANGLE.x,
                  y: armedPoint.y + DANGLE.y,
                })}
              />
            )}
          </svg>
        </div>
      </div>
    </PatchBayContext.Provider>
  );
}
