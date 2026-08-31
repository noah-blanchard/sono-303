import { useCallback, useEffect, useRef, useState } from "react";
import { useWavExport } from "../state/hooks";
import { SonoTapePanel } from "./SonoTapePanel";
import type { ExportStatus } from "./SonoTapePanel";

/**
 * Everything inside the drawer that can take focus, in DOM order. The handle is
 * included on purpose: it is the drawer's own close control, so Tab should
 * reach it rather than escaping to the bench behind the scrim.
 */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    // offsetParent is null for anything display:none or in a hidden subtree,
    // which is exactly the closed tray.
    (element) => element.offsetParent !== null,
  );
}

/**
 * SONO-TAPE lives in a drawer pulled out of the right-hand edge of the bench.
 *
 * A third unit standing on the workbench pushed the page into a scroll, and the
 * recorder is not something you look at while playing — you reach for it when
 * the phrase is finished. So it hides behind a drawer face and slides out over
 * a dimmed bench when pulled.
 *
 * The export lifecycle lives here rather than in the panel because the handle's
 * LED has to stay lit if the drawer is shut mid-render.
 */
export function SonoTapeDrawer() {
  const exportWav = useWavExport();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ExportStatus>("idle");

  const drawerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);

  const rendering = status === "rendering";

  const handleExport = useCallback(async (): Promise<void> => {
    setStatus("rendering");
    try {
      await exportWav();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }, [exportWav]);

  // Escape closes; Tab cycles inside the drawer instead of wandering onto the
  // bench, which is behind a scrim and cannot be clicked anyway.
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;

      const drawer = drawerRef.current;
      if (drawer === null) return;
      const stops = focusableIn(drawer);
      if (stops.length === 0) return;

      const first = stops[0];
      const last = stops[stops.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !drawer.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Focus lands on the first control when the drawer opens and returns to the
  // handle when it shuts, so the keyboard never loses its place.
  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    // Captured now rather than read in the cleanup: the handle node outlives
    // every open/close cycle, so this is the same element either way, and it
    // keeps the cleanup honest about which node it is restoring focus to.
    const handle = handleRef.current;
    if (drawer !== null) focusableIn(drawer)[0]?.focus();
    return () => handle?.focus();
  }, [open]);

  return (
    <>
      <div
        className={`tape-scrim${open ? " is-open" : ""}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div className={`tape-drawer${open ? " is-open" : ""}`} ref={drawerRef}>
        {/* Clips the tray while it is parked behind the handle, so a drawer
            hanging off the right edge can never widen the page. */}
        <div className="tape-drawer__clip">
          <div
            className="tape-drawer__tray"
            role="dialog"
            aria-label="SONO-TAPE wav recorder"
            inert={!open}
          >
            <SonoTapePanel
              status={status}
              onExport={() => {
                void handleExport();
              }}
            />
          </div>
        </div>

        <button
          type="button"
          ref={handleRef}
          className="tape-handle"
          aria-expanded={open}
          onClick={() => setOpen((wasOpen) => !wasOpen)}
        >
          <span className="tape-handle__grip" aria-hidden="true" />
          <span className="tape-handle__label">RECORD</span>
          {/* Stays lit through a render even with the drawer shut. */}
          <span
            className={`led led--small${rendering ? " is-on" : ""}`}
            aria-hidden="true"
          />
          <span className="visually-hidden">
            {open ? "Close the SONO-TAPE drawer" : "Open the SONO-TAPE drawer"}
          </span>
        </button>
      </div>
    </>
  );
}
