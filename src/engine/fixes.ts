// The fix planner: what each upgrade does to *this* home in *this* climate, what
// it roughly costs, and which combination gives the most relief per rupee.
//
// Costs are rough Indian market ranges (2025–26 marketplace listings and
// contractor guides, see docs/how-it-works.md). They vary a lot by city and
// supplier, so the app treats them as editable estimates, never quotes.

import { cloneHome, roofExposed, SIDES, type Home } from './home';
import { simulate } from './simulate';
import { heatBurden, summarize, type Summary } from './summary';
import type { WeatherSeries } from './weather';

export type FixId =
  | 'smartWindows'
  | 'curtains'
  | 'limeWash'
  | 'coolRoof'
  | 'radiantBarrier'
  | 'shadeNet'
  | 'falseCeiling'
  | 'roofInsulation'
  | 'sunshades'
  | 'whiteWalls'
  | 'crossVent'
  | 'trees'
  | 'fan';

export const FIX_IDS: FixId[] = [
  'smartWindows',
  'curtains',
  'limeWash',
  'coolRoof',
  'radiantBarrier',
  'shadeNet',
  'falseCeiling',
  'roofInsulation',
  'sunshades',
  'whiteWalls',
  'crossVent',
  'trees',
  'fan',
];

export type Effort = 'habit' | 'diy' | 'contractor';

export interface CostRange {
  low: number;
  high: number;
  typical: number;
}

export interface FixDef {
  id: FixId;
  effort: Effort;
  /** Years before it needs redoing (null = lasts). */
  lifetime: number | null;
  applies(h: Home): boolean;
  apply(h: Home): Home;
  /** Rough cost in rupees for this home. */
  cost(h: Home): CostRange;
}

const SQFT = 10.764;
const roofSqft = (h: Home) => h.floorArea * SQFT;
const windowM2 = (h: Home) => SIDES.reduce((s, d) => s + (h.exposed[d] ? h.windows[d] : 0), 0);
const windowCount = (h: Home) => Math.max(1, Math.round(windowM2(h) / 1.2));
const exposedWallSqft = (h: Home) => {
  const side = Math.sqrt(h.floorArea);
  return SIDES.reduce((s, d) => s + (h.exposed[d] ? side * h.height - h.windows[d] : 0), 0) * SQFT;
};
const range = (qty: number, low: number, high: number, typical: number): CostRange => ({
  low: Math.round(qty * low),
  high: Math.round(qty * high),
  typical: Math.round(qty * typical),
});
const free: CostRange = { low: 0, high: 0, typical: 0 };

const with_ = (h: Home, patch: Partial<Home>): Home => ({ ...cloneHome(h), ...patch });

