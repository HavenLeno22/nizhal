// A home, described the way a family would describe it.

import type { RoofType, SurfaceFinish, WallType } from './materials';

export type HomeType = 'independent' | 'topFlat' | 'middleFlat' | 'groundFlat' | 'hut';
export type Side = 'N' | 'E' | 'S' | 'W';
export const SIDES: Side[] = ['N', 'E', 'S', 'W'];
/** Compass direction each side faces, degrees from north. */
export const SIDE_AZIMUTH: Record<Side, number> = { N: 0, E: 90, S: 180, W: 270 };

export type WindowHabit = 'smart' | 'dayOpen' | 'nightOpen' | 'alwaysOpen' | 'alwaysClosed';
export type RoofInsulation = 'none' | 'puf50' | 'eps75';

export interface Place {
  name: string;
  lat: number;
  lon: number;
  admin?: string;
  country?: string;
  elevation?: number;
}

export interface Home {
  version: 1;
  name: string;
  place: Place;
  homeType: HomeType;
  /** Floor area of the space being modelled (the main room or the whole small home), m². */
  floorArea: number;
  /** Floor-to-ceiling height, m. */
  height: number;
  roof: RoofType;
  /** null = the roof material's own colour. */
  roofFinish: SurfaceFinish | null;
  roofInsulation: RoofInsulation;
  /** Gypsum false ceiling with an air gap under the roof. */
  falseCeiling: boolean;
  /** Aluminium-foil radiant barrier fixed under the roof (shiny side facing the gap). */
  radiantBarrier: boolean;
  /** Share of sunlight kept off the roof by a shade net, a second roof or trees (0..1). */
  roofShade: number;
  wall: WallType;
  wallFinish: SurfaceFinish | null;
  /** Walls that face the outdoors (the rest are shared with neighbours). */
  exposed: Record<Side, boolean>;
  /** Window area on each side, m². */
  windows: Record<Side, number>;
  windowType: 'glass' | 'shutter';
  /** Concrete sunshade ("chajja") or awning above windows. */
  sunshades: boolean;
  /** Curtains or blinds drawn during the day. */
  curtains: boolean;
  /** Share of sunlight kept off east, south and west walls by trees or creepers (0..1). */
  wallShade: number;
  /** Windows on opposite sides, so air can flow through. */
  crossVentilation: boolean;
  /** Insect mesh on windows (lets windows stay open at night). */
  mesh: boolean;
  windowHabit: WindowHabit;
  people: number;
  cookingInside: boolean;
  fan: boolean;
  calibration?: Calibration;
}

/** Corrections learned from thermometer readings (all 1 / 0 = no correction). */
export interface Calibration {
  roofAbsorptanceScale: number;
  ventilationScale: number;
  gainsScale: number;
  massScale: number;
  rmseBefore: number;
  rmseAfter: number;
  readings: number;
  fittedAt: string;
}

export const CHENNAI: Place = { name: 'Chennai', lat: 13.0827, lon: 80.2707, admin: 'Tamil Nadu', country: 'India', elevation: 6 };

export function defaultHome(place: Place = CHENNAI): Home {
  return {
    version: 1,
    name: 'My home',
    place,
    homeType: 'independent',
    floorArea: 40,
    height: 3,
    roof: 'rcc',
    roofFinish: null,
    roofInsulation: 'none',
    falseCeiling: false,
    radiantBarrier: false,
    roofShade: 0,
    wall: 'brick230',
    wallFinish: null,
    exposed: { N: true, E: true, S: true, W: true },
    windows: { N: 1.5, E: 1.5, S: 1.5, W: 1.5 },
    windowType: 'glass',
    sunshades: true,
    curtains: false,
    wallShade: 0,
    crossVentilation: true,
    mesh: false,
    windowHabit: 'dayOpen',
    people: 4,
    cookingInside: true,
    fan: true,
    calibration: undefined,
  };
}

/** Typical starting points for each kind of home. */
export function homePreset(type: HomeType, place: Place = CHENNAI): Home {
  const h = defaultHome(place);
  h.homeType = type;
  switch (type) {
    case 'independent':
      break;
    case 'topFlat':
      h.floorArea = 55;
      h.height = 2.9;
      h.exposed = { N: false, E: false, S: true, W: true };
      h.windows = { N: 0, E: 0, S: 2.5, W: 2 };
      h.crossVentilation = false;
      break;
    case 'middleFlat':
    case 'groundFlat':
      h.floorArea = 55;
      h.height = 2.9;
      h.exposed = { N: false, E: false, S: true, W: true };
      h.windows = { N: 0, E: 0, S: 2.5, W: 2 };
      h.crossVentilation = false;
      break;
    case 'hut':
      h.floorArea = 18;
      h.height = 2.4;
      h.roof = 'tin';
      h.wall = 'brick115';
      h.windows = { N: 0.5, E: 0.4, S: 0.5, W: 0.4 };
      h.windowType = 'shutter';
      h.sunshades = false;
      h.crossVentilation = false;
      h.people = 5;
      break;
  }
  return h;
}

export function roofExposed(h: Home): boolean {
  return h.homeType === 'independent' || h.homeType === 'topFlat' || h.homeType === 'hut';
}

export function floorOnGround(h: Home): boolean {
  return h.homeType === 'independent' || h.homeType === 'groundFlat' || h.homeType === 'hut';
}

export function cloneHome(h: Home): Home {
  return JSON.parse(JSON.stringify(h)) as Home;
}
