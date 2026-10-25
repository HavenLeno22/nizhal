// Building materials and the roof / wall / floor build-ups found in Indian homes.
//
// Thermal properties are typical handbook values: BIS SP 41 (Handbook on Functional
// Requirements of Buildings) and the ASHRAE Handbook of Fundamentals. Solar
// absorptance and emissivity of surfaces are typical published ranges; real roofs
// vary with age, dust and colour, which is why the app lets you calibrate.

export interface Material {
  name: string;
  /** Thermal conductivity, W/(m·K). */
  k: number;
  /** Density, kg/m³. */
  rho: number;
  /** Specific heat, J/(kg·K). */
  c: number;
}

export const MATERIALS = {
  rcc: { name: 'Reinforced concrete (RCC)', k: 1.58, rho: 2300, c: 880 },
  plaster: { name: 'Cement plaster', k: 0.72, rho: 1760, c: 840 },
  brick: { name: 'Burnt clay brick', k: 0.81, rho: 1820, c: 880 },
  concreteBlock: { name: 'Solid concrete block', k: 1.3, rho: 2000, c: 880 },
  aac: { name: 'AAC block', k: 0.16, rho: 650, c: 1000 },
  mud: { name: 'Mud / stabilised earth', k: 0.75, rho: 1730, c: 880 },
  laterite: { name: 'Laterite stone', k: 1.1, rho: 1900, c: 880 },
  steel: { name: 'Galvanised steel sheet', k: 50, rho: 7850, c: 450 },
  asbestosCement: { name: 'Asbestos-cement sheet', k: 0.3, rho: 1520, c: 840 },
  clayTile: { name: 'Clay roof tile', k: 0.84, rho: 1890, c: 880 },
  thatch: { name: 'Thatch (palm/coconut leaves)', k: 0.07, rho: 240, c: 1800 },
  weatheringCourse: { name: 'Brick-bat lime concrete (weathering course)', k: 0.7, rho: 1600, c: 880 },
  terraceTile: { name: 'Clay terrace tile', k: 0.84, rho: 1890, c: 880 },
  gypsum: { name: 'Gypsum board', k: 0.25, rho: 900, c: 1000 },
  puf: { name: 'PU foam insulation', k: 0.025, rho: 35, c: 1400 },
  eps: { name: 'Expanded polystyrene', k: 0.035, rho: 20, c: 1300 },
  floorConcrete: { name: 'Floor concrete (PCC) with tiles', k: 1.2, rho: 2200, c: 880 },
  soil: { name: 'Moist soil', k: 1.2, rho: 1800, c: 1100 },
  wood: { name: 'Wood', k: 0.14, rho: 600, c: 1600 },
} satisfies Record<string, Material>;

export type MaterialKey = keyof typeof MATERIALS;

/** One layer of a build-up: a solid material of some thickness, or a still-air gap. */
export type Layer =
  | { kind: 'solid'; material: MaterialKey; thickness: number }
  | { kind: 'gap'; resistance: number; label: string };

export interface Construction {
  id: string;
  /** Layers from OUTSIDE to INSIDE. */
  layers: Layer[];
  /** Solar absorptance of the outer surface (0 = mirror white, 1 = black). */
  absorptance: number;
  /** Long-wave emissivity of the outer surface. */
  emissivityOut: number;
  /** Long-wave emissivity of the inner surface (bare metal radiates little). */
  emissivityIn: number;
}

const solid = (material: MaterialKey, mm: number): Layer => ({ kind: 'solid', material, thickness: mm / 1000 });

export type RoofType = 'rcc' | 'rccWeathering' | 'tin' | 'asbestos' | 'clayTile' | 'thatch';
export type WallType = 'brick230' | 'brick115' | 'concreteBlock' | 'aac' | 'mud' | 'laterite' | 'tinWall';
export type SurfaceFinish = 'dark' | 'grey' | 'natural' | 'light' | 'white' | 'coolWhite';

/**
 * Typical solar absorptance by finish. White finishes use first-year averages,
 * because roofs get dusty: fresh reflective coatings start near 0.15–0.2 and
 * lime wash near 0.3, and both lose some of that within months.
 */
export const FINISH_ABSORPTANCE: Record<SurfaceFinish, number> = {
  dark: 0.9,
  grey: 0.7,
  natural: 0.65,
  light: 0.45,
  white: 0.4,
  coolWhite: 0.3,
};

