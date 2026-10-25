// Surface temperature colours: a semantic heat ramp (cool blue → pale → yellow →
// orange → red → deep maroon), always shown with its scale legend.
// No three.js here, so the main bundle stays small; House3D converts to THREE.Color.

export const HEAT_STOPS: [number, string][] = [
  [24, '#3f6fa6'],
  [31, '#9cc3d1'],
  [37, '#f1d36d'],
  [45, '#ec8a3a'],
  [55, '#cf3e2e'],
  [70, '#6e1a29'],
];

const rgb = HEAT_STOPS.map(([t, hex]) => [t, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)] as const);

/** sRGB colour (0..1 channels) for a surface temperature in °C. */
export function tempRgb(t: number): [number, number, number] {
  if (t <= rgb[0][0]) return [...rgb[0][1]] as [number, number, number];
  for (let i = 1; i < rgb.length; i++) {
    const [t1, c1] = rgb[i];
    const [t0, c0] = rgb[i - 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return [...rgb[rgb.length - 1][1]] as [number, number, number];
}

export function heatGradientCss(): string {
  const lo = HEAT_STOPS[0][0];
  const hi = HEAT_STOPS[HEAT_STOPS.length - 1][0];
  return `linear-gradient(to right, ${HEAT_STOPS.map(([t, c]) => `${c} ${(((t - lo) / (hi - lo)) * 100).toFixed(1)}%`).join(', ')})`;
}
