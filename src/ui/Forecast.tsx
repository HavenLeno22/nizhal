// The home screen: how hot it will get inside this home, when, and what to do tonight.
import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { heatLevel } from '../engine/comfort';
import type { Home } from '../engine/home';
import { useLang, useT } from '../i18n';
import { tonightPlan, type TonightPlan } from '../engine/advice';
import { dateRange, dayTimeLabel, deg, heatStretch, timeLabel, weekday } from '../lib/format';
import { analysisKey, useEngine, useWeather } from '../state/hooks';
import { useStore } from '../state/store';
import type { Analysis } from '../workers/protocol';
import { HouseOutline } from './art';
import { DayChart } from './charts/DayChart';
import { DayRows } from './charts/DayRows';
import { HeatRibbon } from './charts/HeatRibbon';
import { ErrorNotice, Segmented } from './controls';

export function Forecast({ home }: { home: Home }) {
  const t = useT();
  const { state, dispatch } = useStore();
  const period = state.prefs.period;
  const wx = useWeather(home.place, period);
  const req = wx.weather ? ({ type: 'analyze', home, weather: wx.weather } as const) : null;
  const an = useEngine<'analyze'>(req, analysisKey(home, wx.weather));
  const [day, setDay] = useState<number | null>(null);

  const a = an.data;
  const busy = wx.status === 'loading' || an.status === 'running';
  const selectedDay = day ?? (a ? Math.floor(a.habitSummary.peakIndex / 24) : 0);

  return (
    <div className="view forecast">
      <div className="view__bar">
        <Segmented
          label={t.period.forecast}
          hideLabel
          wrap
          value={period}
          options={[
            { value: 'forecast', label: t.period.forecast },
            { value: 'hottest', label: t.period.hottest },
          ]}
          onChange={(p) => {
            setDay(null);
            dispatch({ type: 'setPrefs', patch: { period: p } });
          }}
        />
      </div>

      {wx.notice === 'forecastFailed' && <p className="notice">{t.forecast.forecastFailed}</p>}
      {wx.notice === 'sample' && wx.weather && <p className="notice">{t.forecast.sampleNotice(wx.weather.place.name)}</p>}
      {wx.status === 'error' && <ErrorNotice text={t.forecast.weatherError} onRetry={wx.reload} />}
      {an.status === 'error' && <ErrorNotice text={t.forecast.engineError} onRetry={an.retry} />}

      {!a && wx.status !== 'error' && an.status !== 'error' && <p className="loading">{t.forecast.loading}</p>}

      {a && wx.weather && (
        <div className={busy ? 'stale' : undefined} aria-busy={busy}>
          <Hero a={a} home={home} period={wx.shown} onShowHottest={() => dispatch({ type: 'setPrefs', patch: { period: 'hottest' } })} />
          <HeatRibbon r={a.habit} selectedDay={selectedDay} onSelectDay={setDay} />
          <div className="forecast__split">
            <Tonight a={a} home={home} period={wx.shown} />
            <DayRows
              summary={a.habitSummary}
              startUtc={a.habit.startUtc}
              utcOffset={a.habit.utcOffset}
              selected={selectedDay}
              onSelect={setDay}
            />
          </div>
          <DayChart habit={a.habit} smart={a.smart} day={selectedDay} showPlan={home.windowHabit !== 'smart' && (a.nightGain > 0.3 || a.peakGain > 0.3)} />
          <p className="source">
            {wx.shown === 'forecast'
              ? t.forecast.sourceForecast
              : t.forecast.sourceHottest(
                  dateRange(a.habit.startUtc, a.habit.startUtc + (a.habit.hours - 1) * 3_600_000, a.habit.utcOffset, state.prefs.lang),
                )}
          </p>
        </div>
      )}
    </div>
  );
}

