import { describe, expect, it } from 'vitest';
import { heatIndex, imacBand } from '../src/engine/comfort';
import { defaultHome, homePreset, type Home } from '../src/engine/home';
import { roofConstruction, uValue, wallConstruction } from '../src/engine/materials';
import { FLOW_KEYS, simulate, type SimResult } from '../src/engine/simulate';
import { irradianceOn, sunPosition } from '../src/engine/solar';
import { syntheticWeather } from '../src/engine/synthetic';

const max = (a: Float32Array) => a.reduce((m, v) => Math.max(m, v), -Infinity);
const min = (a: Float32Array) => a.reduce((m, v) => Math.min(m, v), Infinity);
const argmax = (a: Float32Array) => a.indexOf(max(a));
/** Last day of a result (the model has settled by then). */
const lastDay = (a: Float32Array) => a.subarray(a.length - 24);

describe('sun', () => {
  it('is overhead at noon on the equator at the equinox', () => {
    // 2026-03-20 ~12:07 local solar noon at longitude 0.
    const p = sunPosition(Date.parse('2026-03-20T12:07:00Z'), 0, 0);
    expect(p.zenith).toBeLessThan(1);
  });

  it('is north of overhead at noon in Chennai in June (it crosses the zenith twice a year there)', () => {
    // Chennai 80.27°E: local solar noon ≈ 06:40 UTC. Declination ≈ +23.4°, latitude 13.08°.
    const p = sunPosition(Date.parse('2026-06-21T06:40:00Z'), 13.08, 80.27);
    expect(p.zenith).toBeGreaterThan(9.5);
    expect(p.zenith).toBeLessThan(11.5);
    expect(p.azimuth < 30 || p.azimuth > 330).toBe(true);
  });

  it('rises in the east and sets in the west', () => {
    const morning = sunPosition(Date.parse('2026-04-10T01:30:00Z'), 13.08, 80.27); // 07:00 IST
    const evening = sunPosition(Date.parse('2026-04-10T12:30:00Z'), 13.08, 80.27); // 18:00 IST
    expect(morning.azimuth).toBeGreaterThan(60);
    expect(morning.azimuth).toBeLessThan(120);
    expect(evening.azimuth).toBeGreaterThan(240);
    expect(evening.azimuth).toBeLessThan(300);
  });

  it('puts no direct sun on a wall facing away from the sun', () => {
    const sky = { ghi: 800, dni: 700, dhi: 100, zenith: 40, azimuth: 90 };
    const east = irradianceOn(sky, 90, 90);
    const west = irradianceOn(sky, 90, 270);
    expect(east).toBeGreaterThan(500);
    expect(west).toBeLessThan(100 * 0.5 + 800 * 0.2 * 0.5 + 1);
  });
});

describe('materials', () => {
  it('gives textbook U-values for common Indian build-ups', () => {
    // 230 mm brick with plaster: about 2.0–2.3 W/m²K. 120 mm RCC roof: about 3.5–4.0.
    expect(uValue(wallConstruction('brick230', null))).toBeGreaterThan(1.9);
    expect(uValue(wallConstruction('brick230', null))).toBeLessThan(2.4);
    expect(uValue(roofConstruction('rcc', null), true)).toBeGreaterThan(3.4);
    expect(uValue(roofConstruction('rcc', null), true)).toBeLessThan(4.6);
    // A bare metal sheet is all surface resistance: about 7 W/m²K.
    expect(uValue(roofConstruction('tin', null), true)).toBeGreaterThan(6.5);
  });
});

describe('comfort', () => {
  it('matches the NWS heat index table', () => {
    // NWS chart: 90 °F at 50% RH → 95 °F; 100 °F at 40% → 109 °F; 86 °F at 85% → 102 °F.
    expect(heatIndex(32.22, 50) * 1.8 + 32).toBeCloseTo(95, 0);
    expect(heatIndex(37.78, 40) * 1.8 + 32).toBeCloseTo(109, -0.5);
    expect(heatIndex(30, 85) * 1.8 + 32).toBeGreaterThan(99);
  });

  it('uses the IMAC equation for naturally ventilated buildings', () => {
    const b = imacBand(30);
    expect(b.neutral).toBeCloseTo(0.54 * 30 + 12.83, 6);
    expect(b.upper - b.neutral).toBeCloseTo(2.38, 6);
  });
});

function quiet(h: Home): Home {
  return { ...h, people: 0, cookingInside: false, fan: false, calibration: { roofAbsorptanceScale: 1, ventilationScale: 1, gainsScale: 0, massScale: 1, rmseBefore: 0, rmseAfter: 0, readings: 0, fittedAt: '' } };
}

