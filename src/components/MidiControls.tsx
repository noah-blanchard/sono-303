import { useMidi } from "../state/hooks";

const ALL_INPUTS = "all";

/**
 * MIDI input: a permission button, then a device picker.
 *
 * Access is requested from this button rather than on load, so the browser's
 * permission prompt only ever appears for someone who actually has a
 * controller to plug in. The LED blinks on every incoming note, which is the
 * one unambiguous sign the device is reaching the instrument.
 */
export function MidiControls() {
  const { status, devices, selectedId, activity, enable, select } = useMidi();

  return (
    <div className="control-group control-group--midi">
      <span className="control-label" id="midi-label">
        MIDI
      </span>

      {status === "granted" ? (
        <>
          <span
            className={`led led--small${activity ? " is-on" : ""}`}
            aria-hidden="true"
          />
          <select
            className="midi-select"
            aria-labelledby="midi-label"
            value={selectedId ?? ALL_INPUTS}
            onChange={(event) =>
              select(
                event.target.value === ALL_INPUTS ? null : event.target.value,
              )
            }
          >
            <option value={ALL_INPUTS}>
              {devices.length === 0 ? "No devices" : "All inputs"}
            </option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <button
          type="button"
          className="panel-button panel-button--wide"
          aria-labelledby="midi-label"
          disabled={status === "unsupported" || status === "requesting"}
          title={
            status === "unsupported"
              ? "This browser has no Web MIDI support"
              : undefined
          }
          onClick={enable}
        >
          {status === "unsupported"
            ? "N/A"
            : status === "requesting"
              ? "…"
              : status === "denied"
                ? "BLOCKED"
                : "ENABLE"}
        </button>
      )}
    </div>
  );
}
