// Horizontal bars for one series (values carried as text too, never by colour alone).
import type { ReactNode } from 'react';

export interface Bar {
  key: string;
  label: ReactNode;
  value: number;
  display: ReactNode;
}

export function BarList(props: { bars: Bar[]; color: string; max?: number; label: string }) {
  const max = props.max ?? Math.max(1e-9, ...props.bars.map((b) => b.value));
  return (
    <ul className="barlist" aria-label={props.label}>
      {props.bars.map((b) => (
        <li key={b.key} className="barlist__row">
          <span className="barlist__label">{b.label}</span>
          <span className="barlist__track" aria-hidden="true">
            <span className="barlist__bar" style={{ width: `${Math.max(1, (Math.max(0, b.value) / max) * 100)}%`, background: props.color }} />
          </span>
          <span className="barlist__value">{b.display}</span>
        </li>
      ))}
    </ul>
  );
}
