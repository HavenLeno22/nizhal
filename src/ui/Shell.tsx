// The app frame: brand, place, language, and the five sections.
import { Box, House, Info, MapPin, Thermometer, Wrench, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Home } from '../engine/home';
import { useT } from '../i18n';
import { About } from './About';
import { Fixes } from './Fixes';
import { Forecast } from './Forecast';
import { HeatView } from './HeatView';
import { HomeEditor } from './HomeEditor';
import { LangSwitch } from './Onboarding';

export type Tab = 'forecast' | 'fixes' | 'heat' | 'home' | 'about';
const TABS: { id: Tab; icon: LucideIcon }[] = [
  { id: 'forecast', icon: Thermometer },
  { id: 'fixes', icon: Wrench },
  { id: 'heat', icon: Box },
  { id: 'home', icon: House },
  { id: 'about', icon: Info },
];

function readTab(): Tab {
  const id = window.location.hash.replace(/^#\/?/, '');
  return (TABS.find((t) => t.id === id)?.id ?? 'forecast') as Tab;
}

export function useTab(): [Tab, (t: Tab) => void] {
  const [tab, setTab] = useState<Tab>(readTab);
  useEffect(() => {
    const on = () => setTab(readTab());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (t: Tab) => {
    if (readTab() !== t) window.location.hash = `#/${t}`;
    setTab(t);
    window.scrollTo({ top: 0 });
  };
  return [tab, go];
}

function useOffline(): boolean {
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOffline(navigator.onLine === false);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);
  return offline;
}

export function Shell({ home }: { home: Home }) {
  const t = useT();
  const [tab, go] = useTab();
  const offline = useOffline();

  return (
    <div className="shell">
      {/* Hash routing owns the URL, so the skip link moves focus instead of changing the hash. */}
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        {t.skipToContent}
      </a>
      {offline && (
        <p className="notice notice--offline" role="status">
          {t.offline}
        </p>
      )}
      <header className="topbar">
        <a className="brand" href="#/forecast" onClick={() => go('forecast')}>
          <span className="brand__word">nizhal</span>
          <span className="brand__ta" lang="ta">
            நிழல்
          </span>
        </a>
        <button type="button" className="placechip" onClick={() => go('home')}>
          <MapPin size={16} aria-hidden="true" />
          <span>{home.place.name}</span>
        </button>
        <nav className="tabs" aria-label={t.appName}>
          {TABS.map(({ id, icon: Icon }) => (
            <a
              key={id}
              href={`#/${id}`}
              className="tabs__item"
              aria-current={tab === id ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                go(id);
              }}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{t.tabs[id]}</span>
            </a>
          ))}
        </nav>
        <div className="topbar__lang">
          <LangSwitch />
        </div>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {tab === 'forecast' && <Forecast home={home} />}
        {tab === 'fixes' && <Fixes home={home} />}
        {tab === 'heat' && <HeatView home={home} />}
        {tab === 'home' && <HomeEditor home={home} />}
        {tab === 'about' && <About />}
      </main>
    </div>
  );
}
