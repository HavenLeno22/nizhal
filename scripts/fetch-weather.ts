// Downloads the hottest week of last summer for a set of Indian cities from the
// Open-Meteo ERA5 archive (CC BY 4.0) and saves them as the app's built-in
// offline samples.  Run:  npx vite-node scripts/fetch-weather.ts
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Place } from '../src/engine/home';
import { fetchHottestWeek, lastSummerYear, type WeatherSeries } from '../src/engine/weather';

const CITIES: (Place & { id: string })[] = [
  { id: 'chennai', name: 'Chennai', lat: 13.0827, lon: 80.2707, admin: 'Tamil Nadu', country: 'India' },
  { id: 'nagercoil', name: 'Nagercoil', lat: 8.1833, lon: 77.4119, admin: 'Tamil Nadu', country: 'India' },
  { id: 'madurai', name: 'Madurai', lat: 9.9252, lon: 78.1198, admin: 'Tamil Nadu', country: 'India' },
  { id: 'coimbatore', name: 'Coimbatore', lat: 11.0168, lon: 76.9558, admin: 'Tamil Nadu', country: 'India' },
  { id: 'vellore', name: 'Vellore', lat: 12.9165, lon: 79.1325, admin: 'Tamil Nadu', country: 'India' },
  { id: 'bengaluru', name: 'Bengaluru', lat: 12.9716, lon: 77.5946, admin: 'Karnataka', country: 'India' },
  { id: 'hyderabad', name: 'Hyderabad', lat: 17.385, lon: 78.4867, admin: 'Telangana', country: 'India' },
  { id: 'mumbai', name: 'Mumbai', lat: 19.076, lon: 72.8777, admin: 'Maharashtra', country: 'India' },
  { id: 'ahmedabad', name: 'Ahmedabad', lat: 23.0225, lon: 72.5714, admin: 'Gujarat', country: 'India' },
  { id: 'delhi', name: 'Delhi', lat: 28.6139, lon: 77.209, admin: 'Delhi', country: 'India' },
  { id: 'jaipur', name: 'Jaipur', lat: 26.9124, lon: 75.7873, admin: 'Rajasthan', country: 'India' },
  { id: 'lucknow', name: 'Lucknow', lat: 26.8467, lon: 80.9462, admin: 'Uttar Pradesh', country: 'India' },
  { id: 'nagpur', name: 'Nagpur', lat: 21.1458, lon: 79.0882, admin: 'Maharashtra', country: 'India' },
  { id: 'kolkata', name: 'Kolkata', lat: 22.5726, lon: 88.3639, admin: 'West Bengal', country: 'India' },
];

const r1 = (v: number) => Math.round(v * 10) / 10;
const r0 = (v: number) => Math.round(v);

function compact(id: string, w: WeatherSeries) {
  return {
    id,
    place: w.place,
    startUtc: w.startUtc,
    utcOffset: w.utcOffset,
    hours: w.hours,
    spinupHours: w.spinupHours,
    runningMean30: r1(w.runningMean30),
    label: w.label,
    temp: w.temp.map(r1),
    dewPoint: w.dewPoint.map(r1),
    rh: w.rh.map(r0),
    wind: w.wind.map(r1),
    cloud: w.cloud.map(r0),
    ghi: w.ghi.map(r0),
    dni: w.dni.map(r0),
    dhi: w.dhi.map(r0),
  };
}

async function main() {
  const year = lastSummerYear();
  const out = [];
  for (const c of CITIES) {
    const { id, ...place } = c;
    const w = await fetchHottestWeek(place, year);
    const shown = w.temp.slice(w.spinupHours);
    const day0 = new Date(w.startUtc + w.spinupHours * 3_600_000 + w.utcOffset * 1000).toISOString().slice(0, 10);
    console.log(`${c.name.padEnd(12)} ${year} hottest week from ${day0}: max ${Math.max(...shown).toFixed(1)} °C, running mean ${w.runningMean30.toFixed(1)}`);
    out.push(compact(id, w));
    await new Promise((r) => setTimeout(r, 400));
  }
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'samples.json');
  writeFileSync(file, JSON.stringify({ year, source: 'Open-Meteo ERA5 archive (CC BY 4.0)', cities: out }));
  console.log(`Saved ${out.length} cities to ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
