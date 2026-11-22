# flowlab (Python)

The Flow Lab nozzle engine in pure Python (standard library only). It is the same model as the website, and it is what runs in the site's **Python lab** tab.

```bash
cd python
pip install -e .            # or: pip install -e ".[plot]" for matplotlib plots
python tests/test_flowlab.py
```

```python
from flowlab import *
geo = build_geometry("bell", Din=30, Dt=10, De=20.58, alpha=30)   # diameters in mm
sol = solve(geo, P0=100*PSI, T0=300, Pb=14.7*PSI, g=1.4, R=287.05)
print(sol.regime_name, round(sol.M[-1], 3), round(sol.mdot*1000, 2), "g/s")
print(compare(geo, 100*PSI, 300, 14.7*PSI, "air"))                 # ideal vs realistic
```

Modules: `isentropic` (area–Mach, shocks), `geometry` (conical, bell, converging), `solver` (ideal quasi-1D with internal normal shock), `realistic` (boundary layer, discharge coefficient, divergence loss, separation), `plot`.
