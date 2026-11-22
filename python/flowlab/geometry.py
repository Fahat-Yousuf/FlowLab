"""Nozzle wall contours: conical (optionally rounded throat), Rao-style bell, converging.

Lengths are in metres, angles in degrees. ``build_geometry`` takes diameters in mm,
the same way the web app does.
"""
import math
from dataclasses import dataclass, field

from .isentropic import area_mach  # noqa: F401  (re-exported for convenience)


def sind(a): return math.sin(math.radians(a))
def cosd(a): return math.cos(math.radians(a))
def tand(a): return math.tan(math.radians(a))


def _jsround(v):
    """Round half up, like JavaScript Math.round, so sampling matches the web app."""
    return int(math.floor(v + 0.5))


def linspace(a, b, n):
    return [a if n == 1 else a + (b - a) * i / (n - 1) for i in range(n)]


def interp(xs, ys, x):
    n = len(xs)
    if x <= xs[0]:
        return ys[0]
    if x >= xs[-1]:
        return ys[-1]
    lo, hi = 0, n - 1
    while hi - lo > 1:
        m = (lo + hi) // 2
        if xs[m] <= x:
            lo = m
        else:
            hi = m
    return ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / (xs[hi] - xs[lo])


@dataclass
class Geometry:
    kind: str
    x: list
    r: list
    meta: dict = field(default_factory=dict)

    def __post_init__(self):
        self.A = [math.pi * v * v for v in self.r]
        self.it = min(range(len(self.A)), key=lambda i: self.A[i])
        self.At = self.A[self.it]
        self.Ae = self.A[-1]

    @property
    def length(self):
        return self.x[-1] - self.x[0]

    @property
    def area_ratio(self):
        return self.Ae / self.At


# Rao 80%-length thrust-optimised parabola angles (approximate chart values).
RAO80 = [(2, 17, 14), (4, 21.5, 14), (5, 23, 13), (10, 26, 11), (20, 28.5, 9.5),
         (30, 29.5, 8.5), (40, 30.5, 8), (50, 31, 7.5), (100, 33, 6.5)]


def rao_angles(eps):
    """Initial (theta_n) and exit (theta_e) wall angles for an 80% bell."""
    e = min(100.0, max(2.0, eps))
    le = math.log(e)
    for (e0, n0, x0), (e1, n1, x1) in zip(RAO80, RAO80[1:]):
        if e <= e1:
            f = (le - math.log(e0)) / (math.log(e1) - math.log(e0))
            return n0 + (n1 - n0) * f, x0 + (x1 - x0) * f
    return 33.0, 6.5


def conical(di, dt, de, alpha, beta, rc=0.0, n=240):
    """Conical CD nozzle. ``rc`` = throat wall radius / throat radius (0 = sharp)."""
    ri, rt, re = di / 2, dt / 2, de / 2
    if not (ri > rt and re > rt):
        raise ValueError("Inlet and exit diameters must both be larger than the throat.")
    if rc == 0:
        L1 = (di - dt) / 2 / tand(alpha)
        L2 = (de - dt) / 2 / tand(beta)
        n1 = max(20, _jsround(n * L1 / (L1 + L2)))
        n2 = max(20, n - n1 + 1)
        x = linspace(0, L1, n1)
        r = linspace(ri, rt, n1)
        xd, rd = linspace(0, L2, n2), linspace(rt, re, n2)
        x += [L1 + v for v in xd[1:]]
        r += rd[1:]
        xt = L1
    else:
        Rc = rc * rt
        r1, r2 = rt + Rc * (1 - cosd(alpha)), rt + Rc * (1 - cosd(beta))
        if r1 >= ri or r2 >= re:
            raise ValueError("Throat Rc/Rt is too large for this inlet/exit.")
        Lc = (ri - r1) / tand(alpha)
        xt = Lc + Rc * sind(alpha)
        x2 = xt + Rc * sind(beta)
        xe = x2 + (re - r2) / tand(beta)
        L = [Lc, Rc * sind(alpha), Rc * sind(beta), xe - x2]
        k = [max(m, _jsround(n * l / xe)) for l, m in zip(L, [15, 8, 8, 15])]
        x, r = [], []
        for xx in linspace(0, Lc, k[0]):
            x.append(xx); r.append(ri - (ri - r1) * xx / Lc)
        for t in linspace(alpha, 0, k[1])[1:]:
            x.append(xt - Rc * sind(t)); r.append(rt + Rc * (1 - cosd(t)))
        for t in linspace(0, beta, k[2])[1:]:
            x.append(xt + Rc * sind(t)); r.append(rt + Rc * (1 - cosd(t)))
        for xx in linspace(x2, xe, k[3])[1:]:
            x.append(xx); r.append(r2 + (re - r2) * (xx - x2) / (xe - x2))
    return Geometry("conical", x, r, dict(alpha=alpha, beta=beta, rcUp=rc, rcDown=rc, exitAngle=beta,
                                          xThroat=xt, Lconv=xt, Ldiv=x[-1] - xt))


