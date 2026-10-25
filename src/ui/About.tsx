// How Nizhal works, its limits, heat safety, sources and settings.
import { useT } from '../i18n';
import { useStore, type Theme } from '../state/store';
import { Segmented } from './controls';
import { LangSwitch } from './Onboarding';

export const VERSION = '1.0.0';

export function About() {
  const t = useT();
  const { state, dispatch } = useStore();
  return (
    <div className="view about">
      <header className="view__head">
        <h1 className="view__title">{t.about.title}</h1>
        <p className="view__lead">{t.about.intro}</p>
      </header>

      <section className="panel" aria-labelledby="ab-settings">
        <h2 className="visually-hidden" id="ab-settings">
          {t.about.language}
        </h2>
        <div className="field">
          <span className="field__label">{t.about.language}</span>
          <LangSwitch />
        </div>
        <Segmented<Theme>
          label={t.about.theme}
          value={state.prefs.theme}
          options={[
            { value: 'system', label: t.about.themeSystem },
            { value: 'light', label: t.about.themeLight },
            { value: 'dark', label: t.about.themeDark },
          ]}
          onChange={(v) => dispatch({ type: 'setPrefs', patch: { theme: v } })}
        />
      </section>

      <section className="prose" aria-labelledby="ab-how">
        <h2 className="block-title" id="ab-how">
          {t.about.howTitle}
        </h2>
        <ol>
          {t.about.how.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>

      <section className="prose" aria-labelledby="ab-limits">
        <h2 className="block-title" id="ab-limits">
          {t.about.limitsTitle}
        </h2>
        <ul>
          {t.about.limits.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <section className="prose safety" aria-labelledby="ab-safety">
        <h2 className="block-title" id="ab-safety">
          {t.about.safetyTitle}
        </h2>
        <ul>
          {t.about.safety.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="source">{t.about.safetySource}</p>
      </section>

      <section className="prose" aria-labelledby="ab-credits">
        <h2 className="block-title" id="ab-credits">
          {t.about.creditsTitle}
        </h2>
        <ul>
          {t.about.credits.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="source">
          {t.about.builtBy} {t.about.version(VERSION)}
        </p>
      </section>
    </div>
  );
}
