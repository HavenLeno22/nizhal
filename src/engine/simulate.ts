// Steps the home's thermal network through the weather, 10 minutes at a time,
// and reports the indoor climate every hour.
//
// Time stepping is implicit (backward Euler): [C/Δt + G] T(t+Δt) = C/Δt T(t) + sources.
// That keeps both a 0.5 mm steel roof (seconds-long time constant) and a 120 mm
// concrete slab (hours) stable. Long-wave radiation is linearised around the
// previous step's surface temperature.

import {
  atmosphericPressure,
  fanCooling,
  heatIndex,
  humidityRatioFromDewPoint,
  imacBand,
  relativeHumidity,
} from './comfort';
import { SIDES, type Home, type Side, type WindowHabit } from './home';
import { DenseLU } from './linalg';
import { buildNetwork, type Network } from './network';
import { irradianceOn, overhangShade, sunPosition, type SkyState } from './solar';
import type { WeatherSeries } from './weather';

const SIGMA = 5.670374419e-8;
const RHO_CP_AIR = 1.2 * 1005;
const K = 273.15;
/** Chajja depth relative to window height. */
const SUNSHADE_RATIO = 0.5;
/** Ground and paving warm up in the sun: about +12 °C above air at 1000 W/m². */
const GROUND_HEATING_PER_WM2 = 0.012;

export type FlowKey = 'roof' | 'walls' | 'windows' | 'sun' | 'air' | 'people' | 'floor';
export const FLOW_KEYS: FlowKey[] = ['roof', 'walls', 'windows', 'sun', 'air', 'people', 'floor'];

export interface SimResult {
  /** Hours reported (after warm-up). */
  hours: number;
  startUtc: number;
  utcOffset: number;
  outdoor: Float32Array;
  outdoorRh: Float32Array;
  outdoorHeatIndex: Float32Array;
  air: Float32Array;
  mrt: Float32Array;
  operative: Float32Array;
  rh: Float32Array;
  heatIndex: Float32Array;
  /** Operative temperature minus the ceiling fan's cooling effect (if there is a fan). */
  feels: Float32Array;
  /** Top surface: roof (or the shared ceiling slab). */
  roofOuter: Float32Array | null;
  roofInner: Float32Array;
  wallOuter: Record<Side, Float32Array | null>;
  wallInner: Record<Side, Float32Array>;
  floorInner: Float32Array;
  /** Hour-averaged heat flow into the room by path, W (negative = heat leaving). */
  flows: Record<FlowKey, Float32Array>;
  windowsOpen: Uint8Array;
  ach: Float32Array;
  comfort: { neutral: number; lower: number; upper: number };
  runningMean30: number;
}

export interface SimOptions {
  /** Time step, s (default 600). */
  stepSeconds?: number;
  /** Override how windows are used. */
  windowHabit?: WindowHabit;
}

/** Internal heat (W) and moisture (kg/s) at a local hour. */
export function internalGains(h: Home, hour: number): { heat: number; moisture: number } {
  const presence = hour < 6 ? 1 : hour < 9 ? 0.9 : hour < 17 ? 0.5 : 1;
  const asleep = hour < 6 || hour >= 22;
  const people = h.people * presence;
  let heat = people * (asleep ? 60 : 75);
  let moisture = (people * 0.05) / 3600;
  if (h.cookingInside && (hour === 7 || hour === 12 || hour === 19)) {
    heat += 500;
    moisture += 0.3 / 3600;
  }
  heat += 60 + (hour >= 18 && hour < 23 ? 150 : 0) + (h.fan && people > 0 ? 60 : 0);
  const scale = h.calibration?.gainsScale ?? 1;
  return { heat: heat * scale, moisture };
}

export function windowsShouldOpen(habit: WindowHabit, hour: number, tOut: number, tAir: number, wasOpen: boolean): boolean {
  switch (habit) {
    case 'alwaysOpen':
      return true;
    case 'alwaysClosed':
      return false;
    case 'dayOpen':
      return hour >= 7 && hour < 20;
    case 'nightOpen':
      return hour >= 19 || hour < 8;
    case 'smart':
      // Open when outside is cooler than inside, with a little hysteresis.
      return wasOpen ? tOut < tAir + 0.3 : tOut < tAir - 0.3;
  }
}

