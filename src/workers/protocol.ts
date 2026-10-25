// Messages between the app and the engine worker.
import type { WindowSegment } from '../engine/advice';
import type { Reading } from '../engine/calibrate';
import type { FixEvaluation, FixId, Plan } from '../engine/fixes';
import type { Calibration, Home } from '../engine/home';
import type { SimResult } from '../engine/simulate';
import type { Summary } from '../engine/summary';
import type { WeatherSeries } from '../engine/weather';

export type EngineRequest =
  | { type: 'analyze'; home: Home; weather: WeatherSeries }
  | { type: 'fixes'; home: Home; weather: WeatherSeries; budget: number }
  | { type: 'compare'; home: Home; weather: WeatherSeries; fixes: FixId[] }
  | { type: 'calibrate'; home: Home; weather: WeatherSeries; readings: Reading[] }
  | { type: 'demoReadings'; home: Home; weather: WeatherSeries };

export interface Analysis {
  /** The home as the family uses it today. */
  habit: SimResult;
  habitSummary: Summary;
  /** The same home with windows used the smart way. */
  smart: SimResult;
  smartSummary: Summary;
  /** The same home with windows kept shut. */
  shut: SimResult;
  segments: WindowSegment[];
  nightGain: number;
  peakGain: number;
}

export interface FixesResult {
  evaluation: FixEvaluation;
  plan: Plan;
}

export interface Comparison {
  base: SimResult;
  planned: SimResult;
}

export type EngineResult = {
  analyze: Analysis;
  fixes: FixesResult;
  compare: Comparison;
  calibrate: Calibration;
  demoReadings: Reading[];
};

export type WorkerMessage =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { id: number; progress: number };
