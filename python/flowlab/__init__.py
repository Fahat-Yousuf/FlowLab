"""Flow Lab: quasi-1D compressible nozzle flow for teaching and design.

Quick start::

    from flowlab import *
    geo = build_geometry("bell", Din=30, Dt=10, De=20.58, alpha=30)
    sol = solve(geo, P0=100*PSI, T0=300, Pb=14.7*PSI, g=1.4, R=287.05)
    print(sol.regime_name, sol.M[-1], sol.mdot)
    print(compare(geo, 100*PSI, 300, 14.7*PSI, "air"))

Units: SI inside (m, Pa, K, kg/s). ``build_geometry`` takes diameters in mm.
"""
from .isentropic import (PSI, PATM, area_mach, mach_from_area, mach_from_pressure_ratio,
                         pressure_ratio, temperature_ratio, choked_flux, normal_shock)
from .geometry import (Geometry, build_geometry, conical, bell, converging, rao_angles,
                       wall_arc_length, linspace, interp)
from .solver import solve, thresholds, mdot_at, REGIMES, Solution
from .realistic import GASES, realistic, compare, boundary_layer, sutherland
from . import plot

__version__ = "1.0.0"
__all__ = ["PSI", "PATM", "area_mach", "mach_from_area", "mach_from_pressure_ratio", "pressure_ratio",
           "temperature_ratio", "choked_flux", "normal_shock", "Geometry", "build_geometry", "conical",
           "bell", "converging", "rao_angles", "wall_arc_length", "linspace", "interp", "solve",
           "thresholds", "mdot_at", "REGIMES", "Solution", "GASES", "realistic", "compare",
           "boundary_layer", "sutherland", "plot"]