/** Air flow through the home, m³/s: leaks, plus wind and buoyancy through open windows. */
export function ventilationFlow(net: Network, open: boolean, wind10: number, tOut: number, tAir: number): number {
  const infiltration = (net.infiltrationACH * net.volume) / 3600;
  if (!open || net.openArea <= 0) return infiltration;
  const A = net.openArea;
  const v = 0.5 * wind10;
  // Cross ventilation: two openings in series, Cd 0.61, ΔCp 0.5 → 0.153·A·v.
  // Single-sided: 0.025·A·v (CIBSE Guide A). Buoyancy: Cd·A/3·√(g·h·ΔT/T).
  const qWind = net.crossVentilation ? 0.153 * A * v : 0.025 * A * v;
  const qStack = 0.61 * (A / 3) * Math.sqrt((9.81 * 1.2 * Math.abs(tAir - tOut)) / (tOut + K));
  const q = Math.sqrt(qWind * qWind + qStack * qStack) + infiltration;
  return Math.min(q, (40 * net.volume) / 3600);
}

/** Effective sky temperature, °C: Berdahl & Martin (1984) clear-sky emissivity with a cloud correction. */
export function skyTemperature(airC: number, dewPointC: number, cloudPct: number): number {
  const td = dewPointC / 100;
  const clear = 0.711 + 0.56 * td + 0.73 * td * td;
  const N = cloudPct / 10;
  const eps = Math.min(1, clear * (1 + 0.0224 * N - 0.0035 * N * N + 0.00028 * N * N * N));
  return Math.pow(eps, 0.25) * (airC + K) - K;
}

function lerp(a: number[], idx: number): number {
  const n = a.length;
  if (idx <= 0) return a[0];
  if (idx >= n - 1) return a[n - 1];
  const i = Math.floor(idx);
  const f = idx - i;
  return a[i] + (a[i + 1] - a[i]) * f;
}

