# Buckley–Leverett Lab

An interactive teaching tool for Buckley–Leverett waterflooding (secondary and enhanced oil recovery). It follows the lecture *Buckley–Leverett waterflooding: displacement in linear systems* (A. Kazemi), and its Core A defaults reproduce the lecture's worked numbers.

## What it does

1. **Inputs (Step 1).** Core geometry, porosity, permeability, Siw, Sor, Corey relative permeability, viscosities, formation volume factors, injection rate and run length, plus tracer and polymer parameters. Each input has a slider and an exact number box.
2. **Explorer (Step 2).**
   - A 3D reservoir block between an injector and a producer well. The top face is an Sw map; the front face shows water and oil as pore-volume fractions. Light, dark or automatic theme.
   - Front rings, a distance ruler and a graduated cylinder that collects the produced oil and water.
   - A **time slider** with play/pause and jumps to breakthrough and other arrivals.
   - An **Sw explorer** that shows where a chosen saturation sits, how fast it moves and when it reaches the outlet.
3. **Linked plots.** Saturation profile (with the raw folded construction), fw with tangent constructions, kr, dfw/dSw, distance–time diagram, outlet history, cumulative volumes, recovery factor and pressure drop. **Pin as baseline** overlays a previous case.
4. **Calculation steps.** The lecture's five-step sequence, with every number recalculated from your inputs and the current time.

## Modes

| Mode | Physics |
|---|---|
| Waterflood | Welge tangent from (Siw, 0): shock to Swf, then a spreading wave |
| Water + tracer | Ideal tracer marks injected water: vB = u·fB/SB (origin tangent). Optional dispersivity |
| Polymer | Viscous injected water μp·Rk, resident water ahead. A common line through (IPV − D, 0) gives the polymer front I and the oil bank SR. Optional adsorption D and IPV |

## Run locally

It is a static site (no build). Serve the folder and open it:

```bash
python3 -m http.server 8000
```

## Tests

```bash
node tests/physics.test.mjs
```

The tests check the engine against the lecture values (Swf = 0.420605, tBT = 185.3 s, SB = 0.494125, SI = 0.576379, SR = 0.427589, Np at 300 s, and others). They also check that the Welge average matches direct integration of the profile in every mode.

## Deploy on GitHub Pages

Settings → Pages → Build and deployment → Deploy from a branch → `main` / root.

## Files

- `js/physics.js`: fractional-flow engine (pure functions)
- `js/core3d.js`: Three.js core view
- `js/plots.js`: Plotly charts
- `js/calc.js`: calculation sheet and model notes
- `js/app.js`: UI state and wiring
