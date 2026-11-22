"""Verification tests. Run:  python -m pytest python/tests   (or python python/tests/test_flowlab.py)"""
import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from flowlab import *  # noqa: E402,F403

AIR = (1.4, 287.05)
P0, T0 = 100 * PSI, 300.0


def test_area_ratio_mach_2_5():
    assert abs(area_mach(2.5, 1.4) - 2.63671875) < 1e-12
    assert abs(mach_from_area(2.63671875, 1.4, True) - 2.5) < 1e-10


def test_normal_shock_mach_2():
    s = normal_shock(2.0, 1.4)  # textbook: M2 = 0.5774, p2/p1 = 4.5, p02/p01 = 0.7209
    assert abs(s["M2"] - 0.57735) < 1e-4 and abs(s["p21"] - 4.5) < 1e-12 and abs(s["p0ratio"] - 0.72087) < 1e-4


def _cd(rc=0):
    return build_geometry("conical", Din=29, Dt=10, De=10 * math.sqrt(2.63671875), alpha=20, beta=10, rc=rc)


def test_regime_thresholds():
    th = thresholds(_cd(), 1.4, P0)
    assert abs(th["Pchoke"] / P0 - 0.96497) < 1e-4
    assert abs(th["PshockExit"] / PSI - 41.701) < 1e-2


def test_ideal_expansion_and_mass_flow():
    geo = _cd(1.5)
    th = thresholds(geo, 1.4, P0)
    s = solve(geo, P0, T0, th["PeIso"], *AIR)
    assert s.regime == "ideal" and abs(s.M[-1] - 2.5) < 1e-6
    assert abs(s.mdot - choked_flux(P0, T0, *AIR) * geo.At) / s.mdot < 1e-9


def test_internal_shock_matches_back_pressure():
    geo = _cd()
    th = thresholds(geo, 1.4, P0)
    pb = (th["Pchoke"] + th["PshockExit"]) / 2
    s = solve(geo, P0, T0, pb, *AIR)
    assert s.regime == "shock" and abs(s.P[-1] - pb) / pb < 1e-6
    assert geo.x[geo.it] < s.shock["x"] < geo.x[-1]


def test_bell_geometry():
    geo = build_geometry("bell", Din=30, Dt=10, De=20.58, alpha=30)
    assert all(b > a for a, b in zip(geo.x, geo.x[1:]))
    assert abs(geo.r[geo.it] - 0.005) < 1e-12 and abs(geo.r[-1] - 0.01029) < 1e-12


def test_realistic_is_below_ideal_when_attached():
    geo = build_geometry("bell", Din=30, Dt=10, De=10 * math.sqrt(area_mach(3, 1.4)), alpha=30)
    r = realistic(geo, 540 * PSI, T0, 14.7 * PSI, "air")
    assert r["sep"] is None and r["ideal"].regime == "ideal"
    assert 0.9 < r["Cd"] < 1 and r["Me"] < r["ideal"].M[-1] and r["Cf"] < r["ideal"].Cf


def test_overexpanded_separation_detected():
    geo = build_geometry("bell", Din=30, Dt=10, De=10 * math.sqrt(area_mach(3, 1.4)), alpha=30)
    r = realistic(geo, 100 * PSI, T0, 14.7 * PSI, "air")
    assert r["sep"] is not None and 0.2 < r["sep"]["frac"] < 0.9


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn(); print("PASS", name)
    print("All Flow Lab Python tests passed.")
