// Prints the numbers quoted in the README so they can be checked (REPORT=1).
import { it } from 'vitest';
import samples from '../src/data/samples.json';
import { windowAdvice } from '../src/engine/advice';
import { FIXES } from '../src/engine/fixes';
import { homePreset } from '../src/engine/home';
import { sampleToSeries, type SampleFile } from '../src/engine/samples';
import { hourOfDay } from '../src/engine/summary';

it.skipIf(!process.env.REPORT)('README claims: Chennai top-floor flat, hottest week', () => {
  const file = samples as unknown as SampleFile;
  const w = sampleToSeries(file.cities.find((c) => c.id === 'chennai')!);
  const home = homePreset('topFlat', w.place);
  const adv = windowAdvice(home, w);
  const at5: number[] = [];
  for (let k = 0; k < adv.smart.hours; k++) if (hourOfDay(adv.smart, k) === 5) at5.push(adv.habit.operative[k] - adv.smart.operative[k]);
  console.log(
    `peak habit ${adv.habitSummary.peak.toFixed(1)}, smart ${adv.smartSummary.peak.toFixed(1)}; ` +
      `5 am gain by night: ${at5.map((v) => v.toFixed(1)).join(', ')}; mean 3 am gain ${adv.nightGain.toFixed(2)}`,
  );
  console.log(`lime wash cost: ${JSON.stringify(FIXES.limeWash.cost(home))}`);
});
