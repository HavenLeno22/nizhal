# Nizhal: design

> நிழல் (*nizhal*) is Tamil for **shade**.

## The problem

India's heatwaves keep breaking records, and most Indian homes have no air
conditioning. Tin, asbestos-cement and thin RCC roofs turn rooms into ovens:
reports describe tin and asbestos homes running roughly 4–6 °C hotter than
outdoors. Heat is worst for the elderly, infants, pregnant women and anyone ill.

Every weather app tells you the temperature **outside**. Nothing tells a family:

- how hot it will get **inside their own home**, hour by hour, this week;
- when to open and close windows to let the night cool the house;
- which fix (white roof paint, shade net, insulation, sunshades…) cools *their*
  house the most for the least money.

## What exists (checked October 2026)

| Tool | What it does | Gap |
|---|---|---|
| IIIT Hyderabad Cool Roof Calculator | EnergyPlus runs for Indian cities; monthly energy/comfort for cool roofs | Research calculator: monthly, roof-only, no forecast, no daily advice |
| Dow Cool Roof Energy Calculator | Coating savings for selected cities | Commercial, coatings only |
| CommHEAT (Iowa State) | Indoor heat prediction for US homes without AC | Research prototype, US only, not public |
| Coolhouse, NADIR (apps) | When to open/close windows | Compares temperatures; no physical model or fix planning |

**Nizhal's angle:** a physics-based *digital twin* of an Indian home (tin /
asbestos / RCC / Mangalore-tile roofs, brick / block / mud walls) driven by real
weather for any location, that gives an **indoor forecast**, a **window plan**,
and a **costed fix planner**, in English, Tamil and Hindi, free and private
(runs entirely in the browser).

## Goals

1. Describe a home in under a minute (wizard, sensible defaults).
2. Indoor forecast: next 7 days, hourly indoor temperature, "feels like" (heat
   index), danger hours, sleep comfort, against outdoors.
3. "Last summer's worst week" replay for any location, so the app is useful in
   every season.
4. Window plan: when to open and close windows for the coolest home.
5. Fix planner: each fix's effect on peak temperature, danger hours and
   sleepable nights, with an editable rough cost, ranked by value.
6. See the heat: a 3D house coloured by surface temperature with the sun
   moving across the sky, and a breakdown of where the heat comes from.
7. Calibrate the twin from a few thermometer readings (or a ₹300 logger CSV).
8. Share a link and print a one-page Home Heat Report.

## Non-goals

- Not a certified building-energy simulation (EnergyPlus/IES grade).
- No accounts, no server, no personal data leaving the browser.
- No AC sizing or energy bills (the people this is for mostly have no AC).

## Anti-goals (a failure even if it "works")

- Inventing precision: numbers must come from a stated model with stated
  assumptions; costs are rough ranges the user can edit.
- Medical advice beyond standard public-health heat guidance.
- A UI that only engineers understand: it must work for a parent in Nagercoil
  on a budget Android phone.

## The model (summary; details in `docs/how-it-works.md`)

- **Weather:** Open-Meteo forecast / ERA5 archive: air temperature, humidity,
  dew point, wind, global/direct/diffuse solar radiation, cloud cover. Hourly,
  interpolated to 5-minute steps.
- **Sun:** NOAA solar position; irradiance on each surface with the isotropic
  sky model (direct + sky diffuse + ground-reflected).
- **Building:** a thermal resistance–capacitance network. Every roof, wall and
  floor is split into material layers with their real conductivity, density and
  heat capacity. Outer surfaces absorb sun (solar absorptance), exchange heat
  with outdoor air (wind-dependent convection) and radiate to the sky (sky
  temperature from dew point and cloud cover). Inner surfaces exchange with the
  room. Windows let sun in (solar heat gain coefficient, shading). Ventilation
  brings outdoor air in at a rate that depends on whether windows are open.
  People, cooking and appliances add heat on schedules.
- **Solver:** implicit (backward Euler) time stepping with radiation linearised
  each step, so thin metal roofs and heavy concrete slabs are both stable.
- **Comfort and health:** indoor heat index (NOAA/NWS Rothfusz regression,
  categories caution / extreme caution / danger / extreme danger); comfort band
  from IMAC, the India Model for Adaptive Comfort (CEPT University) for
  naturally ventilated buildings; ceiling-fan cooling effect for "feels like".

## Decided

- Name: Nizhal. Languages: English, Tamil, Hindi.
- Web app (PWA), React + TypeScript + Vite, three.js for 3D, no backend.
- Fully client-side; share via URL; state in localStorage.

## Left to the builder

- Exact material values (use published handbook values and cite them).
- Default schedules (people, cooking, windows) for Indian homes.
- Visual design.
