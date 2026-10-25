# Build progress (for whoever continues this work)

Project: **Nizhal**, the indoor heat forecast for Indian homes. Folder: `C:\best project`.
Haven asked for an autonomous build with no questions. The previous idea (Avert, a crowd
evacuation simulator) was dropped because it was too close to SurgeGuard; it is archived in
`archive/avert-crowd-evacuation/`.

## Done

- `docs/design.md`: problem, competitors checked (Oct 2026), goals and non-goals.
- Physics engine in `src/engine/` (pure TypeScript, no DOM):
  - `solar.ts`: NOAA sun position, isotropic sky irradiance, overhang shading.
  - `materials.ts`: SP 41 / ASHRAE materials, Indian roof and wall build-ups.
  - `network.ts`: RC thermal network (layers, ventilated false-ceiling void, foil barrier, under-tile venting).
  - `simulate.ts`: implicit time stepping, 10-minute steps, hourly outputs and heat-flow paths.
  - `comfort.ts`: NOAA heat index with IMD colour bands, IMAC comfort band, fan cooling.
  - `weather.ts`: Open-Meteo forecast, ERA5 archive (hottest week), geocoding, recent weather.
  - `summary.ts`, `fixes.ts` (13 fixes, costs, ranking, greedy plan), `advice.ts` (window plan), `calibrate.ts` (Nelder–Mead).
  - `samples.ts` + `src/data/samples.json`: real hottest week of summer 2026 for 14 cities.
- Tests: `npx vitest run` (physics, planner, calibration). `REPORT=1` prints model behaviour.
- i18n: `src/i18n/en.ts`, `ta.ts`, `hi.ts` (type-checked to the same keys).
- App plumbing: `src/state/store.tsx`, `src/state/hooks.ts`, `src/workers/*`, `src/lib/format.ts`, `src/styles/tokens.css`.

- UI (all in `src/ui/`): Shell (hash tabs), Onboarding (welcome with live sample + 4 steps), Forecast
  (hero, heat ribbon, tonight window plan, day rows, day chart with table view), Fixes (budget plan +
  ranked list), HeatView (lazy three.js dollhouse + heat sources), HomeEditor (+ calibration, CSV, share), About.
- PWA: manifest, `public/sw.js`, icons (`scripts/make-icons.mjs` renders the PNGs).
- Verified in the browser (2026-10-25 ~02:30 IST): setup flow, forecast (live Open-Meteo for Nagercoil),
  hottest week, fixes, 3D, My home, Tamil UI, phone width, light and dark.
