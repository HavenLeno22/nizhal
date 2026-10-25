// Prints model behaviour for review (REPORT=1 npx vitest run tests/report.test.ts).
import { it } from 'vitest';
import samples from '../src/data/samples.json';
import { evaluateFixes } from '../src/engine/fixes';
import { homePreset, type Home } from '../src/engine/home';
import { sampleToSeries, type SampleFile } from '../src/engine/samples';
import { FLOW_KEYS, simulate } from '../src/engine/simulate';
import { summarize } from '../src/engine/summary';
import { syntheticWeather } from '../src/engine/synthetic';

it.skipIf(!process.env.REPORT)('real-weather report', () => {
  const file = samples as unknown as SampleFile;
  for (const id of ['chennai', 'madurai', 'delhi', 'nagercoil']) {
    const w = sampleToSeries(file.cities.find((c) => c.id === id)!);
    for (const t of ['independent', 'topFlat', 'hut'] as const) {
      const home = homePreset(t, w.place);
      const s = summarize(simulate(home, w));
      console.log(
        `${id.padEnd(10)} ${t.padEnd(12)} out ${s.outdoorPeak.toFixed(1)} in ${s.peak.toFixed(1)} meanMax ${s.meanDailyMax.toFixed(1)} ` +
          `danger ${s.dangerHours}h caution ${s.cautionHours}h hot ${s.hotHours}h hotNights ${s.hotNights}/${s.nights} upper ${s.comfortUpper.toFixed(1)}`,
      );
      if (t !== 'topFlat') {
        const ev = evaluateFixes(home, w);
        console.log(
          '   fixes: ' +
            ev.results
              .slice(0, 8)
              .map((r) => `${r.id}(${r.peakDrop.toFixed(1)}°, -${r.dangerHoursSaved}dh, -${r.hotNightsSaved}n, ₹${r.cost.typical})`)
              .join(' '),
        );
      }
    }
  }
});

const f1 = (v: number) => v.toFixed(1).padStart(5);

it.skipIf(!process.env.REPORT)('model behaviour report', () => {
  const w = syntheticWeather({ tMin: 29, tMax: 38, dewPoint: 22, days: 4 });
  const rows: [string, Partial<Home>][] = [
    ['RCC roof, day-open', { roof: 'rcc' }],
    ['RCC roof, closed', { roof: 'rcc', windowHabit: 'alwaysClosed' }],
    ['RCC roof, smart windows', { roof: 'rcc', windowHabit: 'smart' }],
    ['RCC + cool white', { roof: 'rcc', roofFinish: 'coolWhite' }],
    ['RCC + PUF 50', { roof: 'rcc', roofInsulation: 'puf50' }],
    ['RCC + shade net 75%', { roof: 'rcc', roofShade: 0.75 }],
    ['RCC + false ceiling', { roof: 'rcc', falseCeiling: true }],
    ['RCC weathering course', { roof: 'rccWeathering' }],
    ['Tin roof', { roof: 'tin' }],
    ['Tin + cool white', { roof: 'tin', roofFinish: 'coolWhite' }],
    ['Tin + false ceiling', { roof: 'tin', falseCeiling: true }],
    ['Tin + foil barrier', { roof: 'tin', radiantBarrier: true }],
    ['Tin + foil + ceiling', { roof: 'tin', radiantBarrier: true, falseCeiling: true }],
    ['Tin + PUF 50', { roof: 'tin', roofInsulation: 'puf50' }],
    ['Tin + shade net', { roof: 'tin', roofShade: 0.75 }],
    ['Asbestos', { roof: 'asbestos' }],
    ['Clay tile', { roof: 'clayTile' }],
    ['Thatch', { roof: 'thatch' }],
  ];
  console.log('label                      outMax inMax@h  inMin  roofIn  HImax  ACHday ACHnight');
  for (const [label, patch] of rows) {
    const home = { ...homePreset('independent'), ...patch };
    const r = simulate(home, w);
    const d = r.hours - 24;
    let inMax = -99;
    let at = 0;
    let inMin = 99;
    let roofIn = -99;
    let hi = -99;
    let outMax = -99;
    for (let k = d; k < r.hours; k++) {
      if (r.operative[k] > inMax) {
        inMax = r.operative[k];
        at = k - d;
      }
      inMin = Math.min(inMin, r.operative[k]);
      roofIn = Math.max(roofIn, r.roofInner[k]);
      hi = Math.max(hi, r.heatIndex[k]);
      outMax = Math.max(outMax, r.outdoor[k]);
    }
    console.log(
      `${label.padEnd(26)} ${f1(outMax)} ${f1(inMax)}@${String(at).padStart(2)} ${f1(inMin)} ${f1(roofIn)} ${f1(hi)} ${f1(r.ach[d + 14])} ${f1(r.ach[d + 2])}`,
    );
  }
  // Heat path breakdown at 3 pm for RCC and tin.
  for (const roof of ['rcc', 'tin'] as const) {
    const r = simulate({ ...homePreset('independent'), roof }, w);
    const k = r.hours - 24 + 15;
    console.log(`${roof} 15:00 flows W: ` + FLOW_KEYS.map((key) => `${key} ${Math.round(r.flows[key][k])}`).join(', '));
  }
  // Each home type.
  for (const t of ['independent', 'topFlat', 'middleFlat', 'groundFlat', 'hut'] as const) {
    const r = simulate(homePreset(t), w);
    const d = r.hours - 24;
    let mx = -99;
    let mn = 99;
    for (let k = d; k < r.hours; k++) {
      mx = Math.max(mx, r.operative[k]);
      mn = Math.min(mn, r.operative[k]);
    }
    console.log(`${t.padEnd(12)} indoor ${f1(mn)} – ${f1(mx)}  comfort upper ${r.comfort.upper.toFixed(1)}`);
  }
});
