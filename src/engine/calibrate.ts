// Calibrating the twin against real thermometer readings.
//
// Four correction factors (roof sun absorption, ventilation, internal heat,
// thermal mass) are fitted by minimising the root-mean-square error between the
// model's indoor air temperature and the readings, with the Nelder–Mead simplex
// method. Corrections are kept within physically sensible bounds.

import type { Calibration, Home } from './home';
import { simulate } from './simulate';
import type { WeatherSeries } from './weather';

export interface Reading {
  utcMs: number;
  tempC: number;
}

const BOUNDS: [number, number][] = [
  [0.5, 1.4], // roof absorptance
  [0.3, 3.0], // ventilation
  [0.0, 3.0], // internal gains
  [0.5, 2.0], // thermal mass
];

function clampParams(p: number[]): number[] {
  return p.map((v, i) => Math.min(BOUNDS[i][1], Math.max(BOUNDS[i][0], v)));
}

function withParams(home: Home, p: number[]): Home {
  return {
    ...home,
    calibration: {
      roofAbsorptanceScale: p[0],
      ventilationScale: p[1],
      gainsScale: p[2],
      massScale: p[3],
      rmseBefore: 0,
      rmseAfter: 0,
      readings: 0,
      fittedAt: '',
    },
  };
}

/** RMSE (°C) of the model's indoor air temperature against the readings. */
export function modelError(home: Home, w: WeatherSeries, readings: Reading[]): number {
  const r = simulate(home, w, { stepSeconds: 900 });
  let se = 0;
  let n = 0;
  for (const rd of readings) {
    const f = (rd.utcMs - r.startUtc) / 3_600_000;
    if (f < 0 || f > r.hours - 1) continue;
    const i = Math.floor(f);
    const frac = f - i;
    const v = i + 1 < r.hours ? r.air[i] * (1 - frac) + r.air[i + 1] * frac : r.air[i];
    se += (v - rd.tempC) ** 2;
    n++;
  }
  return n === 0 ? NaN : Math.sqrt(se / n);
}

/** Nelder–Mead minimisation (standard coefficients). */
export function nelderMead(f: (x: number[]) => number, x0: number[], step: number[], maxIter = 120, tol = 1e-3): { x: number[]; fx: number } {
  const n = x0.length;
  let simplex = [x0, ...x0.map((_, i) => x0.map((v, j) => (i === j ? v + step[j] : v)))];
  let values = simplex.map(f);
  for (let it = 0; it < maxIter; it++) {
    const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
    simplex = order.map((i) => simplex[i]);
    values = order.map((i) => values[i]);
    if (Math.abs(values[n] - values[0]) < tol) break;
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i][j] / n;
    const worst = simplex[n];
    const along = (c: number) => centroid.map((v, j) => v + c * (v - worst[j]));
    const xr = along(1);
    const fr = f(xr);
    if (fr < values[0]) {
      const xe = along(2);
      const fe = f(xe);
      if (fe < fr) {
        simplex[n] = xe;
        values[n] = fe;
      } else {
        simplex[n] = xr;
        values[n] = fr;
      }
    } else if (fr < values[n - 1]) {
      simplex[n] = xr;
      values[n] = fr;
    } else {
      const xc = fr < values[n] ? along(0.5) : along(-0.5);
      const fc = f(xc);
      if (fc < Math.min(fr, values[n])) {
        simplex[n] = xc;
        values[n] = fc;
      } else {
        // Shrink towards the best point.
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
          values[i] = f(simplex[i]);
        }
      }
    }
  }
  const best = values.indexOf(Math.min(...values));
  return { x: simplex[best], fx: values[best] };
}

export function calibrate(home: Home, w: WeatherSeries, readings: Reading[], onProgress?: (iteration: number) => void): Calibration {
  const start = { ...home, calibration: undefined };
  const before = modelError(start, w, readings);
  let calls = 0;
  const objective = (x: number[]) => {
    calls++;
    if (onProgress && calls % 5 === 0) onProgress(calls);
    const p = clampParams(x);
    // Penalise leaving the bounds so the simplex comes back inside.
    const outside = x.reduce((s, v, i) => s + Math.max(0, BOUNDS[i][0] - v) + Math.max(0, v - BOUNDS[i][1]), 0);
    return modelError(withParams(start, p), w, readings) + 10 * outside;
  };
  const { x } = nelderMead(objective, [1, 1, 1, 1], [0.2, 0.5, 0.5, 0.3], 90);
  const p = clampParams(x);
  const after = modelError(withParams(start, p), w, readings);
  // Only keep the correction if it actually helps.
  const useful = after < before - 0.05;
  return {
    roofAbsorptanceScale: useful ? p[0] : 1,
    ventilationScale: useful ? p[1] : 1,
    gainsScale: useful ? p[2] : 1,
    massScale: useful ? p[3] : 1,
    rmseBefore: before,
    rmseAfter: useful ? after : before,
    readings: readings.length,
    fittedAt: new Date().toISOString(),
  };
}
