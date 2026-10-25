// App state: the home being modelled, preferences, and thermometer readings.
// Everything lives in this browser only (localStorage).

import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import type { Reading } from '../engine/calibrate';
import type { Home } from '../engine/home';
import type { Lang } from '../i18n';

export type Period = 'forecast' | 'hottest';
export type Theme = 'system' | 'light' | 'dark';

export interface Prefs {
  lang: Lang;
  period: Period;
  theme: Theme;
  /** Plan budget in rupees; -1 = no limit. */
  budget: number;
}

export interface AppState {
  home: Home | null;
  prefs: Prefs;
  readings: Reading[];
}

export type Action =
  | { type: 'setHome'; home: Home | null }
  | { type: 'patchHome'; patch: Partial<Home> }
  | { type: 'setPrefs'; patch: Partial<Prefs> }
  | { type: 'setReadings'; readings: Reading[] };

const KEY = 'nizhal:v1';

function guessLang(): Lang {
  const l = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
  if (l.startsWith('ta')) return 'ta';
  if (l.startsWith('hi')) return 'hi';
  return 'en';
}

export function defaultState(): AppState {
  return { home: null, prefs: { lang: guessLang(), period: 'forecast', theme: 'system', budget: 10000 }, readings: [] };
}

function load(): AppState {
  const base = defaultState();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return {
      home: parsed.home && parsed.home.version === 1 ? parsed.home : null,
      prefs: { ...base.prefs, ...(parsed.prefs ?? {}) },
      readings: Array.isArray(parsed.readings) ? parsed.readings : [],
    };
  } catch {
    return base;
  }
}

function save(s: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked (private mode): the app still works for this visit.
  }
}

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'setHome':
      return { ...s, home: a.home };
    case 'patchHome':
      return s.home ? { ...s, home: { ...s.home, ...a.patch } } : s;
    case 'setPrefs':
      return { ...s, prefs: { ...s.prefs, ...a.patch } };
    case 'setReadings':
      return { ...s, readings: a.readings };
  }
}

const StoreContext = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null);

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: AppState }) {
  const [state, dispatch] = useReducer(reducer, initial ?? null, (i) => i ?? load());
  useEffect(() => save(state), [state]);
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}

// ---- Share links: the home travels in the URL hash, never to a server. ----

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeHome(h: Home): string {
  const { calibration: _cal, ...rest } = h;
  void _cal;
  return toBase64Url(new TextEncoder().encode(JSON.stringify(rest)));
}

export function decodeHome(s: string): Home | null {
  try {
    const h = JSON.parse(new TextDecoder().decode(fromBase64Url(s))) as Home;
    if (h.version !== 1 || !h.place || typeof h.place.lat !== 'number' || typeof h.floorArea !== 'number') return null;
    return h;
  } catch {
    return null;
  }
}

export function shareUrl(h: Home): string {
  const url = new URL(window.location.href);
  url.hash = `home=${encodeHome(h)}`;
  return url.toString();
}

/** A home passed in the link (#home=…), if any. */
export function homeFromLocation(): Home | null {
  const m = window.location.hash.match(/home=([A-Za-z0-9_-]+)/);
  return m ? decodeHome(m[1]) : null;
}