function Hero(props: { a: Analysis; home: Home; period: 'forecast' | 'hottest'; onShowHottest: () => void }) {
  const { a, home } = props;
  const t = useT();
  const lang = useLang();
  const r = a.habit;
  const s = a.habitSummary;
  const k = s.peakIndex;
  const peak = s.peak;
  const outAtPeak = r.outdoor[k];
  const diff = Math.round(peak - outAtPeak);
  const at = r.startUtc + k * 3_600_000;
  const level = heatLevel(r.heatIndex[k]);
  const mild = props.period === 'forecast' && peak < 33;

  return (
    <section className="hero" aria-labelledby="hero-lead">
      <div className="hero__house">
        <HouseOutline roof={home.roof} homeType={home.homeType} />
        <p className="hero__lead" id="hero-lead">
          {props.period === 'forecast' ? t.forecast.leadForecast : t.forecast.leadHottest}
          <span className="hero__upto">{t.forecast.upTo}</span>
        </p>
        <p className="hero__temp" style={{ fontStretch: `${heatStretch(peak)}%` }}>
          {deg(peak)}
        </p>
        <p className="hero__band">
          <span className="key key--square" style={{ background: `var(--band-${level})` }} aria-hidden="true" />
          {t.band[level]}
        </p>
        <p className="hero__outside">
          <Sun size={18} aria-hidden="true" />
          <span>
            {t.forecast.outside} <strong>{deg(outAtPeak)}</strong>
          </span>
        </p>
      </div>
      <div className="hero__text">
        <p>
          {t.forecast.hottestAt(weekday(at, r.utcOffset, lang), timeLabel(at, r.utcOffset, lang))}{' '}
          {props.period === 'forecast' ? t.forecast.outsideWill(Math.round(outAtPeak)) : t.forecast.outsideWas(Math.round(outAtPeak))}{' '}
          {diff > 0 ? t.forecast.hotterInside(diff) : diff < 0 ? t.forecast.coolerInside(-diff) : ''}
        </p>
        {mild && (
          <p className="hero__mild">
            {t.forecast.mildWeek}{' '}
            <button type="button" className="link-button" onClick={props.onShowHottest}>
              {t.forecast.seeHottest}
            </button>
          </p>
        )}
      </div>
    </section>
  );
}

/** Words for the night's plan. A stretch of a day or more gives its end with the weekday, and a
 * start or end outside the week shown is left out rather than shown as the week's first or last hour. */
function openText(
  p: Extract<TonightPlan, { kind: 'open' }>,
  t: ReturnType<typeof useT>,
  time: (k: number) => string,
  dayTime: (k: number) => string,
): string {
  const f = t.forecast;
  if (p.to === null) return p.from === null ? f.keepOpenAllWeek : f.openFromRestOfWeek(time(p.from));
  if (!p.dayAndNight) return p.from === null ? f.keepOpenUntil(time(p.to)) : f.openFromTo(time(p.from), time(p.to));
  return p.from === null ? f.keepOpenDayNightUntil(dayTime(p.to)) : f.openFromKeepUntil(time(p.from), dayTime(p.to));
}

function Tonight(props: { a: Analysis; home: Home; period: 'forecast' | 'hottest' }) {
  const { a, home } = props;
  const t = useT();
  const lang = useLang();
  const r = a.smart;
  const time = (k: number) => timeLabel(r.startUtc + k * 3_600_000, r.utcOffset, lang);
  const dayTime = (k: number) => dayTimeLabel(r.startUtc + k * 3_600_000, r.utcOffset, lang);
  const plan = tonightPlan(a.segments, r.hours);
  const morning = 29; // 5 am the next day
  const coolTo = r.operative[Math.min(morning, r.hours - 1)];
  const shutTo = a.shut.operative[Math.min(morning, a.shut.hours - 1)];

  return (
    <section className="tonight" aria-labelledby="tonight-title">
      <div className="block-head">
        <h2 className="block-title" id="tonight-title">
          <Moon size={18} aria-hidden="true" /> {props.period === 'forecast' ? t.forecast.tonight : t.forecast.firstNight}
        </h2>
      </div>
      {plan.kind === 'open' ? (
        <>
          <p className="tonight__main">{openText(plan, t, time, dayTime)}</p>
          {coolTo < shutTo - 0.4 && <p>{t.forecast.coolsTo(Math.round(coolTo), time(morning), Math.round(shutTo))}</p>}
          {!home.mesh && <p className="tonight__note">{t.forecast.needMesh}</p>}
        </>
      ) : (
        <p className="tonight__main">{t.forecast.keepShut}</p>
      )}
    </section>
  );
}
