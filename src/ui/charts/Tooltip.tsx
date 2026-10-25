import type { ReactNode } from 'react';

export interface TooltipRow {
  key: string;
  /** Short line key in the series colour (CSS colour). */
  swatch?: string;
  /** Use a filled square instead of a line (for status bands). */
  square?: boolean;
  value: ReactNode;
  label: ReactNode;
}

/** A chart tooltip: values lead, labels follow. Positioned inside a relative container. */
export function Tooltip(props: { x: number; y: number; width: number; title: ReactNode; rows: TooltipRow[] }) {
  const flip = props.x > props.width * 0.62;
  return (
    <div
      className="tooltip"
      role="status"
      style={{
        left: flip ? undefined : props.x + 14,
        right: flip ? props.width - props.x + 14 : undefined,
        top: Math.max(0, props.y - 12),
      }}
    >
      <div className="tooltip__title">{props.title}</div>
      {props.rows.map((r) => (
        <div className="tooltip__row" key={r.key}>
          {r.swatch && <span className={r.square ? 'key key--square' : 'key key--line'} style={{ background: r.swatch }} />}
          <span className="tooltip__value">{r.value}</span>
          <span className="tooltip__label">{r.label}</span>
        </div>
      ))}
    </div>
  );
}
