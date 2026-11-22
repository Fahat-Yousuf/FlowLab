# Flow Lab Nozzle Explorer

An interactive, browser-based simulator for teaching compressible flow through converging and converging–diverging nozzles.

**Live site:** https://fahat-yousuf.github.io/FlowLab/

## What students can do
- Drag the back pressure across colour-coded flow regimes: unchoked, internal normal shock, overexpanded, ideally expanded, underexpanded.
- Watch an animated nozzle coloured by Mach number, pressure, temperature, velocity or density, with the normal shock drawn where it forms.
- Compare wall pressure with the textbook limiting curves, and see choking on the mass-flow vs back-pressure plot.
- Follow four guided lessons with predict-then-check questions.
- Design a nozzle backwards from a target exit Mach, exit pressure or mass flow.
- Export the design directly:
  - **CAD:** closed nozzle solid as STL (Siemens NX, SolidWorks, Fusion, 3D-printing slicers), a half-section DXF sketch to revolve into an exact solid, and wall contour points as CSV.
  - **ANSYS Fluent:** a 2-D axisymmetric fluid domain as DXF (with an optional exhaust plenum and layers named INLET, WALL, AXIS, OUTLET, FARFIELD), a 3-D fluid volume STL with named zones, a setup sheet with boundary conditions and solver settings, and the 1-D results as Fluent XY files to overlay on the CFD.

## Model
Steady quasi-one-dimensional flow of a calorically perfect gas, with isentropic branches and at most one normal shock. It uses the same equations as the Flow Lab MATLAB solver. Not modelled: boundary layers, separation, oblique shocks, real-gas effects and condensation. The flow outside the nozzle is drawn schematically.

## Run locally
Open `index.html` in any modern browser. An internet connection is needed for the plotting library (Plotly) and fonts.
