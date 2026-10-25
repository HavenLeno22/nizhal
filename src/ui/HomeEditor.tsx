// "My home": everything about the home, editable; plus calibration from a thermometer.
import { Share2, Thermometer, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import type { Reading } from '../engine/calibrate';
import { SIDES, type Home, type HomeType, type RoofInsulation, type WindowHabit } from '../engine/home';
import type { RoofType, SurfaceFinish, WallType } from '../engine/materials';
import { useT } from '../i18n';
import { useRecentWeather } from '../state/hooks';
import { shareUrl, useStore } from '../state/store';
import { engine } from '../workers/client';
import { HomeTypeArt, RoofArt } from './art';
import { ChoiceCards, Segmented, SelectField, Stepper, Toggle } from './controls';
import { PlaceSearch } from './PlaceSearch';

const HOME_TYPES: HomeType[] = ['independent', 'topFlat', 'middleFlat', 'groundFlat', 'hut'];
const ROOFS: RoofType[] = ['rcc', 'rccWeathering', 'tin', 'asbestos', 'clayTile', 'thatch'];
const WALLS: WallType[] = ['brick230', 'brick115', 'concreteBlock', 'aac', 'mud', 'laterite', 'tinWall'];
const FINISHES: SurfaceFinish[] = ['dark', 'grey', 'natural', 'light', 'white', 'coolWhite'];
const HABITS: WindowHabit[] = ['dayOpen', 'nightOpen', 'alwaysOpen', 'alwaysClosed', 'smart'];

export function HomeEditor({ home }: { home: Home }) {
  const t = useT();
  const { dispatch } = useStore();
  const patch = (p: Partial<Home>) => dispatch({ type: 'patchHome', patch: p });
  const [copied, setCopied] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const roofIsOurs = home.homeType === 'independent' || home.homeType === 'topFlat' || home.homeType === 'hut';

  const share = async () => {
    const url = shareUrl(home);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Nizhal', text: t.home.shareText, url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return; // the person closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // No clipboard (plain http, or permission refused): show the link to copy by hand.
      setManualUrl(url);
    }
  };

  return (
    <div className="view homeeditor">
      <header className="view__head">
        <h1 className="view__title">{t.home.title}</h1>
        <p className="view__lead">{t.home.body}</p>
        <div className="view__actions">
          <button type="button" className="button" onClick={share}>
            <Share2 size={18} aria-hidden="true" /> {copied ? t.home.copied : t.home.share}
          </button>
        </div>
        {manualUrl && (
          <label className="field sharelink">
            <span className="field__label">{t.home.copyFallback}</span>
            <input readOnly value={manualUrl} onFocus={(e) => e.currentTarget.select()} autoFocus />
          </label>
        )}
      </header>

      <section className="panel" aria-labelledby="sec-place">
        <h2 className="block-title" id="sec-place">
          {t.home.sections.place}
        </h2>
        <PlaceSearch value={home.place} onPick={(p) => patch({ place: p })} />
      </section>

      <section className="panel" aria-labelledby="sec-building">
        <h2 className="block-title" id="sec-building">
          {t.home.sections.building}
        </h2>
        <ChoiceCards
          label={t.fields.homeType}
          value={home.homeType}
          options={HOME_TYPES.map((h) => ({ value: h, title: t.homeType[h], body: t.homeTypeHelp[h], art: <HomeTypeArt type={h} /> }))}
          onChange={(h) => patch({ homeType: h })}
        />
        <div className="grid2">
          <Stepper
            label={t.fields.floorArea}
            help={t.fields.floorAreaHelp}
            value={home.floorArea}
            min={8}
            max={250}
            step={1}
            format={(v) => `${t.fields.m2} (${t.fields.sqft(Math.round(v * 10.764))})`}
            onChange={(v) => patch({ floorArea: v })}
          />
          <Stepper
            label={t.fields.height}
            value={home.height}
            min={2.2}
            max={5}
            step={0.1}
            format={() => t.fields.unitM}
            onChange={(v) => patch({ height: Math.round(v * 10) / 10 })}
          />
        </div>
      </section>

      {roofIsOurs && (
        <section className="panel" aria-labelledby="sec-roof">
          <h2 className="block-title" id="sec-roof">
            {t.home.sections.roof}
          </h2>
          <ChoiceCards
            label={t.fields.roof}
            value={home.roof}
            options={ROOFS.map((r) => ({ value: r, title: t.roof[r], art: <RoofArt type={r} /> }))}
            onChange={(r) => patch({ roof: r })}
          />
          <SelectField<SurfaceFinish | 'asIs'>
            label={t.fields.roofFinish}
            value={home.roofFinish ?? 'asIs'}
            options={[{ value: 'asIs', label: t.finishDefault }, ...FINISHES.map((f) => ({ value: f, label: t.finish[f] }))]}
            onChange={(v) => patch({ roofFinish: v === 'asIs' ? null : v })}
          />
          <p className="field__label">{t.fields.roofUpgrades}</p>
          <Segmented<RoofInsulation>
            label={t.fields.roofInsulation}
            value={home.roofInsulation}
            options={[
              { value: 'none', label: t.fields.none },
              { value: 'puf50', label: 'PU foam 50 mm' },
              { value: 'eps75', label: 'EPS 75 mm' },
            ]}
            onChange={(v) => patch({ roofInsulation: v })}
          />
          <Toggle label={t.fields.falseCeiling} checked={home.falseCeiling} onChange={(v) => patch({ falseCeiling: v })} />
          {(home.roof === 'tin' || home.roof === 'asbestos') && (
            <Toggle label={t.fields.radiantBarrier} checked={home.radiantBarrier} onChange={(v) => patch({ radiantBarrier: v })} />
          )}
          <Segmented
            label={t.fields.roofShade}
            value={home.roofShade >= 0.6 ? 'lots' : home.roofShade >= 0.2 ? 'some' : 'none'}
            options={[
              { value: 'none', label: t.fields.none },
              { value: 'some', label: t.fields.some },
              { value: 'lots', label: t.fields.lots },
            ]}
            onChange={(v) => patch({ roofShade: v === 'lots' ? 0.75 : v === 'some' ? 0.3 : 0 })}
          />
        </section>
      )}

      <section className="panel" aria-labelledby="sec-walls">
        <h2 className="block-title" id="sec-walls">
          {t.home.sections.walls}
        </h2>
        <div className="grid2">
          <SelectField label={t.fields.wall} value={home.wall} options={WALLS.map((w) => ({ value: w, label: t.wall[w] }))} onChange={(v) => patch({ wall: v })} />
          <SelectField<SurfaceFinish | 'asIs'>
            label={t.fields.wallFinish}
            value={home.wallFinish ?? 'asIs'}
            options={[{ value: 'asIs', label: t.finishDefault }, ...FINISHES.map((f) => ({ value: f, label: t.finish[f] }))]}
            onChange={(v) => patch({ wallFinish: v === 'asIs' ? null : v })}
          />
        </div>
        <fieldset className="sides">
          <legend className="field__label">{t.fields.sides}</legend>
          <p className="field__help">{t.fields.sidesHelp}</p>
          {SIDES.map((s) => (
            <div key={s} className="side">
              <Toggle
                label={t.fields.sideName[s]}
                checked={home.exposed[s]}
                onChange={(v) => patch({ exposed: { ...home.exposed, [s]: v } })}
              />
              {home.exposed[s] && (
                <Stepper
                  label={`${t.fields.windows}: ${t.fields.sideName[s]}`}
                  value={home.windows[s]}
                  min={0}
                  max={12}
                  step={0.5}
                  format={() => t.fields.m2}
                  onChange={(v) => patch({ windows: { ...home.windows, [s]: v } })}
                />
              )}
            </div>
          ))}
        </fieldset>
        <Segmented
          label={t.fields.windowType}
          value={home.windowType}
          options={[
            { value: 'glass', label: t.fields.glass },
            { value: 'shutter', label: t.fields.shutter },
          ]}
          onChange={(v) => patch({ windowType: v })}
        />
        <Toggle label={t.fields.sunshades} checked={home.sunshades} onChange={(v) => patch({ sunshades: v })} />
        {home.windowType === 'glass' && <Toggle label={t.fields.curtains} checked={home.curtains} onChange={(v) => patch({ curtains: v })} />}
        <Toggle label={t.fields.mesh} checked={home.mesh} onChange={(v) => patch({ mesh: v })} />
        <Toggle label={t.fields.crossVentilation} checked={home.crossVentilation} onChange={(v) => patch({ crossVentilation: v })} />
        <Segmented
          label={t.fields.wallShade}
          value={home.wallShade >= 0.5 ? 'lots' : home.wallShade >= 0.2 ? 'some' : 'none'}
          options={[
            { value: 'none', label: t.fields.none },
            { value: 'some', label: t.fields.some },
            { value: 'lots', label: t.fields.lots },
          ]}
          onChange={(v) => patch({ wallShade: v === 'lots' ? 0.6 : v === 'some' ? 0.3 : 0 })}
        />
      </section>

      <section className="panel" aria-labelledby="sec-life">
        <h2 className="block-title" id="sec-life">
          {t.home.sections.life}
        </h2>
        <SelectField label={t.fields.habit} value={home.windowHabit} options={HABITS.map((h) => ({ value: h, label: t.habit[h] }))} onChange={(v) => patch({ windowHabit: v })} />
        <Stepper label={t.fields.people} value={home.people} min={0} max={15} step={1} onChange={(v) => patch({ people: v })} />
        <Toggle label={t.fields.fan} checked={home.fan} onChange={(v) => patch({ fan: v })} />
        <Toggle label={t.fields.cooking} checked={home.cookingInside} onChange={(v) => patch({ cookingInside: v })} />
      </section>

      <Calibration home={home} />

      <section className="panel panel--quiet">
        <button
          type="button"
          className="button button--danger"
          onClick={() => {
            if (window.confirm(t.home.resetConfirm)) dispatch({ type: 'setHome', home: null });
          }}
        >
          <Trash2 size={18} aria-hidden="true" /> {t.home.reset}
        </button>
      </section>
    </div>
  );
}

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses "date-time, temperature" lines (CSV from cheap loggers). */
export function parseReadingsCsv(text: string): Reading[] {
  const out: Reading[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ''));
    if (cells.length < 2) continue;
    const ms = Date.parse(cells[0].replace(' ', 'T'));
    const temp = Number(cells[1]);
    if (Number.isFinite(ms) && Number.isFinite(temp) && temp > -10 && temp < 70) out.push({ utcMs: ms, tempC: temp });
  }
  return out.sort((a, b) => a.utcMs - b.utcMs);
}

