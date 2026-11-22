"""Realistic engineering corrections layered on the ideal model.

Each correction is a textbook estimate, not CFD:

1. Boundary-layer displacement thickness: turbulent flat plate with the Eckert
   reference temperature (laminar Blasius below Re = 5e5). It shrinks the
   effective flow area, which lowers mass flow and exit Mach.
2. Inviscid discharge coefficient from throat wall curvature: Hall (1962), leading
   term, Cd = 1 - (g+1)/(96 R^2), with R = Rc/Rt floored at 1.
3. Divergence loss factor: lambda = (1 + cos(exit half-angle)) / 2.
4. Overexpanded separation: Summerfield (p_wall < k*Pb) or Schmucker
   (p_wall/Pb < (1.88 M - 1)^-0.64, capped at 0.5).
"""
import math

from .geometry import Geometry, wall_arc_length, cosd
from .isentropic import PSI
from .solver import solve

GASES = {
    "air": dict(name="Air", g=1.4, R=287.05, mu=(1.716e-5, 273.15, 110.4), condensK=80),
    "n2": dict(name="Nitrogen", g=1.4, R=296.8, mu=(1.663e-5, 273.15, 106.7), condensK=77),
    "he": dict(name="Helium", g=1.667, R=2077.1, mu=(1.865e-5, 273.15, 79.4), condensK=4),
    "h2": dict(name="Hydrogen", g=1.405, R=4124, mu=(8.411e-6, 273.15, 96.7), condensK=20),
    "o2": dict(name="Oxygen", g=1.395, R=259.84, mu=(1.919e-5, 273.15, 139), condensK=90),
    "co2": dict(name="CO2", g=1.289, R=188.9, mu=(1.370e-5, 273.15, 222), condensK=195),
}


def sutherland(T, gas):
    m0, T0, S = gas["mu"]
    return m0 * (T / T0) ** 1.5 * (T0 + S) / (T + S)


def boundary_layer(geo, sol, gas):
    """Displacement thickness (m) and running Reynolds number along the wall."""
    g, R = gas["g"], gas["R"]
    c = (g - 1) / 2
    s = wall_arc_length(geo)
    n = len(geo.x)
    dstar, Re = [0.0] * n, [0.0] * n
    for i in range(1, n):
        M, T, P, V = sol.M[i], sol.T[i], sol.P[i], sol.V[i]
        Tr = T * (1 + 0.89 * c * M * M)          # adiabatic wall (recovery 0.89)
        Tref = T + 0.5 * (Tr - T) + 0.22 * (Tr - T)
        rho, mu = P / (R * Tref), sutherland(Tref, gas)
        Rex = rho * V * s[i] / mu
        Re[i] = Rex
        d = 1.72 * s[i] / math.sqrt(max(Rex, 1)) if Rex < 5e5 else 0.046 * s[i] / Rex ** 0.2
        dstar[i] = min(d, 0.5 * geo.r[i])
    return dict(dstar=dstar, Re=Re, s=s)


