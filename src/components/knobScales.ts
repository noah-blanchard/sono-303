/** Value <-> 0..1 mappings and readout formatters shared by the knob controls. */

export type KnobScale = {
  toNormalized: (value: number) => number;
  fromNormalized: (normalized: number) => number;
};

/** Perceptually even mapping for frequency-like ranges. `min` must be > 0. */
export function logScale(min: number, max: number): KnobScale {
  const ratio = Math.log(max / min);
  return {
    toNormalized: (value) => Math.log(value / min) / ratio,
    fromNormalized: (normalized) => min * Math.exp(normalized * ratio),
  };
}

export function formatHz(value: number): string {
  return value >= 1000
    ? `${(value / 1000).toFixed(2)} kHz`
    : `${Math.round(value)} Hz`;
}

export function formatQ(value: number): string {
  return `${value.toFixed(1)} Q`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function formatSeconds(value: number): string {
  return `${value.toFixed(2)} s`;
}

export function formatDecibels(value: number): string {
  return `${value.toFixed(1)} dB`;
}

export function formatBpm(value: number): string {
  return `${Math.round(value)} BPM`;
}

export function roundTo(decimals: number): (value: number) => number {
  const factor = 10 ** decimals;
  return (value) => Math.round(value * factor) / factor;
}
