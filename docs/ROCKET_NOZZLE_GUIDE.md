# From Flow Lab to a real rocket nozzle

Flow Lab today is a **cold-gas** nozzle tool: air or nitrogen at room temperature, a perfect gas, and walls that never get hot. That is exactly right for learning and for cold-flow testing. A rocket nozzle carries combustion gas at roughly 2000–3600 K, and the hard problems become **heat**, **materials** and **combustion chemistry**. This guide explains what changes, walks through a design workflow with real numbers, and lists what to add to Flow Lab to support it.

> **Safety.** A rocket nozzle is a pressure vessel full of very hot gas. Do all design reviews, proof tests and hot fires inside your team's or university's safety process (for example your rocket propulsion lab's procedures), operate tests remotely from behind a barrier, and follow local regulations. Flow Lab is a design and teaching aid. It does not certify hardware.

---

## 1. What changes from cold gas to hot gas

| | Cold-flow nozzle (Flow Lab now) | Rocket nozzle |
|---|---|---|
| Supply temperature T₀ | ~300 K | ~2000–3600 K (chamber temperature T<sub>c</sub>) |
| Gas properties | Fixed table (air: γ = 1.4) | From a combustion code: γ ≈ 1.13–1.25, molecular weight ≈ 18–30 |
| Wall heating | None | Heat flux of order 10 MW/m² and more at the throat |
| Wall materials | PLA, resin, aluminium | Graphite, ablatives, copper alloys, nickel superalloys, steel for short burns |
| Duration | Unlimited | Limited by how long the wall survives the heat |
| Geometry change during the run | None | The throat can erode, which lowers chamber pressure and thrust |
| Chemistry | None | Composition changes as the gas expands (frozen vs equilibrium flow) |

**What stays the same:** every equation in Flow Lab's ideal model (choking, area ratio, shocks, over/underexpansion, separation) still applies, as long as you use the hot gas's γ, R and T₀.

---

## 2. A worked example with Flow Lab's engine

These numbers come from the `flowlab` Python package with **illustrative** combustion-gas properties: γ = 1.2, molecular weight 22 kg/kmol (R = 378 J/kg·K), T<sub>c</sub> = 3000 K, P<sub>c</sub> = 300 psia, firing at sea level, 20 mm throat, 80% bell. For a real design, take γ, molecular weight and T<sub>c</sub> from a combustion code for your propellants (step 2 below).

| Result | Value | What it means |
|---|---|---|
| Exit Mach for ideal expansion to 14.7 psia | 2.56 | Set by P<sub>c</sub>/P<sub>a</sub> and γ |
| Area ratio A<sub>e</sub>/A<sub>t</sub> | 3.68 (exit Ø 38.4 mm) | Hot gas (γ = 1.2) needs a bigger exit than air for the same pressure ratio |
| Nozzle length (80% bell) | 52.6 mm | |
| Mass flow | 0.396 kg/s | ṁ = P<sub>c</sub>A<sub>t</sub>/c\* |
| Characteristic velocity c\* | 1642 m/s | A property of the propellant and chamber, not the nozzle |
| Thrust coefficient Cf, ideal → realistic | 1.412 → 1.356 | The nozzle's contribution to thrust |
| Thrust, ideal → realistic | 918 N → 881 N | F = Cf · P<sub>c</sub> · A<sub>t</sub> |
| Specific impulse at sea level | 236 s → 233 s | I<sub>sp</sub> = F / (ṁ g₀) |
| Gas static temperature at the throat | ≈ 2730 K | Above the melting point of every common metal |
| Bartz heat flux at the throat | ≈ 13–16 MW/m² | For wall temperatures of 1200 K down to 800 K |

The last two rows are the point of this guide. **The flow part of the design is the easy part. Keeping the throat from melting or eroding is the real design problem.**

Reproduce it in the website's **Python lab**:

```python
from flowlab import *
import math
g, MW, Tc, Pc, Pa = 1.2, 22.0, 3000.0, 300*PSI, 14.696*PSI      # replace with CEA values
R = 8314.46 / MW
gas = dict(name="combustion gas", g=g, R=R, mu=(9.0e-5, 3000.0, 400.0), condensK=0)
Me = mach_from_pressure_ratio(Pc / Pa, g)
De = 20 * math.sqrt(area_mach(Me, g))
geo = build_geometry("bell", Din=44, Dt=20, De=De, alpha=30)
sol = solve(geo, Pc, Tc, Pa, g, R)
print(compare(geo, Pc, Tc, Pa, gas))
print("c* =", Pc * geo.At / sol.mdot, "m/s   Isp =", sol.F / sol.mdot / 9.80665, "s")
```

---

## 3. Design workflow

### Step 1: Requirements
Write down thrust, chamber pressure, where it fires (sea level, altitude, or both), burn time, and what you can manufacture. Every later choice traces back to these.

### Step 2: Propellant properties
Run a chemical-equilibrium code at your chamber pressure and mixture ratio to get chamber temperature, molecular weight, γ, c\*, and transport properties (viscosity, Prandtl number) for the heat-transfer step.

- **NASA CEA**: the standard. It has an online front end ([CEARUN](https://cearun.grc.nasa.gov/)) and a modernized open-source version ([github.com/nasa/cea](https://github.com/nasa/cea), `pip install cea`).
- **RPA (Rocket Propulsion Analysis)**: CEA-style thermochemistry plus thrust-chamber sizing, contours and thermal analysis.
- **Combustion Toolbox**: open-source, CEA-based, MATLAB.

Use a γ representative of the nozzle (between the chamber and exit values). Real combustion is never perfect, so multiply c\* by an efficiency of roughly 0.90–0.97 until your own test data tells you the real value.

### Step 3: Exit pressure and area ratio
- **Sea level only:** aim for exit pressure near ambient. Slightly overexpanded is fine, but keep P<sub>e</sub> above the separation limit (Flow Lab's Check & fix tab does this for you).
- **Flight through altitude:** a larger area ratio gains thrust high up but separates at sea level. Sweep the back pressure in the Simulate tab to see the whole flight.

### Step 4: Throat size
A<sub>t</sub> = F / (Cf · P<sub>c</sub>), and then ṁ = P<sub>c</sub> A<sub>t</sub> / c\*. Use the *realistic* Cf. Flow Lab's "design backwards from mass flow" does this for cold gas; for hot gas use the Python lab as above.

### Step 5: Contour
- An **80% bell** is the usual choice: shorter and lighter than a 15° cone with similar losses.
- Keep the **throat rounded** (upstream radius about 1.5·R<sub>t</sub>). Sharp throats concentrate heat and stress.
- A **contraction ratio** of about 3–6 keeps the chamber gas slow. Chamber length and volume (characteristic length L\*) are a combustion question; see Sutton and Huzel & Huang.

### Step 6: Heat transfer at the throat
The standard first estimate is the **Bartz equation** for the gas-side heat-transfer coefficient:

```
h_g = (0.026 / Dt^0.2) · (μ^0.2 · cp / Pr^0.6) · (Pc / c*)^0.8 · (Dt / Rc)^0.1 · (At / A)^0.9 · σ
q   = h_g · (T_aw − T_wall)
```

μ, cp and Pr are chamber values from CEA, R<sub>c</sub> is the throat radius of curvature, T<sub>aw</sub> is the adiabatic wall (recovery) temperature, and σ corrects for property changes across the boundary layer (take σ ≈ 1 for a first estimate). The (A<sub>t</sub>/A)^0.9 term makes the **throat the hottest point**. In the example, h<sub>g</sub> ≈ 7100 W/m²·K and q ≈ 13–16 MW/m².

### Step 7: Choose a cooling strategy and material

| Approach | How it survives | Typical materials | Good for |
|---|---|---|---|
| **Heat sink** | Thick wall soaks up heat until it gets too hot | Copper, steel, graphite | Short test firings (seconds) |
| **Ablative** | Liner chars and erodes, carrying heat away | Silica/carbon phenolic, graphite throat inserts | Solid motors and simple liquid engines |
| **Radiation** | Wall glows and radiates heat away | Niobium, carbon–carbon | Low-pressure, vacuum nozzle extensions |
| **Film cooling** | A layer of fuel or cool gas protects the wall | Any, combined with the above | Extending heat-sink and ablative designs |
| **Regenerative** | Propellant flows through wall channels before burning | Copper alloys (e.g. GRCop-42, CuCrZr), Inconel 718 (often 3D-printed) | Long-duration liquid engines |

Rough melting points for perspective: aluminium alloys ~850–930 K, copper ~1360 K, Inconel 718 ~1530 K, stainless steels ~1650–1700 K. Graphite does not melt at atmospheric pressure but sublimes near 3900 K. **PLA, resin and aluminium nozzles are for cold-flow tests only.**

### Step 8: Structure
Check pressure stress (Flow Lab's Lamé check) *and* thermal stress, using **strength at operating temperature**, which can be a small fraction of room-temperature strength. Define a maximum expected operating pressure (MEOP), keep a margin to burst, and **hydrostatically proof-test** each part (with water, not gas) before any firing. 1.5× MEOP is a common proof level; follow your team's standard.

### Step 9: Manufacture and measure
1. Export the half-section DXF from Flow Lab, revolve it in NX, and add flanges, bolt holes, pressure ports and thermocouple bosses. The MATLAB app can also produce a STEP solid directly.
2. Hold the throat diameter tightly: thrust and mass flow scale with its square.
3. Measure the **as-built** throat and exit, and enter those values in Flow Lab before comparing with tests.
4. Keep the throat surface smooth and concentric with the chamber.

### Step 10: Test progression
Each step validates part of the model before you add risk:

1. **Cold flow** (what Flow Lab already models): verifies wall pressures, discharge coefficient, separation and your instrumentation with no heat or combustion.
2. **Hydrostatic proof test** of every pressure part.
3. **Short hot fire** with a heat-sink or ablative nozzle, instrumented for chamber pressure, thrust and wall temperature.
4. **Full-duration firings**, then inspect throat erosion and heat damage.

After each step compare measurements with Flow Lab's predictions and update your efficiency factors (c\* efficiency, Cd, Cf). That comparison is the research result.

---

## 4. Making Flow Lab ready for real rocket nozzles

In priority order. Each item lists where it goes in the code (see [CODE_GUIDE.md](CODE_GUIDE.md)).

1. **Hot-gas mode.** A "Combustion gas" option where students enter γ, molecular weight, T<sub>c</sub>, viscosity and Prandtl number (or paste CEA output), plus c\* efficiency. Show c\*, I<sub>sp</sub> and Cf.
   *Code:* a custom entry in `GASES`, new fields in `readInputs()`, new tiles in `renderDesign()`/`renderSimulate()`.
2. **Throat heat transfer.** The Bartz equation along the whole nozzle, giving h<sub>g</sub>(x), heat flux q(x) and the adiabatic wall temperature, on a new **Thermal** tab. Add a heat-sink estimate: how many seconds until the throat reaches the material limit.
   *Code:* a `heatTransfer(geo, sol, gas)` function in `physics.js`, a `thermal.py` module, and a check in `checks()`.
3. **Strength at temperature.** Temperature-dependent yield strength per material, plus a thermal-stress estimate.
   *Code:* extend `MATERIALS` with strength-vs-temperature tables and the wall-strength check.
4. **Altitude performance.** Thrust, I<sub>sp</sub> and separation against altitude (standard atmosphere), to choose the area ratio for a flight profile.
5. **Test-data comparison on the website.** Port the MATLAB app's TEST DATA tab: import chamber-pressure, thrust and wall-pressure traces and compare them with predictions to fit efficiency factors.
6. **Chamber sizing.** Contraction ratio and L\* to size the chamber that feeds the nozzle.
7. **Throat erosion.** Effect of a growing throat on chamber pressure and thrust over a burn.
8. **Method-of-characteristics contours** (ideal and minimum-length) and **STEP export** in the browser.
9. **Frozen vs equilibrium flow**: let γ vary through the nozzle from CEA data.

Items 1 and 2 turn Flow Lab from a flow-only tool into a first-pass rocket-nozzle design tool, and are the best next step.

---

## 5. Further reading

- G. P. Sutton & O. Biblarz, *Rocket Propulsion Elements*: the standard textbook.
- D. K. Huzel & D. H. Huang, *Modern Engineering for Design of Liquid-Propellant Rocket Engines* (NASA SP-125 is the earlier edition): bell contours, cooling, practical design.
- D. R. Bartz (1957), "A simple equation for rapid estimation of rocket nozzle convective heat transfer coefficients," *Jet Propulsion* 27.
- G. V. R. Rao (1958), "Exhaust nozzle contour for optimum thrust," *Jet Propulsion* 28.
- NASA CEA: [nasa.gov/glenn/research/chemical-equilibrium-with-applications](https://www.nasa.gov/glenn/research/chemical-equilibrium-with-applications), [github.com/nasa/cea](https://github.com/nasa/cea), [CEARUN](https://cearun.grc.nasa.gov/).
- RPA: [propulsion-analysis.com](http://propulsion-analysis.com/RPA/download.htm).
