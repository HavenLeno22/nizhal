// Turns a Home into a thermal resistance–capacitance (RC) network.
//
// Every roof, wall and floor becomes a chain of nodes through its material layers
// (each node stores heat; links between them conduct heat). Outer surface nodes
// meet the weather; inner surface nodes meet the room. The room has an air node,
// a node for furniture and partitions ("internal mass"), and a mean-radiant node
// through which all inner surfaces exchange long-wave radiation (Walton's
// "MRT network" simplification).

import {
  groundFloorConstruction,
  MATERIALS,
  roofConstruction,
  sharedSlabConstruction,
  wallConstruction,
  type Construction,
  type Layer,
} from './materials';
import { floorOnGround, roofExposed, SIDE_AZIMUTH, SIDES, type Home, type Side } from './home';

const SIGMA = 5.670374419e-8;
/** Linearised long-wave radiation coefficient indoors at ~30 °C, per unit emissivity. */
const HR_INDOOR = 4 * SIGMA * 303 ** 3;
/** Furniture, partitions and contents, J/K per m² of floor. */
const INTERNAL_MASS_PER_M2 = 30_000;
/** Each sub-layer node represents at most this much material, m. */
const MAX_NODE_THICKNESS = 0.06;

export type ElementKind = 'roof' | 'ceilingShared' | 'wall' | 'floor' | 'floorShared';

export interface ExteriorSurface {
  node: number;
  label: 'roof' | Side;
  area: number;
  tilt: number;
  facing: number;
  absorptance: number;
  emissivity: number;
  /** View factors to sky, to ground/surroundings, and to shading objects at air temperature. */
  fSky: number;
  fGround: number;
  fShade: number;
  /** Share of incident sunlight that actually reaches the surface. */
  solarFactor: number;
  /** Local wind speed as a share of the 10 m wind speed. */
  windFactor: number;
}

export interface Element {
  kind: ElementKind;
  side?: Side;
  area: number;
  innerNode: number;
  outerNode: number | null;
  /** Links from the inner surface into the room: [node, conductance W/K] for air and MRT. */
  hcA: number;
  hrA: number;
}

export interface WindowPart {
  side: Side;
  facing: number;
  area: number;
  node: number;
  /** Thermal resistance of the pane or shutter itself, m²K/W. */
  rPane: number;
  /** Convective and radiative conductance from the inner face into the room, W/K. */
  hcA: number;
  hrA: number;
}

export interface Network {
  n: number;
  C: Float64Array;
  labels: string[];
  links: [number, number, number][];
  exterior: ExteriorSurface[];
  elements: Element[];
  windows: WindowPart[];
  ground: { node: number; G: number } | null;
  /** Nodes washed by outdoor air (a vented ceiling void, the underside of gappy tiles), W/K. */
  outdoorLinks: { node: number; G: number }[];
  /** The air in a false-ceiling void, if there is one. */
  voidNode: number | null;
  air: number;
  mrt: number;
  mass: number;
  floorSurface: number;
  volume: number;
  floorArea: number;
  /** Air changes per hour with windows shut (leaks, tile gaps). */
  infiltrationACH: number;
  /** Effective open area when windows are open, m². */
  openArea: number;
  crossVentilation: boolean;
}

interface Builder {
  C: number[];
  labels: string[];
  links: [number, number, number][];
}

function addNode(b: Builder, C: number, label: string): number {
  b.C.push(C);
  b.labels.push(label);
  return b.C.length - 1;
}

function addLink(b: Builder, a: number, c: number, G: number): void {
  if (G > 0) b.links.push([a, c, G]);
}

interface Slab {
  C: number;
  /** Resistance from the slab's centre to either face, K/W. */
  rHalf: number;
  /** Extra resistance before this slab (an air gap), K/W. */
  rBefore: number;
}

/** Splits layers into slabs (outside → inside), turning gaps into resistances between slabs. */
function slabs(layers: Layer[], area: number, massScale: number): { list: Slab[]; trailingGap: number } {
  const list: Slab[] = [];
  let pendingGap = 0;
  for (const l of layers) {
    if (l.kind === 'gap') {
      pendingGap += l.resistance / area;
      continue;
    }
    const m = MATERIALS[l.material];
    const count = Math.max(1, Math.min(5, Math.ceil(l.thickness / MAX_NODE_THICKNESS)));
    const d = l.thickness / count;
    for (let i = 0; i < count; i++) {
      list.push({ C: m.rho * m.c * d * area * massScale, rHalf: d / (2 * m.k * area), rBefore: pendingGap });
      pendingGap = 0;
    }
  }
  return { list, trailingGap: pendingGap };
}

/**
 * Builds the node chain for one envelope element.
 * Returns the inner surface node and (if it meets the outdoors) the outer surface node.
 */
