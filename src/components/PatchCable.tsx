import { useCallback, useEffect, useState } from "react";
import type { PointerEvent, RefObject } from "react";

/** Pointer distance, in px, within which the plug snaps into the socket. */
const SNAP_RADIUS = 70;

/** Where the loose plug hangs when nothing is patched, relative to OUT. */
const REST_OFFSET = { x: 30, y: 62 };

type Point = { x: number; y: number };

type Anchors = { source: Point; target: Point; width: number; height: number };

function centerIn(element: Element, board: DOMRect): Point {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - board.left,
    y: rect.top + rect.height / 2 - board.top,
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export type PatchCableProps = {
  boardRef: RefObject<HTMLDivElement | null>;
  sourceRef: RefObject<HTMLButtonElement | null>;
  targetRef: RefObject<HTMLButtonElement | null>;
  patched: boolean;
  onPatchedChange: (patched: boolean) => void;
};

/**
 * The patch cable between the SONO-303 OUTPUT and the SONO-DIST INPUT.
 *
 * Purely presentational: it measures the two sockets, draws a sagging lead
 * between them, and dispatches exactly one thing — whether the cable is in.
 * Dragging the plug is the tactile route; the sockets themselves are buttons,
 * so click and keyboard work without touching this component at all.
 */
export function PatchCable({
  boardRef,
  sourceRef,
  targetRef,
  patched,
  onPatchedChange,
}: PatchCableProps) {
  const [anchors, setAnchors] = useState<Anchors | null>(null);
  const [dragPoint, setDragPoint] = useState<Point | null>(null);

  const measure = useCallback(() => {
    const board = boardRef.current;
    const source = sourceRef.current;
    const target = targetRef.current;
    if (!board || !source || !target) return;

    const rect = board.getBoundingClientRect();
    setAnchors({
      source: centerIn(source, rect),
      target: centerIn(target, rect),
      width: rect.width,
      height: rect.height,
    });
  }, [boardRef, sourceRef, targetRef]);

  // The sockets move whenever the layout reflows — a knob readout changing
  // width is enough — so the anchors are re-measured rather than cached once.
  useEffect(() => {
    measure();
    const board = boardRef.current;
    if (!board) return;

    const observer = new ResizeObserver(measure);
    observer.observe(board);
    if (sourceRef.current) observer.observe(sourceRef.current);
    if (targetRef.current) observer.observe(targetRef.current);
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, boardRef, sourceRef, targetRef]);

  if (!anchors) return null;

  const rest = {
    x: anchors.source.x + REST_OFFSET.x,
    y: anchors.source.y + REST_OFFSET.y,
  };
  const freeEnd = dragPoint ?? (patched ? anchors.target : rest);
  const span = distance(anchors.source, freeEnd);
  // A hanging lead, not a taut wire: the sag grows with the span.
  const sag = Math.max(26, span * 0.2);
  const path = `M ${anchors.source.x} ${anchors.source.y} Q ${
    (anchors.source.x + freeEnd.x) / 2
  } ${(anchors.source.y + freeEnd.y) / 2 + sag} ${freeEnd.x} ${freeEnd.y}`;

  function pointFromEvent(event: PointerEvent<HTMLButtonElement>): Point {
    const board = boardRef.current;
    if (!board) return { x: 0, y: 0 };
    const rect = board.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragPoint(pointFromEvent(event));
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>): void {
    if (dragPoint === null) return;
    setDragPoint(pointFromEvent(event));
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>): void {
    if (dragPoint === null) return;
    const released = pointFromEvent(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragPoint(null);
    // Released on the socket: plugged. Released anywhere else: unplugged.
    const landed = anchors !== null && distance(released, anchors.target) <= SNAP_RADIUS;
    if (landed !== patched) onPatchedChange(landed);
  }

  const dragging = dragPoint !== null;

  return (
    <div className="patch" aria-hidden="true">
      <svg
        className="patch__svg"
        width={anchors.width}
        height={anchors.height}
        viewBox={`0 0 ${anchors.width} ${anchors.height}`}
      >
        {/* Drawn twice: a dark core under a lighter highlight, so the lead
            reads as a round rubber cable rather than a flat stroke. */}
        <path className="patch__cable" d={path} />
        <path className="patch__sheen" d={path} />
      </svg>
      <button
        type="button"
        tabIndex={-1}
        className={`patch__plug${dragging ? " is-dragging" : ""}${patched ? " is-seated" : ""}`}
        style={{ transform: `translate(${freeEnd.x}px, ${freeEnd.y}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <span className="patch__plug-tip" />
      </button>
    </div>
  );
}
