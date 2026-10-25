// "Make it cooler": every fix tried on this home in last summer's hottest week,
// the best plan for a budget, and how to do each one.
import { ChevronDown } from 'lucide-react';
import { FIXES, type FixResult } from '../engine/fixes';
import type { Home } from '../engine/home';
import { useLang, useT } from '../i18n';
import { dateRange, deg, rupees } from '../lib/format';
import { analysisKey, useEngine, useWeather } from '../state/hooks';
import { useStore } from '../state/store';
import { BarList } from './charts/BarList';
import { ErrorNotice, Segmented } from './controls';

const BUDGETS = [0, 2000, 10000, 50000, -1];

function costText(t: ReturnType<typeof useT>, lo: number, hi: number): string {
  if (hi <= 0) return t.fixes.free;
  return t.fixes.cost(rupees(lo), rupees(hi));
}

export function Fixes({ home }: { home: Home }) {
  const t = useT();
  const lang = useLang();
  const { state, dispatch } = useStore();
  const budget = state.prefs.budget;
  const wx = useWeather(home.place, 'hottest');
  const req = wx.weather ? ({ type: 'fixes', home, weather: wx.weather, budget } as const) : null;
  const res = useEngine<'fixes'>(req, `${analysisKey(home, wx.weather)}|${budget}`);
  const data = res.data;
  const w = wx.weather;

  return (
    <div className="view fixes">
      <header className="view__head">
        <h1 className="view__title">{t.fixes.title}</h1>
        {w && (
          <p className="view__lead">
            {t.fixes.tested(
              w.place.name,
              dateRange(w.startUtc + w.spinupHours * 3_600_000, w.startUtc + (w.hours - 1) * 3_600_000, w.utcOffset, lang),
            )}
          </p>
        )}
      </header>

      {wx.status === 'error' && <ErrorNotice text={t.forecast.weatherError} onRetry={wx.reload} />}
      {res.status === 'error' && <ErrorNotice text={t.forecast.engineError} onRetry={res.retry} />}

      {!data && wx.status !== 'error' && res.status !== 'error' && (
        <div className="loading">
          <p>{t.fixes.computing}</p>
          <progress max={1} value={res.progress} />
        </div>
      )}

      {data && (
        <div className={res.status === 'running' ? 'stale' : undefined} aria-busy={res.status === 'running'}>
          <section className="plan" aria-labelledby="plan-title">
            <h2 className="block-title" id="plan-title">
              {t.fixes.planTitle}
            </h2>
            <Segmented
              label={t.fixes.budget}
              value={budget}
              wrap
              options={BUDGETS.map((b) => ({ value: b, label: t.fixes.budgets[b] }))}
              onChange={(b) => dispatch({ type: 'setPrefs', patch: { budget: b } })}
            />
            {data.plan.steps.length === 0 ? (
              <p className="plan__empty">{t.fixes.planEmpty}</p>
            ) : (
              <>
                <ol className="plan__steps">
                  {data.plan.steps.map((s) => (
                    <li key={s.id} className="plan__step">
                      <span className="plan__step-title">{t.fix[s.id].title}</span>
                      <span className="plan__step-cost">{costText(t, s.cost.low, s.cost.high)}</span>
                    </li>
                  ))}
                </ol>
                <div className="plan__result">
                  <p className="plan__peak">
                    <span className="plan__from">{deg(data.plan.base.peak)}</span>
                    <span className="plan__to" aria-hidden="true">
                      {deg(data.plan.final.peak)}
                    </span>
                  </p>
                  <ul className="plan__facts">
                    <li>{t.fixes.planPeak(Math.round(data.plan.base.peak), Math.round(data.plan.final.peak))}</li>
                    {data.plan.base.dangerHours > 0 && <li>{t.fixes.planStress(data.plan.base.dangerHours, data.plan.final.dangerHours)}</li>}
                    {data.plan.base.nights > 0 && data.plan.base.hotNights > 0 && (
                      <li>
                        {data.plan.final.hotNights < data.plan.base.hotNights
                          ? t.fixes.planNights(data.plan.base.hotNights, data.plan.final.hotNights, data.plan.base.nights)
                          : t.fixes.planNightsSame(data.plan.final.hotNights, data.plan.base.nights)}
                      </li>
                    )}
                    <li>{t.fixes.planCost(costText(t, data.plan.totalCost.low, data.plan.totalCost.high))}</li>
                  </ul>
                </div>
              </>
            )}
          </section>

          <section className="allfixes" aria-labelledby="all-title">
            <h2 className="block-title" id="all-title">
              {t.fixes.allTitle}
            </h2>
            <BarList
              label={t.fixes.allTitle}
              color="var(--series-outside)"
              bars={data.evaluation.results
                .filter((r) => r.peakDrop > 0.05)
                .map((r) => ({ key: r.id, label: t.fix[r.id].title, value: r.peakDrop, display: `−${r.peakDrop.toFixed(1)}°` }))}
            />
            <ul className="fixlist">
              {data.evaluation.results.map((r) => (
                <FixRow key={r.id} r={r} />
              ))}
            </ul>
            <p className="source">{t.fixes.costNote}</p>
          </section>
        </div>
      )}
    </div>
  );
}

function FixRow({ r }: { r: FixResult }) {
  const t = useT();
  const def = FIXES[r.id];
  const effects: string[] = [];
  if (r.peakDrop >= 0.15) effects.push(t.fixes.peakDrop(Number(r.peakDrop.toFixed(1))));
  else if (r.peakDrop <= -0.15) effects.push(t.fixes.peakRise(Number((-r.peakDrop).toFixed(1))));
  if (r.dangerHoursSaved > 0) effects.push(t.fixes.fewerStress(r.dangerHoursSaved));
  else if (r.dangerHoursSaved < 0) effects.push(t.fixes.moreStress(-r.dangerHoursSaved));
  if (r.hotNightsSaved > 0) effects.push(t.fixes.nightsSaved(r.hotNightsSaved));
  else if (r.hotNightsSaved < 0) effects.push(t.fixes.nightsLost(-r.hotNightsSaved));
  if (effects.length === 0) effects.push(t.fixes.littleEffect);

  return (
    <li className="fixrow">
      <details>
        <summary>
          <span className="fixrow__head">
            <span className="fixrow__title">{t.fix[r.id].title}</span>
            <span className="fixrow__cost">{costText(t, r.cost.low, r.cost.high)}</span>
          </span>
          <span className="fixrow__short">{t.fix[r.id].short}</span>
          {/* Spans, not a list: <summary> only allows phrasing content. The hidden full stop
              keeps screen readers from running the effects together. */}
          <span className="fixrow__effects">
            {effects.map((e, i) => (
              <span key={e}>
                {e}
                {i < effects.length - 1 && <span className="visually-hidden">. </span>}
              </span>
            ))}
          </span>
          <span className="fixrow__meta">
            <span className="chip">{t.fixes.effort[def.effort]}</span>
            {def.effort !== 'habit' && <span className="chip">{def.lifetime === null ? t.fixes.lastsForever : t.fixes.lasts(def.lifetime)}</span>}
            <span className="fixrow__more">
              {t.fixes.how} <ChevronDown size={16} aria-hidden="true" />
            </span>
          </span>
        </summary>
        <p className="fixrow__how">{t.fix[r.id].how}</p>
      </details>
    </li>
  );
}