def realistic(geo, P0, T0, Pb, gas, criterion="schmucker", k=0.4):
    """Ideal and corrected predictions side by side. ``gas`` is a GASES entry."""
    if isinstance(gas, str):
        gas = GASES[gas]
    g, R, n, notes = gas["g"], gas["R"], len(geo.x), []
    ideal = solve(geo, P0, T0, Pb, g, R)
    if ideal.regime in ("sub", "chokedC"):
        ref = ideal
    else:
        ref = solve(geo, P0, T0, min(Pb, ideal.th.get("PeIso", Pb)), g, R)
    bl = boundary_layer(geo, ref, gas)
    geo_eff = Geometry(geo.kind, geo.x, [r - d for r, d in zip(geo.r, bl["dstar"])], geo.meta)
    cd_visc = geo_eff.At / geo.At
    if geo.kind == "converging":
        cd_inv = 0.985
        notes.append("Converging nozzle: a typical inviscid discharge coefficient of 0.985 is assumed.")
    else:
        rc = geo.meta.get("rcUp", 0) or 0
        if rc < 1:
            notes.append("Throat radius below 1*Rt: the curvature estimate assumes 1*Rt and is optimistic.")
            rc = 1
        cd_inv = 1 - (g + 1) / (96 * rc * rc)
    cd = cd_inv * cd_visc
    sol = solve(geo_eff, P0, T0, Pb, g, R)
    mdot = (cd_visc if ideal.regime == "sub" else cd) * ideal.mdot
    lam = 1.0 if geo.kind == "converging" else (1 + cosd(geo.meta["exitAngle"])) / 2
    sep = None
    if geo.kind != "converging" and sol.regime in ("over", "ideal", "under"):
        def limit(M):
            if criterion == "summerfield":
                return k * Pb
            return Pb * min(0.5, max(1.88 * M - 1, 1e-6) ** -0.64)
        for i in range(geo.it + 1, n):
            if sol.M[i] > 1 and sol.P[i] < limit(sol.M[i]):
                frac = (geo.x[i] - geo.x[geo.it]) / (geo.x[-1] - geo.x[geo.it])
                sep = dict(i=i, x=geo.x[i], M=sol.M[i], p=sol.P[i], A=geo.A[i], frac=frac)
                break
    Pwall = list(sol.P)
    if sep:
        span = max(geo.x[-1] - sep["x"], 1e-12)
        for i in range(sep["i"], n):
            Pwall[i] = sep["p"] + (Pb - sep["p"]) * (geo.x[i] - sep["x"]) / span
        if geo.kind == "bell":
            ang = geo.meta["thetaN"] * (1 - sep["frac"]) + geo.meta["thetaE"] * sep["frac"]
            lam_sep = (1 + cosd(ang)) / 2
        else:
            lam_sep = lam
        Ve, Me, Pe = sol.V[sep["i"]], sol.M[sep["i"]], sep["p"]
        F = lam_sep * mdot * Ve + (sep["p"] - Pb) * sep["A"]
        notes.append(f"Flow separates from the wall at {sep['frac']*100:.0f}% of the diverging length (M {sep['M']:.2f}).")
    else:
        Ve, Me, Pe = sol.V[-1], sol.M[-1], sol.P[-1]
        F = lam * mdot * Ve + (Pe - Pb) * geo.Ae
    if sol.shock:
        notes.append("A real normal shock interacts with the boundary layer; its position is approximate.")
    return dict(ideal=ideal, sol=sol, geo_eff=geo_eff, bl=bl, CdVisc=cd_visc, CdInv=cd_inv, Cd=cd,
                mdot=mdot, lam=lam, sep=sep, Pwall=Pwall, F=F, Cf=F / (P0 * geo.At), Me=Me, Pe=Pe, Ve=Ve,
                dstar_throat=bl["dstar"][geo.it], dstar_exit=bl["dstar"][-1], Re_throat=bl["Re"][geo.it],
                eps_eff=geo_eff.Ae / geo_eff.At, notes=notes)


def compare(geo, P0, T0, Pb, gas="air", **kw):
    """Printable ideal-vs-realistic summary."""
    r = realistic(geo, P0, T0, Pb, gas, **kw)
    i = r["ideal"]
    lines = [f"{'':24s}{'ideal':>12s}{'realistic':>12s}",
             f"{'Mass flow (g/s)':24s}{i.mdot*1e3:12.3f}{r['mdot']*1e3:12.3f}",
             f"{'Exit Mach':24s}{i.M[-1]:12.4f}{r['Me']:12.4f}",
             f"{'Exit pressure (psia)':24s}{i.P[-1]/PSI:12.3f}{r['Pe']/PSI:12.3f}",
             f"{'Thrust (N)':24s}{i.F:12.3f}{r['F']:12.3f}",
             f"{'Thrust coefficient Cf':24s}{i.Cf:12.4f}{r['Cf']:12.4f}",
             f"Discharge coefficient Cd = {r['Cd']:.4f} (curvature {r['CdInv']:.4f} x boundary layer {r['CdVisc']:.4f})",
             f"Regime: {i.regime_name}"] + r["notes"]
    return "\n".join(lines)