describe('thermal model', () => {
  it('settles to outdoor temperature with no sun, no people and no sky cooling', () => {
    const w = syntheticWeather({ tMin: 30, tMax: 30, sun: 0, dewPoint: 29.5, cloud: 100, days: 6, spinupDays: 4 });
    const r = simulate(quiet(defaultHome()), w);
    const end = r.air[r.hours - 1];
    // Overcast night sky is only slightly colder than the air, so indoors ends a touch below 30 °C.
    expect(end).toBeGreaterThan(29.0);
    expect(end).toBeLessThan(30.2);
  });

  it('conserves energy: heat paths into the room add up to what the room stores', () => {
    const w = syntheticWeather({ tMin: 31, tMax: 31, sun: 0, dewPoint: 30.5, cloud: 100, days: 3, spinupDays: 10 });
    const r = simulate(defaultHome(), w, { windowHabit: 'alwaysClosed' });
    // At steady state (constant weather, after 10 days) storage is ~0, so paths sum to ~0.
    const k = r.hours - 1;
    let sum = 0;
    let scale = 0;
    for (const key of FLOW_KEYS) {
      sum += r.flows[key][k];
      scale += Math.abs(r.flows[key][k]);
    }
    expect(Math.abs(sum)).toBeLessThan(0.05 * scale + 5);
  });

  it('gives the same answer with a finer time step', () => {
    const w = syntheticWeather({ days: 3 });
    const home = homePreset('hut');
    const a = simulate(home, w, { stepSeconds: 600 });
    const b = simulate(home, w, { stepSeconds: 120 });
    for (let k = 0; k < a.hours; k++) expect(Math.abs(a.operative[k] - b.operative[k])).toBeLessThan(0.4);
  });

  const hot = syntheticWeather({ tMin: 29, tMax: 38, dewPoint: 22, days: 4 });
  const run = (patch: Partial<Home>, base: Home = homePreset('independent')): SimResult => simulate({ ...base, ...patch }, hot);

  it('a tin roof makes the home hotter than outdoors in the afternoon', () => {
    const r = run({ roof: 'tin', windowHabit: 'alwaysClosed' });
    expect(max(lastDay(r.operative))).toBeGreaterThan(max(lastDay(r.outdoor)));
  });

  it('heavy concrete delays the indoor peak compared with a tin roof', () => {
    const tin = run({ roof: 'tin', windowHabit: 'alwaysClosed' });
    const rcc = run({ roof: 'rcc', windowHabit: 'alwaysClosed' });
    const peakTin = argmax(lastDay(tin.operative));
    const peakRcc = argmax(lastDay(rcc.operative));
    expect(peakRcc).toBeGreaterThan(peakTin);
    // And the concrete roof is still radiating heat late at night.
    expect(lastDay(rcc.roofInner)[23]).toBeGreaterThan(lastDay(tin.roofInner)[23]);
  });

  it('a white cool roof, insulation and a shade net each lower the peak', () => {
    const base = run({ roof: 'rcc', windowHabit: 'alwaysClosed' });
    const peak = max(lastDay(base.operative));
    const cool = max(lastDay(run({ roof: 'rcc', roofFinish: 'coolWhite', windowHabit: 'alwaysClosed' }).operative));
    const ins = max(lastDay(run({ roof: 'rcc', roofInsulation: 'puf50', windowHabit: 'alwaysClosed' }).operative));
    const net = max(lastDay(run({ roof: 'rcc', roofShade: 0.75, windowHabit: 'alwaysClosed' }).operative));
    expect(cool).toBeLessThan(peak - 0.5);
    expect(ins).toBeLessThan(peak - 0.5);
    expect(net).toBeLessThan(peak - 0.5);
  });

  it('a cool roof helps a tin-roof home by a margin in line with field studies', () => {
    // Field studies of white-coated tin roofs report indoor reductions of roughly 1–2 °C
    // (Burkina Faso trial, 1.2–1.7 °C) and more in peak hours. The model should be
    // in that neighbourhood, not 0.1 °C and not 10 °C.
    const tin = run({ roof: 'tin', windowHabit: 'dayOpen' });
    const white = run({ roof: 'tin', roofFinish: 'coolWhite', windowHabit: 'dayOpen' });
    const meanDrop =
      lastDay(tin.operative).reduce((s, v) => s + v, 0) / 24 - lastDay(white.operative).reduce((s, v) => s + v, 0) / 24;
    const peakDrop = max(lastDay(tin.operative)) - max(lastDay(white.operative));
    expect(meanDrop).toBeGreaterThan(0.5);
    expect(peakDrop).toBeGreaterThan(1);
    expect(peakDrop).toBeLessThan(8);
  });

  it('opening windows at night (smart) cools the home at night versus keeping them shut', () => {
    const shut = run({ roof: 'rcc', windowHabit: 'alwaysClosed' });
    const smart = run({ roof: 'rcc', windowHabit: 'smart' });
    // 03:00 on the last day.
    expect(lastDay(smart.operative)[3]).toBeLessThan(lastDay(shut.operative)[3] - 0.5);
    expect(min(lastDay(smart.operative))).toBeLessThan(min(lastDay(shut.operative)));
  });

  it('produces finite, sensible numbers everywhere', () => {
    for (const type of ['independent', 'topFlat', 'middleFlat', 'groundFlat', 'hut'] as const) {
      const r = simulate(homePreset(type), hot);
      for (const arr of [r.air, r.operative, r.heatIndex, r.rh, r.feels]) {
        for (const v of arr) {
          expect(Number.isFinite(v)).toBe(true);
        }
      }
      expect(min(r.air)).toBeGreaterThan(20);
      expect(max(r.air)).toBeLessThan(55);
    }
  });
});
