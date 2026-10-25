# Nizhal: interview guide

This is for you, Haven: how to talk about Nizhal so an interviewer remembers it, and
what to study so you can answer any follow-up question honestly.

## First, be honest about how it was built

Nizhal was built with Claude (Anthropic) as an AI pair programmer, and the README
says so. Interviewers in 2026 expect people to use AI tools. What they test is
whether **you** understand the system: why it is designed this way, what breaks, and
how you would extend it. Read every file in `src/engine/` until you can explain it
without looking. If someone asks "did you use AI?", say yes, and then show that you
understand it deeply. That is a stronger answer than pretending.

## The 30-second pitch

"Weather apps only forecast outdoors, but most Indian homes have no AC, and a tin roof
or a top-floor flat can be 5–6° hotter than outside. Nizhal is a physics digital twin
of your home: you describe the roof, walls and windows in a minute, it pulls real
weather for your location and simulates the indoor temperature hour by hour. It tells
you when to open the windows, and it tries 13 fixes, from lime wash to shade nets, on
*your* home and ranks them by relief per rupee. It runs fully in the browser, in
English, Tamil and Hindi, and works offline."

## The story (why this project)

* Heat is a real, growing problem in India, and the people most at risk have the
  fewest tools.
* You checked what exists first. The IIIT Hyderabad Cool Roof Calculator is a
  research tool with monthly outputs; Iowa State's CommHEAT is a US prototype; apps
  like Coolhouse only say "open/close windows". Nobody combined an indoor forecast,
  a window plan and a costed fix planner for *Indian* homes.

## Architecture in plain words

