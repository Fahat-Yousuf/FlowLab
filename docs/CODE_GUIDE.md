# Flow Lab code guide

This guide explains what every part of Flow Lab does, how the pieces talk to each other, and how to change them. Read it with the code open.

- [1. The big picture](#1-the-big-picture)
- [2. What happens when you change an input](#2-what-happens-when-you-change-an-input)
- [3. Physics engine reference (`js/physics.js`)](#3-physics-engine-reference-jsphysicsjs)
- [4. How the key algorithms work](#4-how-the-key-algorithms-work)
- [5. User interface reference (`js/app.js`)](#5-user-interface-reference-jsappjs)
- [6. Python lab (`js/pylab.js`) and the Python package](#6-python-lab-jspylabjs-and-the-python-package)
- [7. How to extend Flow Lab](#7-how-to-extend-flow-lab)
- [8. Testing](#8-testing)
- [9. Known limitations](#9-known-limitations)

---

## 1. The big picture

Flow Lab has three layers. Each one only talks to the layer below it.

```
 index.html + css/style.css     what you see: tabs, sidebar, cards
            │
 js/app.js  (user interface)    reads inputs, calls the engine, draws charts, exports files
 js/pylab.js (Python lab)       runs the Python package in the browser
 js/info.js  (info tips)        the ⓘ icons: every explanation text and the hover/tap tooltip
            │
 js/physics.js (engine "FL")    pure maths: geometry, flow solver, realistic model, checks
 python/flowlab/ (same engine)  identical maths in Python, for students and scripts
```

**The engine knows nothing about the web page.** `physics.js` never touches the HTML. It takes numbers and returns numbers, so it can be tested in Node and ported line by line to Python. The Python package in `python/flowlab/` is that port, and the test scripts check that the two agree to about 1×10⁻¹⁵.

**Units.** Inside the engine everything is SI: metres, pascals, kelvin, kg/s. The interface converts at the edges: diameters are typed in mm, pressures in psia (`PSI = 6894.757293` Pa per psi).

---

## 2. What happens when you change an input

Every input in the sidebar calls `recompute()` in `app.js`. One pass looks like this:

1. **`readInputs()`** reads every field into the shared state object `S` (gas, P₀, T₀, P<sub>b</sub>, material, wall thickness) and builds a `spec` describing the shape (`{shape, Din, Dt, De, alpha, beta, rc, bellPct, ...}`).
2. **`FL.buildGeometry(spec)`** turns the spec into a wall contour: about 240 points of axial position `x` and radius `r`, plus area `A`, the throat index `it`, throat area `At` and exit area `Ae`.
3. **`FL.realistic(geo, P0, T0, Pb, gas)`** runs the physics:
   - calls **`FL.solve()`** for the ideal (first-model) solution,
   - calls **`FL.boundaryLayer()`** to grow the displacement thickness along the wall,
   - calls **`FL.solve()`** again on the smaller *effective* nozzle,
   - adds the discharge coefficient, divergence loss and separation search.
   It returns both the ideal solution (`real.ideal`) and the realistic one.
4. **`FL.checks(...)`** inspects the design and returns a list of findings with fixes.
5. **`buildSegments()`** recalculates the coloured regime bands on the back-pressure slider.
6. **`renderActive()`** redraws only the tab you are looking at (Plotly cannot size charts in hidden tabs, and skipping them keeps the slider smooth).

The animated nozzle runs separately in `tick()`, which `requestAnimationFrame` calls about 60 times a second. It only moves particles and redraws the canvas; it never re-solves the flow.

---

## 3. Physics engine reference (`js/physics.js`)

Everything is exported on one object, `FL`. Python names are the same in `snake_case`.

### Data tables

| Name | What it holds |
|---|---|
| `GASES` | γ, R, Sutherland viscosity constants and an approximate condensation temperature for air, N₂, He, H₂, O₂, CO₂. |
| `MATERIALS` | Typical yield strength, density and maximum service temperature for PLA, PETG, resin, aluminium 6061-T6, stainless 316, brass. Check real data sheets before building. |
| `RAO80` | Approximate initial and exit wall angles (θn, θe) for an 80% Rao bell against area ratio. |

### Gas-dynamics building blocks

| Function | What it does |
|---|---|
| `areaMach(M, g)` | A/A\* for a Mach number: the area-Mach relation. |
| `machFromArea(ar, g, sup)` | The inverse: Mach number for an area ratio. `sup` picks the subsonic or supersonic answer (there are always two). Uses bisection, see §4.1. |
| `machFromPressureRatio(P0/P, g)` | Mach number from the isentropic pressure ratio. |
| `chokedFlux(P0, T0, g, R)` | Mass flow per unit throat area when the throat is sonic. Multiply by `At` for ṁ. |
| `normalShock(M1, g)` | Downstream Mach, static pressure ratio and total-pressure ratio across a normal shock. |
| `sutherland(T, gas)` | Gas viscosity at temperature T (Sutherland's law). Used by the boundary layer. |

### Geometry

| Function | What it does |
|---|---|
| `buildGeometry(spec, n)` | Validates the inputs and calls one of the three shape builders below. Fills in automatic bell angles. |
| `conical(di, dt, de, alpha, beta, rc, n)` | Converging cone, optional circular throat arc of radius `rc·Rt` tangent to both cones, diverging cone. |
| `bell(di, dt, de, alpha, pct, θn, θe, n, auto)` | Rao-style thrust-optimised parabola, see §4.4. |
| `converging(di, dt, alpha, n)` | A single cone; the exit is the throat. |
| `raoAngles(eps)` | Interpolates θn and θe from `RAO80` in log(area ratio). |
| `finishGeo(x, r, kind, meta)` | Adds areas, finds the throat (smallest area) and packages everything into one `geo` object. |
| `wallArcLength(geo)` | Distance measured along the wall from the inlet. The boundary layer grows with this. |

### Flow solvers

| Function | What it does |
|---|---|
| `thresholds(geo, g, P0)` | The three back pressures that separate the regimes: `Pchoke` (choking), `PshockExit` (normal shock exactly at the exit) and `PeIso` (ideal expansion). |
| `shockState(xs, geo, g, P0)` | "If a normal shock stood at x = xs, what would the exit pressure be?" Used by the shock search. |
| `solve(geo, P0, T0, Pb, g, R)` | **The ideal (first) model.** Picks the regime, finds any shock, and returns M, P, T, ρ, V at every point, plus ṁ, thrust F and thrust coefficient Cf. See §4.2. |
| `mdotAt(geo, P0, T0, Pb, g, R)` | Mass flow at any back pressure, used to draw the mass-flow-vs-P<sub>b</sub> curve. |
| `boundaryLayer(geo, sol, gas)` | Displacement thickness δ\* and Reynolds number along the wall. See §4.3. |
| `realistic(geo, P0, T0, Pb, gas, opts)` | **The realistic model.** Ideal solution, effective-area solution, discharge coefficient, divergence factor, separation and corrected thrust. See §4.3. |
| `designFor(mode, value, P0, T0, g, R, opts)` | Inverse design: exit Mach, exit pressure or mass flow → throat diameter, exit diameter, design exit pressure. |

### Checks

| Function | What it does |
|---|---|
| `checks(state)` | Runs every design rule and returns `{level, title, detail, fix, apply}` items. `level` is `bad`, `warn`, `info` or `ok`; `apply` is a map of input fields to new values for the "Apply fix" button. See §4.5. |
| `lameHoop(p, ri, ro)` | Thick-wall (Lamé) hoop stress at the bore of a pressurised tube. |

---

## 4. How the key algorithms work

### 4.1 Inverting the area-Mach relation (`machFromArea`)

A/A\* cannot be solved for M with algebra, so Flow Lab uses **bisection**: start with a bracket that must contain the answer, test the midpoint, keep the half that still contains it, and repeat 70 times. Each step halves the bracket, so 70 steps give far more precision than a double-precision number can hold.

- Subsonic branch: bracket [0, 1]. A/A\* falls as M rises towards 1.
- Supersonic branch: bracket [1, 2], doubled until A/A\*(hi) is large enough. A/A\* rises with M.

Bisection is slower than Newton's method but it can never diverge, which matters when students type unusual inputs.

### 4.2 The ideal solver (`solve`)

1. **Find the thresholds** with `thresholds()`:
   - `Pchoke`: the exit pressure of the subsonic solution with a sonic throat. Above it, nothing is choked.
   - `PeIso`: the exit pressure of the fully supersonic solution.
   - `PshockExit`: `PeIso` raised by a normal shock at the exit Mach number.
2. **Pick the regime** by comparing P<sub>b</sub> with them:
   - P<sub>b</sub> ≥ `Pchoke` → **subsonic everywhere**. The exit Mach comes from P₀/P<sub>b</sub>; a smaller "virtual throat" A\* = A<sub>e</sub>/(A/A\*)(M<sub>e</sub>) sets the Mach number at every other point.
   - Converging nozzle, P<sub>b</sub> < `Pchoke` → **choked**, M = 1 at the exit.
   - `PshockExit` < P<sub>b</sub> < `Pchoke` → **normal shock inside**. Go to step 3.
   - P<sub>b</sub> ≤ `PshockExit` → **shock-free supersonic** inside; over-, ideally or underexpanded depending on how P<sub>b</sub> compares with `PeIso` (±1% counts as ideal).
3. **Locate the shock by bisection.** `shockState(x)` puts a shock at x, computes the total-pressure loss, finds the new (larger) A\* behind the shock, and returns the resulting exit pressure. That exit pressure falls steadily as the shock moves downstream (the shock gets stronger), so bisection between the throat and the exit finds the one position where exit pressure equals P<sub>b</sub>.
4. **Fill in properties** from the isentropic relations at every point, using the reduced total pressure P₀₂ behind a shock.
5. **Totals:** ṁ = ρAV at the inlet, F = ṁV<sub>e</sub> + (P<sub>e</sub> − P<sub>b</sub>)A<sub>e</sub>, Cf = F/(P₀A<sub>t</sub>).

This is the same algorithm as the original MATLAB `FlowLab_IdealGasNozzleSolver.m`.

### 4.3 The realistic model (`realistic` and `boundaryLayer`)

1. **Ideal solution first** (`solve`), kept for the comparison.
2. **Boundary layer.** Along the wall, at arc length s, compute the Reynolds number Re<sub>s</sub> = ρ\*Vs/μ\* with density and viscosity at the **Eckert reference temperature** T\* = T + 0.5(T<sub>w</sub> − T) + 0.22(T<sub>r</sub> − T), where the wall is adiabatic (T<sub>w</sub> = T<sub>r</sub>, recovery temperature with r = 0.89). Then δ\* = 0.046 s/Re<sup>0.2</sup> (turbulent) or 1.72 s/√Re (laminar, Re < 5×10⁵).
3. **Effective nozzle.** Subtract δ\* from the radius everywhere: r<sub>eff</sub> = r − δ\*. The boundary-layer discharge coefficient is `CdVisc = At,eff / At`.
4. **Throat curvature.** `CdInv = 1 − (γ+1)/(96 R²)` with R = R<sub>c</sub>/R<sub>t</sub> floored at 1 (Hall, leading term). A converging nozzle uses a typical 0.985.
5. **Solve the effective nozzle** with `solve` (which handles every regime, including shocks). Mass flow = Cd × ideal ṁ.
6. **Divergence factor** λ = (1 + cos θ<sub>exit</sub>)/2.
7. **Separation.** Only for shock-free supersonic exit flow, march from the throat to the exit and stop at the first point where wall pressure is below the limit: Summerfield `0.4·Pb` or Schmucker `Pb·(1.88M − 1)^−0.64` (capped at 0.5·P<sub>b</sub> because it is not valid near Mach 1). Downstream, the wall pressure is drawn rising linearly to P<sub>b</sub>.
8. **Thrust.** Attached: F = λṁV<sub>e</sub> + (P<sub>e</sub> − P<sub>b</sub>)A<sub>e</sub>. Separated: the same formula evaluated at the separation point, because the wall downstream sees roughly ambient pressure.

### 4.4 The bell contour (`bell`)

The standard Huzel & Huang construction of Rao's parabola, with the throat at x = 0:

1. Converging cone at half-angle α down to an **upstream arc** of radius 1.5·R<sub>t</sub>, tangent to the cone, ending horizontal at the throat.
2. **Downstream arc** of radius 0.382·R<sub>t</sub> from the throat to angle θn, ending at point N.
3. Length L<sub>n</sub> = (bell %) × length of a 15° cone with the same area ratio. The exit point is E = (L<sub>n</sub>, R<sub>e</sub>).
4. A **quadratic Bézier** from N to E. Its control point Q is where the tangent lines at N (angle θn) and E (angle θe) cross. Q must lie between N and E, or the curve would fold back.
5. If the chart angles make that impossible (usual at low area ratios), automatic mode puts Q halfway along and derives θe from it, moving θn until 0 ≤ θe < θn. The design is flagged `meta.adjusted`.

### 4.5 Checks (`checks`)

Each rule compares a computed number with an engineering rule of thumb, then writes a fix that has its own numbers in it. Examples:

- **Separation fix:** finds the exit Mach whose ideal exit pressure is 10% above the separation limit (iterating, because Schmucker's limit depends on Mach), then converts it to an exit diameter.
- **Wall strength:** Lamé hoop stress at the inlet (the largest pressure × radius) against yield ÷ safety factor. If too thin, it solves the Lamé equation for the minimum outer radius.
- **Condensation:** compares exit static temperature with the gas's condensation point and suggests the supply temperature that keeps it 20 K clear.

---

## 5. User interface reference (`js/app.js`)

### State and recompute
| Function | What it does |
|---|---|
| `S` (object) | Everything the page knows: shape, spec, geometry, ideal and realistic solutions, checks, saved designs, active tab, animation particles. |
| `readInputs()` | Reads and validates the sidebar into `S`, builds the geometry. Shows a red error box if an input is impossible. |
| `recompute()` | The pipeline in §2. |
| `setPb(p)` | Sets back pressure from the slider or a jump button. |
| `setShape(sh)` | Switches between bell, conical and converging, and hides fields that do not apply. |
| `showTab()` / `renderActive()` | Simple hash router: `#design`, `#simulate`, ... shows one view and draws it. |

### Design tab
| Function | What it does |
|---|---|
| `renderDesign()` | Summary tiles (design Mach, area ratio, length, mass flow, thrust, part mass). |
| `drawDesign()` | The dimensioned half-section on a canvas: hatched wall, axis, dimension lines with arrowheads, angle notes. |
| `updateDesignCalc()` / `applyDesign()` | The "design backwards" calculator, using `FL.designFor`. |
| `renderShapeNotes()` | The "About this shape" text. |
| `wallVolume()` | Wall volume by integrating π((r+t)² − r²) along x, for part mass. |

### Simulate tab
| Function | What it does |
|---|---|
| `buildSegments()` | Splits the slider into equal-width regime bands, so short regimes (like unchoked) are as easy to reach as long ones. |
| `pbToSlider()` / `sliderToPb()` | Map between slider position and pressure. Logarithmic inside the wide regimes, linear inside the narrow ones. |
| `renderSimulate()` / `updateExplain()` | Tiles and the plain-language "what is happening" text for each regime. |
| `drawSimCharts()` / `refCurves()` | Plotly charts with the textbook limiting curves, the realistic overlay and the separation band. |
| `drawViz()`, `tick()`, `cmap()`, `field()` | The animated nozzle: coloured by the chosen property, particles move at a speed scaled to local velocity, shock line, separation region, schematic plume. |
| `probeAt()` | Hover read-out of local values, including δ\*. |

### Compare tab
| Function | What it does |
|---|---|
| `renderCompare()` | Ideal-vs-realistic table and plots. |
| `currentSnapshot()`, `renderSaved()`, `renderSavedPlots()`, `loadDesign()` | Saved designs, stored in the browser's `localStorage` (private to that browser). |

### Check & fix tab
| Function | What it does |
|---|---|
| `renderChecks()` | Sorts findings by severity and wires the "Apply fix" buttons. |
| `updateBadge()` | The number on the tab: problems first, then warnings. |

### Export tab
| Function | What it does |
|---|---|
| `profileMM()` | Wall profile in mm with collinear points removed (cones become two points). |
| `revolve()` | Spins a closed (x, r) outline around the axis into a watertight triangle mesh, and flips it if the volume comes out negative so normals face outward. |
| `wallMesh()` / `fluidMesh()` | The solid part (with wall thickness) and the gas volume (with named inlet, wall, outlet zones). |
| `stlBinary()` / `stlAsciiNamed()` | STL writers. ASCII is used for the fluid so Fluent Meshing keeps zone names. |
| `dxf()`, `partDxfLines()`, `fluentDxfLines()` | Minimal R12 DXF with LINE entities on named layers. |
| `setupSheet()`, `xyFile()` | Fluent setup sheet and Fluent XY plot files with ideal and realistic curves. |
| `download()` | Saves a generated file through a temporary link. |

---

## 6. Python lab (`js/pylab.js`) and the Python package

**`pylab.js`** loads [Pyodide](https://pyodide.org) (Python compiled to WebAssembly) the first time you open the tab, downloads the six `.py` files from `python/flowlab/` on this same site into Pyodide's virtual file system, and imports them. So the browser runs *exactly* the files in the repository.

| Function | What it does |
|---|---|
| `ensurePython()` | Loads Pyodide once and installs the package. |
| `designCode()` | Writes the current website design as a Python `design` dictionary. |
| `run()` | Runs the editor's code, sending `print` output to the Output box. |
| `window.flowlabPlot` | Called by `flowlab.plot.line()` from Python to draw a Plotly chart. |

**Package modules**

| Module | JavaScript equivalent |
|---|---|
| `isentropic.py` | `areaMach`, `machFromArea`, `machFromPressureRatio`, `chokedFlux`, `normalShock` (plus `pressure_ratio`, `temperature_ratio`) |
| `geometry.py` | `conical`, `bell`, `converging`, `buildGeometry`, `raoAngles`, `wallArcLength`; `Geometry` dataclass |
| `solver.py` | `thresholds`, `shockState`, `solve`, `mdotAt`; `Solution` dataclass with `.table()` and `.regime_name` |
| `realistic.py` | `GASES`, `sutherland`, `boundaryLayer`, `realistic`, plus `compare()` for a printed summary |
| `plot.py` | Draws in the browser, uses matplotlib on a desktop, or prints if neither exists |

---

## 7. How to extend Flow Lab

Always change **both** `js/physics.js` and `python/flowlab/`, then run both test suites (§8).

**Add a gas.** Add an entry to `GASES` in both engines (`g`, `R`, Sutherland `mu`, `condensK`) and an `<option>` in the Gas select in `index.html`.

**Add a material.** Add it to `MATERIALS` in `physics.js` and to the Material select. The strength check picks it up automatically.

**Add a check.** In `checks()`, compute your quantity and call `add(level, title, detail, fix, apply)`. `apply` keys must be input IDs (`P0`, `De`, `Din`, `alpha`, `beta`, `rc`, `T0`, `wall`).

**Add a nozzle shape.** Write a builder that returns `finishGeo(x, r, kind, meta)` with strictly increasing x, the throat as the smallest radius, and `meta.exitAngle`, `meta.rcUp`, `meta.xThroat`. Add a branch in `buildGeometry`, a button in the sidebar, and its fields. The solver, realistic model, checks, drawings and exports all work from `x` and `r`, so they need no changes.

**Add or edit an ⓘ explanation.** All tip text is in the `INFO` table at the top of `js/info.js` as `key: [title, text]`. Give any element `data-info="key"` (or add an input's id to `LABEL_KEYS`) and the icon appears automatically, including in content that is redrawn.

**Add a tab.** Add a `<a data-tab="name">` link, a `<section class="view" data-view="name">`, the name to `TABS`, and a branch in `renderActive()`.

---

## 8. Testing

```bash
# Python engine (textbook values, regimes, bell geometry, realistic model)
python python/tests/test_flowlab.py

# Original MATLAB solver tests (in MATLAB)
FlowLab_Verification_Tests
FlowLab_TargetExitPressure_Tests
```

When you change the engine, also compare JavaScript and Python on a few designs: load `js/physics.js` in Node with `require()`, run the same cases in Python, and check the outputs match to about 1e-12.

---

## 9. Known limitations

- **Perfect gas, constant γ.** Fine for cold-gas tests. Hot rocket exhaust needs properties from a chemical-equilibrium code. See [ROCKET_NOZZLE_GUIDE.md](ROCKET_NOZZLE_GUIDE.md).
- **Adiabatic walls, no heat transfer.** No wall temperatures or cooling.
- **One-dimensional.** No 2-D throat effects, oblique or curved shocks, or plume structure.
- **Realistic corrections are estimates** (boundary layer ±30% on δ\*, separation criteria ± a few percent of length). Confirm with CFD and tests.
- **Bell angles** are approximate chart values; automatically adjusted bells are flagged.
- **No method-of-characteristics contour** and **no STEP export** in the web app (STEP is available from the MATLAB app through CadQuery).
