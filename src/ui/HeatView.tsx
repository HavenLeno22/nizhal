// "See the heat": the 3D house through the hottest day, and where the heat comes from.
import { Pause, Play } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type { Home } from '../engine/home';
import { FLOW_KEYS, type FlowKey, type SimResult } from '../engine/simulate';
import { useLang, useT } from '../i18n';
import { deg, hourTick, timeLabel, dayAndDate } from '../lib/format';
import { analysisKey, useEngine, useWeather } from '../state/hooks';
import { useStore } from '../state/store';
import { BarList } from './charts/BarList';
import { ErrorNotice, Segmented } from './controls';
import { heatGradientCss, HEAT_STOPS } from './heatScale';

const House3D = lazy(() => import('./House3D'));

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Share of heat entering the home from each path, 11:00–17:00 on the given day. */
export function heatSources(r: SimResult, day: number): { key: FlowKey; share: number }[] {
  const sums: Record<FlowKey, number> = { roof: 0, walls: 0, windows: 0, sun: 0, air: 0, people: 0, floor: 0 };
  for (let h = 11; h <= 17; h++) {
    const k = day * 24 + h;
    if (k >= r.hours) break;
    for (const key of FLOW_KEYS) sums[key] += Math.max(0, r.flows[key][k]);
  }
  const total = FLOW_KEYS.reduce((s, key) => s + sums[key], 0) || 1;
  return FLOW_KEYS.map((key) => ({ key, share: sums[key] / total }))
    .filter((x) => x.share >= 0.005)
    .sort((a, b) => b.share - a.share);
}

export function HeatView({ home }: { home: Home }) {
  const t = useT();
  const lang = useLang();
  const { state } = useStore();
  const wx = useWeather(home.place, 'hottest');
  const fixesReq = wx.weather ? ({ type: 'fixes', home, weather: wx.weather, budget: state.prefs.budget } as const) : null;
  const fixes = useEngine<'fixes'>(fixesReq, `${analysisKey(home, wx.weather)}|${state.prefs.budget}`);
  const planIds = fixes.data?.plan.steps.map((s) => s.id) ?? [];
  const cmpReq = wx.weather && fixes.data ? ({ type: 'compare', home, weather: wx.weather, fixes: planIds } as const) : null;
  const cmp = useEngine<'compare'>(cmpReq, `${analysisKey(home, wx.weather)}|${planIds.join(',')}`);
  const [withPlan, setWithPlan] = useState(false);
  const [hour, setHour] = useState(15);
  const [playing, setPlaying] = useState(false);
  const canGl = useMemo(webglAvailable, []);
  const dark = state.prefs.theme === 'dark' || (state.prefs.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  const base = cmp.data?.base ?? null;
  const shown = cmp.data ? (withPlan ? cmp.data.planned : cmp.data.base) : null;
  // The hottest day of the week (by indoor peak in the home as it is).
  const day = useMemo(() => {
    if (!base) return 0;
    let best = 0;
    let bestV = -Infinity;
    for (let k = 0; k < base.hours; k++) if (base.operative[k] > bestV) {
      bestV = base.operative[k];
      best = Math.floor(k / 24);
    }
    return best;
  }, [base]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setHour((h) => (h + 1) % 24), 650);
    return () => window.clearInterval(id);
  }, [playing]);

  const k = day * 24 + hour;
  const sources = base ? heatSources(base, day) : [];

  return (
    <div className="view heatview">
      <header className="view__head">
        <h1 className="view__title">{t.heat.title}</h1>
        <p className="view__lead">{t.heat.body}</p>
      </header>

      {wx.status === 'error' && <ErrorNotice text={t.forecast.weatherError} onRetry={wx.reload} />}
      {fixes.status === 'error' && <ErrorNotice text={t.forecast.engineError} onRetry={fixes.retry} />}
      {cmp.status === 'error' && <ErrorNotice text={t.forecast.engineError} onRetry={cmp.retry} />}

      {!shown && wx.status !== 'error' && fixes.status !== 'error' && cmp.status !== 'error' && (
        <div className="loading">
          <p>{t.fixes.computing}</p>
          <progress max={1} value={fixes.data ? 0.9 : fixes.progress * 0.9} />
        </div>
      )}

      {shown && base && (
        <>
          <div className="heatview__stage">
            {canGl ? (
              <Suspense fallback={<div className="house3d" />}>
                <House3D home={home} result={shown} k={k} dark={dark} />
              </Suspense>
            ) : (
              <p className="notice">{t.heat.noWebgl}</p>
            )}
            <dl className="heatview__readout">
              <div>
                <dt>{t.forecast.outside}</dt>
                <dd>{deg(shown.outdoor[k])}</dd>
              </div>
              {shown.roofOuter && (
                <div>
                  <dt>{t.heat.roofLabel}</dt>
                  <dd>{deg(shown.roofOuter[k])}</dd>
                </div>
              )}
              <div>
                <dt>{t.heat.insideLabel}</dt>
                <dd>{deg(shown.operative[k])}</dd>
              </div>
            </dl>
            {canGl && <p className="heatview__hint">{t.heat.dragHint}</p>}
          </div>

          <div className="heatview__controls">
            <button type="button" className="button" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
              {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              {playing ? t.heat.pause : t.heat.play}
            </button>
            <label className="slider">
              <span className="field__label">
                {t.heat.time}: {dayAndDate(shown.startUtc + k * 3_600_000, shown.utcOffset, lang)},{' '}
                {timeLabel(shown.startUtc + k * 3_600_000, shown.utcOffset, lang)}
              </span>
              <input
                type="range"
                min={0}
                max={23}
                step={1}
                value={hour}
                aria-valuetext={timeLabel(shown.startUtc + k * 3_600_000, shown.utcOffset, lang)}
                onChange={(e) => setHour(Number(e.target.value))}
              />
              <span className="slider__ticks" aria-hidden="true">
                {[0, 6, 12, 18].map((h) => (
                  <span key={h} style={{ left: `${(h / 23) * 100}%` }}>
                    {hourTick(h, lang)}
                  </span>
                ))}
              </span>
            </label>
            {planIds.length > 0 && (
              <Segmented
                label={t.heat.withPlan}
                hideLabel
                value={withPlan ? 'plan' : 'base'}
                options={[
                  { value: 'base', label: t.heat.asItIs },
                  { value: 'plan', label: t.heat.withPlan },
                ]}
                onChange={(v) => setWithPlan(v === 'plan')}
              />
            )}
          </div>

          <figure className="scale-legend">
            <figcaption className="field__label">{t.heat.surfaceTemp}</figcaption>
            <div className="scale-legend__bar" style={{ background: heatGradientCss() }} />
            <div className="scale-legend__ticks">
              {HEAT_STOPS.map(([v]) => (
                <span key={v}>{v}°</span>
              ))}
            </div>
          </figure>

          <section className="sources" aria-labelledby="sources-title">
            <h2 className="block-title" id="sources-title">
              {t.heat.sourcesTitle}
            </h2>
            <p className="block-note">{t.heat.sourcesNote}</p>
            <BarList
              label={t.heat.sourcesTitle}
              color="var(--series-inside)"
              max={1}
              bars={sources.map((s) => ({ key: s.key, label: t.flow[s.key], value: s.share, display: `${Math.round(s.share * 100)}%` }))}
            />
          </section>
        </>
      )}
    </div>
  );
}
