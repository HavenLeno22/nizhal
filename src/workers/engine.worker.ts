/// <reference lib="webworker" />
// Runs the physics off the main thread so the interface never stutters.

import { windowAdvice } from '../engine/advice';
import { calibrate, type Reading } from '../engine/calibrate';
import { applyFixes, buildPlan, evaluateFixes } from '../engine/fixes';
import type { Home } from '../engine/home';
import { simulate } from '../engine/simulate';
import { sliceSeries, type WeatherSeries } from '../engine/weather';
import type { Analysis, Comparison, EngineRequest, FixesResult, WorkerMessage } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

function post(msg: WorkerMessage): void {
  self.postMessage(msg);
}

/** Trim recent weather to the readings' span plus three days of warm-up. */
function trimForReadings(w: WeatherSeries, readings: Reading[]): WeatherSeries {
  const first = Math.min(...readings.map((r) => r.utcMs));
  const last = Math.max(...readings.map((r) => r.utcMs));
  const from = Math.max(0, Math.floor((first - w.startUtc) / 3_600_000) - 72);
  const to = Math.min(w.hours, Math.ceil((last - w.startUtc) / 3_600_000) + 2);
  const spin = Math.min(72, Math.max(0, Math.floor((first - w.startUtc) / 3_600_000) - from));
  return sliceSeries(w, from, to, spin);
}

function demoReadings(home: Home, w: WeatherSeries): Reading[] {
  // A "true" home that differs from the description: the readings are generated, not measured.
  const truth: Home = {
    ...home,
    calibration: { roofAbsorptanceScale: 1.15, ventilationScale: 0.7, gainsScale: 1.4, massScale: 1, rmseBefore: 0, rmseAfter: 0, readings: 0, fittedAt: '' },
  };
  const r = simulate(truth, w);
  const out: Reading[] = [];
  // The last five days before now.
  const nowIdx = Math.min(r.hours, Math.floor((Date.now() - r.startUtc) / 3_600_000));
  const start = Math.max(0, nowIdx - 5 * 24);
  const now = Date.now();
  for (let k = start; k < r.hours; k++) {
    // Only the past: a thermometer can't have read a future hour.
    if (r.startUtc + k * 3_600_000 > now) break;
    const localHour = new Date(r.startUtc + k * 3_600_000 + r.utcOffset * 1000).getUTCHours();
    if (localHour === 7 || localHour === 13 || localHour === 16 || localHour === 21) {
      const noise = 0.3 * Math.sin(k * 2.3);
      out.push({ utcMs: r.startUtc + k * 3_600_000, tempC: Math.round((r.air[k] + noise) * 10) / 10 });
    }
  }
  return out;
}

self.onmessage = (e: MessageEvent<{ id: number; req: EngineRequest }>) => {
  const { id, req } = e.data;
  try {
    let result: unknown;
    switch (req.type) {
      case 'analyze': {
        const adv = windowAdvice(req.home, req.weather);
        const shut = simulate(req.home, req.weather, { windowHabit: 'alwaysClosed' });
        const a: Analysis = {
          habit: adv.habit,
          habitSummary: adv.habitSummary,
          smart: adv.smart,
          smartSummary: adv.smartSummary,
          shut,
          segments: adv.segments,
          nightGain: adv.nightGain,
          peakGain: adv.peakGain,
        };
        result = a;
        break;
      }
      case 'fixes': {
        const evaluation = evaluateFixes(req.home, req.weather, (done, total) => post({ id, progress: done / (total + 2) }));
        const plan = buildPlan(req.home, req.weather, { budget: req.budget < 0 ? Infinity : req.budget });
        const r: FixesResult = { evaluation, plan };
        result = r;
        break;
      }
      case 'compare': {
        const c: Comparison = {
          base: simulate(req.home, req.weather),
          planned: simulate(applyFixes(req.home, req.fixes), req.weather),
        };
        result = c;
        break;
      }
      case 'calibrate': {
        const w = trimForReadings(req.weather, req.readings);
        result = calibrate(req.home, w, req.readings, (n) => post({ id, progress: Math.min(0.95, n / 160) }));
        break;
      }
      case 'demoReadings':
        result = demoReadings(req.home, req.weather);
        break;
    }
    post({ id, ok: true, result });
  } catch (err) {
    post({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
