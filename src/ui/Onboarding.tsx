// First run: a welcome that shows the idea with real numbers, then four short steps.
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CHENNAI, homePreset, roofExposed, type Home, type HomeType, type WindowHabit } from '../engine/home';
import type { RoofType, SurfaceFinish } from '../engine/materials';
import { loadSamples, sampleToSeries } from '../engine/samples';
import type { WeatherSeries } from '../engine/weather';
import { CITIES, cityName } from '../data/cities';
import { LANGS, MESSAGES, useLang, useT, type Lang } from '../i18n';
import { deg, heatStretch } from '../lib/format';
import { analysisKey, useEngine } from '../state/hooks';
import { useStore } from '../state/store';
import { HomeTypeArt, HouseOutline, RoofArt } from './art';
import { ChoiceCards, Segmented, Stepper, Toggle } from './controls';
import { PlaceSearch } from './PlaceSearch';

const HOME_TYPES: HomeType[] = ['independent', 'topFlat', 'middleFlat', 'groundFlat', 'hut'];
const ROOFS: RoofType[] = ['rcc', 'rccWeathering', 'tin', 'asbestos', 'clayTile', 'thatch'];
const HABITS: WindowHabit[] = ['dayOpen', 'nightOpen', 'alwaysOpen', 'alwaysClosed', 'smart'];

export function LangSwitch() {
  const { state, dispatch } = useStore();
  const short: Record<Lang, string> = { en: 'EN', ta: 'த', hi: 'हि' };
  return (
    <Segmented
      label={MESSAGES[state.prefs.lang].about.language}
      hideLabel
      value={state.prefs.lang}
      options={LANGS.map((l) => ({ value: l, label: <span lang={l} title={MESSAGES[l].langName}>{short[l]}</span>, hint: MESSAGES[l].langName }))}
      onChange={(l) => dispatch({ type: 'setPrefs', patch: { lang: l } })}
    />
  );
}

export function Onboarding() {
  const t = useT();
  const { dispatch } = useStore();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Home>(() => homePreset('independent', CHENNAI));
  const patch = (p: Partial<Home>) => setDraft((d) => ({ ...d, ...p }));
  const total = 4;

  if (step === 0) return <Welcome onStart={() => setStep(1)} />;

  const finish = () => {
    dispatch({ type: 'setHome', home: draft });
    dispatch({ type: 'setPrefs', patch: { period: 'forecast' } });
    window.location.hash = '#/forecast';
  };

  return (
    <div className="setup">
      <header className="setup__top">
        <button type="button" className="icon-button" onClick={() => setStep((s) => s - 1)} aria-label={t.setup.back}>
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <span className="setup__count">{t.setup.stepOf(step, total)}</span>
        <LangSwitch />
      </header>
      <div className="setup__progress" aria-hidden="true">
        <span style={{ width: `${(step / total) * 100}%` }} />
      </div>
      <main className="setup__body">
        <h1 className="setup__title">{t.setup.steps[step - 1]}</h1>

        {step === 1 && <PlaceSearch value={draft.place} onPick={(p) => patch({ place: p })} />}

        {step === 2 && (
          <ChoiceCards
            label={t.fields.homeType}
            value={draft.homeType}
            options={HOME_TYPES.map((h) => ({ value: h, title: t.homeType[h], body: t.homeTypeHelp[h], art: <HomeTypeArt type={h} /> }))}
            onChange={(h) => setDraft((d) => ({ ...homePreset(h, d.place), people: d.people }))}
          />
        )}

        {step === 3 && (
          <>
            {roofExposed(draft) ? (
              <>
                <ChoiceCards
                  label={t.fields.roof}
                  value={draft.roof}
                  options={ROOFS.map((r) => ({ value: r, title: t.roof[r], art: <RoofArt type={r} /> }))}
                  onChange={(r) => patch({ roof: r, roofFinish: null })}
                />
                {draft.roof !== 'thatch' && (
                  <Segmented<SurfaceFinish | 'asIs'>
                    label={t.setup.roofColour}
                    wrap
                    value={draft.roofFinish ?? 'asIs'}
                    options={[
                      { value: 'asIs', label: t.finishDefault },
                      { value: 'dark', label: t.finish.dark },
                      { value: 'white', label: t.finish.white },
                      { value: 'coolWhite', label: t.finish.coolWhite },
                    ]}
                    onChange={(v) => patch({ roofFinish: v === 'asIs' ? null : v })}
                  />
                )}
                <p className="field__help">{t.setup.roofColourHelp}</p>
              </>
            ) : (
              <p className="setup__note">{t.homeTypeHelp[draft.homeType]}</p>
            )}
          </>
        )}

        {step === 4 && (
          <div className="setup__details">
            <Stepper
              label={t.fields.floorArea}
              help={t.fields.floorAreaHelp}
              value={draft.floorArea}
              min={8}
              max={250}
              step={1}
              format={(v) => `${t.fields.m2} (${t.fields.sqft(Math.round(v * 10.764))})`}
              onChange={(v) => patch({ floorArea: v })}
            />
            <Stepper label={t.fields.people} value={draft.people} min={0} max={15} step={1} onChange={(v) => patch({ people: v })} />
            <Segmented
              label={t.fields.habit}
              wrap
              value={draft.windowHabit}
              options={HABITS.map((h) => ({ value: h, label: t.habit[h] }))}
              onChange={(v) => patch({ windowHabit: v })}
            />
            <Toggle label={t.fields.fan} checked={draft.fan} onChange={(v) => patch({ fan: v })} />
            <Toggle label={t.fields.cooking} checked={draft.cookingInside} onChange={(v) => patch({ cookingInside: v })} />
            <Toggle label={t.fields.mesh} checked={draft.mesh} onChange={(v) => patch({ mesh: v })} />
          </div>
        )}
      </main>
      <footer className="setup__foot">
        {step < total ? (
          <button type="button" className="button button--primary" onClick={() => setStep((s) => s + 1)}>
            {t.setup.next}
          </button>
        ) : (
          <button type="button" className="button button--primary" onClick={finish}>
            {t.setup.finish}
          </button>
        )}
      </footer>
    </div>
  );
}