- Production build: main bundle ~92 KB gzip; three.js only in the lazy 3D chunk.
- Dev server: `npx vite --port 5173` (the preview tool's launch.json lookup points at an old folder, so start
  vite by hand and open http://127.0.0.1:5173 with preview_start url).

- Solver factorises once per hour (2.5–3× faster; results unchanged).
- Calibration tested end to end in the browser (demo readings: ±0.9° → ±0.2°).
- Docs: README (screenshots in `docs/screenshots/`, taken with the chrome-devtools MCP `take_screenshot`
  filePath option), `docs/how-it-works.md`, `docs/interview-guide.md`. README numbers checked with
  `REPORT=1 npx vitest run tests/claims.test.ts`.

- Polish pass, code part (2026-10-25 04:20 run; see the log below). Hindi and Tamil files have no
  untranslated strings (script check). Dark-mode chart colours come from tokens, already validated.

- Keyboard pass, code part (2026-10-25 06:22 run): radio groups follow the ARIA pattern, 3D slider
  announces the time. Service worker: two caching bugs fixed (see the log).

## Next

Unattended runs cannot start the dev server (the preview tool's start request was declined at
04:20 and again at 06:22), so everything below needs a session where Haven is present, or a
run where the server start is allowed.

1. Browser check of the 04:20 and 06:22 runs (neither seen in a browser yet): error notices, offline
   banner (DevTools offline), skip link, shared-link prompt (open a `#home=` link while a home is
   saved), clipboard fallback (plain http on a LAN IP), arrow keys in Segmented / ChoiceCards / the
   language switch, 3D slider read-out. Phone and desktop, light and dark.
2. Accessibility audit (Lighthouse via chrome-devtools MCP) and fix findings.
3. `vite build` + `vite preview` check of the service worker (install, offline reload, v2→v3 cache
   swap, and that pruning leaves the forecast usable offline).
4. Browser check of the 08:22 run: fix rows on the Fixes tab should look exactly as before (effects
   are now spans in the same flex row), and a screen reader should pause between effects.

Design decisions: limewash/neem/neel palette, Anek type family (Latin/Tamil/Devanagari), hero temperature
gets wider with heat (font-stretch), IMD heat-index bands as status colours with labels, chart series
inside = orange `#eb6834`, outside = blue `#2a78d6` (validated with the dataviz validator).

## Log

### 2026-10-25, 23:00 IST (live session with Haven)

- **Fixed: "Open the windows from 12 am to 12 am".** The Tonight card printed the start and end of
  the smart plan's whole open stretch with no day. When it stays cooler outside than inside the
  stretch can last days (Chennai's sample week: 2 pm on day one to the end of the week), and a
  stretch already open when the data begins started at "12 am". New `tonightPlan` in
  `src/engine/advice.ts` leaves out a start or end that falls outside the week, and a stretch of a
  day or more is worded "day and night, until Wednesday 10 am" or "for the rest of the week" (new
  strings in English, Tamil and Hindi). Five tests in `tests/planner.test.ts`, including all 14
  sample cities. Checked in the browser on the home that showed the bug: it now says "Keep the
  windows open, day and night, all week."
- Published: https://github.com/HavenLeno22/nizhal, live at https://havenleno22.github.io/nizhal/
  (GitHub Pages, `.github/workflows/deploy.yml`, deploys on push to main after the tests pass).

### 2026-10-25, 04:20–04:35 IST (scheduled run)

Started green: 28 tests pass, `tsc -b` clean. The preview tool's request to start the dev server was
declined in this unattended run, so nothing below has been seen in a browser yet; it is checked
only by `tsc -b`, `vitest` (28 pass) and `vite build` (main bundle 93.5 KB gzip, unchanged).

What changed:
- **Error states.** An engine error used to leave Forecast, Fixes and See the heat on "loading"
  forever, and a weather error showed a bare retry button. New shared `ErrorNotice` (in
  `src/ui/controls.tsx`, `role="alert"`) says what failed and offers Try again; `useEngine` gained
  `retry()`.
- **Offline banner.** `Shell` listens to online/offline events and shows a plain status line saying
  the app still works with saved or built-in weather. Not sticky, because the top bar already is.
- **Skip link.** It was labelled with the tab name and its `#main` href broke hash routing (it sent
  you back to the forecast tab). Now labelled "Skip to content" and moves focus without touching
  the hash.
- **Shared links.** Opening a `#home=` link used to overwrite the saved home (and its calibration)
  without asking. Now `SharedPrompt` asks first; "Keep my home" is the focused default because it
  is the non-destructive choice. If no home is saved, the link opens directly as before.
- **Share fallback.** If the share sheet fails (other than the person cancelling) it falls back to
  the clipboard; if the clipboard is unavailable (plain http, permission refused) the link is shown
  in a read-only field to copy by hand.
- New i18n keys in all three languages: `skipToContent`, `offline`, `shared.*`,
  `forecast.weatherError`, `forecast.engineError`, `home.copyFallback`. The Tamil and Hindi copy is
  my own translation and would benefit from a native speaker's read.

Remaining: the "Next" list above, starting with the browser check of this run.

### 2026-10-25, 06:22–06:40 IST (scheduled run)

Started green: 28 tests pass, `tsc -b` clean. The dev-server start was declined again, and I did not
work around it (no starting vite through the shell), so none of this run has been seen in a browser.
Checked by `tsc -b` (clean), `vitest` (28 pass), `vite build` (main bundle 93.7 KB gzip) and
`node --check public/sw.js`. No dependencies added (there is no DOM test library, so a jsdom/axe
test would have meant installing packages unattended; I chose not to).

What changed:
- **Radio groups.** `Segmented` and `ChoiceCards` (in `src/ui/controls.tsx`) had `role="radio"`
  buttons that were each a Tab stop with no arrow keys. Now a shared `radioKeys` helper makes the
  group one Tab stop (the checked option) and arrow keys / Home / End move focus and select, as
  native radios do. This covers every segmented control, the setup choice cards and the language
  switch.
- **3D time slider.** Screen readers announced a bare number (0–23). It now has `aria-valuetext`
  with the time label in the current language.
- **Service worker** (`public/sw.js`, cache `nizhal-v2`): a non-OK weather response (rate limit,
  server error) used to overwrite the last good cached forecast; now the cached copy is served
  instead. An uncached script or image requested offline used to get `index.html` back; now only
  page loads fall back to the app shell.

Reviewed and left as is: focus ring (`:focus-visible` in app.css), reduced motion, day rows
(`aria-pressed`), chart keyboard handlers, tab nav (`aria-current`), skip link.

Remaining: the "Next" list above. Every item needs a browser.

### 2026-10-25, 08:22–08:40 IST (scheduled run)

Started green: 28 tests pass, `tsc -b` clean. The dev-server start was declined a third time, so
again nothing was seen in a browser. Checked by `tsc -b` (clean), `vitest` (28 pass), `vite build`
(main bundle 93.7 KB gzip, unchanged), `node --check public/sw.js`, and a throwaway Node script that
ran the service worker's cache code against a fake Cache API (results below).

What changed (old Next items 4 and 5):
- **Fix rows** (`src/ui/Fixes.tsx`): the effects list inside `<summary>` is now spans instead of
  `<ul>/<li>`, because `<summary>` only allows phrasing content. The container is already a flex
  row, so the layout should not change. A visually hidden ". " between effects stops screen readers
  running them together.
- **Service worker pruning** (`public/sw.js`, cache bumped to `nizhal-v3`): after each cache write
  the worker trims that kind of entry, oldest first: place searches 12, weather responses 24, app
  files and fonts 80. The app shell (`./`, `index.html`, manifest, icon) is never trimmed. Place
  searches have their own bucket so typing in the search box cannot push the saved forecast out.
  Re-fetching an entry moves it to the newest end, so the forecast you use stays. Fake-cache test:
  30 forecasts, 50 searches and 100 files in → 24, 12 and 80 kept, shell kept, a refreshed old
  forecast survived. Decision: cache writes stay fire-and-forget (no `event.waitUntil`), as before,
  because calling `waitUntil` after a cache-first response has already settled can throw.

Remaining: the "Next" list above (browser checks, Lighthouse audit, service-worker check with
`vite preview`). All of it needs a browser, so it needs a session where the dev server may start.

### 2026-10-25, 10:22–10:25 IST (scheduled run)

Started green: 28 tests pass, `tsc -b` clean, `vite build` fine (main bundle 93.7 KB gzip, 3D chunk
133 KB gzip, lazy), `node --check public/sw.js` clean. The dev-server start (`nizhal-dev` in
`.claude/launch.json`) was declined a fourth time, and I did not start vite another way.

No code changed. Decision: every remaining "Next" item is a browser check, and three runs of
unverified code changes are already waiting for one. Adding a fourth batch nobody has seen would
make the eventual check harder, not easier, so this run stopped after the checks.

Remaining: the "Next" list, unchanged. To unblock later scheduled runs, Haven can allow the
`nizhal-dev` preview server once in a live session (or do the browser check with Claude then).

### 2026-10-25, 12:22–12:25 IST (scheduled run)

Started green: 28 tests pass (3 report-only skipped), `tsc -b --noEmit` clean. The `nizhal-dev`
server start was declined a fifth time, and I did not start vite another way. No code changed, for
the reason given in the 10:22 entry: everything still on the "Next" list is a browser check.

Remaining: the "Next" list, unchanged. Later scheduled runs will keep stopping here until the
`nizhal-dev` preview server is allowed in a live session.

### 2026-10-25, 16:22–16:25 IST (scheduled run)

Started green: 28 tests pass (3 report-only skipped), `tsc -b --noEmit` clean. The `nizhal-dev`
server start was declined a sixth time; I did not start vite another way. No code changed, for the
reason in the 10:22 entry.

Remaining: the "Next" list, unchanged (all browser checks). The build window ends 2026-10-26
10:00 IST, so the browser check of the 04:20, 06:22 and 08:22 runs will most likely happen in a
live session with Haven.

### 2026-10-25, 18:19–18:22 IST (scheduled run)

Started green: 28 tests pass (3 report-only skipped), `tsc -b --noEmit` clean. The `nizhal-dev`
server start was declined a seventh time; I did not start vite another way. No code changed, for
the reason in the 10:22 entry.

Remaining: the "Next" list, unchanged (all browser checks).

### 2026-10-25, 21:23–21:25 IST (scheduled run)

Started green: 28 tests pass (3 report-only skipped), `tsc -b --noEmit` clean. The `nizhal-dev`
server start was declined an eighth time; I did not start vite another way. No code changed, for
the reason in the 10:22 entry.

Remaining: the "Next" list, unchanged (all browser checks). The build window closes 2026-10-26
10:00 IST.