export function roofConstruction(type: RoofType, finish: SurfaceFinish | null): Construction {
  switch (type) {
    case 'rcc':
      return {
        id: 'roof',
        layers: [solid('rcc', 120), solid('plaster', 12)],
        absorptance: FINISH_ABSORPTANCE[finish ?? 'grey'],
        emissivityOut: 0.9,
        emissivityIn: 0.9,
      };
    case 'rccWeathering':
      return {
        id: 'roof',
        layers: [solid('terraceTile', 20), solid('weatheringCourse', 75), solid('rcc', 120), solid('plaster', 12)],
        absorptance: FINISH_ABSORPTANCE[finish ?? 'natural'],
        emissivityOut: 0.9,
        emissivityIn: 0.9,
      };
    case 'tin':
      return {
        id: 'roof',
        layers: [solid('steel', 0.5)],
        // Weathered, dusty galvanised steel: absorbing, a middling emitter
        // (new galvanising is ~0.25, rusty sheet ~0.8). A painted coating emits well.
        absorptance: finish ? FINISH_ABSORPTANCE[finish] : 0.8,
        emissivityOut: finish ? 0.88 : 0.55,
        emissivityIn: 0.5,
      };
    case 'asbestos':
      return {
        id: 'roof',
        layers: [solid('asbestosCement', 6)],
        absorptance: FINISH_ABSORPTANCE[finish ?? 'grey'],
        emissivityOut: 0.9,
        emissivityIn: 0.9,
      };
    case 'clayTile':
      return {
        id: 'roof',
        layers: [solid('clayTile', 15)],
        absorptance: FINISH_ABSORPTANCE[finish ?? 'natural'],
        emissivityOut: 0.9,
        emissivityIn: 0.9,
      };
    case 'thatch':
      return {
        id: 'roof',
        layers: [solid('thatch', 150)],
        absorptance: 0.7,
        emissivityOut: 0.9,
        emissivityIn: 0.9,
      };
  }
}

export function wallConstruction(type: WallType, finish: SurfaceFinish | null): Construction {
  const a = (f: SurfaceFinish) => FINISH_ABSORPTANCE[finish ?? f];
  switch (type) {
    case 'brick230':
      return { id: 'wall', layers: [solid('plaster', 12), solid('brick', 230), solid('plaster', 12)], absorptance: a('light'), emissivityOut: 0.9, emissivityIn: 0.9 };
    case 'brick115':
      return { id: 'wall', layers: [solid('plaster', 12), solid('brick', 115), solid('plaster', 12)], absorptance: a('light'), emissivityOut: 0.9, emissivityIn: 0.9 };
    case 'concreteBlock':
      return { id: 'wall', layers: [solid('plaster', 12), solid('concreteBlock', 200), solid('plaster', 12)], absorptance: a('light'), emissivityOut: 0.9, emissivityIn: 0.9 };
    case 'aac':
      return { id: 'wall', layers: [solid('plaster', 12), solid('aac', 200), solid('plaster', 12)], absorptance: a('light'), emissivityOut: 0.9, emissivityIn: 0.9 };
    case 'mud':
      return { id: 'wall', layers: [solid('mud', 300)], absorptance: a('natural'), emissivityOut: 0.9, emissivityIn: 0.9 };
    case 'laterite':
      return { id: 'wall', layers: [solid('laterite', 230), solid('plaster', 12)], absorptance: a('natural'), emissivityOut: 0.9, emissivityIn: 0.9 };
    case 'tinWall':
      return { id: 'wall', layers: [solid('steel', 0.5)], absorptance: finish ? FINISH_ABSORPTANCE[finish] : 0.8, emissivityOut: finish ? 0.88 : 0.55, emissivityIn: 0.5 };
  }
}

/** Floor on the ground: tiles + concrete, then soil down to deep-ground temperature. */
export function groundFloorConstruction(): Construction {
  return {
    id: 'floor',
    layers: [solid('soil', 600), solid('floorConcrete', 100)],
    absorptance: 0,
    emissivityOut: 0.9,
    emissivityIn: 0.9,
  };
}

/** A concrete slab shared with a neighbour (no heat flows through it, but it stores heat). */
export function sharedSlabConstruction(): Construction {
  return { id: 'slab', layers: [solid('rcc', 120), solid('plaster', 12)], absorptance: 0, emissivityOut: 0.9, emissivityIn: 0.9 };
}

/** Steady-state U-value with standard surface resistances (ISO 6946: Rse 0.04, Rsi 0.13 / 0.10). */
export function uValue(c: Construction, horizontal = false): number {
  let R = 0.04 + (horizontal ? 0.1 : 0.13);
  for (const l of c.layers) R += l.kind === 'gap' ? l.resistance : l.thickness / MATERIALS[l.material].k;
  return 1 / R;
}

export const WINDOW = {
  /** Single clear glass, W/(m²·K). */
  uGlass: 5.8,
  /** Solar heat gain coefficient of single clear glass. */
  shgcGlass: 0.8,
  /** Wooden shutters (closed), W/(m²·K). */
  uShutter: 3.0,
};
