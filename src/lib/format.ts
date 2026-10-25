// Display formatting: temperatures, rupees, local times and dates.
import { LOCALE, type Lang } from '../i18n';

export function deg(v: number): string {
  return `${Math.round(v)}°`;
}

export function deg1(v: number): string {
  return `${(Math.round(v * 10) / 10).toFixed(1)}°`;
}

/** Rounds a rupee amount to a figure that doesn't pretend to precision. */
export function niceRupees(v: number): number {
  if (v <= 0) return 0;
  if (v < 1000) return Math.max(50, Math.round(v / 50) * 50);
  if (v < 10_000) return Math.round(v / 100) * 100;
  if (v < 100_000) return Math.round(v / 500) * 500;
  return Math.round(v / 1000) * 1000;
}

export function rupees(v: number): string {
  return `₹${niceRupees(v).toLocaleString('en-IN')}`;
}

/** Shift a UTC instant to the place's local wall clock, then format it as if UTC. */
function local(utcMs: number, utcOffset: number): Date {
  return new Date(utcMs + utcOffset * 1000);
}

export function timeLabel(utcMs: number, utcOffset: number, lang: Lang): string {
  const d = local(utcMs, utcOffset);
  const withMinutes = d.getUTCMinutes() !== 0;
  return new Intl.DateTimeFormat(LOCALE[lang], {
    hour: 'numeric',
    minute: withMinutes ? '2-digit' : undefined,
    timeZone: 'UTC',
  }).format(d);
}

/** Weekday and hour, for a time that may be days away: "Wednesday 10 am". */
export function dayTimeLabel(utcMs: number, utcOffset: number, lang: Lang): string {
  const d = local(utcMs, utcOffset);
  return new Intl.DateTimeFormat(LOCALE[lang], {
    weekday: 'long',
    hour: 'numeric',
    minute: d.getUTCMinutes() !== 0 ? '2-digit' : undefined,
    timeZone: 'UTC',
  }).format(d);
}

export function hourTick(hour: number, lang: Lang): string {
  const d = new Date(Date.UTC(2026, 0, 1, hour));
  return new Intl.DateTimeFormat(LOCALE[lang], { hour: 'numeric', timeZone: 'UTC' }).format(d);
}

export function weekday(utcMs: number, utcOffset: number, lang: Lang, style: 'short' | 'long' = 'long'): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: style, timeZone: 'UTC' }).format(local(utcMs, utcOffset));
}

export function dayAndDate(utcMs: number, utcOffset: number, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    local(utcMs, utcOffset),
  );
}

export function dateRange(fromUtc: number, toUtc: number, utcOffset: number, lang: Lang): string {
  const fmt = new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const a = local(fromUtc, utcOffset);
  const b = local(toUtc, utcOffset);
  try {
    return fmt.formatRange(a, b);
  } catch {
    return `${fmt.format(a)} – ${fmt.format(b)}`;
  }
}

/** Font width (CSS font-stretch %) that grows with heat: the type expands as it gets hotter. */
export function heatStretch(t: number): number {
  const lo = 28;
  const hi = 46;
  const f = Math.max(0, Math.min(1, (t - lo) / (hi - lo)));
  return Math.round(78 + f * 47);
}
