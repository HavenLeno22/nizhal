// Seven days × 24 hours of indoor heat stress, coloured by IMD heat-index band.
import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { HEAT_LEVELS, heatLevel, type HeatLevel } from '../../engine/comfort';
import type { SimResult } from '../../engine/simulate';
import { useLang, useT } from '../../i18n';
import { deg, dayAndDate, hourTick, timeLabel, weekday } from '../../lib/format';
import { Tooltip } from './Tooltip';
import { useWidth } from './useWidth';

const TOP = 2;
const AXIS_H = 24;

export function HeatRibbon(props: { r: SimResult; selectedDay: number; onSelectDay: (d: number) => void }) {
  const { r } = props;
  const t = useT();
  const lang = useLang();
  const [wrap, W] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<{ d: number; h: number } | null>(null);
  const narrow = W < 520;
  const LABEL_W = narrow ? 52 : 84;
  const ROW_H = narrow ? 24 : 28;
  const days = Math.min(7, Math.floor(r.hours / 24));
  const cellW = (W - LABEL_W) / 24;
  const H = TOP + days * ROW_H + AXIS_H;

  const at = (d: number, h: number) => r.startUtc + (d * 24 + h) * 3_600_000;

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const h = Math.floor((x - LABEL_W) / cellW);
    const d = Math.floor((y - TOP) / ROW_H);
    if (h >= 0 && h < 24 && d >= 0 && d < days) setActive({ d, h });
    else setActive(null);
  };

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const cur = active ?? { d: props.selectedDay, h: 15 };
    let { d, h } = cur;
    if (e.key === 'ArrowRight') h = Math.min(23, h + 1);
    else if (e.key === 'ArrowLeft') h = Math.max(0, h - 1);
    else if (e.key === 'ArrowDown') d = Math.min(days - 1, d + 1);
    else if (e.key === 'ArrowUp') d = Math.max(0, d - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      props.onSelectDay(cur.d);
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    setActive({ d, h });
  };

  const k = active ? active.d * 24 + active.h : -1;
  const level: HeatLevel | null = active ? heatLevel(r.heatIndex[k]) : null;

  return (
    <figure className="ribbon">
      <figcaption className="block-head">
        <h2 className="block-title">{t.forecast.ribbonTitle}</h2>
        <p className="block-note">{t.forecast.ribbonNote}</p>
      </figcaption>
      <div className="ribbon__plot" ref={wrap}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={t.forecast.ribbonTitle}
          tabIndex={0}
          onPointerMove={pick}
          onPointerLeave={() => setActive(null)}
          onClick={() => active && props.onSelectDay(active.d)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          {Array.from({ length: days }, (_, d) => {
            const y = TOP + d * ROW_H;
            const selected = d === props.selectedDay;
            return (
              <g key={d}>
                <text x={0} y={y + ROW_H / 2 + 4.5} className={selected ? 'ribbon__day ribbon__day--selected' : 'ribbon__day'}>
                  {weekday(at(d, 12), r.utcOffset, lang, 'short')}
                  {narrow ? '' : ` ${new Date(at(d, 12) + r.utcOffset * 1000).getUTCDate()}`}
                </text>
                {Array.from({ length: 24 }, (_, h) => {
                  const lv = heatLevel(r.heatIndex[d * 24 + h]);
                  const isActive = active !== null && active.d === d && active.h === h;
                  return (
                    <rect
                      key={h}
                      x={LABEL_W + h * cellW + 1}
                      y={y + 1}
                      width={Math.max(1, cellW - 2)}
                      height={ROW_H - 2}
                      rx={narrow ? 2 : 3}
                      fill={`var(--band-${lv})`}
                      className={isActive ? 'ribbon__cell ribbon__cell--active' : 'ribbon__cell'}
                      style={{ '--h': h, '--d': d } as CSSProperties}
                    />
                  );
                })}
              </g>
            );
          })}
          {[0, 6, 12, 18].map((h) => (
            <text key={h} x={LABEL_W + h * cellW + 1} y={TOP + days * ROW_H + 17} className="axis-label">
              {hourTick(h, lang)}
            </text>
          ))}
        </svg>
        {active && level && (
          <Tooltip
            x={LABEL_W + (active.h + 1) * cellW}
            y={TOP + active.d * ROW_H}
            width={W}
            title={`${dayAndDate(at(active.d, active.h), r.utcOffset, lang)}, ${timeLabel(at(active.d, active.h), r.utcOffset, lang)}`}
            rows={[
              { key: 'hi', swatch: `var(--band-${level})`, square: true, value: deg(r.heatIndex[k]), label: `${t.forecast.heatIndex}: ${t.bandShort[level]}` },
              { key: 'in', swatch: 'var(--series-inside)', value: deg(r.operative[k]), label: t.forecast.inside },
              { key: 'out', swatch: 'var(--series-outside)', value: deg(r.outdoor[k]), label: t.forecast.outside },
            ]}
          />
        )}
      </div>
      <ul className="legend legend--bands" aria-label={t.forecast.heatIndex}>
        {HEAT_LEVELS.map((l) => (
          <li key={l.level}>
            <span className="key key--square" style={{ background: `var(--band-${l.level})` }} />
            {t.band[l.level]}
          </li>
        ))}
      </ul>
    </figure>
  );
}
