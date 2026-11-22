/* Flow Lab physics engine (no DOM). Units: SI (m, Pa, K, kg/s) unless named.
 * Mirrors python/flowlab. Used by app.js in the browser and by tests in Node. */
(function (root) {
"use strict";
const PSI = 6894.757293, PATM = 101325;

/* ---------- gases and materials ---------- */
// Sutherland viscosity [mu_ref Pa s, T_ref K, S K]; condensK: rough 1-atm boiling or
// sublimation point, used only for warnings.
const GASES = {
  air: { name: "Air", g: 1.4, R: 287.05, mu: [1.716e-5, 273.15, 110.4], condensK: 80 },
  n2:  { name: "Nitrogen", g: 1.4, R: 296.8, mu: [1.663e-5, 273.15, 106.7], condensK: 77 },
  he:  { name: "Helium", g: 1.667, R: 2077.1, mu: [1.865e-5, 273.15, 79.4], condensK: 4 },
  h2:  { name: "Hydrogen", g: 1.405, R: 4124, mu: [8.411e-6, 273.15, 96.7], condensK: 20 },
  o2:  { name: "Oxygen", g: 1.395, R: 259.84, mu: [1.919e-5, 273.15, 139], condensK: 90 },
  co2: { name: "CO2", g: 1.289, R: 188.9, mu: [1.370e-5, 273.15, 222], condensK: 195 }
};
// Typical room-temperature values. Always check your supplier's data sheet.
const MATERIALS = {
  pla:    { name: "PLA (3D print)", yieldMPa: 50, rho: 1240, maxK: 328 },
  petg:   { name: "PETG (3D print)", yieldMPa: 45, rho: 1270, maxK: 343 },
  resin:  { name: "Tough SLA resin", yieldMPa: 40, rho: 1150, maxK: 330 },
  al6061: { name: "Aluminium 6061-T6", yieldMPa: 276, rho: 2700, maxK: 423 },
  ss316:  { name: "Stainless steel 316", yieldMPa: 205, rho: 8000, maxK: 1000 },
  brass:  { name: "Brass C360 (annealed)", yieldMPa: 124, rho: 8500, maxK: 500 }
};
function sutherland(T, gas) { const [m0, T0, S] = gas.mu; return m0 * Math.pow(T / T0, 1.5) * (T0 + S) / (T + S); }

/* ---------- maths helpers ---------- */
const sind = a => Math.sin(a * Math.PI / 180), cosd = a => Math.cos(a * Math.PI / 180), tand = a => Math.tan(a * Math.PI / 180);
function linspace(a, b, n) { const o = []; for (let i = 0; i < n; i++) o.push(n === 1 ? a : a + (b - a) * i / (n - 1)); return o; }
function interp(xs, ys, x) {
  const n = xs.length; if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; }
  return ys[lo] + (ys[hi] - ys[lo]) * (x - xs[lo]) / (xs[hi] - xs[lo]);
}

/* ---------- isentropic and shock relations ---------- */
function areaMach(M, g) { return (1 / M) * Math.pow((2 / (g + 1)) * (1 + (g - 1) * M * M / 2), (g + 1) / (2 * (g - 1))); }
function machFromArea(ar, g, sup) {
  if (ar <= 1 + 1e-12) return 1;
  let lo, hi;
  if (sup) { lo = 1; hi = 2; while (areaMach(hi, g) < ar) hi *= 2;
    for (let k = 0; k < 70; k++) { const m = (lo + hi) / 2; if (areaMach(m, g) < ar) lo = m; else hi = m; } }
  else { lo = 1e-12; hi = 1;
    for (let k = 0; k < 70; k++) { const m = (lo + hi) / 2; if (areaMach(m, g) > ar) lo = m; else hi = m; } }
  return (lo + hi) / 2;
}
function machFromPressureRatio(P0overP, g) { return Math.sqrt(2 / (g - 1) * (Math.pow(P0overP, (g - 1) / g) - 1)); }
function chokedFlux(P0, T0, g, R) { return P0 * Math.sqrt(g / (R * T0)) * Math.pow(2 / (g + 1), (g + 1) / (2 * (g - 1))); }
function normalShock(M1, g) {
  const c = (g - 1) / 2, M2 = Math.sqrt((1 + c * M1 * M1) / (g * M1 * M1 - c));
  const p21 = 1 + 2 * g / (g + 1) * (M1 * M1 - 1);
  const p0ratio = Math.pow(((g + 1) * M1 * M1) / ((g - 1) * M1 * M1 + 2), g / (g - 1)) * Math.pow((g + 1) / (2 * g * M1 * M1 - (g - 1)), 1 / (g - 1));
  return { M2, p21, p0ratio };
}

/* ---------- geometry ---------- */
// Rao 80%-length thrust-optimised parabola angles (approximate chart values).
const RAO80 = [[2, 17, 14], [4, 21.5, 14], [5, 23, 13], [10, 26, 11], [20, 28.5, 9.5], [30, 29.5, 8.5], [40, 30.5, 8], [50, 31, 7.5], [100, 33, 6.5]];
function raoAngles(eps) {
  const e = Math.min(100, Math.max(2, eps)), le = Math.log(e);
  for (let i = 1; i < RAO80.length; i++) if (e <= RAO80[i][0]) {
    const [e0, n0, x0] = RAO80[i - 1], [e1, n1, x1] = RAO80[i], f = (le - Math.log(e0)) / (Math.log(e1) - Math.log(e0));
    return { thetaN: n0 + (n1 - n0) * f, thetaE: x0 + (x1 - x0) * f };
  }
  return { thetaN: 33, thetaE: 6.5 };
}
function finishGeo(x, r, kind, meta) {
  const A = r.map(v => Math.PI * v * v); let it = 0; A.forEach((a, i) => { if (a < A[it]) it = i; });
  return { kind, x, r, A, it, At: A[it], Ae: A[A.length - 1], meta };
}
function conical(di, dt, de, alpha, beta, rc, n) {
  const ri = di / 2, rt = dt / 2, re = de / 2;
  if (!(ri > rt && re > rt)) throw new Error("Inlet and exit diameters must both be larger than the throat.");
  if (!(rc >= 0)) throw new Error("Throat Rc/Rt must be zero or positive.");
  let x, r, Lc, xt;
  if (rc === 0) {
    const L1 = (di - dt) / 2 / tand(alpha), L2 = (de - dt) / 2 / tand(beta);
    const n1 = Math.max(20, Math.round(n * L1 / (L1 + L2))), n2 = Math.max(20, n - n1 + 1);
    x = linspace(0, L1, n1); r = linspace(ri, rt, n1);
    const xd = linspace(0, L2, n2), rd = linspace(rt, re, n2);
    for (let i = 1; i < n2; i++) { x.push(L1 + xd[i]); r.push(rd[i]); }
    Lc = L1; xt = L1;
  } else {
    const Rc = rc * rt, r1 = rt + Rc * (1 - cosd(alpha)), r2 = rt + Rc * (1 - cosd(beta));
    if (r1 >= ri) throw new Error("Throat Rc/Rt is too large for the converging section. Reduce Rc/Rt or the converging angle, or enlarge the inlet.");
    if (r2 >= re) throw new Error("Throat Rc/Rt is too large for the diverging section. Reduce Rc/Rt or the diverging angle, or enlarge the exit.");
    Lc = (ri - r1) / tand(alpha); xt = Lc + Rc * sind(alpha);
    const x2 = xt + Rc * sind(beta), xe = x2 + (re - r2) / tand(beta);
    const L = [Lc, Rc * sind(alpha), Rc * sind(beta), xe - x2], mins = [15, 8, 8, 15];
    const k = L.map((l, i) => Math.max(mins[i], Math.round(n * l / xe)));
    x = []; r = [];
    linspace(0, Lc, k[0]).forEach(xx => { x.push(xx); r.push(ri - (ri - r1) * xx / Lc); });
    linspace(alpha, 0, k[1]).slice(1).forEach(t => { x.push(xt - Rc * sind(t)); r.push(rt + Rc * (1 - cosd(t))); });
    linspace(0, beta, k[2]).slice(1).forEach(t => { x.push(xt + Rc * sind(t)); r.push(rt + Rc * (1 - cosd(t))); });
    linspace(x2, xe, k[3]).slice(1).forEach(xx => { x.push(xx); r.push(r2 + (re - r2) * (xx - x2) / (xe - x2)); });
  }
  return finishGeo(x, r, "conical", { alpha, beta, rcUp: rc, rcDown: rc, exitAngle: beta, xThroat: xt, Lconv: xt, Ldiv: x[x.length - 1] - xt });
}
function converging(di, dt, alpha, n) {
  if (!(di > dt)) throw new Error("The inlet diameter must be larger than the throat (exit) diameter.");
  const L = (di - dt) / 2 / tand(alpha), x = linspace(0, L, n);
  return finishGeo(x, x.map(xx => di / 2 - (di - dt) / 2 * xx / L), "converging", { alpha, rcUp: 0, exitAngle: 0, xThroat: L, Lconv: L, Ldiv: 0 });
}
function bell(di, dt, de, alpha, pct, thN, thE, n, auto) {
  const ri = di / 2, rt = dt / 2, re = de / 2, eps = (re / rt) ** 2, R1 = 1.5 * rt, R2 = 0.382 * rt;
  if (!(ri > rt && re > rt)) throw new Error("Inlet and exit diameters must both be larger than the throat.");
  if (!(pct >= 50 && pct <= 100)) throw new Error("Bell length must be 50-100% of the equivalent 15° cone.");
  if (!(thN > thE && thE >= 0 && thN < 50)) throw new Error("Bell angles need 0 ≤ θe < θn < 50°.");
  const xa = -R1 * sind(alpha), ra = rt + R1 * (1 - cosd(alpha));
  if (ra >= ri) throw new Error("The inlet is too small for the 1.5·Rt upstream throat arc. Enlarge the inlet or reduce the converging angle.");
  const xin = xa - (ri - ra) / tand(alpha);
  let Nx = R2 * sind(thN), Nr = rt + R2 * (1 - cosd(thN));
  const L15 = ((Math.sqrt(eps) - 1) * rt + R2 * (1 / cosd(15) - 1)) / tand(15), Ln = pct / 100 * L15;
  const Ex = Ln, Er = re;
  if (Er <= Nr || Ex <= Nx) throw new Error("The exit is too small for a bell contour. Use a larger exit or the conical shape.");
  let tn = tand(thN), te = tand(thE), Qx = (Er - Nr + Nx * tn - Ex * te) / (tn - te), Qr = Nr + (Qx - Nx) * tn, adjusted = false;
  if (!(Qx > Nx && Qx < Ex) && auto) {
    // Chart angles do not fit (typical at low area ratios): put the control point midway
    // along the length and derive θe from it, moving θn until θe lies between 0 and θn.
    for (let tries = 0; tries < 60; tries++) {
      Nx = R2 * sind(thN); Nr = rt + R2 * (1 - cosd(thN));
      Qx = (Nx + Ex) / 2; Qr = Nr + (Qx - Nx) * tand(thN);
      const thE2 = Math.atan2(Er - Qr, Ex - Qx) * 180 / Math.PI;
      if (thE2 >= 0 && thE2 < thN) { thE = thE2; adjusted = true; break; }
      thN += thE2 >= thN ? 1 : -1;   // wall must rise faster (short, low-ratio bells) or slower
      if (thN <= 1 || thN >= 50) break;
    }
    tn = tand(thN); te = tand(thE); Qx = (Er - Nr + Nx * tn - Ex * te) / (tn - te); Qr = Nr + (Qx - Nx) * tn;
  }
  if (!(Qx > Nx && Qx < Ex)) throw new Error("This bell cannot reach the exit at this length and area ratio. Make the bell longer, use automatic angles, or use the conical shape for low Mach numbers.");
  const span = Ex - xin, k = [Math.max(12, Math.round(n * (xa - xin) / span)), 14, 10, Math.max(40, Math.round(n * (Ex - Nx) / span))];
  const x = [], r = [];
  linspace(xin, xa, k[0]).forEach(xx => { x.push(xx); r.push(ri - (ri - ra) * (xx - xin) / (xa - xin)); });
  linspace(-90 - alpha, -90, k[1]).slice(1).forEach(t => { x.push(R1 * cosd(t)); r.push(rt + R1 + R1 * sind(t)); });
  linspace(-90, thN - 90, k[2]).slice(1).forEach(t => { x.push(R2 * cosd(t)); r.push(rt + R2 + R2 * sind(t)); });
  linspace(0, 1, k[3]).slice(1).forEach(t => { const a = (1 - t) ** 2, b = 2 * t * (1 - t), c = t * t;
    x.push(a * Nx + b * Qx + c * Ex); r.push(a * Nr + b * Qr + c * Er); });
  const xs = x.map(v => v - xin);
  return finishGeo(xs, r, "bell", { alpha, thetaN: thN, thetaE: thE, pct, L15, rcUp: 1.5, rcDown: 0.382, exitAngle: thE, xThroat: -xin, Lconv: -xin, Ldiv: Ex, adjusted });
}
// spec: {shape:'conical'|'bell'|'converging', Din, Dt, De (mm), alpha, beta (deg), rc, bellPct, autoAngles, thetaN, thetaE}
function buildGeometry(spec, n) {
  n = n || 240;
  const di = spec.Din / 1000, dt = spec.Dt / 1000, de = spec.De / 1000;
  if (![di, dt, spec.alpha].every(Number.isFinite) || !(dt > 0)) throw new Error("Fill in every diameter and angle with a positive number.");
  if (!(spec.alpha > 0 && spec.alpha < 90)) throw new Error("The converging half-angle must be between 0° and 90°.");
  if (spec.shape === "converging") return converging(di, dt, spec.alpha, n);
  if (!(Number.isFinite(de) && de > dt)) throw new Error("A converging–diverging nozzle needs an exit diameter larger than the throat.");
  if (spec.shape === "bell") {
    let { thetaN, thetaE } = spec;
    if (spec.autoAngles !== false) ({ thetaN, thetaE } = raoAngles((de / dt) ** 2));
    return bell(di, dt, de, spec.alpha, spec.bellPct || 80, thetaN, thetaE, n, spec.autoAngles !== false);
  }
  if (!(spec.beta > 0 && spec.beta < 90)) throw new Error("The diverging half-angle must be between 0° and 90°.");
  return conical(di, dt, de, spec.alpha, spec.beta, spec.rc || 0, n);
}
function wallArcLength(geo) { const s = [0]; for (let i = 1; i < geo.x.length; i++) s.push(s[i - 1] + Math.hypot(geo.x[i] - geo.x[i - 1], geo.r[i] - geo.r[i - 1])); return s; }

/* ---------- ideal quasi-1D solver (port of FlowLab_IdealGasNozzleSolver.m) ---------- */
function thresholds(geo, g, P0) {
  const c = (g - 1) / 2, e = g / (g - 1), ar = geo.Ae / geo.At;
  const Msub = machFromArea(ar, g, false), Pchoke = P0 / Math.pow(1 + c * Msub * Msub, e);
  if (geo.kind === "converging") return { Pchoke, Msub };
  const Msup = machFromArea(ar, g, true), PeIso = P0 / Math.pow(1 + c * Msup * Msup, e);
  return { Pchoke, Msub, Msup, PeIso, PshockExit: PeIso * (1 + 2 * g / (g + 1) * (Msup * Msup - 1)) };
}
function shockState(xs, geo, g, P0) {
  const c = (g - 1) / 2, e = g / (g - 1), As = interp(geo.x, geo.A, xs), M1 = machFromArea(As / geo.At, g, true);
  const M2 = Math.sqrt((1 + c * M1 * M1) / (g * M1 * M1 - c));
  const P1 = P0 / Math.pow(1 + c * M1 * M1, e), P2 = P1 * (1 + 2 * g / (g + 1) * (M1 * M1 - 1)), P02 = P2 * Math.pow(1 + c * M2 * M2, e);
  const Ast2 = As / areaMach(M2, g), Me = machFromArea(geo.Ae / Ast2, g, false);
  return { Pe: P02 / Math.pow(1 + c * Me * Me, e), P02, M1, M2, P1, P2, Ast2 };
}
function solve(geo, P0, T0, Pb, g, R) {
  const n = geo.A.length, c = (g - 1) / 2, e = g / (g - 1), th = thresholds(geo, g, P0);
  const M = new Array(n), P0p = new Array(n).fill(P0);
  let regime, shock = null;
  if (Pb >= th.Pchoke * (1 - 1e-10)) {
    const Ast = geo.Ae / areaMach(machFromPressureRatio(P0 / Pb, g), g);
    for (let j = 0; j < n; j++) M[j] = machFromArea(geo.A[j] / Ast, g, false);
    regime = "sub";
  } else if (geo.kind === "converging") {
    for (let j = 0; j < n; j++) M[j] = machFromArea(geo.A[j] / geo.At, g, false);
    regime = "chokedC";
  } else if (Pb > th.PshockExit * (1 + 1e-10)) {
    let lo = geo.x[geo.it], hi = geo.x[n - 1];
    for (let k = 0; k < 75; k++) { const mid = (lo + hi) / 2; if (shockState(mid, geo, g, P0).Pe > Pb) lo = mid; else hi = mid; }
    const xs = (lo + hi) / 2, s = shockState(xs, geo, g, P0);
    for (let j = 0; j < n; j++) {
      if (j <= geo.it) M[j] = machFromArea(geo.A[j] / geo.At, g, false);
      else if (geo.x[j] < xs) M[j] = machFromArea(geo.A[j] / geo.At, g, true);
      else { M[j] = machFromArea(geo.A[j] / s.Ast2, g, false); P0p[j] = s.P02; }
    }
    shock = Object.assign({ x: xs }, s); regime = "shock";
  } else {
    for (let j = 0; j < n; j++) M[j] = machFromArea(geo.A[j] / geo.At, g, j > geo.it);
    regime = Pb > th.PeIso * 1.01 ? "over" : (Pb < th.PeIso * 0.99 ? "under" : "ideal");
  }
  const T = M.map(m => T0 / (1 + c * m * m)), P = M.map((m, j) => P0p[j] / Math.pow(1 + c * m * m, e));
  const rho = P.map((p, j) => p / (R * T[j])), V = M.map((m, j) => m * Math.sqrt(g * R * T[j]));
  const mdot = rho[0] * geo.A[0] * V[0], F = mdot * V[n - 1] + (P[n - 1] - Pb) * geo.Ae;
  return { M, P, T, rho, V, mdot, F, Cf: F / (P0 * geo.At), regime, shock, th, Pb, P0, T0 };
}
function mdotAt(geo, P0, T0, Pb, g, R, th) {
  th = th || thresholds(geo, g, P0);
  if (Pb >= th.Pchoke) return chokedFlux(P0, T0, g, R) * geo.Ae / areaMach(machFromPressureRatio(P0 / Pb, g), g);
  return chokedFlux(P0, T0, g, R) * geo.At;
}

/* ---------- realistic engineering model ---------- */
// Corrections layered on the ideal model. Each is a textbook estimate, not CFD:
//  1. Boundary-layer displacement thickness (turbulent flat plate, Eckert reference
//     temperature; laminar Blasius below Re 5e5) shrinks the effective flow area.
//  2. Inviscid discharge coefficient from throat wall curvature (Hall 1962, leading term).
//  3. Divergence loss factor lambda = (1 + cos(exit half-angle)) / 2.
//  4. Flow separation when overexpanded: Summerfield (p_w < k·Pb) or Schmucker
//     (p_w/Pb < (1.88·M_w - 1)^-0.64).
function boundaryLayer(geo, sol, gas) {
  const g = gas.g, R = gas.R, c = (g - 1) / 2, s = wallArcLength(geo), n = geo.x.length, dstar = new Array(n).fill(0), Re = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const M = sol.M[i], T = sol.T[i], P = sol.P[i], V = sol.V[i];
    const Tr = T * (1 + 0.89 * c * M * M), Tref = T + 0.5 * (Tr - T) + 0.22 * (Tr - T); // adiabatic wall: Tw = Tr
    const rhoRef = P / (R * Tref), mu = sutherland(Tref, gas), Rex = rhoRef * V * s[i] / mu;
    Re[i] = Rex;
    dstar[i] = Rex < 5e5 ? 1.72 * s[i] / Math.sqrt(Math.max(Rex, 1)) : 0.046 * s[i] / Math.pow(Rex, 0.2);
    dstar[i] = Math.min(dstar[i], 0.5 * geo.r[i]);
  }
  return { dstar, Re, s };
}
function realistic(geo, P0, T0, Pb, gas, opts) {
  opts = opts || {};
  const g = gas.g, R = gas.R, c = (g - 1) / 2, e = g / (g - 1), n = geo.x.length, notes = [];
  const ideal = solve(geo, P0, T0, Pb, g, R);
  // Boundary layer from the attached ideal flow (fully supersonic branch when choked).
  const ref = (ideal.regime === "sub" || ideal.regime === "chokedC") ? ideal : solve(geo, P0, T0, Math.min(Pb, ideal.th.PeIso || Pb), g, R);
  const bl = boundaryLayer(geo, ref, gas);
  const rEff = geo.r.map((r, i) => r - bl.dstar[i]);
  const geoEff = finishGeo(geo.x, rEff, geo.kind, geo.meta);
  const CdVisc = geoEff.At / geo.At;
  // Hall's series is only reliable for Rc/Rt >= ~1, so smaller radii are floored at 1.
  // Conical converging nozzles use a typical measured value instead.
  let Rcurv = geo.meta.rcUp || 0, CdInv;
  if (geo.kind === "converging") { CdInv = 0.985; notes.push("Converging nozzle: a typical inviscid discharge coefficient of 0.985 is assumed."); }
  else { if (Rcurv < 1) { notes.push("Throat radius below 1·Rt: the curvature discharge estimate assumes 1·Rt and is optimistic."); Rcurv = 1; }
    CdInv = 1 - (g + 1) / (96 * Rcurv * Rcurv); }
  const Cd = CdInv * CdVisc;
  // Effective-area flow (attached). Inviscid Cd acts on mass flow only.
  const sol = solve(geoEff, P0, T0, Pb, g, R);
  const mdot = (ideal.regime === "sub" ? CdVisc : Cd) * ideal.mdot;
  const lambda = geo.kind === "converging" ? 1 : (1 + cosd(geo.meta.exitAngle)) / 2;
  // Separation search along the diverging wall (supersonic, attached part).
  let sep = null;
  const crit = opts.criterion || "schmucker", k = opts.k || 0.4;
  // Only for shock-free supersonic exit flow: with an internal normal shock the
  // separation is shock-induced at the shock itself. Schmucker is capped at 0.5·Pb
  // because it is not valid close to Mach 1.
  if (geo.kind !== "converging" && ["over", "ideal", "under"].includes(sol.regime)) {
    const sepLimit = M => crit === "summerfield" ? k * Pb : Pb * Math.min(0.5, Math.pow(Math.max(1.88 * M - 1, 1e-6), -0.64));
    for (let i = geo.it + 1; i < n; i++) {
      if (sol.M[i] > 1 && sol.P[i] < sepLimit(sol.M[i])) { sep = { i, x: geo.x[i], M: sol.M[i], p: sol.P[i], A: geo.A[i], frac: (geo.x[i] - geo.x[geo.it]) / (geo.x[n - 1] - geo.x[geo.it]) }; break; }
    }
  }
  // Realistic wall pressure: attached effective-area solution, with a schematic linear
  // recovery from the separation pressure to Pb downstream of separation.
  const Pwall = sol.P.slice();
  if (sep) for (let i = sep.i; i < n; i++) Pwall[i] = sep.p + (Pb - sep.p) * (geo.x[i] - sep.x) / Math.max(geo.x[n - 1] - sep.x, 1e-12);
  let F, Me, Pe, Ve;
  if (sep) {
    const lamSep = geo.kind === "conical" ? lambda : (1 + cosd(geo.meta.thetaN * (1 - sep.frac) + geo.meta.thetaE * sep.frac)) / 2;
    Ve = sol.V[sep.i]; Me = sol.M[sep.i]; Pe = sep.p;
    F = lamSep * mdot * Ve + (sep.p - Pb) * sep.A;
    notes.push(`Flow separates from the wall at ${(sep.frac * 100).toFixed(0)}% of the diverging length (M ${sep.M.toFixed(2)}).`);
  } else {
    Ve = sol.V[n - 1]; Me = sol.M[n - 1]; Pe = sol.P[n - 1];
    F = lambda * mdot * Ve + (Pe - Pb) * geo.Ae;
  }
  if (sol.shock) notes.push("A real normal shock interacts with the boundary layer and usually becomes a lambda shock with separation; its position is approximate.");
  return { ideal, sol, geoEff, bl, CdVisc, CdInv, Cd, mdot, lambda, sep, Pwall, F, Cf: F / (P0 * geo.At), Me, Pe, Ve,
    dstarThroat: bl.dstar[geo.it], dstarExit: bl.dstar[n - 1], ReThroat: bl.Re[geo.it], epsEff: geoEff.Ae / geoEff.At, notes };
}