def converging(di, dt, alpha, n=240):
    """Conical converging nozzle; the exit is the throat."""
    if not di > dt:
        raise ValueError("The inlet diameter must be larger than the throat (exit) diameter.")
    L = (di - dt) / 2 / tand(alpha)
    x = linspace(0, L, n)
    return Geometry("converging", x, [di / 2 - (di - dt) / 2 * v / L for v in x],
                    dict(alpha=alpha, rcUp=0, exitAngle=0, xThroat=L, Lconv=L, Ldiv=0))


def bell(di, dt, de, alpha, pct=80.0, theta_n=None, theta_e=None, n=240):
    """Rao-style thrust-optimised parabolic bell (Huzel & Huang construction).

    Upstream throat arc 1.5*Rt, downstream arc 0.382*Rt, then a quadratic Bezier from
    angle theta_n to theta_e. Length is ``pct`` % of an equivalent 15-degree cone.
    """
    ri, rt, re = di / 2, dt / 2, de / 2
    eps = (re / rt) ** 2
    auto = theta_n is None or theta_e is None
    if auto:
        theta_n, theta_e = rao_angles(eps)
    R1, R2 = 1.5 * rt, 0.382 * rt
    xa, ra = -R1 * sind(alpha), rt + R1 * (1 - cosd(alpha))
    if ra >= ri:
        raise ValueError("The inlet is too small for the 1.5*Rt upstream throat arc.")
    xin = xa - (ri - ra) / tand(alpha)
    Nx, Nr = R2 * sind(theta_n), rt + R2 * (1 - cosd(theta_n))
    L15 = ((math.sqrt(eps) - 1) * rt + R2 * (1 / cosd(15) - 1)) / tand(15)
    Ex, Er = pct / 100 * L15, re
    tn, te = tand(theta_n), tand(theta_e)
    Qx = (Er - Nr + Nx * tn - Ex * te) / (tn - te)
    Qr = Nr + (Qx - Nx) * tn
    adjusted = False
    if not (Nx < Qx < Ex) and auto:
        # Chart angles do not fit (typical at low area ratios): put the control point
        # midway along the length and derive theta_e from it, moving theta_n until 0 <= theta_e < theta_n.
        for _ in range(60):
            Nx, Nr = R2 * sind(theta_n), rt + R2 * (1 - cosd(theta_n))
            Qx = (Nx + Ex) / 2
            Qr = Nr + (Qx - Nx) * tand(theta_n)
            te2 = math.degrees(math.atan2(Er - Qr, Ex - Qx))
            if 0 <= te2 < theta_n:
                theta_e, adjusted = te2, True
                break
            theta_n += 1 if te2 >= theta_n else -1   # rise faster (short, low-ratio bells) or slower
            if theta_n <= 1 or theta_n >= 50:
                break
        tn, te = tand(theta_n), tand(theta_e)
        Qx = (Er - Nr + Nx * tn - Ex * te) / (tn - te)
        Qr = Nr + (Qx - Nx) * tn
    if not (Nx < Qx < Ex):
        raise ValueError("This bell cannot reach the exit at this length and area ratio; make it longer or use the conical shape.")
    span = Ex - xin
    k = [max(12, _jsround(n * (xa - xin) / span)), 14, 10, max(40, _jsround(n * (Ex - Nx) / span))]
    x, r = [], []
    for xx in linspace(xin, xa, k[0]):
        x.append(xx); r.append(ri - (ri - ra) * (xx - xin) / (xa - xin))
    for t in linspace(-90 - alpha, -90, k[1])[1:]:
        x.append(R1 * cosd(t)); r.append(rt + R1 + R1 * sind(t))
    for t in linspace(-90, theta_n - 90, k[2])[1:]:
        x.append(R2 * cosd(t)); r.append(rt + R2 + R2 * sind(t))
    for t in linspace(0, 1, k[3])[1:]:
        a, b, c = (1 - t) ** 2, 2 * t * (1 - t), t * t
        x.append(a * Nx + b * Qx + c * Ex); r.append(a * Nr + b * Qr + c * Er)
    x = [v - xin for v in x]
    return Geometry("bell", x, r, dict(alpha=alpha, thetaN=theta_n, thetaE=theta_e, pct=pct, L15=L15,
                                       rcUp=1.5, rcDown=0.382, exitAngle=theta_e, xThroat=-xin,
                                       Lconv=-xin, Ldiv=Ex, adjusted=adjusted))


def build_geometry(shape, Din, Dt, De=None, alpha=20, beta=12, rc=0.0, bell_pct=80,
                   theta_n=None, theta_e=None, n=240):
    """Build a nozzle from diameters in **mm** (like the web app). Returns lengths in m."""
    if shape == "converging":
        return converging(Din / 1000, Dt / 1000, alpha, n)
    if shape == "bell":
        return bell(Din / 1000, Dt / 1000, De / 1000, alpha, bell_pct, theta_n, theta_e, n)
    return conical(Din / 1000, Dt / 1000, De / 1000, alpha, beta, rc, n)


def wall_arc_length(geo):
    s = [0.0]
    for i in range(1, len(geo.x)):
        s.append(s[-1] + math.hypot(geo.x[i] - geo.x[i - 1], geo.r[i] - geo.r[i - 1]))
    return s
