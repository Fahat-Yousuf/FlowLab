# Flow Lab Nozzle Studio

Design, simulate, check and export supersonic nozzles. A teaching tool that connects compressible-flow theory with real engineering design.

**Live site:** https://fahat-yousuf.github.io/FlowLab/

## Tabs
| Tab | What it does |
|---|---|
| **Design** | Bell (Rao thrust-optimised parabola), conical (with rounded throat) or converging nozzles. Dimensioned drawing, key numbers, part mass, and inverse design from a target exit Mach, exit pressure or mass flow. |
| **Simulate** | Drag the back pressure across colour-coded regimes (unchoked, internal normal shock, over-, ideally and underexpanded). Animated flow, separation marker, wall-pressure, Mach and mass-flow plots, and a plain-language explanation. |
| **Compare** | The first (ideal) model next to the realistic model, plus saved designs overlaid side by side. |
| **Check & fix** | Automatic checks of regime, separation, angles, throat curvature, contraction ratio, Reynolds number, boundary-layer blockage, condensation, wall strength and manufacturing, each with a specific fix and an "Apply fix" button. |
| **How it works** | Equations, assumptions, every realistic correction with its source, nozzle shapes, troubleshooting FAQ, guided lessons and references. |
| **Python lab** | Real Python in the browser (Pyodide) running the `flowlab` package, with examples and plots. |
| **Export** | STL part and half-section DXF for CAD and 3D printing; Fluent 2-D axisymmetric domain (DXF), 3-D fluid STL, setup sheet and XY overlay files for ANSYS. |

## Models
- **Ideal (first model):** steady quasi-1D isentropic flow of a calorically perfect gas with at most one normal shock. Same equations as the original MATLAB solver.
- **Realistic:** adds turbulent boundary-layer displacement (Eckert reference temperature), throat-curvature discharge coefficient (Hall), divergence loss, and overexpanded separation (Schmucker or Summerfield). These are engineering estimates; use CFD and experiments to confirm.

## Repository layout
```
index.html          app shell and tab content
css/style.css       styles (light and dark)
js/physics.js       engine: geometry, ideal solver, realistic model, checks (no DOM)
js/app.js           user interface, charts, exports
js/pylab.js         Python lab (Pyodide)
python/flowlab/     the same engine as a pip-installable Python package
python/tests/       Python verification tests
```

## Python
```bash
cd python && pip install -e . && python tests/test_flowlab.py
```
The JavaScript and Python engines are cross-checked to agree to about 1e-15.

## Run locally
Serve the folder (for example `python -m http.server`) and open http://localhost:8000. Plotly, fonts and Pyodide load from CDNs, so an internet connection is needed.
