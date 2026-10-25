# How Nizhal works

Nizhal is a *digital twin* of a home: a physics model of its roof, walls, floor,
windows and air, driven by real weather for the home's location. Everything runs in
the browser (a Web Worker), so nothing about the home leaves the device.

```
 Open-Meteo weather ──► sun position & irradiance ──► thermal RC network ──► indoor climate ──► comfort & risk
 (forecast / ERA5)        (NOAA, isotropic sky)        (implicit solver)      (hourly)          (heat index, IMAC)
                                                              │
                                     fixes ─► re-simulate ─► ranked by relief per rupee, greedy plan
                                     readings ─► Nelder–Mead ─► calibrated twin
```

## 1. Weather

* **Forecast:** Open-Meteo forecast API, 7 days ahead plus 30 past days (the past days
  give the comfort running mean and warm the model up).
* **Last summer's hottest week:** the ERA5 reanalysis archive (Open-Meteo), February to
  June of the last complete summer. Nizhal picks the 7 days with the highest mean
  daily maximum, and keeps 3 days before it for warm-up.
* **Variables, hourly:** air temperature, relative humidity, dew point, 10 m wind,
  cloud cover, global horizontal, direct normal and diffuse horizontal irradiance.
  Radiation values are means of the preceding hour, so they are interpolated at
  half-hours; temperatures are instantaneous.
* **Offline:** 14 Indian cities have their 2026 hottest week bundled
  (`src/data/samples.json`, made by `scripts/fetch-weather.ts`). If the network
  fails, Nizhal uses the nearest one and says so.

ERA5 is a ~25 km reanalysis: it smooths extremes, so real station maxima can be a
degree or two higher.

## 2. The sun on each surface

* Sun position every 10 minutes from the NOAA Solar Calculator equations (Meeus).
* Irradiance on a surface of tilt β facing azimuth γ (isotropic sky, Liu & Jordan):
  `I = DNI·max(0, cos θ) + DHI·(1 + cos β)/2 + GHI·ρg·(1 − cos β)/2`, with ground
  albedo ρg = 0.2.
* Window overhangs ("chajja", depth/height 0.5) shade the beam by the profile-angle
  method.

## 3. The building as a thermal network

Every opaque element (roof, each wall, floor, shared slabs in flats) is a chain of
nodes through its real layers (`src/engine/materials.ts`, BIS SP 41 and ASHRAE
values). Each sub-layer of up to 6 cm is one node with heat capacity `ρ·c·d·A`;
neighbours are linked by conductance `A / (d₁/2k₁ + d₂/2k₂)`.

* **Outer surface node** (massless) exchanges with:
  * outdoor air by convection, `h = 4 + 4·v_local` W/m²K (ISO 6946 form),
  * the sky by linearised long-wave radiation, with sky temperature from the
    Berdahl & Martin (1984) clear-sky emissivity and the Clark & Allen cloud
    correction,
  * the ground and surroundings (which heat up in the sun: +12 °C at 1000 W/m²),
  * and absorbs `α·I·A` of sunlight (α by roof/wall finish; white finishes use
    first-year averages because roofs get dusty).
