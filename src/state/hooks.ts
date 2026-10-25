// Data hooks: weather (cached, with offline fallback) and engine results.
import { useEffect, useRef, useState } from 'react';
import type { Place } from '../engine/home';
import { loadSamples, nearestSample, sampleToSeries } from '../engine/samples';
import { fetchForecast, fetchHottestWeek, fetchRecent, lastSummerYear, type WeatherSeries } from '../engine/weather';
import { engine } from '../workers/client';
import type { EngineRequest, EngineResult } from '../workers/protocol';
import type { Period } from './store';

const HOUR = 3_600_000;

function cacheGet<T>(key: string, maxAge: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { at, value } = JSON.parse(raw) as { at: number; value: T };
    return Date.now() - at < maxAge ? value : null;
  } catch {
    return null;
  }
}

function cacheSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
  } catch {
    // Quota exceeded: drop old weather and carry on without caching.
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('nizhal:wx:')) localStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
  }
}

const placeKey = (p: Place) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;

export type WeatherNotice = 'sample' | 'forecastFailed' | null;

export interface WeatherState {
  status: 'loading' | 'ready' | 'error';
  weather: WeatherSeries | null;
  /** The period actually shown (a failed forecast falls back to the hottest week). */
  shown: Period;
  notice: WeatherNotice;
  reload: () => void;
}

async function hottestFor(place: Place): Promise<{ w: WeatherSeries; sample: boolean }> {
  const year = lastSummerYear();
  const key = `nizhal:wx:h:${placeKey(place)}:${year}`;
  const cached = cacheGet<WeatherSeries>(key, 30 * 24 * HOUR);
  if (cached) return { w: cached, sample: false };
  try {
    const w = await fetchHottestWeek(place, year);
    cacheSet(key, w);
    return { w, sample: false };
  } catch {
    const file = await loadSamples();
    const s = sampleToSeries(nearestSample(file, place));
    return { w: { ...s, place: { ...s.place } }, sample: true };
  }
}

async function forecastFor(place: Place): Promise<WeatherSeries> {
  const key = `nizhal:wx:f:${placeKey(place)}`;
  const cached = cacheGet<WeatherSeries>(key, HOUR);
  if (cached) return cached;
  const w = await fetchForecast(place, 7);
  cacheSet(key, w);
  return w;
}

export function useWeather(place: Place | null, period: Period): WeatherState {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<Omit<WeatherState, 'reload'>>({ status: 'loading', weather: null, shown: period, notice: null });
  const key = place ? `${placeKey(place)}|${period}|${nonce}` : '';

  useEffect(() => {
    if (!place) return;
    let alive = true;
    setState((s) => ({ ...s, status: 'loading' }));
    (async () => {
      if (period === 'forecast') {
        try {
          const w = await forecastFor(place);
          if (alive) setState({ status: 'ready', weather: w, shown: 'forecast', notice: null });
          return;
        } catch {
          const h = await hottestFor(place);
          if (alive) setState({ status: 'ready', weather: h.w, shown: 'hottest', notice: 'forecastFailed' });
          return;
        }
      }
      const h = await hottestFor(place);
      if (alive) setState({ status: 'ready', weather: h.w, shown: 'hottest', notice: h.sample ? 'sample' : null });
    })().catch(() => {
      if (alive) setState((s) => ({ ...s, status: 'error' }));
    });
    return () => {
      alive = false;
    };
    // `key` captures place, period and reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}

/** The last 31 days of weather, for calibration. */
export function useRecentWeather(place: Place | null, enabled: boolean): { weather: WeatherSeries | null; error: boolean } {
  const [weather, setWeather] = useState<WeatherSeries | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!place || !enabled) return;
    let alive = true;
    const key = `nizhal:wx:r:${placeKey(place)}`;
    const cached = cacheGet<WeatherSeries>(key, 3 * HOUR);
    if (cached) {
      setWeather(cached);
      return;
    }
    fetchRecent(place)
      .then((w) => {
        cacheSet(key, w);
        if (alive) setWeather(w);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [place?.lat, place?.lon, enabled]);
  return { weather, error };
}

export interface EngineState<T> {
  status: 'idle' | 'running' | 'ready' | 'error';
  /** Latest result; kept while a newer request runs, so the screen never flashes empty. */
  data: T | null;
  progress: number;
  error: string | null;
  /** Runs the same request again (after an error). */
  retry: () => void;
}

/** Recent engine results, so moving between tabs doesn't re-run the physics. */
const resultCache = new Map<string, unknown>();
const CACHE_MAX = 24;

function remember(key: string, value: unknown): void {
  resultCache.delete(key);
  resultCache.set(key, value);
  while (resultCache.size > CACHE_MAX) {
    const oldest = resultCache.keys().next().value;
    if (oldest === undefined) break;
    resultCache.delete(oldest);
  }
}

/**
 * Runs an engine request whenever `key` changes. Results from superseded
 * requests are dropped; repeated requests are answered from a small cache.
 */
export function useEngine<K extends EngineRequest['type']>(
  req: Extract<EngineRequest, { type: K }> | null,
  key: string,
): EngineState<EngineResult[K]> {
  const cacheKey = req ? `${req.type}|${key}` : '';
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Omit<EngineState<EngineResult[K]>, 'retry'>>(() => {
    const hit = cacheKey ? resultCache.get(cacheKey) : undefined;
    return hit ? { status: 'ready', data: hit as EngineResult[K], progress: 1, error: null } : { status: 'idle', data: null, progress: 0, error: null };
  });
  const latest = useRef(0);
  useEffect(() => {
    if (!req) return;
    const ticket = ++latest.current;
    const hit = resultCache.get(cacheKey);
    if (hit) {
      setState({ status: 'ready', data: hit as EngineResult[K], progress: 1, error: null });
      return;
    }
    setState((s) => ({ ...s, status: 'running', progress: 0, error: null }));
    engine
      .call(req, (p) => {
        if (ticket === latest.current) setState((s) => ({ ...s, progress: p }));
      })
      .then((data) => {
        remember(cacheKey, data);
        if (ticket === latest.current) setState({ status: 'ready', data, progress: 1, error: null });
      })
      .catch((e: Error) => {
        if (ticket === latest.current) setState((s) => ({ ...s, status: 'error', error: e.message }));
      });
    // `cacheKey` stands for the request's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

/** Stable key for a home + weather pair. */
export function analysisKey(home: unknown, w: WeatherSeries | null): string {
  return w ? `${JSON.stringify(home)}|${w.source}|${w.startUtc}|${w.hours}` : '';
}
