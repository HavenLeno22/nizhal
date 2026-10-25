// One day, hour by hour: outside, inside as the family lives now, and inside with
// Nizhal's window plan, over the IMAC comfortable range.
import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { heatLevel } from '../../engine/comfort';
import type { SimResult } from '../../engine/simulate';
import { useLang, useT } from '../../i18n';
import { deg, deg1, hourTick, timeLabel } from '../../lib/format';
import { Tooltip } from './Tooltip';
import { useWidth } from './useWidth';

interface Series {
  key: string;
  label: string;
  short: string;
  color: string;
  values: number[];
}

export function DayChart(props: { habit: SimResult; smart: SimResult; day: number; showPlan: boolean }) {
  const { habit, smart, day } = props;
  const t = useT();
  const lang = useLang();
  const [wrap, W] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const narrow = W < 520;
  const H = narrow ? 260 : 300;
  const M = { l: 36, r: narrow ? 52 : 108, t: 12, b: 40 };

  const k0 = day * 24;
  const n = Math.min(25, habit.hours - k0);
  const idx = Array.from({ length: n }, (_, i) => k0 + i);
  const pick = (a: Float32Array) => idx.map((k) => a[k]);
  const series: Series[] = [
    { key: 'out', label: t.forecast.outside, short: t.forecast.outside, color: 'var(--series-outside)', values: pick(habit.outdoor) },
    { key: 'in', label: t.forecast.inside, short: t.forecast.inside, color: 'var(--series-inside)', values: pick(habit.operative) },
  ];
  if (props.showPlan) {
    series.push({ key: 'plan', label: t.fix.smartWindows.title, short: '', color: 'var(--series-plan)', values: pick(smart.operative) });
  }

  const band = habit.comfort;
  const all = series.flatMap((s) => s.values);
  const span0 = Math.max(...all) - Math.min(...all, band.upper);
  const step = span0 > 14 ? 4 : span0 > 7 ? 2 : 1;
  const lo = Math.floor((Math.min(...all, band.upper) - 1) / step) * step;
  const hi = Math.ceil((Math.max(...all) + 1) / step) * step;

  const pw = W - M.l - M.r;
  const ph = H - M.t - M.b;
  const x = (i: number) => M.l + (i / 24) * pw;
  const y = (v: number) => M.t + (1 - (v - lo) / (hi - lo)) * ph;
  const path = (vals: number[]) => vals.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');

  const bandTop = y(Math.min(hi, band.upper));
  const bandBottom = y(Math.max(lo, band.lower));

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left - M.l) / pw) * 24);
    setHover(i >= 0 && i < n ? i : null);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setHover((h) => {
      const cur = h ?? 15;
      return e.key === 'ArrowLeft' ? Math.max(0, cur - 1) : Math.min(n - 1, cur + 1);
    });
  };

  // Direct end labels only where they don't collide; the legend always carries identity.
  const ends = series.map((s) => ({ s, y: y(s.values[s.values.length - 1]) })).sort((a, b) => a.y - b.y);
  const collide = ends.some((e, i) => i > 0 && e.y - ends[i - 1].y < 15);

  const yTicks: number[] = [];
  for (let v = lo; v <= hi; v += step) yTicks.push(v);
  const xTicks = narrow ? [0, 6, 12, 18] : [0, 3, 6, 9, 12, 15, 18, 21];
  const at = (i: number) => habit.startUtc + (k0 + i) * 3_600_000;

  // Windows-open strip: for the plan when shown, else for the current habit.
  const openRun = props.showPlan ? smart : habit;
  const strips: { from: number; to: number }[] = [];
  let s0 = -1;
  for (let i = 0; i < n; i++) {
    const open = openRun.windowsOpen[k0 + i] === 1;
    if (open && s0 < 0) s0 = i;
    if (s0 >= 0 && (!open || i === n - 1)) {
      strips.push({ from: s0, to: open ? i : i - 1 });
      s0 = -1;
    }
  }

  const hk = hover === null ? -1 : k0 + hover;
  const lvl = hover === null ? null : heatLevel(habit.heatIndex[hk]);

  return (
    <figure className="daychart">
      <figcaption className="block-head">
        <h2 className="block-title">{t.forecast.chartTitle}</h2>
      </figcaption>
      <ul className="legend">
        {series.map((s) => (
          <li key={s.key}>
            <span className="key key--line" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
        <li>
          <span className="key key--wash" />
          {t.forecast.comfort}
        </li>
        <li>
          <span className="key key--strip" />
          {t.forecast.windowsOpen}
        </li>
      </ul>
      <div className="daychart__plot" ref={wrap}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={t.forecast.chartTitle}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          {bandBottom > bandTop && <rect x={M.l} y={bandTop} width={pw} height={bandBottom - bandTop} className="comfort-band" />}
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={M.l} x2={M.l + pw} y1={y(v)} y2={y(v)} className="gridline" />
              <text x={M.l - 6} y={y(v) + 4} textAnchor="end" className="axis-label">
                {v}°
              </text>
            </g>
          ))}
          {xTicks.map((h) => (
            <text key={h} x={x(h)} y={H - M.b + 32} textAnchor="middle" className="axis-label">
              {hourTick(h, lang)}
            </text>
          ))}
          {strips.map((s) => (
            <rect key={s.from} x={x(s.from)} y={H - M.b + 8} width={Math.max(3, x(s.to) - x(s.from))} height={5} rx={2.5} className="open-strip" />
          ))}
          {series.map((s) => (
            <path key={s.key} d={path(s.values)} className="series-line" style={{ stroke: s.color }} />
          ))}
          {!collide &&
            ends.map(({ s, y: ly }) => (
              <text key={s.key} x={x(n - 1) + 8} y={ly + 4} className="end-label">
                {deg(s.values[s.values.length - 1])}
                {!narrow && s.short ? ` ${s.short}` : ''}
              </text>
            ))}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + ph} className="crosshair" />
              {series.map((s) => (
                <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r={4.5} className="marker" style={{ fill: s.color }} />
              ))}
            </g>
          )}
        </svg>
        {hover !== null && lvl && (
          <Tooltip
            x={x(hover)}
            y={M.t}
            width={W}
            title={timeLabel(at(hover), habit.utcOffset, lang)}
            rows={[
              ...series.map((s) => ({ key: s.key, swatch: s.color, value: deg1(s.values[hover]), label: s.label })),
              { key: 'feels', value: deg(habit.feels[hk]), label: t.forecast.feels },
              {
                key: 'hi',
                swatch: `var(--band-${lvl})`,
                square: true,
                value: deg(habit.heatIndex[hk]),
                label: `${t.forecast.heatIndex}: ${t.bandShort[lvl]}`,
              },
              { key: 'win', value: '', label: openRun.windowsOpen[hk] ? t.forecast.windowsOpen : t.forecast.windowsShut },
            ]}
          />
        )}
      </div>
      <button type="button" className="link-button" onClick={() => setTable((v) => !v)} aria-expanded={table}>
        {table ? t.forecast.hideTable : t.forecast.showTable}
      </button>
      {table && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t.forecast.time}</th>
                {series.map((s) => (
                  <th scope="col" key={s.key}>
                    {s.label}
                  </th>
                ))}
                <th scope="col">{t.forecast.feels}</th>
                <th scope="col">{t.forecast.heatIndex}</th>
              </tr>
            </thead>
            <tbody>
              {idx.slice(0, 24).map((k, i) => (
                <tr key={k}>
                  <th scope="row">{timeLabel(at(i), habit.utcOffset, lang)}</th>
                  {series.map((s) => (
                    <td key={s.key}>{deg1(s.values[i])}</td>
                  ))}
                  <td>{deg1(habit.feels[k])}</td>
                  <td>
                    {deg(habit.heatIndex[k])} {t.bandShort[heatLevel(habit.heatIndex[k])]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