* **Inner surface node** exchanges with the room air (convection) and with a
  massless mean-radiant node (radiation, Walton's MRT network), with low-emissivity
  inner faces (galvanised sheet, foil) radiating less.
* **Room:** an air node, an internal-mass node (furniture, partitions,
  30 kJ/K per m² of floor), and the MRT node. Operative temperature is the mean of
  air and mean-radiant temperature.
* **Windows:** conduction through the pane or shutter; transmitted sun
  (`SHGC × I × A`, SHGC 0.8 single glass, ×0.55 with curtains in the day) lands on
  the floor (50%), furniture (30%) and air (20%).
* **False ceiling:** its own ventilated air void, with radiation across the gap at an
  effective emissivity `1/(1/ε₁ + 1/ε₂ − 1)`. A foil radiant barrier (ε 0.05) is
  modelled through that emissivity. Gappy clay tiles and thatch have outdoor air
  washing their underside.
* **Floor:** concrete and 0.6 m of soil down to deep-ground temperature (the 30-day
  mean outdoor temperature).

## 4. Ventilation and windows

* Leaks: 1 ACH (independent house), 0.7 (flat), 2 (sheet-roof hut), +2 for tiles or
  thatch.
* Open windows: wind-driven cross ventilation `Q = 0.153·A·v` (two openings in
  series, Cd 0.61, ΔCp 0.5) or single-sided `0.025·A·v` (CIBSE Guide A), combined in
  quadrature with buoyancy `Cd·(A/3)·√(g·h·ΔT/T)`. Capped at 40 ACH.
* Window habits: open by day, by night, always, never, or **smart** (open when outside
  is at least 0.3 °C cooler than inside, with hysteresis). The window plan in the app
  is the smart run.

## 5. Solving

Implicit (backward Euler) time stepping, 10-minute steps:
`[C/Δt + G]·T(t+Δt) = C/Δt·T(t) + sources`. Implicit stepping keeps a 0.5 mm steel
sheet (time constant of seconds) and a 120 mm concrete slab (hours) both stable.
Surface coefficients, window conductances and ventilation change slowly, so they are
refreshed and the ~50×50 matrix is LU-factorised once an hour; every 10-minute step
reuses the factorisation. A week with 3 days of warm-up takes about 30 ms.

## 6. Comfort and risk

* **Heat index:** the NOAA/NWS equation (Steadman's simple form below ~27 °C, the
  Rothfusz regression above, with NWS humidity adjustments), applied to the
  operative temperature and the indoor humidity (outdoor moisture plus people and
  cooking, diluted by ventilation).
* **Risk bands:** India Meteorological Department experimental heat index colours:
  green below 35 °C, yellow 35–45, orange 45–55, red 55 and above. "High heat
  stress" = orange or red.
* **Comfort:** IMAC, the India Model for Adaptive Comfort (Manu et al., CEPT
  University, Building and Environment 2016) for naturally ventilated buildings:
  neutral temperature `0.54 × T_rm + 12.83` with a ±2.38 °C band, from the 30-day
  outdoor running mean.
* **Fan:** feels 2.5 °C cooler up to 33 °C, tapering to no benefit at 37 °C (above
  skin temperature fans stop helping; WHO heat-health guidance).
* **Hot night:** the mean "feels like" from 10 pm to 6 am is above the IMAC upper limit.

## 7. Fixes and the plan

Each of 13 fixes is a transformation of the home (white roof, foil, shade net, false
ceiling, insulation, sunshades, curtains, white walls, cross ventilation, trees, fan,
smart windows, lime wash). Each is simulated on the home in last summer's hottest
week. Effects are summarised as a *heat burden*: uncomfortable hours, plus 3× extra
for each IMD orange hour and again for red hours, plus 4 hours for each hot night.

* **Ranking:** free fixes that help come first, then relief per ₹1,000 of typical cost.
* **Plan:** greedy: repeatedly add the fix with the best relief per rupee *on top of
  the fixes already chosen* (re-simulated, so overlapping fixes aren't double
  counted), within the budget, up to 4 steps.
* **Costs:** rough 2025–26 Indian market ranges from marketplace listings and
  contractor guides (cool-roof coating ₹20–80/sq ft installed, lime wash under
  ₹20/sq ft, gypsum false ceiling ₹75–150/sq ft, foil insulation ₹5.5–15/sq ft plus
  fixing, polycarbonate awnings ₹200–550/sq ft, insect mesh ₹15–300/sq ft). The app
  presents them as ranges and asks people to get a local quote.

## 8. Calibration

A family can enter thermometer readings (or a logger CSV). Nizhal fetches the last 31
days of weather for the place, and fits four correction factors (roof sun absorption
0.5–1.4×, ventilation 0.3–3×, internal heat 0–3×, thermal mass 0.5–2×) by
minimising the RMSE between modelled indoor air temperature and the readings with the
Nelder–Mead simplex method. The fit is kept only if it lowers the error.

## 9. What the tests check (`npx vitest run`)

* Sun position: equinox noon overhead at the equator; Chennai's June noon sun north
  of the zenith; sunrise in the east.
* Materials: textbook U-values (230 mm brick ≈ 2.1, 120 mm RCC ≈ 3.9, bare sheet ≈ 7 W/m²K).
* Heat index matches the NWS chart.
* With constant overcast weather and no gains, the home settles to outdoor temperature.
* Energy balance: at steady state the heat paths into the room sum to zero (within 5%).
* Time-step independence: 10-minute and 2-minute steps agree within 0.4 °C.
* Physical behaviour: a tin roof makes the home hotter than outdoors; concrete delays
  the peak and keeps radiating at night; white roofs, insulation and shade nets lower
  the peak; smart night ventilation cools the night.
* Planner: every applicable fix is evaluated, the plan keeps reducing heat burden and
  respects the budget.
* Calibration recovers a hidden home from noisy readings to under 0.6 °C RMSE.

## 10. What it says, on real weather

Hottest week of summer 2026, Chennai (ERA5 outdoor maximum 40.2 °C), default homes:

| Home | Indoor peak (operative) |
|---|---|
| Independent house, grey RCC roof | 40.9 °C |
| Top-floor flat | 42.9 °C |
| Small house, metal sheet roof | 46.3 °C |

On an idealised clear-sky day (29–38 °C), a metal-roof home peaks about 4.8 °C above
outdoors, in line with reports of tin and asbestos homes running 4–6 °C hotter than
outside. A white coating on that roof lowers the peak by about 4 °C on that idealised
day, and by up to about 6 °C for a small metal-roof hut on real heatwave days. The
REFLECT field trial in Burkina Faso measured *average* indoor reductions of 1.2–1.7 °C;
peak-hour reductions are larger than averages, so the model is in a plausible range,
but probably on the optimistic side for roofs that get dusty.

## 11. Limits

* It is a single-zone model: the home is one space. Upstairs rooms and rooms directly
  under the roof are hotter than the average.
* Inputs are simplified (square plan, typical schedules, typical material values).
  Calibration with a thermometer is the honest way to tighten it.
* It is not a certified building-energy simulation (EnergyPlus-grade) and makes no
  claim to be one.

## References

* NOAA Global Monitoring Laboratory, Solar Calculator equations (after Meeus,
  *Astronomical Algorithms*).
* Liu & Jordan (1960), isotropic sky diffuse model, *Solar Energy* 4(3).
* Berdahl & Martin (1984), clear-sky emissivity, *Solar Energy* 32(5).
* ISO 6946, building components: thermal resistance and transmittance.
* BIS SP 41 (1987), Handbook on Functional Requirements of Buildings.
* ASHRAE Handbook: Fundamentals.
* CIBSE Guide A, Environmental design (natural ventilation).
* Walton (1980), mean radiant temperature network for radiant interchange, ASHRAE Transactions.
* Rothfusz (1990), NWS heat index regression; Steadman (1979).
* Ministry of Earth Sciences (2023), IMD experimental heat index colour codes.
* Manu, Shukla, Rawal, Thomas & de Dear (2016), India Model for Adaptive Comfort,
  *Building and Environment* 98.
* Hersbach et al. (2020), ERA5 reanalysis; Open-Meteo (CC BY 4.0).
* Nelder & Mead (1965), simplex method, *Computer Journal* 7(4).