/* ---------- inverse design ---------- */
function designFor(mode, value, P0, T0, g, R, opts) {
  const c = (g - 1) / 2, e = g / (g - 1), crit = Math.pow(2 / (g + 1), e);
  let Me, Dt = opts.Dt;
  if (mode === "M") { if (!(value > 1)) throw new Error("A supersonic exit needs a target Mach number above 1."); Me = value; }
  else if (mode === "Pe") { if (!(value > 0) || value / P0 >= crit) throw new Error(`For a supersonic exit, Pe must be below ${(crit * P0 / PSI).toFixed(2)} psia.`); Me = machFromPressureRatio(P0 / value, g); }
  else { Me = opts.Me; if (!(Me > 1)) throw new Error("Enter an exit Mach number above 1."); if (!(value > 0)) throw new Error("Mass flow must be positive.");
    Dt = Math.sqrt(4 * value / chokedFlux(P0, T0, g, R) / Math.PI); }
  const ar = areaMach(Me, g), De = Dt * Math.sqrt(ar), Pe = P0 / Math.pow(1 + c * Me * Me, e);
  return { Me, ar, Dt, De, Pe, Te: T0 / (1 + c * Me * Me), mdot: chokedFlux(P0, T0, g, R) * Math.PI * Dt * Dt / 4,
    PshockExit: Pe * (1 + 2 * g / (g + 1) * (Me * Me - 1)), P0ideal: p => p * Math.pow(1 + c * Me * Me, e) };
}