export const FIXES: Record<FixId, FixDef> = {
  smartWindows: {
    id: 'smartWindows',
    effort: 'habit',
    lifetime: null,
    applies: (h) => h.windowHabit !== 'smart' && windowM2(h) > 0.3,
    apply: (h) => with_(h, { windowHabit: 'smart', mesh: true }),
    // Free, but night opening needs insect mesh if there isn't any (₹15–35/sq ft basic, up to ₹300 for roller mesh).
    cost: (h) => (h.mesh ? free : range(windowM2(h) * SQFT, 15, 150, 40)),
  },
  curtains: {
    id: 'curtains',
    effort: 'diy',
    lifetime: 5,
    applies: (h) => !h.curtains && h.windowType === 'glass' && windowM2(h) > 0.3,
    apply: (h) => with_(h, { curtains: true }),
    cost: (h) => range(windowCount(h), 300, 1500, 600),
  },
  limeWash: {
    id: 'limeWash',
    effort: 'diy',
    lifetime: 1,
    applies: (h) => roofExposed(h) && h.roof !== 'thatch' && h.roofFinish !== 'white' && h.roofFinish !== 'coolWhite',
    apply: (h) => with_(h, { roofFinish: 'white' }),
    cost: (h) => range(roofSqft(h), 5, 20, 8),
  },
  coolRoof: {
    id: 'coolRoof',
    effort: 'contractor',
    lifetime: 5,
    applies: (h) => roofExposed(h) && h.roof !== 'thatch' && h.roofFinish !== 'coolWhite',
    apply: (h) => with_(h, { roofFinish: 'coolWhite' }),
    cost: (h) => range(roofSqft(h), 20, 80, 30),
  },
  radiantBarrier: {
    id: 'radiantBarrier',
    effort: 'diy',
    lifetime: 10,
    applies: (h) => roofExposed(h) && (h.roof === 'tin' || h.roof === 'asbestos') && !h.radiantBarrier,
    apply: (h) => with_(h, { radiantBarrier: true }),
    // Foil-bubble insulation ₹5.5–15/sq ft plus fixing.
    cost: (h) => range(roofSqft(h), 10, 30, 18),
  },
  shadeNet: {
    id: 'shadeNet',
    effort: 'diy',
    lifetime: 3,
    applies: (h) => roofExposed(h) && h.roofShade < 0.5,
    apply: (h) => with_(h, { roofShade: 0.75 }),
    // 75% net ₹18–170/m² plus a simple frame of pipes or ropes.
    cost: (h) => range(h.floorArea * 1.2, 60, 300, 150),
  },
  falseCeiling: {
    id: 'falseCeiling',
    effort: 'contractor',
    lifetime: 15,
    applies: (h) => roofExposed(h) && !h.falseCeiling,
    apply: (h) => with_(h, { falseCeiling: true }),
    cost: (h) => range(roofSqft(h), 75, 150, 100),
  },
  roofInsulation: {
    id: 'roofInsulation',
    effort: 'contractor',
    lifetime: 20,
    applies: (h) => roofExposed(h) && h.roofInsulation === 'none' && h.roof !== 'thatch',
    apply: (h) => with_(h, { roofInsulation: 'puf50' }),
    cost: (h) => range(roofSqft(h), 50, 180, 100),
  },
  sunshades: {
    id: 'sunshades',
    effort: 'contractor',
    lifetime: 10,
    applies: (h) => !h.sunshades && windowM2(h) > 0.3,
    apply: (h) => with_(h, { sunshades: true }),
    // Polycarbonate awnings ₹200–550/sq ft; ~0.6 m deep over each window.
    cost: (h) => range(windowCount(h) * 1.2 * 0.6 * SQFT, 150, 550, 300),
  },
  whiteWalls: {
    id: 'whiteWalls',
    effort: 'contractor',
    lifetime: 5,
    applies: (h) => SIDES.some((d) => h.exposed[d]) && h.wallFinish !== 'white' && h.wallFinish !== 'coolWhite' && h.wall !== 'tinWall',
    apply: (h) => with_(h, { wallFinish: 'white' }),
    cost: (h) => range(exposedWallSqft(h), 15, 40, 25),
  },
  crossVent: {
    id: 'crossVent',
    effort: 'diy',
    lifetime: null,
    applies: (h) => !h.crossVentilation && SIDES.filter((d) => h.exposed[d] && h.windows[d] > 0.2).length >= 1,
    apply: (h) => {
      const next = with_(h, { crossVentilation: true });
      // Needs an opening on a second side: a vent or a window across the room.
      const open = SIDES.filter((d) => next.exposed[d] && next.windows[d] > 0.2);
      if (open.length < 2) {
        const opposite: Record<string, 'N' | 'E' | 'S' | 'W'> = { N: 'S', S: 'N', E: 'W', W: 'E' };
        const target = opposite[open[0] ?? 'S'];
        next.exposed = { ...next.exposed, [target]: true };
        next.windows = { ...next.windows, [target]: Math.max(next.windows[target], 0.6) };
      }
      return next;
    },
    cost: (h) => (SIDES.filter((d) => h.exposed[d] && h.windows[d] > 0.2).length >= 2 ? free : range(1, 3000, 15000, 6000)),
  },
  trees: {
    id: 'trees',
    effort: 'diy',
    lifetime: null,
    applies: (h) => h.wallShade < 0.3 && (h.homeType === 'independent' || h.homeType === 'hut' || h.homeType === 'groundFlat'),
    apply: (h) => with_(h, { wallShade: 0.4, roofShade: Math.max(h.roofShade, roofExposed(h) ? 0.2 : 0) }),
    cost: () => range(1, 100, 1500, 500),
  },
  fan: {
    id: 'fan',
    effort: 'contractor',
    lifetime: 10,
    applies: (h) => !h.fan,
    apply: (h) => with_(h, { fan: true }),
    cost: () => range(1, 1500, 4000, 2500),
  },
};

export interface FixResult {
  id: FixId;
  summary: Summary;
  peakDrop: number;
  meanMaxDrop: number;
  dangerHoursSaved: number;
  hotHoursSaved: number;
  hotNightsSaved: number;
  /** Heat-burden points removed (see heatBurden). */
  relief: number;
  cost: CostRange;
  /** Relief per ₹1,000 of typical cost (Infinity for free fixes). */
  value: number;
}

