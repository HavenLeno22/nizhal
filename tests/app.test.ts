import { describe, expect, it } from 'vitest';
import { homePreset } from '../src/engine/home';
import { en } from '../src/i18n/en';
import { hi } from '../src/i18n/hi';
import { ta } from '../src/i18n/ta';
import { heatStretch, niceRupees } from '../src/lib/format';
import { decodeHome, encodeHome } from '../src/state/store';
import { parseReadingsCsv } from '../src/ui/HomeEditor';

describe('share links', () => {
  it('round-trips a home, including a Tamil place name', () => {
    const h = homePreset('hut', { name: 'நாகர்கோவில்', lat: 8.18, lon: 77.41 });
    const back = decodeHome(encodeHome(h));
    expect(back).not.toBeNull();
    expect(back?.place.name).toBe('நாகர்கோவில்');
    expect(back?.roof).toBe('tin');
  });

  it('rejects garbage', () => {
    expect(decodeHome('not-a-home')).toBeNull();
    expect(decodeHome('')).toBeNull();
  });
});

describe('thermometer CSV import', () => {
  it('reads common logger formats and skips junk', () => {
    const csv = ['time,temp', '2026-10-20 08:00,30.5', '2026-10-20T14:00,34.1', '"2026-10-21 08:00";29.9', 'nonsense', '2026-10-21 14:00,999'].join('\n');
    const r = parseReadingsCsv(csv);
    expect(r.map((x) => x.tempC)).toEqual([30.5, 34.1, 29.9]);
  });
});

describe('formatting', () => {
  it('rounds rupees to honest figures', () => {
    expect(niceRupees(2583)).toBe(2600);
    expect(niceRupees(43056)).toBe(43000);
    expect(niceRupees(120)).toBe(100);
  });

  it('widens the hero type as it gets hotter', () => {
    expect(heatStretch(30)).toBeLessThan(heatStretch(40));
    expect(heatStretch(20)).toBe(78);
    expect(heatStretch(50)).toBe(125);
  });
});

describe('translations', () => {
  it('have every fix and every heat band in all three languages', () => {
    for (const m of [en, ta, hi]) {
      for (const k of Object.keys(en.fix)) expect((m.fix as Record<string, { title: string }>)[k].title.length).toBeGreaterThan(3);
      expect(Object.keys(m.band)).toEqual(Object.keys(en.band));
    }
  });
});
