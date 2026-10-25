// Where the sun is, and how much of its energy lands on each surface of the house.
// Solar position: NOAA Solar Calculator equations (Meeus, "Astronomical Algorithms").
// Surface irradiance: isotropic sky model (Liu & Jordan): direct beam + sky diffuse
// + light reflected off the ground.

const RAD = Math.PI / 180;

export interface SunPosition {
  /** Angle from straight overhead, degrees (90 = on the horizon). */
  zenith: number;
  /** Compass direction of the sun, degrees clockwise from north. */
  azimuth: number;
  /** Solar declination, degrees. */
  declination: number;
}

/** Sun position at a moment (UTC milliseconds) seen from latitude/longitude (degrees, east positive). */
export function sunPosition(utcMs: number, lat: number, lon: number): SunPosition {
  const jd = utcMs / 86_400_000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = mod(280.46646 + T * (36000.76983 + 0.0003032 * T), 360);
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C =
    Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M * RAD) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const appLong = trueLong - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(appLong * RAD)) / RAD;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime =
    (4 / RAD) *
    (y * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD));
  const minutesUtc = mod(utcMs / 60_000, 1440);
  const trueSolarTime = mod(minutesUtc + eqTime + 4 * lon, 1440);
  const hourAngle = trueSolarTime / 4 - 180;

  const phi = lat * RAD;
  const delta = decl * RAD;
  const H = hourAngle * RAD;
  const cosZ = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(H);
  const zenith = Math.acos(Math.max(-1, Math.min(1, cosZ))) / RAD;
  const az = Math.atan2(-Math.sin(H), Math.tan(delta) * Math.cos(phi) - Math.sin(phi) * Math.cos(H)) / RAD;
  return { zenith, azimuth: mod(az, 360), declination: decl };
}

export interface SkyState {
  /** Global horizontal irradiance, W/m². */
  ghi: number;
  /** Direct normal irradiance, W/m². */
  dni: number;
  /** Diffuse horizontal irradiance, W/m². */
  dhi: number;
  zenith: number;
  azimuth: number;
}

/** Ground reflectance (albedo) for typical Indian urban ground: soil, concrete, tar. */
export const GROUND_ALBEDO = 0.2;

/**
 * Sunlight falling on a surface, W/m².
 * @param tilt degrees from horizontal (0 = flat roof, 90 = wall)
 * @param facing compass direction the surface faces, degrees from north (ignored when tilt = 0)
 */
export function irradianceOn(sky: SkyState, tilt: number, facing: number, shadeBeam = 0): number {
  const beta = tilt * RAD;
  let beam = 0;
  if (sky.zenith < 90 && sky.dni > 0) {
    const Z = sky.zenith * RAD;
    const cosInc = Math.cos(Z) * Math.cos(beta) + Math.sin(Z) * Math.sin(beta) * Math.cos((sky.azimuth - facing) * RAD);
    if (cosInc > 0) beam = sky.dni * cosInc * (1 - shadeBeam);
  }
  const diffuse = sky.dhi * (1 + Math.cos(beta)) / 2;
  const ground = sky.ghi * GROUND_ALBEDO * (1 - Math.cos(beta)) / 2;
  return beam + diffuse + ground;
}

/** Shading from a horizontal overhang ("chajja") above a window: fraction of the window's beam blocked. */
export function overhangShade(sky: SkyState, facing: number, depthOverHeight: number): number {
  if (depthOverHeight <= 0 || sky.zenith >= 90) return 0;
  // Profile angle: the sun's elevation seen in the vertical plane normal to the wall.
  const alt = (90 - sky.zenith) * RAD;
  const rel = (sky.azimuth - facing) * RAD;
  const cosRel = Math.cos(rel);
  if (cosRel <= 0) return 0; // sun is behind the wall
  const tanProfile = Math.tan(alt) / cosRel;
  // Shadow length down the window = depth × tan(profile); window height normalised to 1.
  return Math.max(0, Math.min(1, depthOverHeight * tanProfile));
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
