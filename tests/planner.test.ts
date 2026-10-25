import { describe, expect, it } from 'vitest';
import samples from '../src/data/samples.json';
import { tonightPlan, windowAdvice } from '../src/engine/advice';
import { calibrate, modelError, type Reading } from '../src/engine/calibrate';
import { buildPlan, evaluateFixes, FIXES, FIX_IDS } from '../src/engine/fixes';
import { homePreset, type Home } from '../src/engine/home';
import { sampleToSeries, type SampleFile } from '../src/engine/samples';
import { simulate } from '../src/engine/simulate';
import { heatBurden, summarize } from '../src/engine/summary';

const file = samples as unknown as SampleFile;
const city = (id: string) => sampleToSeries(file.cities.find((c) => c.id === id)!);

describe('real weather samples', () => {
  it('has 14 cities with complete, plausible data', () => {
    expect(file.cities.length).toBe(14);
    for (const c of file.cities) {
      expect(c.temp.length).toBe(c.hours);
      expect(c.hours).toBe(c.spinupHours + 7 * 24);
      expect(Math.max(...c.temp)).toBeGreaterThan(30);
      expect(Math.max(...c.ghi)).toBeGreaterThan(600);
    }
  });

  it('simulates a real Chennai heatwave week quickly', () => {
    const w = city('chennai');
    const t0 = performance.now();
    const r = simulate(homePreset('independent'), w);
    const ms = performance.now() - t0;
    expect(r.hours).toBe(7 * 24);
    expect(ms).toBeLessThan(1500);
    const s = summarize(r);
    expect(s.days.length).toBe(7);
    expect(s.peak).toBeGreaterThan(30);
    expect(s.peak).toBeLessThan(50);
  });
});

describe('fix planner', () => {
  const w = city('madurai');
  const hut: Home = homePreset('hut');

  it('evaluates every applicable fix and ranks free, helpful ones first', () => {
    const ev = evaluateFixes(hut, w);
    expect(ev.results.length).toBe(FIX_IDS.filter((id) => FIXES[id].applies(hut)).length);
    const cool = ev.results.find((r) => r.id === 'coolRoof')!;
    expect(cool.peakDrop).toBeGreaterThan(1);
    expect(cool.relief).toBeGreaterThan(0);
    // Ranking: helpful free fixes never come after paid ones.
    const helpful = ev.results.filter((r) => r.relief > 0.5);
    const firstPaid = helpful.findIndex((r) => r.cost.typical > 0);
    const lastFree = helpful.map((r) => r.cost.typical === 0).lastIndexOf(true);
    if (firstPaid >= 0 && lastFree >= 0) expect(lastFree).toBeLessThan(firstPaid);
  });

  it('builds a plan that keeps reducing heat and respects the budget', () => {
    const plan = buildPlan(hut, w, { budget: 15000 });
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.totalCost.typical).toBeLessThanOrEqual(15000);
    let prev = heatBurden(plan.base);
    for (const s of plan.steps) {
      expect(heatBurden(s.summary)).toBeLessThan(prev);
      prev = heatBurden(s.summary);
    }
    expect(plan.final.peak).toBeLessThan(plan.base.peak);
  });

  it('smart window use beats keeping windows open only in the day', () => {
    const home = { ...homePreset('independent'), windowHabit: 'dayOpen' as const };
    const adv = windowAdvice(home, w);
    expect(adv.nightGain).toBeGreaterThan(0.3);
    expect(adv.segments.length).toBeGreaterThan(4);
  });
});

describe('calibration', () => {
  it('recovers a hidden house from noisy thermometer readings', () => {
    const w = city('chennai');
    const base = homePreset('independent');
    const truth: Home = {
      ...base,
      calibration: { roofAbsorptanceScale: 1.25, ventilationScale: 0.5, gainsScale: 1.5, massScale: 1, rmseBefore: 0, rmseAfter: 0, readings: 0, fittedAt: '' },
    };
    const r = simulate(truth, w);
    // A reading every 3 hours for 5 days, with ±0.3 °C deterministic "noise".
    const readings: Reading[] = [];
    for (let k = 24; k < 24 * 6; k += 3) readings.push({ utcMs: r.startUtc + k * 3_600_000, tempC: r.air[k] + 0.3 * Math.sin(k * 1.7) });
    const before = modelError(base, w, readings);
    const cal = calibrate(base, w, readings);
    expect(cal.rmseAfter).toBeLessThan(before);
    expect(cal.rmseAfter).toBeLessThan(0.6);
  });
});

describe('tonight’s window plan', () => {
  const seg = (from: number, to: number, open = true) => ({ from, to, open });
  it('gives the evening’s open hours as they are', () => {
    expect(tonightPlan([seg(0, 10, false), seg(10, 19, false), seg(19, 30), seg(30, 168, false)], 168)).toEqual({
      kind: 'open', from: 19, to: 30, dayAndNight: false,
    });
  });
  it('does not invent a start time when the windows were already open when the week began', () => {
    expect(tonightPlan([seg(0, 34), seg(34, 168, false)], 168)).toEqual({ kind: 'open', from: null, to: 34, dayAndNight: true });
  });
  it('does not invent an end time when the windows stay open to the end of the week', () => {
    expect(tonightPlan([seg(0, 14, false), seg(14, 168)], 168)).toEqual({ kind: 'open', from: 14, to: null, dayAndNight: true });
    expect(tonightPlan([seg(0, 168)], 168)).toEqual({ kind: 'open', from: null, to: null, dayAndNight: true });
  });
  it('says shut when no open stretch covers the night', () => {
    expect(tonightPlan([seg(0, 168, false)], 168)).toEqual({ kind: 'shut' });
  });
  it('never gives a stretch longer than a day as a plain from–to', () => {
    for (const c of file.cities) {
      const a = windowAdvice(homePreset('independent', c.place), sampleToSeries(c));
      const p = tonightPlan(a.segments, a.smart.hours);
      if (p.kind === 'open' && !p.dayAndNight) {
        expect(p.from).not.toBeNull();
        expect(p.to).not.toBeNull();
        expect(p.to! - p.from!).toBeLessThan(24);
      }
    }
  });
});