1. **Weather** (`src/engine/weather.ts`): Open-Meteo forecast (next 7 days plus 30 past
   days) or the ERA5 archive (finds last summer's hottest week). Cached in
   localStorage; falls back to 14 bundled cities offline.
2. **Sun** (`solar.ts`): where the sun is every 10 minutes (NOAA equations) and how
   much sunlight hits each wall, window and the roof.
3. **Building as a circuit** (`network.ts`): heat flow is like electric current,
   temperature like voltage. Each material layer is a resistor (it slows heat) plus a
   capacitor (it stores heat). Concrete has a big capacitor, so it heats slowly and
   gives the heat back at night; a tin sheet has almost none.
4. **Solver** (`simulate.ts`): steps that circuit forward in time with backward Euler,
   which needs solving a ~50×50 linear system (LU decomposition, `linalg.ts`).
5. **Comfort** (`comfort.ts`): heat index (temperature + humidity), IMD colour bands,
   IMAC comfort range.
6. **Decisions** (`fixes.ts`, `advice.ts`, `calibrate.ts`): try each fix, rank by value,
   build a plan greedily; compute the window plan; fit the model to thermometer readings
   with Nelder–Mead.
7. **App** (`src/ui/`): React. The engine runs in a Web Worker so the UI never freezes.

## Decisions you should be able to defend

| Decision | Why | Trade-off |
|---|---|---|
| Implicit (backward Euler) solver | A 0.5 mm steel sheet reacts in seconds; a concrete slab over hours. Explicit stepping would need tiny steps for the steel. Implicit is stable at any step. | Needs a linear solve each step (cheap at 50 nodes). |
| Factorise the matrix once an hour | Coefficients change slowly; reusing the LU factorisation for the 6 ten-minute steps made everything 2.5–3× faster with no visible change in results. | Coefficients lag by up to an hour. |
| Single-zone model | Families can describe one space in a minute; multi-room needs floor plans. | Upstairs rooms are hotter than the average it shows. |
| Run in the browser, no backend | Privacy (home details never leave the phone), zero hosting cost, works offline. | No server-side alerts or shared accounts. |
| IMD colour bands instead of the US NWS ones | With NWS bands a humid Chennai home was "danger" 162 of 168 hours, so the metric couldn't tell homes apart. IMD's bands are India's own and separate homes clearly. | Same NOAA equation underneath. |
| Greedy plan, re-simulated at each step | Fixes overlap (two roof fixes don't add up). Re-simulating captures that; greedy is fast and explainable. | Not guaranteed optimal, but close for 13 fixes. |
| Costs as ranges | Prices vary a lot by city; showing a single number would be fake precision. | Less "neat". |

## Real bugs found while building (good interview stories)

1. **A false ceiling made a tin-roof home hotter.** The void was modelled as a plain
   resistance, so the gypsum (high emissivity) radiated more heat at people than the
   tin (low emissivity) did. Fix: model the void as its own ventilated air node with
   radiation across the gap. Bonus: this also made the cheap foil radiant barrier
   possible to model.
2. **Clay tiles came out hotter than tin.** Mangalore tiles breathe: air moves through
   the gaps. Added outdoor air washing the tile underside.
3. **The "Tonight" advice said "keep windows shut" when the chart clearly showed
   cooler air outside.** It only looked for an open period *starting* after 5 pm, but
   the smart plan had opened the windows earlier that afternoon. Fix: use the open
   period that *covers* 10 pm.
4. **The bottom tab bar jumped to the top of the screen.** The header had
   `backdrop-filter`, which makes it the containing block for `position: fixed`
   children. Removed the blur.
5. **three.js leaked into the main bundle** (764 KB) through one small import of
   `Color`. Removed the dependency so three.js loads only with the 3D tab; the first
   load dropped to about 92 KB gzipped.
6. **Demo thermometer readings were dated in the future** (the weather window
   includes today's forecast hours). Limited them to the past.
7. **The README itself overstated a number** (3° instead of about 2° for night
   ventilation). A test (`tests/claims.test.ts`) prints the quoted numbers so they can
   be checked.

## Questions you will probably get

**How do you know the model is right?**
Tests check physics laws (energy balance closes, results don't depend on the time
step, textbook U-values, NWS heat-index table). Behaviour matches field reports: tin
homes 4–6° hotter than outdoors; cool roofs lower indoor temperature. It is not
validated against measured data from Indian homes yet, which is exactly why
calibration exists. Next step: log a real room with a ₹300 sensor and compare.

**What is backward Euler and why is it stable?**
You evaluate the heat flows at the *end* of the step: (C/Δt + G)·T_new = C/Δt·T_old +
sources. The matrix is diagonally dominant and positive definite, so the solution can't
blow up whatever the step size.

**Why LU decomposition and not Gaussian elimination each time?**
LU splits the matrix once (O(n³)); then each right-hand side is solved in O(n²). Since
the matrix only changes hourly, we factor once and solve six times.

**How does the window plan work?**
The "smart" run opens windows when outside air is at least 0.3° cooler than inside
(with hysteresis so it doesn't flicker), and the app turns that into "open from X to Y".

**How does calibration work?**
Four correction factors (roof sun absorption, ventilation, internal heat, thermal mass)
are fitted with Nelder–Mead to minimise the RMSE between the model and the readings,
within physically sensible bounds, and kept only if they improve the fit.

**Why a Web Worker?**
A plan evaluates ~20 simulations. On the main thread that would freeze scrolling;
in a worker the UI stays smooth and old requests are dropped when the input changes.

**What would you do next?**
Validate against real logged data; multi-room model; WhatsApp or SMS heat alerts (needs
a small backend); cost data from local suppliers; NGO / municipal heat-action-plan
dashboards for many homes at once.

## What to study so you can own it

* Heat transfer basics: conduction (Fourier), convection, radiation (Stefan–Boltzmann,
  emissivity), thermal mass. Search "RC thermal network building".
* Numerical methods: explicit vs implicit Euler, stiffness, LU decomposition.
* Optimisation: what Nelder–Mead does, and greedy algorithms.
* Web: Web Workers and `postMessage`, service workers and caching strategies, React
  hooks (`useEffect` cleanup, stale results), code splitting with `import()`.
* Accessibility: why every chart has a table view and keyboard tooltips.

Spend an evening changing one thing in each module and predicting the result before you
run `REPORT=1 npx vitest run tests/report.test.ts`. If your predictions are right,
you understand it.