function buildChain(
  b: Builder,
  cons: Construction,
  area: number,
  outer: 'exterior' | 'adiabatic' | 'ground',
  name: string,
  massScale: number,
): { inner: number; outer: number | null; groundNode: number | null; groundG: number } {
  const { list, trailingGap } = slabs(cons.layers, area, massScale);
  const nodes = list.map((s, i) => addNode(b, s.C, `${name}:${i}`));
  let outerNode: number | null = null;
  let groundNode: number | null = null;
  let groundG = 0;
  if (outer === 'exterior') {
    outerNode = addNode(b, 0, `${name}:out`);
    addLink(b, outerNode, nodes[0], 1 / (list[0].rHalf + list[0].rBefore));
  } else if (outer === 'ground') {
    groundNode = nodes[0];
    groundG = 1 / list[0].rHalf;
  }
  for (let i = 1; i < nodes.length; i++) {
    addLink(b, nodes[i - 1], nodes[i], 1 / (list[i - 1].rHalf + list[i].rBefore + list[i].rHalf));
  }
  const inner = addNode(b, 0, `${name}:in`);
  const last = list[list.length - 1];
  addLink(b, nodes[nodes.length - 1], inner, 1 / (last.rHalf + trailingGap));
  return { inner, outer: outerNode, groundNode, groundG };
}

export function isSheetRoof(h: Home): boolean {
  return h.roof === 'tin' || h.roof === 'asbestos' || h.roof === 'clayTile' || h.roof === 'thatch';
}

/** Roof build-up after insulation upgrades (a false ceiling is modelled separately as a void). */
export function effectiveRoof(h: Home): Construction {
  const c = roofConstruction(h.roof, h.roofFinish);
  const layers = [...c.layers];
  if (h.roofInsulation !== 'none') {
    const ins: Layer =
      h.roofInsulation === 'puf50'
        ? { kind: 'solid', material: 'puf', thickness: 0.05 }
        : { kind: 'solid', material: 'eps', thickness: 0.075 };
    if (isSheetRoof(h)) {
      // Insulation fixed under the sheet.
      layers.splice(1, 0, ins);
    } else {
      // Over-deck insulation with a protective screed on top.
      layers.unshift({ kind: 'solid', material: 'plaster', thickness: 0.025 }, ins);
    }
  }
  // Foil under the roof: its shiny face barely radiates.
  const emissivityIn = h.radiantBarrier ? 0.05 : c.emissivityIn;
  return { ...c, layers, emissivityIn };
}

/** Linearised radiation between two facing surfaces at ~47 °C (hot roof spaces), W/m²K. */
function gapRadiation(e1: number, e2: number): number {
  return (4 * SIGMA * 320 ** 3) / (1 / e1 + 1 / e2 - 1);
}

