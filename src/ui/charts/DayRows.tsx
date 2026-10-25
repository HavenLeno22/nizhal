// Day by day: indoor and outdoor ranges on one shared scale.
import { heatLevel } from '../../engine/comfort';
import type { Summary } from '../../engine/summary';
import { useLang, useT } from '../../i18n';
import { deg, weekday } from '../../lib/format';

export function DayRows(props: { summary: Summary; startUtc: number; utcOffset: number; selected: number; onSelect: (d: number) => void }) {
  const t = useT();
  const lang = useLang();
  const days = props.summary.days.slice(0, 7);
  const lo = Math.floor(Math.min(...days.map((d) => Math.min(d.inMin, d.outMin))) - 1);
  const hi = Math.ceil(Math.max(...days.map((d) => Math.max(d.inMax, d.outMax))) + 1);
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const width = (a: number, b: number) => `${Math.max(1.5, ((b - a) / (hi - lo)) * 100)}%`;

  return (
    <section className="dayrows" aria-labelledby="dayrows-title">
      <div className="block-head">
        <h2 className="block-title" id="dayrows-title">
          {t.forecast.dayByDay}
        </h2>
      </div>
      <ul className="legend">
        <li>
          <span className="key key--bar" style={{ background: 'var(--series-inside)' }} />
          {t.forecast.inside}
        </li>
        <li>
          <span className="key key--line" style={{ background: 'var(--series-outside)' }} />
          {t.forecast.outside}
        </li>
      </ul>
      <ol className="dayrows__list">
        {days.map((d, i) => {
          const dayUtc = props.startUtc + (i * 24 + 12) * 3_600_000;
          const lvl = heatLevel(d.hiMax);
          return (
            <li key={d.date}>
              <button type="button" className="dayrow" aria-pressed={props.selected === i} onClick={() => props.onSelect(i)}>
                <span className="dayrow__name">
                  {weekday(dayUtc, props.utcOffset, lang, 'short')}
                  <span className="dayrow__date">{new Date(dayUtc + props.utcOffset * 1000).getUTCDate()}</span>
                </span>
                <span className="dayrow__track" aria-hidden="true">
                  <span className="dayrow__out" style={{ left: pos(d.outMin), width: width(d.outMin, d.outMax) }} />
                  <span className="dayrow__in" style={{ left: pos(d.inMin), width: width(d.inMin, d.inMax) }} />
                </span>
                <span className="dayrow__range">
                  {deg(d.inMin)}–{deg(d.inMax)}
                  <span className="visually-hidden">
                    {' '}
                    {t.forecast.inside}, {deg(d.outMin)}–{deg(d.outMax)} {t.forecast.outside}
                  </span>
                </span>
                <span className="dayrow__stress">
                  <span className="key key--square" style={{ background: `var(--band-${lvl})` }} aria-hidden="true" />
                  {d.dangerHours > 0 ? t.forecast.highStressHours(d.dangerHours) : t.bandShort[lvl]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