export interface FixEvaluation {
  base: Summary;
  results: FixResult[];
}

function compare(id: FixId, base: Summary, s: Summary, cost: CostRange): FixResult {
  const relief = heatBurden(base) - heatBurden(s);
  return {
    id,
    summary: s,
    peakDrop: base.peak - s.peak,
    meanMaxDrop: base.meanDailyMax - s.meanDailyMax,
    dangerHoursSaved: base.dangerHours - s.dangerHours,
    hotHoursSaved: base.hotHours - s.hotHours,
    hotNightsSaved: base.hotNights - s.hotNights,
    relief,
    cost,
    value: cost.typical <= 0 ? (relief > 0 ? Infinity : 0) : (relief / cost.typical) * 1000,
  };
}

/** Ranks fixes: free ones that help first, then by relief per rupee. */
export function rankFixes(results: FixResult[]): FixResult[] {
  return [...results].sort((a, b) => {
    const ah = a.relief > 0.5 ? 1 : 0;
    const bh = b.relief > 0.5 ? 1 : 0;
    if (ah !== bh) return bh - ah;
    if (a.value !== b.value) return b.value - a.value;
    return b.relief - a.relief;
  });
}

export function evaluateFixes(home: Home, w: WeatherSeries, onProgress?: (done: number, total: number) => void): FixEvaluation {
  const base = summarize(simulate(home, w));
  const ids = FIX_IDS.filter((id) => FIXES[id].applies(home));
  const results: FixResult[] = [];
  ids.forEach((id, i) => {
    const fixed = FIXES[id].apply(home);
    results.push(compare(id, base, summarize(simulate(fixed, w)), FIXES[id].cost(home)));
    onProgress?.(i + 1, ids.length);
  });
  return { base, results: rankFixes(results) };
}

export interface PlanStep {
  id: FixId;
  summary: Summary;
  cost: CostRange;
}

export interface Plan {
  steps: PlanStep[];
  base: Summary;
  final: Summary;
  totalCost: CostRange;
}

/**
 * Builds a plan greedily: keep adding the fix that removes the most heat burden
 * per rupee (free first) on top of the ones already chosen, until nothing left
 * helps much or the budget runs out. Re-simulating at every step captures how
 * fixes overlap (two roof fixes don't add up fully).
 */
export function buildPlan(home: Home, w: WeatherSeries, opts: { budget?: number; maxSteps?: number; candidates?: FixId[] } = {}): Plan {
  const budget = opts.budget ?? Infinity;
  const maxSteps = opts.maxSteps ?? 4;
  const base = summarize(simulate(home, w));
  let current = home;
  let currentSummary = base;
  let spent = 0;
  const steps: PlanStep[] = [];
  const pool = new Set<FixId>(opts.candidates ?? FIX_IDS);
  while (steps.length < maxSteps) {
    let best: { id: FixId; home: Home; summary: Summary; cost: CostRange; value: number; relief: number } | null = null;
    for (const id of pool) {
      const def = FIXES[id];
      if (!def.applies(current)) continue;
      const cost = def.cost(home);
      if (spent + cost.typical > budget) continue;
      const next = def.apply(current);
      const s = summarize(simulate(next, w));
      const relief = heatBurden(currentSummary) - heatBurden(s);
      if (relief < 1) continue;
      const value = cost.typical <= 0 ? Infinity : relief / cost.typical;
      if (!best || value > best.value || (value === best.value && relief > best.relief)) {
        best = { id, home: next, summary: s, cost, value, relief };
      }
    }
    if (!best) break;
    steps.push({ id: best.id, summary: best.summary, cost: best.cost });
    pool.delete(best.id);
    // Lime wash and cool-roof coating are alternatives.
    if (best.id === 'limeWash') pool.delete('coolRoof');
    if (best.id === 'coolRoof') pool.delete('limeWash');
    current = best.home;
    currentSummary = best.summary;
    spent += best.cost.typical;
  }
  const totalCost = steps.reduce<CostRange>(
    (acc, s) => ({ low: acc.low + s.cost.low, high: acc.high + s.cost.high, typical: acc.typical + s.cost.typical }),
    { low: 0, high: 0, typical: 0 },
  );
  return { steps, base, final: currentSummary, totalCost };
}

/** Applies a list of fixes in order (skipping any that no longer apply). */
export function applyFixes(home: Home, ids: FixId[]): Home {
  let h = home;
  for (const id of ids) if (FIXES[id].applies(h)) h = FIXES[id].apply(h);
  return h;
}
