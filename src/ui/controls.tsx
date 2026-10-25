// Small form controls, styled in app.css. All keyboard accessible.
import { Minus, Plus, RefreshCw } from 'lucide-react';
import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { useT } from '../i18n';

/**
 * ARIA radio group keyboard pattern: the group is one Tab stop (the checked option, or the first
 * when none is), and arrow keys, Home and End move focus and select, as native radios do.
 */
function radioKeys<T>(values: T[], value: T, onChange: (v: T) => void) {
  const current = values.indexOf(value);
  const focusable = current === -1 ? 0 : current;
  return {
    tabIndex: (i: number) => (i === focusable ? 0 : -1),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const n = values.length;
      const next =
        e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (focusable + 1) % n
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (focusable - 1 + n) % n
        : e.key === 'Home' ? 0
        : e.key === 'End' ? n - 1
        : null;
      if (next === null) return;
      e.preventDefault();
      onChange(values[next]);
      const group = e.currentTarget.closest('[role="radiogroup"]');
      group?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
    },
  };
}

export function Segmented<T extends string | number>(props: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; hint?: string }[];
  onChange: (v: T) => void;
  wrap?: boolean;
  hideLabel?: boolean;
}) {
  const id = useId();
  const keys = radioKeys(props.options.map((o) => o.value), props.value, props.onChange);
  return (
    <div className={`field segmented${props.wrap ? ' segmented--wrap' : ''}`} role="radiogroup" aria-labelledby={id}>
      <span id={id} className={props.hideLabel ? 'visually-hidden' : 'field__label'}>
        {props.label}
      </span>
      <div className="segmented__options">
        {props.options.map((o, i) => (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={o.value === props.value}
            tabIndex={keys.tabIndex(i)}
            onKeyDown={keys.onKeyDown}
            className="segmented__option"
            onClick={() => props.onChange(o.value)}
            title={o.hint}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle(props: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; help?: string }) {
  const id = useId();
  return (
    <label className="toggle" htmlFor={id}>
      <span className="toggle__text">
        <span className="toggle__label">{props.label}</span>
        {props.help && <span className="field__help">{props.help}</span>}
      </span>
      <input id={id} type="checkbox" role="switch" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
    </label>
  );
}

export function Stepper(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => ReactNode;
  help?: string;
}) {
  const id = useId();
  const clamp = (v: number) => Math.min(props.max, Math.max(props.min, Math.round(v / props.step) * props.step));
  return (
    <div className="field stepper">
      <label className="field__label" htmlFor={id}>
        {props.label}
      </label>
      {props.help && <span className="field__help">{props.help}</span>}
      <div className="stepper__row">
        <button
          type="button"
          className="icon-button"
          aria-label={`− ${props.label}`}
          onClick={() => props.onChange(clamp(props.value - props.step))}
          disabled={props.value <= props.min}
        >
          <Minus size={18} aria-hidden="true" />
        </button>
        <input
          id={id}
          className="stepper__input"
          type="number"
          inputMode="decimal"
          value={props.value}
          min={props.min}
          max={props.max}
          step={props.step}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) props.onChange(clamp(v));
          }}
        />
        <button
          type="button"
          className="icon-button"
          aria-label={`+ ${props.label}`}
          onClick={() => props.onChange(clamp(props.value + props.step))}
          disabled={props.value >= props.max}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
        <span className="stepper__unit">{props.format?.(props.value)}</span>
      </div>
    </div>
  );
}

export function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  help?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {props.label}
      </label>
      {props.help && <span className="field__help">{props.help}</span>}
      <select id={id} className="select" value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Choice cards with a picture, for the setup steps. */
export function ChoiceCards<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; title: string; body?: string; art?: ReactNode }[];
  onChange: (v: T) => void;
}) {
  const id = useId();
  const keys = radioKeys(props.options.map((o) => o.value), props.value, props.onChange);
  return (
    <div className="choices" role="radiogroup" aria-labelledby={id}>
      <span id={id} className="visually-hidden">
        {props.label}
      </span>
      {props.options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          tabIndex={keys.tabIndex(i)}
          onKeyDown={keys.onKeyDown}
          className="choice"
          onClick={() => props.onChange(o.value)}
        >
          {o.art && <span className="choice__art">{o.art}</span>}
          <span className="choice__title">{o.title}</span>
          {o.body && <span className="choice__body">{o.body}</span>}
        </button>
      ))}
    </div>
  );
}

/** A failure message with a retry button, announced to screen readers. */
export function ErrorNotice(props: { text: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="notice notice--error" role="alert">
      <p>{props.text}</p>
      <button type="button" className="button button--quiet" onClick={props.onRetry}>
        <RefreshCw size={16} aria-hidden="true" /> {t.forecast.retry}
      </button>
    </div>
  );
}
