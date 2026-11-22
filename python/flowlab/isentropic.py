"""Isentropic-flow and normal-shock relations for a calorically perfect gas.

All functions take the ratio of specific heats ``g`` (gamma) explicitly.
"""
import math

PSI = 6894.757293  # Pa per psi
PATM = 101325.0    # Pa


def area_mach(M, g):
    """A/A* for Mach number M."""
    return (1 / M) * ((2 / (g + 1)) * (1 + (g - 1) * M * M / 2)) ** ((g + 1) / (2 * (g - 1)))


def mach_from_area(ar, g, supersonic):
    """Invert A/A* by bisection. ``supersonic`` picks the branch."""
    if ar <= 1 + 1e-12:
        return 1.0
    if supersonic:
        lo, hi = 1.0, 2.0
        while area_mach(hi, g) < ar:
            hi *= 2
        for _ in range(70):
            m = (lo + hi) / 2
            if area_mach(m, g) < ar:
                lo = m
            else:
                hi = m
    else:
        lo, hi = 1e-12, 1.0
        for _ in range(70):
            m = (lo + hi) / 2
            if area_mach(m, g) > ar:
                lo = m
            else:
                hi = m
    return (lo + hi) / 2


def mach_from_pressure_ratio(p0_over_p, g):
    """Mach number for a given stagnation-to-static pressure ratio."""
    return math.sqrt(2 / (g - 1) * (p0_over_p ** ((g - 1) / g) - 1))


def pressure_ratio(M, g):
    """p/p0."""
    return (1 + (g - 1) / 2 * M * M) ** (-g / (g - 1))


def temperature_ratio(M, g):
    """T/T0."""
    return 1 / (1 + (g - 1) / 2 * M * M)


def choked_flux(P0, T0, g, R):
    """Choked mass flux at the throat, kg/(s m^2). Multiply by throat area."""
    return P0 * math.sqrt(g / (R * T0)) * (2 / (g + 1)) ** ((g + 1) / (2 * (g - 1)))


def normal_shock(M1, g):
    """Downstream Mach, static pressure ratio p2/p1 and total pressure ratio p02/p01."""
    c = (g - 1) / 2
    M2 = math.sqrt((1 + c * M1 * M1) / (g * M1 * M1 - c))
    p21 = 1 + 2 * g / (g + 1) * (M1 * M1 - 1)
    p0r = (((g + 1) * M1 * M1) / ((g - 1) * M1 * M1 + 2)) ** (g / (g - 1)) * \
          ((g + 1) / (2 * g * M1 * M1 - (g - 1))) ** (1 / (g - 1))
    return {"M2": M2, "p21": p21, "p0ratio": p0r}