export function simulate(home: Home, w: WeatherSeries, opts: SimOptions = {}): SimResult {
  const dt = opts.stepSeconds ?? 600;
  const habit = opts.windowHabit ?? home.windowHabit;
  const net = buildNetwork(home);
  const n = net.n;
  const { lat, lon } = w.place;
  const pressure = atmosphericPressure(w.place.elevation ?? 0);
  const comfort = imacBand(w.runningMean30);
  const tDeep = w.runningMean30;

  // Static part of the system matrix: capacities and fixed conductances.
  const base = new Float64Array(n * n);
  for (let i = 0; i < n; i++) base[i * n + i] += net.C[i] / dt;
  for (const [a, b, G] of net.links) {
    base[a * n + a] += G;
    base[b * n + b] += G;
    base[a * n + b] -= G;
    base[b * n + a] -= G;
  }
  const A = new Float64Array(n * n);
  const rhs = new Float64Array(n);
  const T = new Float64Array(n);
  const Tn = new Float64Array(n);
  const lu = new DenseLU(n);
  const start = w.temp.slice(0, 24);
  const t0 = start.reduce((s, v) => s + v, 0) / start.length + 1;
  T.fill(t0);

  const outH = w.hours - w.spinupHours;
  const mk = () => new Float32Array(outH);
  const res: SimResult = {
    hours: outH,
    startUtc: w.startUtc + w.spinupHours * 3_600_000,
    utcOffset: w.utcOffset,
    outdoor: mk(),
    outdoorRh: mk(),
    outdoorHeatIndex: mk(),
    air: mk(),
    mrt: mk(),
    operative: mk(),
    rh: mk(),
    heatIndex: mk(),
    feels: mk(),
    roofOuter: net.exterior.some((e) => e.label === 'roof') ? mk() : null,
    roofInner: mk(),
    wallOuter: { N: null, E: null, S: null, W: null },
    wallInner: { N: mk(), E: mk(), S: mk(), W: mk() },
    floorInner: mk(),
    flows: { roof: mk(), walls: mk(), windows: mk(), sun: mk(), air: mk(), people: mk(), floor: mk() },
    windowsOpen: new Uint8Array(outH),
    ach: mk(),
    comfort,
    runningMean30: w.runningMean30,
  };
  for (const e of net.exterior) if (e.label !== 'roof') res.wallOuter[e.label] = mk();

  const roofExt = net.exterior.find((e) => e.label === 'roof') ?? null;
  const wallExt = new Map<Side, number>();
  for (const e of net.exterior) if (e.label !== 'roof') wallExt.set(e.label, e.node);
  const topEl = net.elements.find((e) => e.kind === 'roof' || e.kind === 'ceilingShared');
  const floorEl = net.elements.find((e) => e.kind === 'floor' || e.kind === 'floorShared');
  const wallEls = net.elements.filter((e) => e.kind === 'wall');
  if (!topEl || !floorEl) throw new Error('Network is missing its roof or floor.');

  const acc: Record<FlowKey, number> = { roof: 0, walls: 0, windows: 0, sun: 0, air: 0, people: 0, floor: 0 };
  let openSteps = 0;
  let achAcc = 0;
  let stepsInHour = 0;
  let open = false;

  const totalSteps = Math.round(((w.hours - 1) * 3600) / dt);
  const sky: SkyState = { ghi: 0, dni: 0, dhi: 0, zenith: 90, azimuth: 0 };
  const W = net.windows;
  const sunshade = home.sunshades ? SUNSHADE_RATIO : 0;

  // Surface coefficients (convection, linearised radiation), window conductances,
  // ventilation and the window state change slowly, so they are refreshed once an
  // hour and the matrix is factorised once an hour; every sub-step reuses the
  // factorisation with its own weather, sun and gains on the right-hand side.
  const stepsPerHour = Math.max(1, Math.round(3600 / dt));
  const ext = net.exterior;
  const gAirH = new Float64Array(ext.length);
  const gSkyH = new Float64Array(ext.length);
  const gGrH = new Float64Array(ext.length);
  const gWinH = new Float64Array(W.length);
  let gv = 0;
  let q = 0;

  for (let s = 0; s < totalSteps; s++) {
    const t1 = (s + 1) * dt;
    const idx = t1 / 3600;
    const radIdx = idx + 0.5; // radiation values are means of the preceding hour
    const tOut = lerp(w.temp, idx);
    const tDew = lerp(w.dewPoint, idx);
    const wind = Math.max(0, lerp(w.wind, idx));
    const cloud = lerp(w.cloud, idx);
    const utc = w.startUtc + t1 * 1000;
    const pos = sunPosition(utc, lat, lon);
    sky.zenith = pos.zenith;
    sky.azimuth = pos.azimuth;
    sky.ghi = Math.max(0, lerp(w.ghi, radIdx));
    sky.dni = pos.zenith < 90 ? Math.max(0, lerp(w.dni, radIdx)) : 0;
    sky.dhi = Math.max(0, lerp(w.dhi, radIdx));
    const tSky = skyTemperature(tOut, tDew, cloud);
    const tGround = tOut + GROUND_HEATING_PER_WM2 * sky.ghi;
    const localHour = new Date(utc + w.utcOffset * 1000).getUTCHours();
    const daytime = localHour >= 8 && localHour < 18;

    if (s % stepsPerHour === 0) {
      // Refresh the slow coefficients and refactorise.
      A.set(base);
      for (let e = 0; e < ext.length; e++) {
        const sf = ext[e];
        const ts = T[sf.node] + K;
        const hc = 4 + 4 * wind * sf.windFactor;
        const sk = tSky + K;
        const gr = tGround + K;
        const ai = tOut + K;
        const hrSky = sf.emissivity * SIGMA * (ts * ts + sk * sk) * (ts + sk);
        const hrGr = sf.emissivity * SIGMA * (ts * ts + gr * gr) * (ts + gr);
        const hrAir = sf.emissivity * SIGMA * (ts * ts + ai * ai) * (ts + ai);
        gAirH[e] = (hc + hrAir * sf.fShade) * sf.area;
        gSkyH[e] = hrSky * sf.fSky * sf.area;
        gGrH[e] = hrGr * sf.fGround * sf.area;
        A[sf.node * n + sf.node] += gAirH[e] + gSkyH[e] + gGrH[e];
      }
      for (let i = 0; i < W.length; i++) {
        const he = 4 + 4 * wind * 0.5 + 5;
        gWinH[i] = W[i].area / (1 / he + W[i].rPane);
        A[W[i].node * n + W[i].node] += gWinH[i];
      }
      open = windowsShouldOpen(habit, localHour, tOut, T[net.air], open);
      q = ventilationFlow(net, open, wind, tOut, T[net.air]);
      gv = RHO_CP_AIR * q;
      A[net.air * n + net.air] += gv;
      for (const l of net.outdoorLinks) A[l.node * n + l.node] += l.G;
      if (net.ground) A[net.ground.node * n + net.ground.node] += net.ground.G;
      lu.factor(A);
    }

    for (let i = 0; i < n; i++) rhs[i] = (net.C[i] / dt) * T[i];

    // Outer surfaces: sun, outdoor air, sky and ground.
    for (let e = 0; e < ext.length; e++) {
      const sf = ext[e];
      const sun = sf.absorptance * irradianceOn(sky, sf.tilt, sf.facing) * sf.solarFactor * sf.area;
      rhs[sf.node] += gAirH[e] * tOut + gSkyH[e] * tSky + gGrH[e] * tGround + sun;
    }

    // Windows: conduction through the pane or shutter, and sunlight let in.
    let transmitted = 0;
    for (let i = 0; i < W.length; i++) {
      const win = W[i];
      rhs[win.node] += gWinH[i] * tOut;
      const shade = overhangShade(sky, win.facing, sunshade);
      const I = irradianceOn(sky, 90, win.facing, shade) * (1 - home.wallShade * 0.5);
      let shgc: number;
      if (home.windowType === 'glass') shgc = 0.8 * (home.curtains && daytime ? 0.55 : 1);
      else shgc = open ? 0.85 : 0.05;
      transmitted += shgc * I * win.area;
      rhs[win.node] += (home.windowType === 'glass' ? 0.06 : open ? 0 : 0.5) * I * win.area;
    }
    rhs[net.floorSurface] += 0.5 * transmitted;
    rhs[net.mass] += 0.3 * transmitted;
    rhs[net.air] += 0.2 * transmitted;

    // Ventilation with outdoor air, and vented roof spaces.
    rhs[net.air] += gv * tOut;
    for (const l of net.outdoorLinks) rhs[l.node] += l.G * tOut;

    // Floor to deep ground.
    if (net.ground) rhs[net.ground.node] += net.ground.G * tDeep;

    // People, cooking, appliances: half to the air, half to furniture and walls.
    const gains = internalGains(home, localHour);
    rhs[net.air] += 0.5 * gains.heat;
    rhs[net.mass] += 0.5 * gains.heat;

    lu.solve(rhs, Tn);
    T.set(Tn);

    // Heat delivered into the room by each path during this step.
    const tA = T[net.air];
    const tM = T[net.mrt];
    const into = (node: number, hcA: number, hrA: number) => hcA * (T[node] - tA) + hrA * (T[node] - tM);
    acc.roof += into(topEl.innerNode, topEl.hcA, topEl.hrA);
    for (const e of wallEls) acc.walls += into(e.innerNode, e.hcA, e.hrA);
    // Half the sunlight through the windows lands on the floor surface; count it as
    // "sun", and count only what the floor slab itself gives off as "floor".
    acc.floor += into(floorEl.innerNode, floorEl.hcA, floorEl.hrA) - 0.5 * transmitted;
    for (const win of W) acc.windows += into(win.node, win.hcA, win.hrA);
    acc.sun += transmitted;
    acc.air += gv * (tOut - tA);
    acc.people += gains.heat;
    openSteps += open ? 1 : 0;
    achAcc += (q * 3600) / net.volume;
    stepsInHour++;

    if (t1 % 3600 === 0) {
      const hIdx = t1 / 3600;
      const k = hIdx - w.spinupHours;
      if (k >= 0 && k < outH) {
        const op = 0.5 * (tA + tM);
        const Wout = humidityRatioFromDewPoint(w.dewPoint[hIdx], pressure);
        const flow = Math.max(1e-4, (achAcc / stepsInHour) * net.volume / 3600);
        const Win = Wout + gains.moisture / (1.2 * flow);
        const rhIn = relativeHumidity(Win, tA, pressure);
        res.outdoor[k] = w.temp[hIdx];
        res.outdoorRh[k] = w.rh[hIdx];
        res.outdoorHeatIndex[k] = heatIndex(w.temp[hIdx], w.rh[hIdx]);
        res.air[k] = tA;
        res.mrt[k] = tM;
        res.operative[k] = op;
        res.rh[k] = rhIn;
        res.heatIndex[k] = heatIndex(op, rhIn);
        res.feels[k] = home.fan ? op - fanCooling(op) : op;
        if (res.roofOuter && roofExt) res.roofOuter[k] = T[roofExt.node];
        res.roofInner[k] = T[topEl.innerNode];
        for (const sd of SIDES) {
          const el = wallEls.find((e) => e.side === sd);
          if (el) res.wallInner[sd][k] = T[el.innerNode];
          const ext = wallExt.get(sd);
          const arr = res.wallOuter[sd];
          if (ext !== undefined && arr) arr[k] = T[ext];
        }
        res.floorInner[k] = T[floorEl.innerNode];
        for (const key of Object.keys(acc) as FlowKey[]) res.flows[key][k] = acc[key] / stepsInHour;
        res.windowsOpen[k] = openSteps * 2 >= stepsInHour ? 1 : 0;
        res.ach[k] = achAcc / stepsInHour;
      }
      for (const key of Object.keys(acc) as FlowKey[]) acc[key] = 0;
      openSteps = 0;
      achAcc = 0;
      stepsInHour = 0;
    }
  }
  return res;
}
