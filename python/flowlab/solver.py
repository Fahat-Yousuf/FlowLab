"""Ideal quasi-1D nozzle solver with an optional internal normal shock.

Port of FlowLab_IdealGasNozzleSolver.m and js/physics.js ``solve``.
"""
import math
from dataclasses import dataclass

from .isentropic import area_mach, mach_from_area, mach_from_pressure_ratio, choked_flux
from .geometry import interp

REGIMES = {
    "sub": "Subsonic, unchoked",
    "chokedC": "Choked, sonic exit",
    "shock": "Normal shock inside the nozzle",
    "over": "Overexpanded",
    "ideal": "Ideally expanded",
    "under": "Underexpanded",
}


def thresholds(geo, g, P0):
    """Back pressures that separate the flow regimes for this nozzle."""
    c, e = (g - 1) / 2, g / (g - 1)
    ar = geo.Ae / geo.At
    Msub = mach_from_area(ar, g, False)
    out = {"Pchoke": P0 / (1 + c * Msub * Msub) ** e, "Msub": Msub}
    if geo.kind != "converging":
        Msup = mach_from_area(ar, g, True)
        PeIso = P0 / (1 + c * Msup * Msup) ** e
        out.update(Msup=Msup, PeIso=PeIso, PshockExit=PeIso * (1 + 2 * g / (g + 1) * (Msup * Msup - 1)))
    return out


def shock_state(xs, geo, g, P0):
    """Exit pressure and shock jump if a normal shock stands at x = xs."""
    c, e = (g - 1) / 2, g / (g - 1)
    As = interp(geo.x, geo.A, xs)
    M1 = mach_from_area(As / geo.At, g, True)
    M2 = math.sqrt((1 + c * M1 * M1) / (g * M1 * M1 - c))
    P1 = P0 / (1 + c * M1 * M1) ** e
    P2 = P1 * (1 + 2 * g / (g + 1) * (M1 * M1 - 1))
    P02 = P2 * (1 + c * M2 * M2) ** e
    Ast2 = As / area_mach(M2, g)
    Me = mach_from_area(geo.Ae / Ast2, g, False)
    return dict(Pe=P02 / (1 + c * Me * Me) ** e, P02=P02, M1=M1, M2=M2, P1=P1, P2=P2, Ast2=Ast2)


@dataclass
class Solution:
    M: list
    P: list
    T: list
    rho: list
    V: list
    mdot: float
    F: float
    Cf: float
    regime: str
    shock: dict
    th: dict
    Pb: float
    P0: float
    T0: float

    @property
    def regime_name(self):
        return REGIMES[self.regime]

    def table(self, geo, every=20):
        """Readable text table (x in mm, P in kPa)."""
        rows = ["   x mm    r mm     Mach     P kPa      T K     V m/s"]
        for i in list(range(0, len(self.M), every)) + [len(self.M) - 1]:
            rows.append(f"{geo.x[i]*1e3:7.2f} {geo.r[i]*1e3:7.3f} {self.M[i]:8.4f} {self.P[i]/1e3:9.2f} "
                        f"{self.T[i]:8.2f} {self.V[i]:9.2f}")
        return "\n".join(rows)


def solve(geo, P0, T0, Pb, g, R):
    """Steady quasi-1D solution. Pressures in Pa (absolute), temperature in K."""
    n, c, e = len(geo.A), (g - 1) / 2, g / (g - 1)
    th = thresholds(geo, g, P0)
    M, P0p, shock = [0.0] * n, [P0] * n, None
    if Pb >= th["Pchoke"] * (1 - 1e-10):
        Ast = geo.Ae / area_mach(mach_from_pressure_ratio(P0 / Pb, g), g)
        M = [mach_from_area(a / Ast, g, False) for a in geo.A]
        regime = "sub"
    elif geo.kind == "converging":
        M = [mach_from_area(a / geo.At, g, False) for a in geo.A]
        regime = "chokedC"
    elif Pb > th["PshockExit"] * (1 + 1e-10):
        lo, hi = geo.x[geo.it], geo.x[-1]
        for _ in range(75):
            mid = (lo + hi) / 2
            if shock_state(mid, geo, g, P0)["Pe"] > Pb:
                lo = mid
            else:
                hi = mid
        xs = (lo + hi) / 2
        s = shock_state(xs, geo, g, P0)
        for j in range(n):
            if j <= geo.it:
                M[j] = mach_from_area(geo.A[j] / geo.At, g, False)
            elif geo.x[j] < xs:
                M[j] = mach_from_area(geo.A[j] / geo.At, g, True)
            else:
                M[j] = mach_from_area(geo.A[j] / s["Ast2"], g, False)
                P0p[j] = s["P02"]
        shock = dict(s, x=xs)
        regime = "shock"
    else:
        M = [mach_from_area(geo.A[j] / geo.At, g, j > geo.it) for j in range(n)]
        regime = "over" if Pb > th["PeIso"] * 1.01 else ("under" if Pb < th["PeIso"] * 0.99 else "ideal")
    T = [T0 / (1 + c * m * m) for m in M]
    P = [P0p[j] / (1 + c * M[j] ** 2) ** e for j in range(n)]
    rho = [P[j] / (R * T[j]) for j in range(n)]
    V = [M[j] * math.sqrt(g * R * T[j]) for j in range(n)]
    mdot = rho[0] * geo.A[0] * V[0]
    F = mdot * V[-1] + (P[-1] - Pb) * geo.Ae
    return Solution(M, P, T, rho, V, mdot, F, F / (P0 * geo.At), regime, shock, th, Pb, P0, T0)


def mdot_at(geo, P0, T0, Pb, g, R, th=None):
    """Mass flow (kg/s) at back pressure Pb, from the analytic choking relation."""
    th = th or thresholds(geo, g, P0)
    if Pb >= th["Pchoke"]:
        return choked_flux(P0, T0, g, R) * geo.Ae / area_mach(mach_from_pressure_ratio(P0 / Pb, g), g)
    return choked_flux(P0, T0, g, R) * geo.At