function Calibration({ home }: { home: Home }) {
  const t = useT();
  const { state, dispatch } = useStore();
  const readings = state.readings;
  const [open, setOpen] = useState(readings.length > 0 || !!home.calibration);
  const recent = useRecentWeather(home.place, open);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const setReadings = (r: Reading[]) => dispatch({ type: 'setReadings', readings: r });
  const now = Date.now();
  const usable = readings.filter((r) => r.utcMs > now - 30 * 86_400_000 && r.utcMs <= now);

  const run = async () => {
    if (!recent.weather || usable.length < 6) {
      setMessage(t.home.needReadings);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const cal = await engine.call({ type: 'calibrate', home: { ...home, calibration: undefined }, weather: recent.weather, readings: usable }, setProgress);
      if (cal.rmseAfter < cal.rmseBefore - 0.05) {
        dispatch({ type: 'patchHome', patch: { calibration: cal } });
        setMessage(t.home.calibrated(Number(cal.rmseBefore.toFixed(1)), Number(cal.rmseAfter.toFixed(1)), cal.readings));
      } else {
        setMessage(t.home.notImproved);
      }
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadDemo = async () => {
    if (!recent.weather) return;
    const r = await engine.call({ type: 'demoReadings', home: { ...home, calibration: undefined }, weather: recent.weather });
    setReadings(r);
    setDemo(true);
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const parsed = parseReadingsCsv(await f.text());
    if (parsed.length === 0) setMessage(t.home.csvBad);
    else {
      setReadings(parsed);
      setDemo(false);
      setMessage(null);
    }
    e.target.value = '';
  };

  return (
    <section className="panel" aria-labelledby="sec-cal">
      <h2 className="block-title" id="sec-cal">
        <Thermometer size={18} aria-hidden="true" /> {t.home.calibrateTitle}
      </h2>
      <p>{t.home.calibrateBody}</p>
      {!open ? (
        <button type="button" className="button" onClick={() => setOpen(true)}>
          {t.home.addReading}
        </button>
      ) : (
        <>
          <ul className="readings">
            {readings.map((r, i) => (
              <li key={`${r.utcMs}-${i}`} className="reading">
                <label>
                  <span className="visually-hidden">{t.home.when}</span>
                  <input
                    type="datetime-local"
                    value={toLocalInput(r.utcMs)}
                    onChange={(e) => {
                      const ms = new Date(e.target.value).getTime();
                      if (Number.isFinite(ms)) setReadings(readings.map((x, j) => (j === i ? { ...x, utcMs: ms } : x)));
                    }}
                  />
                </label>
                <label>
                  <span className="visually-hidden">{t.home.reading}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={0.1}
                    value={r.tempC}
                    onChange={(e) => setReadings(readings.map((x, j) => (j === i ? { ...x, tempC: Number(e.target.value) } : x)))}
                  />
                </label>
                <button type="button" className="icon-button" aria-label={t.home.remove} onClick={() => setReadings(readings.filter((_, j) => j !== i))}>
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <div className="row-actions">
            <button
              type="button"
              className="button"
              onClick={() => {
                const last = readings[readings.length - 1];
                setReadings([...readings, { utcMs: Math.min(Date.now(), (last?.utcMs ?? Date.now() - 3 * 3_600_000) + 3 * 3_600_000), tempC: last?.tempC ?? 32 }]);
                setDemo(false);
              }}
            >
              {t.home.addReading}
            </button>
            <button type="button" className="button button--quiet" onClick={() => file.current?.click()}>
              <Upload size={16} aria-hidden="true" /> {t.home.importCsv}
            </button>
            <input ref={file} type="file" accept=".csv,.txt,text/csv" hidden onChange={onFile} />
            <button type="button" className="button button--quiet" onClick={loadDemo} disabled={!recent.weather}>
              {t.home.demoReadings}
            </button>
          </div>
          <p className="field__help">{t.home.csvHelp}</p>
          {demo && <p className="notice">{t.home.demoNote}</p>}
          <button type="button" className="button button--primary" onClick={run} disabled={busy || !recent.weather}>
            {busy ? t.home.calibrating : t.home.calibrate}
          </button>
          {busy && <progress max={1} value={progress} />}
          {message && <p className="notice" role="status">{message}</p>}
          {home.calibration && (
            <p>
              {t.home.calibrated(
                Number(home.calibration.rmseBefore.toFixed(1)),
                Number(home.calibration.rmseAfter.toFixed(1)),
                home.calibration.readings,
              )}{' '}
              <button type="button" className="link-button" onClick={() => dispatch({ type: 'patchHome', patch: { calibration: undefined } })}>
                {t.home.clearCalibration}
              </button>
            </p>
          )}
        </>
      )}
    </section>
  );
}
