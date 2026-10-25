// Turning an hourly simulation into the numbers a family cares about.

import { HEAT_LEVELS } from './comfort';
import type { SimResult } from './simulate';

/** IMD orange and above: high heat stress. */
export const DANGER_HI = HEAT_LEVELS.find((l) => l.level === 'orange')!.from;
/** IMD yellow: take care. */
export const CAUTION_HI = HEAT_LEVELS.find((l) => l.level === 'yellow')!.from;
/** IMD red: extreme. */
export const EXTREME_HI = HEAT_LEVELS.find((l) => l.level === 'red')!.from;

export function hourOfDay(r: Pick<SimResult, 'startUtc' | 'utcOffset'>, k: number): number {
  return new Date(r.startUtc + k * 3_600_000 + r.utcOffset * 1000).getUTCHours();
}

export function dayKey(r: Pick<SimResult, 'startUtc' | 'utcOffset'>, k: number): string {
  return new Date(r.startUtc + k * 3_600_000 + r.utcOffset * 1000).toISOString().slice(0, 10);
}

export function isNightHour(h: number): boolean {
  return h >= 22 || h < 6;
}

export interface DayStat {
  date: string;
  outMax: number;
  outMin: number;
  inMax: number;
  inMaxHour: number;
  inMin: number;
  feelsMax: number;
  hiMax: number;
  dangerHours: number;
  cautionHours: number;
  hotHours: number;
  /** Mean "feels like" from 22:00 to 06:00 starting this evening, or null if the night isn't in the data. */
  nightFeels: number | null;
  hotNight: boolean;
}

export interface Summary {
  hours: number;
  peak: number;
  peakIndex: number;
  outdoorPeak: number;
  outdoorPeakIndex: number;
  meanDailyMax: number;
  meanIndoor: number;
  /** Hours at IMD orange or red (heat index ≥ 45 °C). */
  dangerHours: number;
  /** Hours at IMD red (heat index ≥ 55 °C). */
  extremeHours: number;
  /** Hours at IMD yellow (35–45 °C). */
  cautionHours: number;
  hotHours: number;
  hotNights: number;
  nights: number;
  /** Hours when it is hotter inside than outside. */
  hotterInsideHours: number;
  comfortUpper: number;
  days: DayStat[];
}

export function summarize(r: SimResult): Summary {
  const upper = r.comfort.upper;
  const days: DayStat[] = [];
  const byDay = new Map<string, number[]>();
  for (let k = 0; k < r.hours; k++) {
    const key = dayKey(r, k);
    const list = byDay.get(key);
    if (list) list.push(k);
    else byDay.set(key, [k]);
  }
  let peak = -Infinity;
  let peakIndex = 0;
  let outdoorPeak = -Infinity;
  let outdoorPeakIndex = 0;
  let danger = 0;
  let extreme = 0;
  let caution = 0;
  let hot = 0;
  let hotterInside = 0;
  let sum = 0;
  for (let k = 0; k < r.hours; k++) {
    const op = r.operative[k];
    sum += op;
    if (op > peak) {
      peak = op;
      peakIndex = k;
    }
    if (r.outdoor[k] > outdoorPeak) {
      outdoorPeak = r.outdoor[k];
      outdoorPeakIndex = k;
    }
    const hi = r.heatIndex[k];
    if (hi >= DANGER_HI) danger++;
    else if (hi >= CAUTION_HI) caution++;
    if (hi >= EXTREME_HI) extreme++;
    if (r.feels[k] > upper) hot++;
    if (op > r.outdoor[k] + 0.5) hotterInside++;
  }

  const keys = [...byDay.keys()];
  keys.forEach((key, d) => {
    const ks = byDay.get(key)!;
    if (ks.length < 20) return; // skip partial days
    let outMax = -Infinity;
    let outMin = Infinity;
    let inMax = -Infinity;
    let inMaxHour = 0;
    let inMin = Infinity;
    let feelsMax = -Infinity;
    let hiMax = -Infinity;
    let dh = 0;
    let ch = 0;
    let hh = 0;
    for (const k of ks) {
      outMax = Math.max(outMax, r.outdoor[k]);
      outMin = Math.min(outMin, r.outdoor[k]);
      if (r.operative[k] > inMax) {
        inMax = r.operative[k];
        inMaxHour = hourOfDay(r, k);
      }
      inMin = Math.min(inMin, r.operative[k]);
      feelsMax = Math.max(feelsMax, r.feels[k]);
      hiMax = Math.max(hiMax, r.heatIndex[k]);
      if (r.heatIndex[k] >= DANGER_HI) dh++;
      else if (r.heatIndex[k] >= CAUTION_HI) ch++;
      if (r.feels[k] > upper) hh++;
    }
    // The night that starts this evening: 22:00 today to 06:00 tomorrow.
    const night: number[] = [];
    for (const k of ks) if (hourOfDay(r, k) >= 22) night.push(k);
    const next = keys[d + 1] ? byDay.get(keys[d + 1])! : [];
    for (const k of next) if (hourOfDay(r, k) < 6) night.push(k);
    const nightFeels = night.length >= 6 ? night.reduce((s, k) => s + r.feels[k], 0) / night.length : null;
    days.push({
      date: key,
      outMax,
      outMin,
      inMax,
      inMaxHour,
      inMin,
      feelsMax,
      hiMax,
      dangerHours: dh,
      cautionHours: ch,
      hotHours: hh,
      nightFeels,
      hotNight: nightFeels !== null && nightFeels > upper,
    });
  });

  const nights = days.filter((d) => d.nightFeels !== null).length;
  return {
    hours: r.hours,
    peak,
    peakIndex,
    outdoorPeak,
    outdoorPeakIndex,
    meanDailyMax: days.length ? days.reduce((s, d) => s + d.inMax, 0) / days.length : peak,
    meanIndoor: sum / Math.max(1, r.hours),
    dangerHours: danger,
    extremeHours: extreme,
    cautionHours: caution,
    hotHours: hot,
    hotNights: days.filter((d) => d.hotNight).length,
    nights,
    hotterInsideHours: hotterInside,
    comfortUpper: upper,
    days,
  };
}

/**
 * One number for "how bad is it": every uncomfortable hour counts 1, an IMD
 * orange hour counts 3 more, a red hour 3 more again, and a night too hot to
 * sleep counts like 4 extra hours.
 */
export function heatBurden(s: Summary): number {
  return s.hotHours + 3 * s.dangerHours + 3 * s.extremeHours + 4 * s.hotNights;
}