function Welcome({ onStart }: { onStart: () => void }) {
  const t = useT();
  const lang = useLang();
  const [sample, setSample] = useState<WeatherSeries | null>(null);
  const demoHome = homePreset('hut', CHENNAI);
  useEffect(() => {
    loadSamples()
      .then((f) => setSample(sampleToSeries(f.cities.find((c) => c.id === 'chennai') ?? f.cities[0])))
      .catch(() => setSample(null));
  }, []);
  const req = sample ? ({ type: 'analyze', home: demoHome, weather: sample } as const) : null;
  const an = useEngine<'analyze'>(req, analysisKey(demoHome, sample));
  const s = an.data?.habitSummary;
  const inside = s?.peak ?? null;
  const outside = an.data && s ? an.data.habit.outdoor[s.peakIndex] : null;

  return (
    <div className="welcome">
      <header className="welcome__top">
        <span className="brand">
          <span className="brand__word">nizhal</span>
          <span className="brand__ta" lang="ta">
            நிழல்
          </span>
        </span>
        <LangSwitch />
      </header>
      <main className="welcome__body">
        <h1 className="welcome__title">{t.welcome.title}</h1>
        <div className="welcome__demo" aria-hidden={inside === null}>
          <div className="hero__house hero__house--demo">
            <HouseOutline roof="tin" homeType="hut" />
            <p className="hero__temp" style={{ fontStretch: `${heatStretch(inside ?? 30)}%` }}>
              {inside === null ? '…' : deg(inside)}
            </p>
            {outside !== null && (
              <p className="hero__outside">
                {t.forecast.outside} <strong>{deg(outside)}</strong>
              </p>
            )}
          </div>
          {inside !== null && outside !== null && (
            <p className="welcome__sample">{t.welcome.sample(cityName(CITIES[0], lang), Math.round(outside), Math.round(inside))}</p>
          )}
        </div>
        <p className="welcome__lede">{t.welcome.body}</p>
        <button type="button" className="button button--primary button--large" onClick={onStart}>
          {t.welcome.start}
        </button>
        <p className="welcome__fine">{t.welcome.privacy}</p>
        <p className="welcome__fine">{t.welcome.madeFor}</p>
      </main>
    </div>
  );
}