export function buildNetwork(h: Home): Network {
  const cal = h.calibration;
  const massScale = cal?.massScale ?? 1;
  const b: Builder = { C: [], labels: [], links: [] };
  const A = h.floorArea;
  const side = Math.sqrt(A);
  const volume = A * h.height;

  const air = addNode(b, 1.2 * 1005 * volume, 'air');
  const mrt = addNode(b, 0, 'mrt');
  const mass = addNode(b, INTERNAL_MASS_PER_M2 * A * massScale, 'mass');
  const massArea = 2 * A;
  addLink(b, mass, air, 3 * massArea);
  addLink(b, mass, mrt, HR_INDOOR * 0.9 * massArea);

  const exterior: ExteriorSurface[] = [];
  const elements: Element[] = [];
  const windows: WindowPart[] = [];
  const outdoorLinks: Network['outdoorLinks'] = [];
  let ground: Network['ground'] = null;
  let voidNode: number | null = null;

  const attachInner = (inner: number, area: number, hc: number, emissivity: number) => {
    const hcA = hc * area;
    const hrA = HR_INDOOR * emissivity * area;
    addLink(b, inner, air, hcA);
    addLink(b, inner, mrt, hrA);
    return { hcA, hrA };
  };

  // ---- Roof or shared ceiling ----
  if (roofExposed(h)) {
    const roof = effectiveRoof(h);
    const ch = buildChain(b, roof, A, 'exterior', 'roof', massScale);
    const absorbScale = cal?.roofAbsorptanceScale ?? 1;
    exterior.push({
      node: ch.outer as number,
      label: 'roof',
      area: A,
      tilt: 0,
      facing: 180,
      absorptance: Math.min(0.98, Math.max(0.05, roof.absorptance * absorbScale)),
      emissivity: roof.emissivityOut,
      fSky: 1 - h.roofShade,
      fGround: 0,
      fShade: h.roofShade,
      solarFactor: 1 - h.roofShade,
      windFactor: 0.7,
    });
    if (h.falseCeiling) {
      // Roof underside → ventilated void → gypsum board → room.
      const voidDepth = 0.4;
      voidNode = addNode(b, 1.2 * 1005 * A * voidDepth, 'void');
      const gypTop = addNode(b, 0, 'ceiling:top');
      const gyp = MATERIALS.gypsum;
      const d = 0.0125;
      const gypMid = addNode(b, gyp.rho * gyp.c * d * A * massScale, 'ceiling:board');
      const gypBottom = addNode(b, 0, 'ceiling:in');
      addLink(b, gypTop, gypMid, (2 * gyp.k * A) / d);
      addLink(b, gypMid, gypBottom, (2 * gyp.k * A) / d);
      addLink(b, ch.inner, voidNode, 1.0 * A);
      addLink(b, gypTop, voidNode, 1.0 * A);
      addLink(b, ch.inner, gypTop, gapRadiation(roof.emissivityIn, 0.9) * A);
      // Sheet roofs leak at the eaves and ridge, so their voids are well vented.
      const voidACH = isSheetRoof(h) ? 10 : 1;
      outdoorLinks.push({ node: voidNode, G: (1.2 * 1005 * voidACH * A * voidDepth) / 3600 });
      const att = attachInner(gypBottom, A, 1.0, 0.9);
      elements.push({ kind: 'roof', area: A, innerNode: gypBottom, outerNode: ch.outer, ...att });
    } else {
      const att = attachInner(ch.inner, A, 1.0, roof.emissivityIn);
      elements.push({ kind: 'roof', area: A, innerNode: ch.inner, outerNode: ch.outer, ...att });
      // Outdoor air washing through the gaps between tiles or thatch takes heat off the underside.
      if (h.roof === 'clayTile' || h.roof === 'thatch') outdoorLinks.push({ node: ch.inner, G: 2 * A });
    }
  } else {
    const ch = buildChain(b, sharedSlabConstruction(), A, 'adiabatic', 'ceiling', massScale);
    const att = attachInner(ch.inner, A, 1.0, 0.9);
    elements.push({ kind: 'ceilingShared', area: A, innerNode: ch.inner, outerNode: null, ...att });
  }

  // ---- Walls and windows ----
  const wallCons = wallConstruction(h.wall, h.wallFinish);
  let openArea = 0;
  let sidesWithWindows = 0;
  for (const s of SIDES) {
    const gross = side * h.height;
    if (!h.exposed[s]) {
      const ch = buildChain(b, wallCons, gross, 'adiabatic', `wall${s}`, massScale);
      const att = attachInner(ch.inner, gross, 2.5, wallCons.emissivityIn);
      elements.push({ kind: 'wall', side: s, area: gross, innerNode: ch.inner, outerNode: null, ...att });
      continue;
    }
    const win = Math.min(h.windows[s], gross * 0.6);
    const net = gross - win;
    const ch = buildChain(b, wallCons, net, 'exterior', `wall${s}`, massScale);
    exterior.push({
      node: ch.outer as number,
      label: s,
      area: net,
      tilt: 90,
      facing: SIDE_AZIMUTH[s],
      absorptance: wallCons.absorptance,
      emissivity: wallCons.emissivityOut,
      fSky: 0.5 * (1 - h.wallShade),
      fGround: 0.5,
      fShade: 0.5 * h.wallShade,
      solarFactor: 1 - h.wallShade,
      windFactor: 0.5,
    });
    const att = attachInner(ch.inner, net, 2.5, wallCons.emissivityIn);
    elements.push({ kind: 'wall', side: s, area: net, innerNode: ch.inner, outerNode: ch.outer, ...att });

    if (win > 0.05) {
      const node = addNode(b, 0, `window${s}`);
      const hcA = 3 * win;
      const hrA = HR_INDOOR * 0.84 * win;
      addLink(b, node, air, hcA);
      addLink(b, node, mrt, hrA);
      windows.push({
        side: s,
        facing: SIDE_AZIMUTH[s],
        area: win,
        node,
        rPane: h.windowType === 'glass' ? 0.004 : 0.18,
        hcA,
        hrA,
      });
      openArea += win * (h.windowType === 'glass' ? 0.45 : 0.6);
      sidesWithWindows++;
    }
  }

  // ---- Floor ----
  let floorSurface: number;
  if (floorOnGround(h)) {
    const ch = buildChain(b, groundFloorConstruction(), A, 'ground', 'floor', massScale);
    const att = attachInner(ch.inner, A, 1.5, 0.9);
    elements.push({ kind: 'floor', area: A, innerNode: ch.inner, outerNode: null, ...att });
    ground = { node: ch.groundNode as number, G: ch.groundG };
    floorSurface = ch.inner;
  } else {
    const ch = buildChain(b, sharedSlabConstruction(), A, 'adiabatic', 'floor', massScale);
    const att = attachInner(ch.inner, A, 1.5, 0.9);
    elements.push({ kind: 'floorShared', area: A, innerNode: ch.inner, outerNode: null, ...att });
    floorSurface = ch.inner;
  }

  let infiltrationACH = h.homeType === 'hut' ? 2 : h.homeType === 'independent' ? 1 : 0.7;
  if (h.roof === 'clayTile' || h.roof === 'thatch') infiltrationACH += 2;
  infiltrationACH *= cal?.ventilationScale ?? 1;

  return {
    n: b.C.length,
    C: Float64Array.from(b.C),
    labels: b.labels,
    links: b.links,
    exterior,
    elements,
    windows,
    ground,
    outdoorLinks,
    voidNode,
    air,
    mrt,
    mass,
    floorSurface,
    volume,
    floorArea: A,
    infiltrationACH,
    openArea: openArea * (cal?.ventilationScale ?? 1),
    crossVentilation: h.crossVentilation && sidesWithWindows >= 2,
  };
}
