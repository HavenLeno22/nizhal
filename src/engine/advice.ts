// Practical advice from the twin: when to open the windows, when the home is at
// its worst, and how much smarter window use alone would help.

import type { Home } from './home';
import { simulate, type SimResult } from './simulate';
import { hourOfDay, summarize, type Summary } from './summary';
import type { WeatherSeries } from './weather';

export interface WindowSegment {
  /** Hour index (into the result) where this segment starts, and where it ends (exclusive). */
  from: number;
  to: number;
  open: boolean;
}

/** Collapses an hourly open/closed series into segments. */
export function segments(open: Uint8Array): WindowSegment[] {
  const out: WindowSegment[] = [];
  let start = 0;
  for (let k = 1; k <= open.length; k++) {
    if (k === open.length || open[k] !== open[start]) {
      out.push({ from: start, to: k, open: open[start] === 1 });
      start = k;
    }
  }
  return out;
}

export interface WindowAdvice {
  smart: SimResult;
  smartSummary: Summary;
  habit: SimResult;
  habitSummary: Summary;
  segments: WindowSegment[];
  /** How much cooler the smart plan is at 3 am, on average, °C. */
  nightGain: number;
  /** How much cooler the smart plan is at the daily peak, on average, °C. */
  peakGain: number;
}

export function windowAdvice(home: Home, w: WeatherSeries): WindowAdvice {
  const smart = simulate(home, w, { windowHabit: 'smart' });
  const habit = home.windowHabit === 'smart' ? smart : simulate(home, w);
  const smartSummary = summarize(smart);
  const habitSummary = home.windowHabit === 'smart' ? smartSummary : summarize(habit);
  let nightSum = 0;
  let nightN = 0;
  for (let k = 0; k < smart.hours; k++) {
    if (hourOfDay(smart, k) === 3) {
      nightSum += habit.operative[k] - smart.operative[k];
      nightN++;
    }
  }
  return {
    smart,
    smartSummary,
    habit,
    habitSummary,
    segments: segments(smart.windowsOpen),
    nightGain: nightN ? nightSum / nightN : 0,
    peakGain: habitSummary.meanDailyMax - smartSummary.meanDailyMax,
  };
}

export type TonightPlan =
  | { kind: 'shut' }
  /** `from` is null when the windows were already open as the week began, `to` when they stay
   * open to its end: the data says nothing about those times, so none is shown. */
  | { kind: 'open'; from: number | null; to: number | null; dayAndNight: boolean };

/** The first night's plan: the smart plan's open stretch that covers 10 pm (or, failing that,
 * 2 am). A stretch can last for days when it stays cooler outside than inside, so it is not
 * always a plain "from 7 pm to 6 am". */
export function tonightPlan(segs: WindowSegment[], hours: number): TonightPlan {
  const covers = (k: number) => segs.find((g) => g.open && g.from <= k && k < g.to);
  const seg = covers(22) ?? covers(26);
  if (!seg) return { kind: 'shut' };
  return {
    kind: 'open',
    from: seg.from > 0 ? seg.from : null,
    to: seg.to < hours ? seg.to : null,
    dayAndNight: seg.to - seg.from >= 24,
  };
}

/** The hours of a given day when it is hotter indoors than outdoors (go to the shade outside, or a cooler room). */
export function hotterInsideRanges(r: SimResult, dayStart: number): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let start = -1;
  for (let k = dayStart; k < Math.min(r.hours, dayStart + 24); k++) {
    const hot = r.operative[k] > r.outdoor[k] + 1;
    if (hot && start < 0) start = k;
    if (!hot && start >= 0) {
      out.push({ from: start, to: k });
      start = -1;
    }
  }
  if (start >= 0) out.push({ from: start, to: Math.min(r.hours, dayStart + 24) });
  return out;
}
