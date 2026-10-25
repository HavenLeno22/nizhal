// How hot it *feels*, and when it becomes dangerous.

/** Saturation vapour pressure over water, Pa (Magnus–Tetens, Alduchov & Eskridge 1996). */
export function saturationPressure(tC: number): number {
  return 610.94 * Math.exp((17.625 * tC) / (tC + 243.04));
}

export function atmosphericPressure(elevationM: number): number {
  return 101325 * Math.pow(1 - 2.25577e-5 * Math.max(0, elevationM), 5.2559);
}

/** Humidity ratio (kg water / kg dry air) from dew point. */
export function humidityRatioFromDewPoint(dewPointC: number, pressurePa: number): number {
  const pw = saturationPressure(dewPointC);
  return (0.622 * pw) / (pressurePa - pw);
}

/** Relative humidity (%) of air with humidity ratio W at temperature t. */
export function relativeHumidity(W: number, tC: number, pressurePa: number): number {
  const pw = (W * pressurePa) / (0.622 + W);
  return Math.max(1, Math.min(100, (100 * pw) / saturationPressure(tC)));
}

/**
 * NOAA / US National Weather Service heat index (°C) from temperature (°C) and
 * relative humidity (%): Steadman's simple formula below ~27 °C, the Rothfusz
 * regression above it, with NWS's low- and high-humidity adjustments.
 */
export function heatIndex(tC: number, rh: number): number {
  const T = tC * 1.8 + 32;
  const R = Math.max(0, Math.min(100, rh));
  let hi = 0.5 * (T + 61 + (T - 68) * 1.2 + R * 0.094);
  if ((hi + T) / 2 >= 80) {
    hi =
      -42.379 +
      2.04901523 * T +
      10.14333127 * R -
      0.22475541 * T * R -
      0.00683783 * T * T -
      0.05481717 * R * R +
      0.00122874 * T * T * R +
      0.00085282 * T * R * R -
      0.00000199 * T * T * R * R;
    if (R < 13 && T >= 80 && T <= 112) hi -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
    else if (R > 85 && T >= 80 && T <= 87) hi += ((R - 85) / 10) * ((87 - T) / 5);
  }
  return (hi - 32) / 1.8;
}

export type HeatLevel = 'green' | 'yellow' | 'orange' | 'red';

/**
 * India Meteorological Department's experimental heat index colour bands
 * (Ministry of Earth Sciences, 2023), computed with the same NOAA equation:
 * green < 35 °C, yellow 35–45, orange 45–55, red ≥ 55.
 */
export const HEAT_LEVELS: { level: HeatLevel; from: number }[] = [
  { level: 'green', from: -Infinity },
  { level: 'yellow', from: 35 },
  { level: 'orange', from: 45 },
  { level: 'red', from: 55 },
];

export function heatLevel(hiC: number): HeatLevel {
  let l: HeatLevel = 'green';
  for (const h of HEAT_LEVELS) if (hiC >= h.from) l = h.level;
  return l;
}

/**
 * IMAC, the India Model for Adaptive Comfort (Manu et al., CEPT University, 2016),
 * for naturally ventilated buildings: neutral temperature from the 30-day outdoor
 * running mean, with a ±2.38 °C band that 90% of people find acceptable.
 */
export function imacBand(runningMean30: number): { neutral: number; lower: number; upper: number } {
  const t = Math.max(12.5, Math.min(31.5, runningMean30));
  const neutral = 0.54 * t + 12.83;
  return { neutral, lower: neutral - 2.38, upper: neutral + 2.38 };
}

/**
 * Cooling felt from a ceiling fan (air speed ~0.8–1 m/s), °C. Fans help a lot in
 * warm rooms, less as the air approaches skin temperature, and above ~37 °C
 * they stop helping: blowing air hotter than skin can add heat (WHO heat–health
 * guidance warns against relying on fans in extreme heat).
 */
export function fanCooling(operativeC: number): number {
  if (operativeC <= 33) return 2.5;
  if (operativeC >= 37) return 0;
  return 2.5 * (37 - operativeC) / 4;
}