/* ---------- design checks and recommendations ---------- */
function lameHoop(p, ri, ro) { return p * (ro * ro + ri * ri) / (ro * ro - ri * ri); }
function checks(st) {
  // st: {spec, geo, gas, P0, T0, Pb, real, material, wall (mm), sf}
  const out = [], { spec, geo, gas, P0, T0, Pb, real, wall } = st, ideal = real.ideal, th = ideal.th, g = gas.g, c = (g - 1) / 2, e = g / (g - 1);
  const n = geo.x.length, add = (level, title, detail, fix, apply) => out.push({ level, title, detail, fix: fix || "", apply: apply || null });
  const psi = v => (v / PSI).toFixed(2) + " psia";
  const cd = geo.kind !== "converging";
  // 1. Operating regime
  if (ideal.regime === "sub") {
    add("bad", "Nozzle is not choked", `At Pb = ${psi(Pb)} the flow never reaches Mach 1, so there is no supersonic flow and mass flow depends on Pb.`,
      `Raise P₀ above ${psi(Pb / (th.Pchoke / P0))} or lower Pb below ${psi(th.Pchoke)}.`, { P0: +(Pb / (th.Pchoke / P0) * 1.05 / PSI).toFixed(1) });
  } else if (ideal.regime === "shock") {
    const need = Pb / (th.PshockExit / P0);
    add("bad", "Normal shock inside the nozzle", `The back pressure is between the choking limit (${psi(th.Pchoke)}) and the shock-at-exit limit (${psi(th.PshockExit)}). The design exit Mach is not reached and total pressure is lost.`,
      `Raise P₀ above ${psi(need)}, lower Pb below ${psi(th.PshockExit)}, or reduce the exit diameter.`, { P0: +(need * 1.05 / PSI).toFixed(1) });
  } else if (cd && real.sep) {
    // Target an exit pressure 10% above the separation limit of the selected criterion.
    const kOf = M => st.crit === "summerfield" ? 0.4 : Math.min(0.5, Math.pow(Math.max(1.88 * M - 1, 1e-6), -0.64));
    const P0need = 1.1 * kOf(th.Msup) * Pb * (P0 / th.PeIso);
    let MeOK = th.Msup; for (let it = 0; it < 30; it++) MeOK = Math.max(1.01, machFromPressureRatio(P0 / (1.1 * kOf(MeOK) * Pb), g));
    const DeOK = 2000 * Math.sqrt(geo.At * areaMach(MeOK, g) / Math.PI);
    add("warn", "Flow will likely separate inside the nozzle", `Ideal exit pressure ${psi(th.PeIso)} is far below Pb (${psi(Pb)}). The separation criterion predicts the jet leaves the wall at ${(real.sep.frac * 100).toFixed(0)}% of the diverging length, which causes unsteady side loads and lower thrust.`,
      `Raise P₀ to about ${psi(P0need)} or reduce the exit diameter to about ${DeOK.toFixed(2)} mm (exit Mach ${MeOK.toFixed(2)}). Both keep the exit pressure 10% above the separation limit.`, { De: +DeOK.toFixed(2) });
  } else if (ideal.regime === "over") add("ok", "Overexpanded, attached", `Exit pressure ${psi(ideal.P[n - 1])} is below Pb but above the separation limit, so the flow should stay attached.`);
  else if (ideal.regime === "ideal") add("ok", "Ideally expanded", "Exit pressure matches the back pressure: the design point.");
  else if (ideal.regime === "under") {
    const MeIdeal = machFromPressureRatio(P0 / Pb, g), De = 2000 * Math.sqrt(geo.At * areaMach(MeIdeal, g) / Math.PI);
    add("info", "Underexpanded", `Exit pressure ${psi(ideal.P[n - 1])} is above Pb, so the jet keeps expanding outside and some thrust is lost.`, `For ideal expansion at this Pb, use an exit diameter of ${De.toFixed(2)} mm.`, { De: +De.toFixed(2) });
  } else if (ideal.regime === "chokedC") add("info", "Choked converging nozzle", "The exit is sonic. A diverging section is needed for supersonic flow.");
  // 2. Geometry angles
  if (geo.kind === "conical") {
    if (spec.beta > 15) add("warn", `Diverging half-angle ${spec.beta}° is steep`, `Divergence loss factor λ = ${real.lambda.toFixed(4)} (${((1 - real.lambda) * 100).toFixed(1)}% thrust loss) and steep walls separate more easily.`, "Use 12–15°, or switch to a bell contour.", { beta: 15 });
    else if (spec.beta < 8) add("info", `Diverging half-angle ${spec.beta}° is shallow`, "The nozzle gets long, which adds wall friction and weight.", "12–15° is the usual compromise.", { beta: 12 });
    else add("ok", `Diverging half-angle ${spec.beta}°`, `Divergence loss ${((1 - real.lambda) * 100).toFixed(2)}%.`);
  } else if (geo.kind === "bell") add("ok", "Bell contour", `θn ${geo.meta.thetaN.toFixed(1)}°, θe ${geo.meta.thetaE.toFixed(1)}°, ${geo.meta.pct}% of a 15° cone (${(geo.meta.L15 * 1000).toFixed(1)} mm). Divergence loss ${((1 - real.lambda) * 100).toFixed(2)}%.`);
  if (spec.alpha > 60) add("warn", `Converging half-angle ${spec.alpha}° is steep`, "Flow can separate at the inlet corner, and the sonic line becomes strongly curved.", "Use 20–45°.", { alpha: 45 });
  else if (spec.alpha < 15) add("info", `Converging half-angle ${spec.alpha}° is shallow`, "Long converging sections add friction with no benefit.", "Use 20–45°.", { alpha: 30 });
  // 3. Throat curvature
  if (geo.kind === "conical") {
    if ((spec.rc || 0) < 0.5) add("warn", "Sharp throat", `Sharp corners curve the sonic line (Cd ≈ ${real.CdInv.toFixed(3)} from curvature alone), concentrate stress and are hard to machine accurately.`, "Use a throat radius of 1–2 × Rt.", { rc: 1.5 });
    else add("ok", `Throat radius ${spec.rc} × Rt`, `Curvature discharge coefficient ≈ ${real.CdInv.toFixed(4)}.`);
  }
  // 4. Contraction ratio
  const CR = geo.A[0] / geo.At, Min = ideal.M[0];
  if (CR < 3) add("warn", `Contraction ratio ${CR.toFixed(2)} is low`, `Inlet Mach is ${Min.toFixed(3)}, so the inlet static pressure is ${(100 * (1 - ideal.P[0] / P0)).toFixed(1)}% below P₀. A pressure tap at the inlet will not read the true total pressure.`,
    `Use an inlet diameter of at least ${(spec.Dt * 2).toFixed(1)} mm (contraction ratio 4).`, { Din: +(spec.Dt * 2).toFixed(1) });
  else add("ok", `Contraction ratio ${CR.toFixed(1)}`, `Inlet Mach ${Min.toFixed(3)}: the inlet is effectively a plenum.`);
  // 5. Viscous effects
  const ReT = real.ReThroat;
  if (ReT < 1e5) add("warn", `Throat Reynolds number ${ReT.toExponential(2)} is low`, "Viscous losses are significant at this size and pressure; expect lower Cd and exit Mach than the ideal model.", "Raise P₀ or enlarge the throat.");
  else add("ok", `Throat Reynolds number ${ReT.toExponential(2)}`, `Boundary-layer discharge coefficient ≈ ${real.CdVisc.toFixed(4)}.`);
  if (cd) {
    const blk = real.dstarExit / geo.r[n - 1];
    const MeI = th.Msup, MeR = machFromArea(real.epsEff, g, true);
    if (blk > 0.03) add("warn", "Boundary layer blocks the exit noticeably", `Displacement thickness is ${(blk * 100).toFixed(1)}% of the exit radius. Effective area ratio ${real.epsEff.toFixed(3)} instead of ${(geo.Ae / geo.At).toFixed(3)}, so exit Mach drops from ${MeI.toFixed(3)} to about ${MeR.toFixed(3)}.`,
      "Enlarge the exit diameter by roughly twice the displacement thickness, or accept the lower Mach.", { De: +(spec.De + 2 * 2000 * real.dstarExit / 2).toFixed(2) });
    else add("ok", "Boundary-layer blockage small", `Exit displacement thickness ${(real.dstarExit * 1e3).toFixed(3)} mm; effective exit Mach ≈ ${MeR.toFixed(3)} vs ideal ${MeI.toFixed(3)}.`);
  }
  // 6. Cold exit flow
  const Te = cd ? T0 / (1 + c * th.Msup * th.Msup) : ideal.T[n - 1];
  if (Te < gas.condensK + 10) {
    const T0need = (gas.condensK + 20) * (1 + c * (cd ? th.Msup * th.Msup : 1));
    add("warn", `Exit static temperature ${Te.toFixed(0)} K is near condensation`, `${gas.name} can condense near ${gas.condensK} K (1 atm; lower at low pressure). Condensation shocks would distort measurements.`,
      `Heat the supply to T₀ ≈ ${T0need.toFixed(0)} K, or lower the exit Mach.`, { T0: Math.round(T0need) });
  } else if (Te < 273 && (gas === GASES.air || gas.name === "Air")) add("info", `Exit static temperature ${Te.toFixed(0)} K`, "Any moisture in the supply will freeze and can form condensation shocks.", "Use dry air or bottled nitrogen.");
  // 7. Wall strength (thick-wall Lamé hoop stress at the inlet, the highest p·r location)
  const mat = st.material, sf = st.sf || 4, pg = Math.max(P0 - PATM, 0), ri = geo.r[0], ro = ri + wall / 1000;
  const sig = lameHoop(pg, ri, ro), allow = mat.yieldMPa * 1e6 / sf;
  if (sig > allow) {
    const a = allow;
    if (a <= pg) add("bad", "Wall cannot hold this pressure in this material", `Even a very thick wall exceeds the allowable stress (${mat.name}, safety factor ${sf}).`, "Choose a stronger material or lower P₀.");
    else { const roMin = ri * Math.sqrt((a + pg) / (a - pg)), tMin = (roMin - ri) * 1000;
      add("bad", "Wall is too thin for the pressure", `Hoop stress ${(sig / 1e6).toFixed(1)} MPa exceeds the allowable ${(allow / 1e6).toFixed(1)} MPa (${mat.name}, yield ${mat.yieldMPa} MPa ÷ safety factor ${sf}).`,
        `Use a wall of at least ${tMin.toFixed(2)} mm, then proof-test before running gas.`, { wall: +(Math.ceil(tMin * 2) / 2).toFixed(1) }); }
  } else add("ok", "Wall strength", `Hoop stress ${(sig / 1e6).toFixed(2)} MPa vs allowable ${(allow / 1e6).toFixed(1)} MPa (${mat.name}, SF ${sf}). Proof-test hardware anyway.`);
  if (T0 > mat.maxK) add("warn", `Supply temperature above ${mat.name} limit`, `${mat.name} softens near ${mat.maxK} K.`, "Lower T₀ or choose a metal.");
  // 8. Manufacturing
  const sens = 2 * 0.1 / spec.Dt * 100;
  if (spec.Dt < 2) add("warn", `Throat diameter ${spec.Dt} mm is small`, "Most 3D printers cannot hold a round hole this small accurately.", "Machine or ream the throat, or scale the design up.");
  add("info", "Measure the as-built throat", `Mass flow scales with throat diameter squared: a 0.1 mm error changes it by about ${sens.toFixed(1)}%.`, "Measure the throat after manufacture and enter the real value before comparing with tests.");
  return out;
}

const FL = { PSI, PATM, GASES, MATERIALS, sutherland, sind, cosd, tand, linspace, interp, areaMach, machFromArea, machFromPressureRatio, chokedFlux, normalShock,
  raoAngles, conical, converging, bell, buildGeometry, finishGeo, wallArcLength, thresholds, shockState, solve, mdotAt, boundaryLayer, realistic, designFor, checks, lameHoop };
if (typeof module !== "undefined" && module.exports) module.exports = FL; else root.FL = FL;
})(typeof window !== "undefined" ? window : globalThis);
