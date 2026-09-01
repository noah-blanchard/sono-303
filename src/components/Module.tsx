import type { ReactNode } from "react";
import type { PortId } from "../sequencer/types";
import { JackSocket } from "./JackSocket";

const SCREW_CORNERS = ["tl", "tr", "bl", "br"] as const;

export type ModuleProps = {
  /** Displayed brand, e.g. `SONO-DIST`. Also names the sockets to a reader. */
  name: string;
  /** Small line under the brand. Omitted on the instrument, which needs none. */
  subtitle?: string;
  /** Jacks on this module's edges. The patchbay does the rest. */
  ports?: PortId[];
  /** Extra class on the shell, for per-module width and state. */
  className?: string;
  /** Extra class on the faceplate itself. */
  panelClassName?: string;
  /**
   * Rendered inside the faceplate, above the children. Pass `null` for a module
   * that carries no brand plate — the instrument's zones are its own face.
   */
  header?: ReactNode;
  children: ReactNode;
};

/**
 * The chassis every device on the bench is built from.
 *
 * One place owns the shell, its screws, the faceplate and the jacks, so a new
 * module is a name, a list of ports and its own controls — nothing else. The
 * modules never learn that cables exist: they declare sockets, and `PatchBay`
 * measures and draws them.
 */
export function Module({
  name,
  subtitle,
  ports = [],
  className = "",
  panelClassName = "",
  header,
  children,
}: ModuleProps) {
  return (
    <div className={`panel-shell${className === "" ? "" : ` ${className}`}`}>
      {SCREW_CORNERS.map((corner) => (
        <span
          key={corner}
          className={`panel-shell__screw panel-shell__screw--${corner}`}
          aria-hidden="true"
        />
      ))}

      {ports.map((port) => (
        <JackSocket key={port} port={port} moduleName={name} />
      ))}

      <section
        className={`panel${panelClassName === "" ? "" : ` ${panelClassName}`}`}
        aria-label={`${name}${subtitle === undefined ? "" : ` ${subtitle}`}`}
      >
        {/* `undefined` means "use the default plate"; `null` means "no plate". */}
        {header === undefined ? (
          <header className="module-header">
            <h2 className="module-brand">{name}</h2>
            {subtitle !== undefined && (
              <p className="module-subtitle">{subtitle}</p>
            )}
          </header>
        ) : (
          header
        )}
        {children}
      </section>
    </div>
  );
}
