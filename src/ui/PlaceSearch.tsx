// Find the home's location: search, "use my location", or a quick city pick.
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { CITIES, cityName } from '../data/cities';
import type { Place } from '../engine/home';
import { geocode, type GeoResult } from '../engine/weather';
import { useLang, useT } from '../i18n';

export function PlaceSearch({ value, onPick }: { value: Place | null; onPick: (p: Place) => void }) {
  const t = useT();
  const lang = useLang();
  const id = useId();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [status, setStatus] = useState<'idle' | 'searching' | 'done' | 'error'>('idle');
  const [geo, setGeo] = useState<'idle' | 'locating' | 'denied'>('idle');

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setStatus('idle');
      return;
    }
    let alive = true;
    setStatus('searching');
    const timer = window.setTimeout(() => {
      geocode(query, lang)
        .then((r) => {
          if (!alive) return;
          setResults(r);
          setStatus('done');
        })
        .catch(() => alive && setStatus('error'));
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [q, lang]);

  const locate = () => {
    if (!navigator.geolocation) {
      setGeo('denied');
      return;
    }
    setGeo('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo('idle');
        onPick({ name: t.setup.myLocation, lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => setGeo('denied'),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  };

  const isPicked = (p: Place) => !!value && Math.abs(value.lat - p.lat) < 0.01 && Math.abs(value.lon - p.lon) < 0.01;

  return (
    <div className="placesearch">
      <label className="placesearch__box" htmlFor={id}>
        <Search size={18} aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t.setup.searchPlaceholder}
          autoComplete="off"
          aria-describedby={`${id}-status`}
        />
      </label>
      <p id={`${id}-status`} className="placesearch__status" aria-live="polite">
        {status === 'searching' ? t.setup.searching : status === 'done' && results.length === 0 ? t.setup.noResults : ''}
      </p>
      {results.length > 0 && (
        <ul className="placesearch__results">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="placesearch__result"
                aria-pressed={isPicked(r)}
                onClick={() => {
                  onPick({ name: r.name, lat: r.lat, lon: r.lon, admin: r.admin, country: r.country, elevation: r.elevation });
                  setQ('');
                  setResults([]);
                }}
              >
                <MapPin size={16} aria-hidden="true" />
                <span>
                  {r.name}
                  <span className="placesearch__admin">{[r.admin, r.country].filter(Boolean).join(', ')}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="button button--quiet" onClick={locate} disabled={geo === 'locating'}>
        <LocateFixed size={18} aria-hidden="true" /> {geo === 'locating' ? t.setup.locating : t.setup.useLocation}
      </button>
      {geo === 'denied' && <p className="placesearch__status">{t.setup.locationDenied}</p>}
      <p className="field__label">{t.setup.popular}</p>
      <div className="chips">
        {CITIES.map((c) => (
          <button key={c.id} type="button" className="chip chip--button" aria-pressed={isPicked(c)} onClick={() => onPick(c)}>
            {cityName(c, lang)}
          </button>
        ))}
      </div>
      {value && (
        <p className="placesearch__picked">
          <MapPin size={16} aria-hidden="true" /> {value.name}
          {value.admin ? `, ${value.admin}` : ''}
        </p>
      )}
    </div>
  );
}
