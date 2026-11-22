/* Flow Lab Nozzle Studio: user interface. Physics lives in physics.js (FL). */
"use strict";
const PSI = FL.PSI;
const $ = id => document.getElementById(id);
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fx = (v, d) => Number(v).toFixed(d);
const REG = {
  sub: { name: "Subsonic, unchoked", col: "--r-sub" },
  chokedC: { name: "Choked, sonic exit", col: "--r-under" },
  shock: { name: "Normal shock inside the nozzle", col: "--r-shock" },
  over: { name: "Overexpanded", col: "--r-over" },
  ideal: { name: "Ideally expanded", col: "--r-ideal" },
  under: { name: "Underexpanded", col: "--r-under" }
};
const S = { shape: "bell", spec: null, geo: null, real: null, sol: null, gasKey: "air", gas: FL.GASES.air, P0: 100 * PSI, T0: 300, Pb: 14.7 * PSI,
  material: FL.MATERIALS.al6061, wall: 3, sf: 4, crit: "schmucker", checks: [], segments: [], playing: true, particles: [], saved: [], tab: "design", lesson: -1 };

/* ===================== inputs and recompute ===================== */
function num(id) { return parseFloat($(id).value); }
function readInputs() {
  S.gasKey = $("gas").value; S.gas = FL.GASES[S.gasKey];
  S.P0 = num("P0") * PSI; S.T0 = num("T0"); S.Pb = num("PbIn") * PSI;
  S.material = FL.MATERIALS[$("mat").value]; S.wall = num("wall"); S.sf = num("sf"); S.crit = $("crit").value;
  if (!(S.P0 > 0 && S.T0 > 0)) throw new Error("P₀ and T₀ must be positive.");
  if (!(S.Pb > 0)) throw new Error("Back pressure must be positive (absolute).");
  if (S.Pb >= S.P0) throw new Error("Back pressure must be lower than the supply pressure P₀, or nothing flows.");
  if (!(S.wall > 0)) throw new Error("Wall thickness must be positive.");
  if (!(S.sf >= 1)) throw new Error("Safety factor must be at least 1.");
  S.spec = { shape: S.shape, Din: num("Din"), Dt: num("Dt"), De: num("De"), alpha: num("alpha"), beta: num("beta"), rc: num("rc"),
    bellPct: num("bellPct"), autoAngles: $("autoAng").checked, thetaN: num("thN"), thetaE: num("thE") };
  S.geo = FL.buildGeometry(S.spec, 240);
  if (S.shape === "bell" && S.spec.autoAngles) { $("thN").value = fx(S.geo.meta.thetaN, 1); $("thE").value = fx(S.geo.meta.thetaE, 1); }
}
let pending = false;
function recompute(opts) {
  opts = opts || {};
  try {
    readInputs();
    S.real = FL.realistic(S.geo, S.P0, S.T0, S.Pb, S.gas, { criterion: S.crit });
    S.sol = S.real.ideal;
    S.checks = FL.checks({ spec: S.spec, geo: S.geo, gas: S.gas, P0: S.P0, T0: S.T0, Pb: S.Pb, real: S.real, material: S.material, wall: S.wall, sf: S.sf, crit: S.crit });
    $("err").style.display = "none";
    if (opts.segments !== false) buildSegments();
    updateSidebarInfo(); updateBadge();
    if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; renderActive(); }); }
  } catch (e) {
    $("err").textContent = e.message; $("err").style.display = "block";
  }
}
function setPb(p) { $("PbIn").value = fx(p / PSI, 3); recompute({ segments: false }); }
function setShape(sh) {
  S.shape = sh;
  if (sh !== "converging") S.lastCD = sh;
  $("tyCD").setAttribute("aria-pressed", String(sh !== "converging")); $("tyConv").setAttribute("aria-pressed", String(sh === "converging"));
  ["shBell", "shCone"].forEach(id => $(id).setAttribute("aria-pressed", String($(id).dataset.shape === (S.lastCD || "bell"))));
  document.querySelectorAll(".cdOnly").forEach(e => e.hidden = sh === "converging");
  document.querySelectorAll(".coneOnly").forEach(e => e.hidden = sh !== "conical");
  document.querySelectorAll(".bellOnly").forEach(e => e.hidden = sh !== "bell");
  $("thN").disabled = $("thE").disabled = $("autoAng").checked;
}
function updateSidebarInfo() {
  const g = S.geo, n = g.x.length, L = g.x[n - 1];
  $("geoInfo").textContent = g.kind === "converging" ? `Length ${fx(L * 1000, 1)} mm · exit = throat`
    : `Length ${fx(L * 1000, 1)} mm · Ae/At ${fx(g.Ae / g.At, 3)} · design Mach ${fx(S.sol.th.Msup, 3)}`;
}
function updateBadge() {
  const bad = S.checks.filter(c => c.level === "bad").length, warn = S.checks.filter(c => c.level === "warn").length, b = $("chkBadge");
  b.hidden = false;
  if (bad) { b.textContent = bad; b.dataset.level = "bad"; } else if (warn) { b.textContent = warn; b.dataset.level = "warn"; } else { b.textContent = "✓"; b.dataset.level = "ok"; }
}

/* ===================== tabs ===================== */
const TABS = ["design", "simulate", "compare", "checks", "learn", "python", "export"];
function showTab() {
  const t = (location.hash || "#design").slice(1);
  S.tab = TABS.includes(t) ? t : "design";
  document.querySelectorAll("nav.tabs a").forEach(a => a.setAttribute("aria-selected", String(a.dataset.tab === S.tab)));
  document.querySelectorAll(".view").forEach(v => v.hidden = v.dataset.view !== S.tab);
  if (S.tab === "simulate") resizeViz();
  renderActive();
}
window.addEventListener("hashchange", showTab);
function renderActive() {
  if (!S.sol) return;
  if (S.tab === "design") renderDesign();
  else if (S.tab === "simulate") renderSimulate();
  else if (S.tab === "compare") renderCompare();
  else if (S.tab === "checks") renderChecks();
}

/* ===================== shared chart helpers ===================== */
const cfg = { displayModeBar: false, responsive: true };
function baseLayout(xt, yt) {
  const ink = cssv("--ink"), muted = cssv("--muted"), line = cssv("--line");
  return { margin: { l: 56, r: 12, t: 8, b: 44 }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "IBM Plex Sans, system-ui, sans-serif", size: 12, color: ink },
    xaxis: { title: { text: xt, font: { color: muted } }, gridcolor: line, zerolinecolor: line, linecolor: line },
    yaxis: { title: { text: yt, font: { color: muted } }, gridcolor: line, zerolinecolor: line, linecolor: line },
    showlegend: true, legend: { orientation: "h", y: -0.3, x: 0, font: { size: 11, color: muted } } };
}
function plot(id, traces, layout) { if (typeof Plotly !== "undefined") Plotly.react(id, traces, layout, cfg); }
function tile(k, v, u, cls) { return `<div class="tile ${cls || ""}"><div class="k">${k}</div><div class="v">${v}</div>${u ? `<div class="u">${u}</div>` : ""}</div>`; }
function wallVolume(geo, t) { let v = 0; for (let i = 1; i < geo.x.length; i++) { const a = (geo.r[i - 1] + t) ** 2 - geo.r[i - 1] ** 2, b = (geo.r[i] + t) ** 2 - geo.r[i] ** 2; v += Math.PI * (a + b) / 2 * (geo.x[i] - geo.x[i - 1]); } return v; }

/* ===================== DESIGN tab ===================== */
function renderDesign() {
  const g = S.geo, r = S.real, i = S.sol, n = g.x.length, cd = g.kind !== "converging";
  $("dsTitle").textContent = { bell: "Bell nozzle", conical: "Conical nozzle", converging: "Converging nozzle" }[g.kind];
  $("dsSub").textContent = `${S.gas.name} · P₀ ${fx(S.P0 / PSI, 1)} psia · T₀ ${fx(S.T0, 0)} K · Pb ${fx(S.Pb / PSI, 2)} psia`;
  const mass = wallVolume(g, S.wall / 1000) * S.material.rho * 1000;
  $("dsTiles").innerHTML = [
    tile("Design exit Mach", cd ? fx(i.th.Msup, 3) : "1.000"), tile("Area ratio", cd ? fx(g.Ae / g.At, 3) : "1"),
    tile("Length", fx(g.x[n - 1] * 1000, 1), "mm"), tile("Throat / exit Ø", `${fx(S.spec.Dt, 2)} / ${fx(2000 * g.r[n - 1], 2)}`, "mm"),
    tile("Mass flow (ideal)", fx(i.mdot * 1000, 2), "g/s"), tile("Mass flow (realistic)", fx(r.mdot * 1000, 2), `g/s · Cd ${fx(r.Cd, 3)}`, "real"),
    tile("Thrust at Pb (realistic)", fx(r.F, 2), `N · ideal ${fx(i.F, 2)}`, "real"), tile("Part mass", fx(mass, 1), `g · ${S.material.name}`)].join("");
  drawDesign(); updateDesignCalc(); renderShapeNotes();
}
function renderShapeNotes() {
  const g = S.geo, m = g.meta, r = S.real;
  let h = "";
  if (g.kind === "bell") {
    h = `<p>A Rao-style thrust-optimised bell. After the throat the wall turns out to θn = ${fx(m.thetaN, 1)}° on a 0.382·Rt arc, then a parabola bends it back to θe = ${fx(m.thetaE, 1)}° at the exit.</p>
      <p>It is ${fx(m.pct, 0)}% as long as an equivalent 15° cone (${fx(m.L15 * 1000, 1)} mm), saving ${fx((m.L15 - m.Ldiv) * 1000, 1)} mm of diverging length. Divergence loss is about ${fx((1 - r.lambda) * 100, 2)}%.</p>
      <p class="hint">Automatic angles are approximate values from Rao's 80% chart. For other lengths, untick “Automatic bell angles” and enter angles from the chart.</p>`;
  } else if (g.kind === "conical") {
    h = `<p>A conical nozzle with a ${fx(m.alpha, 0)}° converging and ${fx(m.beta, 0)}° diverging half-angle${m.rcUp > 0 ? `, joined by a throat arc of ${fx(m.rcUp, 2)}·Rt` : " and a sharp throat"}.</p>
      <p>Divergence loss λ = (1 + cos ${fx(m.beta, 0)}°)/2 = ${fx(r.lambda, 4)}, so ${fx((1 - r.lambda) * 100, 2)}% of the jet momentum is not axial. A bell with the same area ratio would be shorter and lose less.</p>`;
  } else {
    h = `<p>A converging nozzle accelerates the flow to at most Mach 1 at its exit. It is ideal for seeing choking: below a pressure ratio of ${fx(Math.pow(2 / (S.gas.g + 1), S.gas.g / (S.gas.g - 1)), 3)} the mass flow stops rising.</p>`;
  }
  $("shapeNotes").innerHTML = h;
}
let designResult = null;
function updateDesignCalc() {
  const mode = $("dMode").value, val = num("dVal"), out = $("dOut"); $("dMachWrap").hidden = mode !== "mdot"; designResult = null;
  try {
    const v = mode === "Pe" ? val * PSI : (mode === "mdot" ? val / 1000 : val);
    const d = FL.designFor(mode, v, S.P0, S.T0, S.gas.g, S.gas.R, { Dt: num("Dt") / 1000, Me: num("dMach") });
    const Pb = S.Pb, Pchoke = S.P0 / Math.pow(1 + (S.gas.g - 1) / 2 * Math.pow(FL.machFromArea(d.ar, S.gas.g, false), 2), S.gas.g / (S.gas.g - 1));
    let verdict = Pb >= Pchoke ? "Unchoked: the target will not be reached." : Pb > d.PshockExit ? "Internal normal shock: the target will not be reached."
      : Math.abs(Pb - d.Pe) / d.Pe <= 0.01 ? "Ideally expanded." : Pb > d.Pe ? (d.Pe / Pb < 0.4 ? "Overexpanded; separation likely in a real test." : "Overexpanded, attached.") : "Underexpanded.";
    const rows = [["Exit Mach", fx(d.Me, 4)], ["Area ratio Ae/At", fx(d.ar, 4)], ["Throat diameter", fx(d.Dt * 1000, 3) + " mm"], ["Exit diameter", fx(d.De * 1000, 3) + " mm"],
      ["Design exit pressure", fx(d.Pe / PSI, 3) + " psia"], ["Exit static temperature", fx(d.Te, 1) + " K"], ["Choked mass flow (ideal)", fx(d.mdot * 1000, 3) + " g/s"],
      ["Shock-free if Pb ≤", fx(d.PshockExit / PSI, 3) + " psia"], [`P₀ for ideal expansion into ${fx(Pb / PSI, 2)} psia`, fx(d.P0ideal(Pb) / PSI, 1) + " psia"], ["At the current Pb", verdict]];
    if (d.Dt * 1000 >= num("Din")) rows.push(["Note", "The throat is larger than the inlet: applying will double the inlet diameter."]);
    out.innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td class="n">${r[1]}</td></tr>`).join("");
    designResult = d;
  } catch (e) { out.innerHTML = `<tr><td style="color:var(--bad)">${e.message}</td></tr>`; }
}
function applyDesign(setPbToo) {
  if (!designResult) return;
  if (S.shape === "converging") setShape("bell");
  $("Dt").value = fx(designResult.Dt * 1000, 3); $("De").value = fx(designResult.De * 1000, 3);
  if (num("Din") <= designResult.Dt * 1000 * 1.2) $("Din").value = fx(designResult.Dt * 2000, 1);
  if (setPbToo) $("PbIn").value = fx(designResult.Pe / PSI, 3);
  recompute();
}
/* dimensioned drawing */
function drawDesign() {
  const cv = $("drawing"), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (!W) return;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const c = cv.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const g = S.geo, n = g.x.length, t = S.wall, xs = g.x.map(v => v * 1000), rs = g.r.map(v => v * 1000), L = xs[n - 1], rmax = Math.max(...rs) + t;
  const top = 96, sc = Math.min((W - 170) / L, (H - top - 50) / (2 * rmax)), x0 = Math.max(70, (W - L * sc) / 2), yc = top + rmax * sc, X = x => x0 + x * sc, Y = r => yc - r * sc;
  const ink = cssv("--ink"), muted = cssv("--muted"), accent = cssv("--accent"), font = "12px IBM Plex Mono, monospace";
  // wall with hatching
  const hatch = document.createElement("canvas"); hatch.width = hatch.height = 8; const hc = hatch.getContext("2d");
  hc.strokeStyle = muted; hc.globalAlpha = .55; hc.lineWidth = 1; hc.beginPath(); hc.moveTo(0, 8); hc.lineTo(8, 0); hc.stroke();
  for (const sgn of [1, -1]) {
    c.beginPath(); xs.forEach((x, i) => { const px = X(x), py = Y(sgn * rs[i]); i ? c.lineTo(px, py) : c.moveTo(px, py); });
    for (let i = n - 1; i >= 0; i--) c.lineTo(X(xs[i]), Y(sgn * (rs[i] + t)));
    c.closePath(); c.fillStyle = cssv("--line"); c.fill(); c.fillStyle = c.createPattern(hatch, "repeat"); c.fill();
    c.strokeStyle = ink; c.lineWidth = 1.6; c.stroke();
  }
  // axis
  c.save(); c.setLineDash([14, 4, 3, 4]); c.strokeStyle = muted; c.lineWidth = 1; c.beginPath(); c.moveTo(X(-4), yc); c.lineTo(X(L + 4), yc); c.stroke(); c.restore();
  // dimension helpers
  c.font = font; c.fillStyle = ink; c.strokeStyle = accent; c.lineWidth = 1;
  const arrow = (x, y, dx, dy) => { const a = Math.atan2(dy, dx); c.beginPath(); c.moveTo(x, y); c.lineTo(x - 7 * Math.cos(a - .35), y - 7 * Math.sin(a - .35)); c.moveTo(x, y); c.lineTo(x - 7 * Math.cos(a + .35), y - 7 * Math.sin(a + .35)); c.stroke(); };
  const dimH = (xa, xb, y, label, yfrom) => {
    c.beginPath(); c.moveTo(X(xa), yfrom); c.lineTo(X(xa), y); c.moveTo(X(xb), yfrom); c.lineTo(X(xb), y); c.globalAlpha = .45; c.stroke(); c.globalAlpha = 1;
    c.beginPath(); c.moveTo(X(xa), y); c.lineTo(X(xb), y); c.stroke(); arrow(X(xa), y, -1, 0); arrow(X(xb), y, 1, 0);
    c.textAlign = "center"; c.fillText(label, (X(xa) + X(xb)) / 2, y - 5);
  };
  const dimV = (x, r, label, side) => {
    const px = X(x) + side * 0; c.beginPath(); c.moveTo(px, Y(r)); c.lineTo(px, Y(-r)); c.stroke(); arrow(px, Y(r), 0, -1); arrow(px, Y(-r), 0, 1);
    c.save(); c.translate(px + side * 6, yc); c.rotate(-Math.PI / 2); c.textAlign = "center"; c.textBaseline = side > 0 ? "top" : "bottom"; c.fillText(label, 0, 0); c.restore();
  };
  const xt = g.meta.xThroat * 1000;
  dimH(0, L, Y(-rmax) + 34, `L = ${fx(L, 2)}`, Y(-rmax) + 4);
  if (g.kind !== "converging") { dimH(0, xt, Y(rmax) - 22, fx(xt, 2), Y(rmax) - 4); dimH(xt, L, Y(rmax) - 22, fx(L - xt, 2), Y(rmax) - 4); }
  dimV(0, rs[0], `Ø ${fx(2 * rs[0], 2)}`, -1);
  dimV(xs[g.it], rs[g.it], `Ø ${fx(2 * rs[g.it], 2)}`, 1);
  if (g.kind !== "converging") dimV(L, rs[n - 1], `Ø ${fx(2 * rs[n - 1], 2)}`, 1);
  // angle notes
  c.fillStyle = muted; c.textAlign = "left"; c.font = "12px IBM Plex Sans, sans-serif";
  const notes = [`converging half-angle ${fx(g.meta.alpha, 0)}°`];
  if (g.kind === "conical") notes.push(`diverging half-angle ${fx(g.meta.beta, 0)}°`, g.meta.rcUp > 0 ? `throat radius ${fx(g.meta.rcUp * rs[g.it], 2)} mm` : "sharp throat");
  if (g.kind === "bell") notes.push(`bell ${fx(g.meta.pct, 0)}%: θn ${fx(g.meta.thetaN, 1)}° → θe ${fx(g.meta.thetaE, 1)}°`, `throat arcs ${fx(1.5 * rs[g.it], 2)} / ${fx(0.382 * rs[g.it], 2)} mm`);
  notes.push(`wall ${fx(t, 1)} mm · ${S.material.name}`);
  notes.forEach((s, k) => c.fillText(s, 12, 16 + 15 * k));
}

/* ===================== SIMULATE tab ===================== */
function buildSegments() {
  const th = S.sol.th, P0 = S.P0;
  S.segments = S.geo.kind === "converging" ? [
    { lo: th.Pchoke * 0.15, hi: th.Pchoke, key: "chokedC", label: "Choked", sub: "exit M = 1, flow fixed", geo: true },
    { lo: th.Pchoke, hi: P0 * 0.999, key: "sub", label: "Unchoked", sub: "subsonic everywhere" }] : [
    { lo: th.PeIso * 0.2, hi: th.PeIso, key: "under", label: "Underexpanded", sub: "Pe > Pb", geo: true },
    { lo: th.PeIso, hi: th.PshockExit, key: "over", label: "Overexpanded", sub: "Pe < Pb", geo: true },
    { lo: th.PshockExit, hi: th.Pchoke, key: "shock", label: "Shock inside", sub: "normal shock in diverging part" },
    { lo: th.Pchoke, hi: P0 * 0.999, key: "sub", label: "Unchoked", sub: "subsonic, venturi-like" }];
  const bands = $("bands"), labels = $("bandlabels"), ticks = $("ticks"), jumps = $("jumps"), ns = S.segments.length;
  bands.innerHTML = labels.innerHTML = ticks.innerHTML = jumps.innerHTML = "";
  S.segments.forEach((s, i) => {
    const d = document.createElement("div"); d.style.background = `var(${REG[s.key].col})`; bands.appendChild(d);
    const l = document.createElement("div"); l.innerHTML = `<b>${s.label}</b>${s.sub}`; labels.appendChild(l);
    if (i > 0) { const t = document.createElement("span"); t.style.left = (100 * i / ns) + "%"; t.textContent = fx(s.lo / PSI, 2); ticks.appendChild(t); }
  });
  const J = S.geo.kind === "converging"
    ? [["sub", "Unchoked", (th.Pchoke + P0) / 2], ["chokedC", "Just choked", th.Pchoke * 0.98], ["chokedC", "Deeply choked", th.Pchoke * 0.4], ["chokedC", "Atmosphere", 14.696 * PSI]]
    : [["sub", "Unchoked", (th.Pchoke + P0) / 2], ["shock", "Shock near throat", th.Pchoke - (th.Pchoke - th.PshockExit) * 0.1], ["shock", "Shock mid-nozzle", (th.Pchoke + th.PshockExit) / 2],
       ["shock", "Shock at exit", th.PshockExit * 1.0005], ["over", "Overexpanded", Math.sqrt(th.PeIso * th.PshockExit)], ["ideal", "Ideal expansion", th.PeIso], ["under", "Underexpanded", th.PeIso * 0.45], ["sub", "Atmosphere (14.7)", 14.696 * PSI]];
  J.forEach(([k, txt, p]) => { if (p >= P0) return; const b = document.createElement("button"); b.innerHTML = `<span style="background:var(${REG[k].col})"></span>${txt}`; b.addEventListener("click", () => setPb(p)); jumps.appendChild(b); });
}
function pbToSlider(Pb) {
  const n = S.segments.length;
  for (let i = 0; i < n; i++) { const s = S.segments[i];
    if (Pb <= s.hi || i === n - 1) { const p = Math.min(Math.max(Pb, s.lo), s.hi), f = s.geo ? Math.log(p / s.lo) / Math.log(s.hi / s.lo) : (p - s.lo) / (s.hi - s.lo); return 1000 * (i + f) / n; } }
  return 1000;
}
function sliderToPb(v) { const n = S.segments.length, pos = v / 1000 * n, i = Math.min(n - 1, Math.floor(pos)), f = pos - i, s = S.segments[i]; return s.geo ? s.lo * Math.pow(s.hi / s.lo, f) : s.lo + (s.hi - s.lo) * f; }
function renderSimulate() {
  const s = S.sol, r = S.real, n = s.M.length, reg = REG[s.regime], th = s.th;
  $("pb").value = pbToSlider(S.Pb); $("pbVal").textContent = fx(S.Pb / PSI, 2); $("pbRatio").textContent = "Pb/P₀ = " + fx(S.Pb / S.P0, 4);
  const chip = $("chip"); chip.textContent = reg.name; chip.style.background = `var(${reg.col})`;
  $("chipSub").textContent = S.geo.kind !== "converging" ? `Thresholds: choke ${fx(th.Pchoke / PSI, 2)} · shock at exit ${fx(th.PshockExit / PSI, 2)} · ideal ${fx(th.PeIso / PSI, 2)} psia`
    : `Choking at Pb ≤ ${fx(th.Pchoke / PSI, 2)} psia`;
  $("simTiles").innerHTML = [tile("Exit Mach", fx(s.M[n - 1], 3), `realistic ${fx(r.Me, 3)}`), tile("Exit velocity", fx(s.V[n - 1], 1), "m/s"),
    tile("Mass flow", fx(s.mdot * 1000, 2), `g/s · realistic ${fx(r.mdot * 1000, 2)}`), tile("Exit pressure", fx(s.P[n - 1] / PSI, 2), "psia"),
    tile("Thrust", fx(s.F, 2), `N · realistic ${fx(r.F, 2)}`), tile("Separation", r.sep ? fx(r.sep.frac * 100, 0) + "%" : "none", r.sep ? "of diverging length" : "realistic model", r.sep ? "real" : "")].join("");
  updateExplain(); drawSimCharts();
}
function updateExplain() {
  const s = S.sol, r = S.real, n = s.M.length, th = s.th, g = S.gas.g, P0 = S.P0, Pe = s.P[n - 1], Pb = S.Pb, it = S.geo.it;
  let h = "";
  switch (s.regime) {
    case "sub": h = `<p>The back pressure is too high for the flow to reach Mach 1 anywhere. The gas speeds up toward the throat (M = <span class="num">${fx(s.M[it], 3)}</span>)` +
      (S.geo.kind !== "converging" ? ` and slows down again in the diverging section, like a venturi meter.` : `, which is also the exit.`) + `</p><p>Lower P<sub>b</sub> and the mass flow rises. Below <span class="num">${fx(th.Pchoke / PSI, 2)}</span> psia the throat reaches Mach 1 and the nozzle <b>chokes</b>.</p>`; break;
    case "chokedC": h = `<p>The exit is the throat and it is sonic: M = 1. The mass flow is fixed at <span class="num">${fx(s.mdot * 1000, 2)}</span> g/s. Lowering P<sub>b</sub> further cannot raise it, because pressure signals travel at the speed of sound and cannot move upstream through sonic flow.</p><p>The exit pressure stays at <span class="num">${fx(Pe / PSI, 2)}</span> psia, above P<sub>b</sub>, so the jet keeps expanding outside. Supersonic flow needs a diverging section.</p>`; break;
    case "shock": { const sh = s.shock, L = S.geo.x[n - 1];
      h = `<p>The throat is choked, so mass flow is fixed. After the throat the flow goes supersonic, but the back pressure is too high for a fully supersonic exit, so a <b>normal shock</b> stands inside.</p>
        <div class="callout shock"><p class="num" style="margin:0">Shock at x = ${fx(sh.x * 1000, 2)} mm (${fx(100 * sh.x / L, 1)}% of length)<br>Mach ${fx(sh.M1, 3)} → ${fx(sh.M2, 3)} · P ${fx(sh.P1 / PSI, 2)} → ${fx(sh.P2 / PSI, 2)} psia<br>Total pressure lost: ${fx(100 * (1 - sh.P02 / P0), 1)}%</p></div>
        <p>Behind the shock the flow is subsonic and slows as the area grows, so pressure rises to P<sub>b</sub> at the exit. Lower P<sub>b</sub> and the shock moves downstream and gets stronger. It reaches the exit at <span class="num">${fx(th.PshockExit / PSI, 2)}</span> psia. In a real nozzle the shock meets the boundary layer and usually separates it.</p>`; break; }
    case "over": h = `<p>Inside the nozzle the flow is fully supersonic and shock-free in the ideal model, reaching Mach <span class="num">${fx(s.M[n - 1], 3)}</span>. Its exit pressure (<span class="num">${fx(Pe / PSI, 2)}</span> psia) is <b>below</b> P<sub>b</sub>, so oblique shocks outside the exit squeeze the jet.</p>`;
      h += r.sep ? `<p class="callout">Realistic model: the wall pressure drops below the ${S.crit === "schmucker" ? "Schmucker" : "Summerfield"} limit at ${fx(r.sep.frac * 100, 0)}% of the diverging length (M ${fx(r.sep.M, 2)}), so the flow is expected to <b>separate</b> there. Separation is unsteady and creates side loads.</p>`
        : `<p>The realistic model predicts the flow stays attached.</p>`; break;
    case "ideal": h = `<p>This is the <b>design condition</b>: exit pressure equals back pressure (<span class="num">${fx(Pe / PSI, 2)}</span> psia), so the jet leaves parallel with no shocks or expansion waves outside.</p>`; break;
    case "under": h = `<p>The flow leaves at <span class="num">${fx(Pe / PSI, 2)}</span> psia, <b>above</b> P<sub>b</sub>, so it keeps expanding outside through expansion fans. A larger exit would capture more of that expansion as thrust.</p>`; break;
  }
  h += `<p class="hint">Realistic model at this point: Cd ${fx(r.Cd, 4)}, exit Mach ${fx(r.Me, 3)}, thrust ${fx(r.F, 2)} N (ideal ${fx(s.F, 2)} N). Details in the Compare tab.</p>`;
  $("explain").innerHTML = h;
}
function refCurves() {
  const geo = S.geo, g = S.gas.g, c = (g - 1) / 2, e = g / (g - 1), xs = geo.x.map(v => v * 1000);
  const subM = geo.A.map(a => FL.machFromArea(a / geo.At, g, false)), supM = geo.A.map((a, j) => FL.machFromArea(a / geo.At, g, j > geo.it));
  return { xs, subP: subM.map(m => 1 / Math.pow(1 + c * m * m, e)), supP: supM.map(m => 1 / Math.pow(1 + c * m * m, e)), subM, supM };
}
function drawSimCharts() {
  const s = S.sol, r = S.real, geo = S.geo, xs = geo.x.map(v => v * 1000), ref = refCurves(), muted = cssv("--muted"), col = cssv(REG[s.regime].col), shockC = cssv("--shock"), realC = cssv("--r-over");
  const Lmm = xs[xs.length - 1], showReal = $("showReal").checked, cd = geo.kind !== "converging";
  const t1 = [{ x: ref.xs, y: ref.subP, name: "Choking limit", mode: "lines", line: { dash: "dot", width: 1.5, color: muted } }];
  if (cd) t1.push({ x: ref.xs, y: ref.supP, name: "Shock-free supersonic", mode: "lines", line: { dash: "dash", width: 1.5, color: muted } });
  t1.push({ x: xs, y: s.P.map(p => p / S.P0), name: "Ideal", mode: "lines", line: { width: 3, color: col } });
  if (showReal) t1.push({ x: xs, y: r.Pwall.map(p => p / S.P0), name: "Realistic", mode: "lines", line: { width: 2, color: realC, dash: "dashdot" } });
  t1.push({ x: [Lmm, Lmm * 1.06], y: [S.Pb / S.P0, S.Pb / S.P0], name: "Back pressure", mode: "lines", line: { width: 3, color: cssv("--ink") } });
  const l1 = baseLayout("x (mm)", "P / P₀"); l1.yaxis.range = [0, 1.03]; l1.xaxis.range = [0, Lmm * 1.07]; l1.shapes = [];
  if (s.shock) l1.shapes.push({ type: "line", x0: s.shock.x * 1000, x1: s.shock.x * 1000, y0: 0, y1: 1, line: { color: shockC, width: 1.5, dash: "dot" } });
  if (showReal && r.sep) l1.shapes.push({ type: "rect", x0: r.sep.x * 1000, x1: Lmm, yref: "paper", y0: 0, y1: 1, fillcolor: realC, opacity: .12, line: { width: 0 } });
  plot("plotP", t1, l1);
  const v = $("plot2Var").value, map = { M: [s.M, r.sol.M, "Mach number"], T: [s.T, r.sol.T, "T (K)"], V: [s.V, r.sol.V, "V (m/s)"], rho: [s.rho, r.sol.rho, "ρ (kg/m³)"] }[v];
  const t2 = [{ x: xs, y: map[0], name: "Ideal", mode: "lines", line: { width: 3, color: col } }];
  if (showReal) t2.push({ x: xs, y: map[1], name: "Realistic (attached)", mode: "lines", line: { width: 2, color: realC, dash: "dashdot" } });
  if (v === "M") { t2.unshift({ x: ref.xs, y: ref.subM, name: "Choking limit", mode: "lines", line: { dash: "dot", width: 1.5, color: muted } });
    if (cd) t2.unshift({ x: ref.xs, y: ref.supM, name: "Shock-free supersonic", mode: "lines", line: { dash: "dash", width: 1.5, color: muted } }); }
  const l2 = baseLayout("x (mm)", map[2]); l2.shapes = [];
  if (s.shock) l2.shapes.push({ type: "line", x0: s.shock.x * 1000, x1: s.shock.x * 1000, yref: "paper", y0: 0, y1: 1, line: { color: shockC, width: 1.5, dash: "dot" } });
  if (showReal && r.sep) l2.shapes.push({ type: "rect", x0: r.sep.x * 1000, x1: Lmm, yref: "paper", y0: 0, y1: 1, fillcolor: realC, opacity: .12, line: { width: 0 } });
  plot("plot2", t2, l2);
  const th = s.th, pr = FL.linspace(0.01, 0.999, 160), md = pr.map(p => 1000 * FL.mdotAt(geo, S.P0, S.T0, p * S.P0, S.gas.g, S.gas.R, th));
  const t3 = [{ x: pr, y: md, name: "Ideal", mode: "lines", line: { width: 2.5, color: cssv("--accent") } }];
  if (showReal) t3.push({ x: pr, y: md.map((m, i) => m * (pr[i] * S.P0 >= th.Pchoke ? r.CdVisc : r.Cd)), name: "Realistic", mode: "lines", line: { width: 2, color: realC, dash: "dashdot" } });
  t3.push({ x: [S.Pb / S.P0], y: [s.mdot * 1000], name: "Current", mode: "markers", marker: { size: 12, color: col, line: { width: 2, color: cssv("--surface") } } });
  const l3 = baseLayout("Pb / P₀", "ṁ (g/s)"); l3.xaxis.range = [0, 1]; l3.yaxis.rangemode = "tozero";
  l3.shapes = [{ type: "line", x0: th.Pchoke / S.P0, x1: th.Pchoke / S.P0, yref: "paper", y0: 0, y1: 1, line: { color: muted, width: 1, dash: "dot" } }];
  plot("plotM", t3, l3);
}
/* animated nozzle */
const cv = $("viz"), ctx = cv.getContext("2d"); let view = null;
const STOPS = [[0, [48, 18, 59]], [0.15, [65, 69, 171]], [0.3, [57, 135, 249]], [0.45, [27, 207, 212]], [0.6, [97, 252, 108]], [0.72, [210, 233, 53]], [0.85, [254, 155, 45]], [1, [200, 30, 20]]];
function cmap(t) { t = Math.min(1, Math.max(0, t)); for (let i = 1; i < STOPS.length; i++) if (t <= STOPS[i][0]) { const [a, ca] = STOPS[i - 1], [b, cb] = STOPS[i], f = (t - a) / (b - a); return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * f)).join(",")})`; } return "rgb(200,30,20)"; }
function field() {
  const s = S.sol, k = $("colorBy").value, arr = { M: s.M, P: s.P.map(p => p / PSI), T: s.T, V: s.V, rho: s.rho }[k], unit = { M: "", P: " psia", T: " K", V: " m/s", rho: " kg/m³" }[k];
  let lo = Math.min(...arr), hi = Math.max(...arr); if (k === "M") { lo = 0; hi = Math.max(2, hi); } if (hi - lo < 1e-9) hi = lo + 1; return { arr, lo, hi, unit, k };
}
function resizeViz() { const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w) return; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
function seedParticles() { S.particles = []; for (let i = 0; i < 170; i++) S.particles.push({ x: Math.random(), y: (Math.random() * 2 - 1) * 0.9, ext: Math.random() < 0.35 }); }
function drawViz() {
  if (!S.sol || S.tab !== "simulate") return;
  const w = cv.clientWidth, h = cv.clientHeight, geo = S.geo, s = S.sol, n = geo.x.length, L = geo.x[n - 1], rmax = Math.max(...geo.r);
  if (!w) return;
  const sc = Math.min((w - 30) / (L * 1.42), (h - 40) / (2 * rmax * 1.45)), x0 = Math.max(16, (w - L * 1.38 * sc) / 2), yc = h / 2 + 6; view = { sc, x0, L };
  const X = x => x0 + x * sc, Y = r => yc - r * sc; ctx.clearRect(0, 0, w, h);
  const f = field(), norm = v => (v - f.lo) / (f.hi - f.lo), re = geo.r[n - 1], xe = X(L), pl = L * 0.38 * sc;
  let spread = 1; if (s.regime === "under" || s.regime === "chokedC") spread = 1.45; else if (s.regime === "over") spread = 0.72; else if (s.regime === "sub" || s.regime === "shock") spread = 1.12;
  ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = cmap(norm(f.arr[n - 1])); ctx.beginPath(); ctx.moveTo(xe, Y(re));
  ctx.quadraticCurveTo(xe + pl * 0.5, Y(re * (1 + (spread - 1) * 1.4)), xe + pl, Y(re * spread)); ctx.lineTo(xe + pl, Y(-re * spread));
  ctx.quadraticCurveTo(xe + pl * 0.5, Y(-re * (1 + (spread - 1) * 1.4)), xe, Y(-re)); ctx.closePath(); ctx.fill(); ctx.restore();
  if (s.regime === "over" || s.regime === "under") { ctx.save(); ctx.strokeStyle = cssv("--muted"); ctx.globalAlpha = 0.55; ctx.lineWidth = 1; const step = pl / 3;
    for (let k = 0; k < 3; k++) { const xa = xe + k * step, rr = re * (s.regime === "over" ? 0.85 : 1.1); ctx.beginPath(); ctx.moveTo(xa, Y(rr)); ctx.lineTo(xa + step * 0.5, Y(0)); ctx.lineTo(xa, Y(-rr)); ctx.moveTo(xa + step * 0.5, Y(0)); ctx.lineTo(xa + step, Y(rr)); ctx.moveTo(xa + step * 0.5, Y(0)); ctx.lineTo(xa + step, Y(-rr)); ctx.stroke(); } ctx.restore(); }
  for (let i = 0; i < n - 1; i++) { ctx.fillStyle = cmap(norm((f.arr[i] + f.arr[i + 1]) / 2)); ctx.beginPath(); ctx.moveTo(X(geo.x[i]), Y(geo.r[i])); ctx.lineTo(X(geo.x[i + 1]), Y(geo.r[i + 1])); ctx.lineTo(X(geo.x[i + 1]), Y(-geo.r[i + 1])); ctx.lineTo(X(geo.x[i]), Y(-geo.r[i])); ctx.closePath(); ctx.fill(); }
  const sep = $("showReal").checked ? S.real.sep : null;
  if (sep) { // separated region: gas pulls away from the wall
    ctx.save(); ctx.fillStyle = cssv("--soft"); ctx.globalAlpha = 0.85;
    for (const sg of [1, -1]) { ctx.beginPath(); ctx.moveTo(X(sep.x), Y(sg * interpR(sep.x)));
      for (let i = sep.i; i < n; i++) ctx.lineTo(X(geo.x[i]), Y(sg * geo.r[i]));
      for (let i = n - 1; i >= sep.i; i--) { const f2 = (geo.x[i] - sep.x) / (L - sep.x + 1e-12); ctx.lineTo(X(geo.x[i]), Y(sg * (sep.p > 0 ? interpR(sep.x) + (geo.r[i] - interpR(sep.x)) * 0.25 * f2 : geo.r[i]))); }
      ctx.closePath(); ctx.fill(); }
    ctx.restore(); ctx.fillStyle = cssv("--r-over"); ctx.font = "600 12px IBM Plex Sans Condensed, sans-serif"; ctx.textAlign = "left"; ctx.fillText("◂ separation (realistic model)", X(sep.x), Y(rmax * 1.15) - (S.sol.shock ? 20 : 4));
  }
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  for (const p of S.particles) { let px, py;
    if (p.ext && p.x > 1) { const t = (p.x - 1) / 0.38; px = xe + t * pl; py = yc - p.y * re * (1 + (spread - 1) * Math.min(1, t * 1.4)) * sc; }
    else { const xx = Math.min(p.x, 1) * L; let rr = interpR(xx); if (sep && xx > sep.x) rr = interpR(sep.x) + (rr - interpR(sep.x)) * 0.25 * (xx - sep.x) / (L - sep.x); px = X(xx); py = yc - p.y * rr * sc; }
    ctx.beginPath(); ctx.arc(px, py, 1.6, 0, 6.283); ctx.fill(); }
  ctx.strokeStyle = cssv("--ink"); ctx.lineWidth = 3;
  for (const sg of [1, -1]) { ctx.beginPath(); geo.x.forEach((x, i) => { const px = X(x), py = Y(sg * geo.r[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }); ctx.stroke(); }
  const xt = X(geo.x[geo.it]); ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = cssv("--muted"); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xt, Y(rmax * 1.15)); ctx.lineTo(xt, Y(-rmax * 1.15)); ctx.stroke(); ctx.restore();
  ctx.fillStyle = cssv("--muted"); ctx.font = "12px IBM Plex Sans, sans-serif"; ctx.textAlign = "center"; ctx.fillText(geo.kind !== "converging" ? "throat" : "throat = exit", xt, Y(-rmax * 1.15) + 14);
  if (s.shock) { const xs = X(s.shock.x), rs = interpR(s.shock.x); ctx.strokeStyle = cssv("--shock"); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(xs, Y(rs)); ctx.lineTo(xs, Y(-rs)); ctx.stroke();
    ctx.fillStyle = cssv("--shock"); ctx.font = "600 13px IBM Plex Sans Condensed, sans-serif"; ctx.fillText(`normal shock  M ${fx(s.shock.M1, 2)} → ${fx(s.shock.M2, 2)}`, xs, Y(rmax * 1.15) - 4); }
  ctx.fillStyle = cssv("--muted"); ctx.font = "12px IBM Plex Sans, sans-serif"; ctx.textAlign = "left"; ctx.fillText(`P₀ ${fx(S.P0 / PSI, 1)} psia`, x0, 16);
  ctx.textAlign = "right"; ctx.fillText(`Pb ${fx(S.Pb / PSI, 2)} psia · outside flow drawn schematically`, w - 8, 16);
  const lc = $("legCanvas"), lx = lc.getContext("2d"); for (let i = 0; i < 160; i++) { lx.fillStyle = cmap(i / 159); lx.fillRect(i, 0, 1, 10); }
  const d = f.k === "M" ? 2 : (f.k === "rho" ? 3 : 1); $("legMin").textContent = fx(f.lo, d) + f.unit; $("legMax").textContent = fx(f.hi, d) + f.unit;
}
function interpR(x) { return FL.interp(S.geo.x, S.geo.r, x); }
let last = performance.now();
function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.playing && S.sol && S.tab === "simulate") { const geo = S.geo, s = S.sol, L = geo.x[geo.x.length - 1], vmax = Math.max(...s.V), Ve = s.V[s.V.length - 1];
    for (const p of S.particles) { const v = p.x <= 1 ? FL.interp(geo.x, s.V, p.x * L) : Ve * 0.9; p.x += dt * 0.45 * Math.max(v, vmax * 0.004) / vmax; if (p.x > (p.ext ? 1.38 : 1)) { p.x = 0; p.y = (Math.random() * 2 - 1) * 0.9; } } }
  drawViz(); requestAnimationFrame(tick);
}
function probeAt(cx, cy) {
  if (!view || !S.sol) return; const rect = cv.getBoundingClientRect(), mx = cx - rect.left, x = (mx - view.x0) / view.sc, geo = S.geo, s = S.sol, pr = $("probe");
  if (x < 0 || x > view.L) { pr.style.display = "none"; return; }
  const g = k => FL.interp(geo.x, s[k], x);
  pr.innerHTML = `x ${fx(x * 1000, 2)} mm · Ø ${fx(2000 * interpR(x), 2)} mm<br>M ${fx(g("M"), 3)} · V ${fx(g("V"), 1)} m/s<br>P ${fx(g("P") / PSI, 2)} psia · T ${fx(g("T"), 1)} K<br>ρ ${fx(g("rho"), 3)} kg/m³ · δ* ${fx(FL.interp(geo.x, S.real.bl.dstar, x) * 1e6, 0)} µm`;
  pr.style.display = "block"; pr.style.left = Math.min(mx + 14, rect.width - pr.offsetWidth - 6) + "px"; pr.style.top = Math.max(6, cy - rect.top - 76) + "px";
}

/* ===================== COMPARE tab ===================== */
function renderCompare() {
  const i = S.sol, r = S.real, n = i.M.length, pct = (a, b) => b === 0 ? "–" : (a / b - 1 >= 0 ? "+" : "") + fx(100 * (a / b - 1), 1) + "%";
  const rows = [["Mass flow (g/s)", i.mdot * 1000, r.mdot * 1000, 3], ["Discharge coefficient Cd", 1, r.Cd, 4], ["Exit Mach", i.M[n - 1], r.Me, 3],
    ["Exit or separation pressure (psia)", i.P[n - 1] / PSI, r.Pe / PSI, 3], ["Exit velocity (m/s)", i.V[n - 1], r.Ve, 1], ["Thrust (N)", i.F, r.F, 3], ["Thrust coefficient Cf", i.Cf, r.Cf, 4],
    ["Effective area ratio", S.geo.Ae / S.geo.At, r.epsEff, 4], ["Divergence factor λ", 1, r.lambda, 4]];
  $("cmpTable").innerHTML = `<tr><th></th><th class="n">First model (ideal)</th><th class="n">Realistic</th><th class="n">Difference</th></tr>` +
    rows.map(([k, a, b, d]) => `<tr><td>${k}</td><td class="n">${fx(a, d)}</td><td class="n">${fx(b, d)}</td><td class="n">${pct(b, a)}</td></tr>`).join("") +
    `<tr><td>Regime</td><td class="n">${REG[i.regime].name}</td><td class="n">${r.sep ? "Separated at " + fx(r.sep.frac * 100, 0) + "%" : REG[r.sol.regime].name}</td><td></td></tr>`;
  $("cmpNotes").innerHTML = [`Boundary layer: displacement thickness ${fx(r.dstarThroat * 1e6, 0)} µm at the throat and ${fx(r.dstarExit * 1e6, 0)} µm at the exit; throat Reynolds number ${r.ReThroat.toExponential(2)}.`, ...r.notes]
    .map(t => `<p class="hint" style="margin:3px 0">${t}</p>`).join("");
  const xs = S.geo.x.map(v => v * 1000), realC = cssv("--r-over"), col = cssv("--accent");
  const l1 = baseLayout("x (mm)", "P / P₀"); l1.yaxis.range = [0, 1.03];
  if (r.sep) l1.shapes = [{ type: "line", x0: r.sep.x * 1000, x1: r.sep.x * 1000, yref: "paper", y0: 0, y1: 1, line: { color: realC, width: 1.5, dash: "dot" } }];
  plot("cmpP", [{ x: xs, y: i.P.map(p => p / S.P0), name: "Ideal", mode: "lines", line: { width: 3, color: col } },
    { x: xs, y: r.Pwall.map(p => p / S.P0), name: "Realistic", mode: "lines", line: { width: 2.5, color: realC, dash: "dashdot" } }], l1);
  plot("cmpM", [{ x: xs, y: i.M, name: "Ideal", mode: "lines", line: { width: 3, color: col } },
    { x: xs, y: r.sol.M, name: "Realistic (attached)", mode: "lines", line: { width: 2.5, color: realC, dash: "dashdot" } }], baseLayout("x (mm)", "Mach number"));
  renderSaved();
}
const STORE = "flowlab.saved.v1";
function loadSaved() { try { S.saved = JSON.parse(localStorage.getItem(STORE) || "[]"); } catch (e) { S.saved = []; } }
function storeSaved() { try { localStorage.setItem(STORE, JSON.stringify(S.saved)); } catch (e) { /* storage unavailable: keep in memory */ } }
function currentSnapshot(name) {
  const i = S.sol, r = S.real, n = i.M.length;
  return { id: Date.now(), name, show: true, spec: Object.assign({}, S.spec), gasKey: S.gasKey, P0: S.P0, T0: S.T0, Pb: S.Pb, wall: S.wall, mat: $("mat").value,
    sum: { L: S.geo.x[n - 1] * 1000, eps: S.geo.Ae / S.geo.At, Me: i.M[n - 1], MeR: r.Me, reg: i.regime, mdot: i.mdot * 1000, mdotR: r.mdot * 1000, F: i.F, FR: r.F, Cd: r.Cd, sep: r.sep ? r.sep.frac : null } };
}
function renderSaved() {
  const t = $("savedTable");
  if (!S.saved.length) { t.innerHTML = `<tr><td class="hint">No saved designs yet. Name the current design and press “Save current design”.</td></tr>`; plot("savedGeo", [], baseLayout("x (mm)", "r (mm)")); plot("savedP", [], baseLayout("x (mm)", "P / P₀")); return; }
  t.innerHTML = `<tr><th>Show</th><th>Design</th><th>Shape</th><th class="n">Ae/At</th><th class="n">Length mm</th><th class="n">P₀ / Pb psia</th><th>Regime</th><th class="n">ṁ g/s ideal / real</th><th class="n">Thrust N ideal / real</th><th class="n">Exit M ideal / real</th><th></th></tr>` +
    S.saved.map((d, k) => `<tr><td><input type="checkbox" data-k="${k}" class="svShow" ${d.show ? "checked" : ""} aria-label="Show ${d.name}"></td><td>${escapeHtml(d.name)}</td><td>${d.spec.shape}</td>
      <td class="n">${fx(d.sum.eps, 3)}</td><td class="n">${fx(d.sum.L, 1)}</td><td class="n">${fx(d.P0 / PSI, 1)} / ${fx(d.Pb / PSI, 2)}</td><td>${REG[d.sum.reg].name}${d.sum.sep != null ? `, separates at ${fx(d.sum.sep * 100, 0)}%` : ""}</td>
      <td class="n">${fx(d.sum.mdot, 2)} / ${fx(d.sum.mdotR, 2)}</td><td class="n">${fx(d.sum.F, 2)} / ${fx(d.sum.FR, 2)}</td><td class="n">${fx(d.sum.Me, 3)} / ${fx(d.sum.MeR, 3)}</td>
      <td><button class="btn small svLoad" data-k="${k}">Load</button> <button class="btn small svDel" data-k="${k}">Delete</button></td></tr>`).join("");
  t.querySelectorAll(".svShow").forEach(b => b.addEventListener("change", e => { S.saved[+e.target.dataset.k].show = e.target.checked; storeSaved(); renderSavedPlots(); }));
  t.querySelectorAll(".svLoad").forEach(b => b.addEventListener("click", e => loadDesign(S.saved[+e.target.dataset.k])));
  t.querySelectorAll(".svDel").forEach(b => b.addEventListener("click", e => { S.saved.splice(+e.target.dataset.k, 1); storeSaved(); renderSaved(); }));
  renderSavedPlots();
}
function renderSavedPlots() {
  const pal = ["--accent", "--r-over", "--r-ideal", "--r-under", "--r-shock", "--r-sub"], tg = [], tp = [];
  S.saved.forEach((d, k) => { if (!d.show) return; try {
    const geo = FL.buildGeometry(d.spec, 200), gas = FL.GASES[d.gasKey], s = FL.solve(geo, d.P0, d.T0, d.Pb, gas.g, gas.R), c = cssv(pal[k % pal.length]), xs = geo.x.map(v => v * 1000);
    tg.push({ x: xs, y: geo.r.map(v => v * 1000), name: d.name, mode: "lines", line: { width: 2.5, color: c } });
    tg.push({ x: xs, y: geo.r.map(v => -v * 1000), showlegend: false, hoverinfo: "skip", mode: "lines", line: { width: 2.5, color: c } });
    tp.push({ x: xs, y: s.P.map(p => p / d.P0), name: d.name, mode: "lines", line: { width: 2.5, color: c } });
  } catch (e) { /* skip invalid saved design */ } });
  const lg = baseLayout("x (mm)", "r (mm)"); lg.yaxis.scaleanchor = "x"; plot("savedGeo", tg, lg);
  const lp = baseLayout("x (mm)", "P / P₀"); lp.yaxis.range = [0, 1.03]; plot("savedP", tp, lp);
}
function loadDesign(d) {
  setShape(d.spec.shape);
  ["Din", "Dt", "De", "alpha", "beta", "rc", "bellPct"].forEach(k => { if (Number.isFinite(d.spec[k])) $(k).value = d.spec[k]; });
  $("autoAng").checked = d.spec.autoAngles !== false; if (!$("autoAng").checked) { $("thN").value = d.spec.thetaN; $("thE").value = d.spec.thetaE; }
  $("thN").disabled = $("thE").disabled = $("autoAng").checked;
  $("gas").value = d.gasKey; $("P0").value = fx(d.P0 / PSI, 3); $("T0").value = d.T0; $("PbIn").value = fx(d.Pb / PSI, 3); $("wall").value = d.wall; if (d.mat) $("mat").value = d.mat;
  recompute(); seedParticles();
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* ===================== CHECKS tab ===================== */
const LVL = { bad: "Problem", warn: "Warning", info: "Note", ok: "OK" };
function renderChecks() {
  const cnt = k => S.checks.filter(c => c.level === k).length;
  $("checkSum").innerHTML = [["bad", "Problems"], ["warn", "Warnings"], ["info", "Notes"], ["ok", "Passed"]].map(([k, t]) => `<span class="pill" style="border-color:var(--${k})">${t} <b>${cnt(k)}</b></span>`).join("");
  const order = { bad: 0, warn: 1, info: 2, ok: 3 };
  const list = S.checks.map((c, i) => ({ c, i })).sort((a, b) => order[a.c.level] - order[b.c.level]);
  $("checkList").innerHTML = list.map(({ c, i }) => `<article class="chk" data-level="${c.level}"><header><h3>${c.title}</h3><span class="lvl">${LVL[c.level]}</span></header>
    <p>${c.detail}</p>${c.fix ? `<p class="fix">Fix: ${c.fix}</p>` : ""}${c.apply ? `<p><button class="btn small chkApply" data-i="${i}">Apply fix</button> <span class="hint">${Object.entries(c.apply).map(([k, v]) => `${k} → ${v}`).join(", ")}</span></p>` : ""}</article>`).join("");
  $("checkList").querySelectorAll(".chkApply").forEach(b => b.addEventListener("click", e => {
    const a = S.checks[+e.target.dataset.i].apply;
    for (const [k, v] of Object.entries(a)) { if (k === "beta" && S.shape !== "conical") continue; if ($(k)) $(k).value = v; }
    recompute();
  }));
}

/* ===================== LESSONS ===================== */
const LESSONS = [
  { t: "1 · Choking in a converging nozzle", tab: "simulate", set: { shape: "converging", Din: 20, Dt: 10, alpha: 20, P0: 100, T0: 300, Pb: 95 },
    steps: ["Watch the mass-flow chart as you slowly drag P<sub>b</sub> to the left.", "Find where ṁ stops rising. Compare with 0.528·P₀.", "Keep lowering P<sub>b</sub>. What happens to exit Mach and exit pressure?"],
    q: "If you halve P<sub>b</sub> from 40 to 20 psia, how much does the mass flow change?", a: "Not at all. Once the throat is sonic the flow is choked: ṁ depends only on P₀, T₀, the gas and the throat area." },
  { t: "2 · A shock walks through the nozzle", tab: "simulate", set: { shape: "conical", Din: 20, Dt: 10, De: 16.24, alpha: 20, beta: 10, rc: 1.5, P0: 100, T0: 300, Pb: 98 },
    steps: ["Start unchoked: the flow speeds up then slows down, like a venturi.", "Lower P<sub>b</sub> past the choking pressure. Where does the shock first appear?", "Keep lowering it: the shock moves downstream and the total-pressure loss grows."],
    q: "Why does the shock get stronger as it moves toward the exit?", a: "The flow ahead keeps accelerating in the diverging section, so the shock meets a higher Mach number. Normal-shock losses grow rapidly with M₁." },
  { t: "3 · Ideal vs realistic: separation", tab: "compare", set: { shape: "bell", Din: 30, Dt: 10, De: 20.58, alpha: 30, bellPct: 80, P0: 100, T0: 300, Pb: 14.7 },
    steps: ["This Mach 3 bell runs at 100 psia into the atmosphere.", "Compare the ideal and realistic wall pressure. Where does the flow separate?", "Raise P₀ in steps of 100 psia until separation disappears."],
    q: "Why can a separated nozzle make more thrust than the ideal model predicts?", a: "The ideal model keeps the flow attached all the way, so the wall pressure near the exit is far below ambient, pulling the nozzle backwards. After separation that wall sees roughly ambient pressure, which removes the negative thrust." },
  { t: "4 · Bell vs cone", tab: "compare", set: { shape: "conical", Din: 30, Dt: 10, De: 20.58, alpha: 30, beta: 15, rc: 1.5, P0: 540, T0: 300, Pb: 14.7 },
    steps: ["Save this 15° cone as “Cone M3” in Saved designs.", "Switch the shape to Bell, keep the diameters, and save it as “Bell M3”.", "Compare length, thrust and divergence factor."],
    q: "The bell is shorter. Why doesn't it lose more thrust?", a: "It turns the flow outward quickly near the throat, where the gas is dense and slow, then straightens it so the exit flow is nearly axial. Its exit angle (θe) is smaller than the cone's 15°." },
  { t: "5 · Design, check, export", tab: "design", set: { shape: "bell", Din: 30, Dt: 8, De: 16, alpha: 30, bellPct: 80, P0: 150, T0: 300, Pb: 14.7 },
    steps: ["Use “Design backwards” to size a Mach 2.5 nozzle and apply it.", "Open Check &amp; fix and clear every problem.", "Export the STL for printing and the Fluent package for CFD."],
    q: "Which check matters most before a pressurised test?", a: "Wall strength, followed by a hydrostatic proof test. A burst with compressed gas releases far more energy than with water." }
];
function buildLessons() {
  const box = $("lessons");
  LESSONS.forEach((L, i) => {
    const d = document.createElement("article"); d.className = "lesson"; d.dataset.active = "false";
    d.innerHTML = `<header><h3>${L.t}</h3><button class="btn">Set up</button></header><ol>${L.steps.map(s => `<li>${s}</li>`).join("")}</ol><details><summary>Predict, then check: ${L.q}</summary><p>${L.a}</p></details>`;
    d.querySelector("button").addEventListener("click", () => applyLesson(i)); box.appendChild(d);
  });
}
function applyLesson(i) {
  const s = LESSONS[i].set; setShape(s.shape); $("autoAng").checked = true; $("thN").disabled = $("thE").disabled = true;
  ["Din", "Dt", "De", "alpha", "beta", "rc", "bellPct", "P0", "T0"].forEach(k => { if (s[k] !== undefined) $(k).value = s[k]; });
  $("PbIn").value = s.Pb; $("gas").value = "air";
  document.querySelectorAll(".lesson").forEach((el, j) => el.dataset.active = String(j === i));
  recompute(); seedParticles(); location.hash = LESSONS[i].tab;
}

/* ===================== EXPORT ===================== */
function profileMM() {
  const g = S.geo, pts = g.x.map((x, i) => [x * 1000, g.r[i] * 1000]), out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) { const a = out[out.length - 1], b = pts[i], c = pts[i + 1]; if (Math.abs((b[1] - a[1]) * (c[0] - b[0]) - (c[1] - b[1]) * (b[0] - a[0])) > 1e-9) out.push(b); }
  out.push(pts[pts.length - 1]); return out;
}
function revolve(loop, groups, N) {
  const V = [], idx = [];
  for (const [x, r] of loop) { if (r < 1e-9) { idx.push([V.length]); V.push([x, 0, 0]); } else { const row = []; for (let k = 0; k < N; k++) { const t = 2 * Math.PI * k / N; row.push(V.length); V.push([x, r * Math.cos(t), r * Math.sin(t)]); } idx.push(row); } }
  const T = [], m = loop.length;
  for (let s = 0; s < m; s++) { const A = idx[s], B = idx[(s + 1) % m], grp = groups[s]; if (A.length === 1 && B.length === 1) continue;
    for (let k = 0; k < N; k++) { const k1 = (k + 1) % N; if (A.length === 1) T.push([A[0], B[k], B[k1], grp]); else if (B.length === 1) T.push([A[k], B[0], A[k1], grp]); else { T.push([A[k], B[k], B[k1], grp]); T.push([A[k], B[k1], A[k1], grp]); } } }
  let vol = 0; for (const t of T) { const a = V[t[0]], b = V[t[1]], c = V[t[2]]; vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; }
  if (vol < 0) for (const t of T) { const q = t[1]; t[1] = t[2]; t[2] = q; }
  return { V, T, volume: Math.abs(vol) };
}
function triNormal(a, b, c) { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1; return n.map(q => q / l); }
function wallMesh(t, N) { const p = profileMM(), outer = p.map(([x, r]) => [x, r + t]).reverse(), groups = []; for (let i = 0; i < p.length - 1; i++) groups.push("bore"); groups.push("exit_face"); for (let i = 0; i < outer.length - 1; i++) groups.push("outer"); groups.push("inlet_face"); return revolve([...p, ...outer], groups, N); }
function fluidMesh(N) { const p = profileMM(), x0 = p[0][0], xn = p[p.length - 1][0], groups = ["inlet"]; for (let i = 0; i < p.length - 1; i++) groups.push("wall"); groups.push("outlet", "axis"); return revolve([[x0, 0], ...p, [xn, 0]], groups, N); }
function stlBinary(mesh, header) {
  const n = mesh.T.length, buf = new ArrayBuffer(84 + 50 * n), dv = new DataView(buf), h = header.slice(0, 79);
  for (let i = 0; i < h.length; i++) dv.setUint8(i, h.charCodeAt(i) & 127); dv.setUint32(80, n, true); let o = 84;
  for (const t of mesh.T) { const a = mesh.V[t[0]], b = mesh.V[t[1]], c = mesh.V[t[2]]; for (const q of [triNormal(a, b, c), a, b, c]) for (const v of q) { dv.setFloat32(o, v, true); o += 4; } dv.setUint16(o, 0, true); o += 2; }
  return buf;
}
function stlAsciiNamed(mesh) {
  const f = v => v.toExponential(7), groups = [...new Set(mesh.T.map(t => t[3]))]; let s = "";
  for (const g of groups) { s += `solid ${g}\n`; for (const t of mesh.T) { if (t[3] !== g) continue; const a = mesh.V[t[0]], b = mesh.V[t[1]], c = mesh.V[t[2]], n = triNormal(a, b, c);
    s += ` facet normal ${n.map(f).join(" ")}\n  outer loop\n` + [a, b, c].map(v => `   vertex ${v.map(f).join(" ")}\n`).join("") + `  endloop\n endfacet\n`; } s += `endsolid ${g}\n`; }
  return s;
}
function dxf(lines) {
  const layers = [...new Set(lines.map(l => l[4]))], f = v => (Math.abs(v) < 1e-12 ? 0 : v).toFixed(6);
  let s = "0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n70\n" + layers.length + "\n";
  layers.forEach((L, i) => { s += `0\nLAYER\n2\n${L}\n70\n0\n62\n${i % 7 + 1}\n`; });
  s += "0\nENDTAB\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n";
  for (const [x1, y1, x2, y2, L] of lines) s += `0\nLINE\n8\n${L}\n10\n${f(x1)}\n20\n${f(y1)}\n30\n0.0\n11\n${f(x2)}\n21\n${f(y2)}\n31\n0.0\n`;
  return s + "0\nENDSEC\n0\nEOF\n";
}
function chain(pts, layer) { const o = []; for (let i = 0; i < pts.length - 1; i++) o.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], layer]); return o; }
function partDxfLines(t) { const p = profileMM(), n = p.length, outer = p.map(([x, r]) => [x, r + t]);
  return [...chain(p, "WALL_INNER"), [p[n - 1][0], p[n - 1][1], outer[n - 1][0], outer[n - 1][1], "EXIT_FACE"], ...chain(outer, "WALL_OUTER"), [p[0][0], p[0][1], outer[0][0], outer[0][1], "INLET_FACE"], [p[0][0] - 5, 0, p[n - 1][0] + 5, 0, "AXIS"]]; }
function fluentDxfLines(t, plenum) {
  const p = profileMM(), n = p.length, x0 = p[0][0], xe = p[n - 1][0], re = p[n - 1][1], L = [[x0, 0, x0, p[0][1], "INLET"], ...chain(p, "WALL")];
  if (!plenum) { L.push([xe, re, xe, 0, "OUTLET"], [xe, 0, x0, 0, "AXIS"]); return { lines: L }; }
  const De = 2 * re, Lp = 15 * De, Rp = Math.max(5 * De, re + t + 2 * De), xp = xe + Lp;
  L.push([xe, re, xe, re + t, "WALL"], [xe, re + t, xe, Rp, "FARFIELD"], [xe, Rp, xp, Rp, "FARFIELD"], [xp, Rp, xp, 0, "OUTLET"], [xp, 0, x0, 0, "AXIS"]);
  return { lines: L, Lp, Rp };
}
function download(name, data, mime) {
  try { const url = URL.createObjectURL(new Blob([data], { type: mime })), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); $("xMsg").textContent = `Downloaded ${name}.`; }
  catch (e) { $("xMsg").textContent = "This browser blocked the download. Open the site in a normal browser tab and try again."; }
}
function exportOpts() { const N = Math.round(num("xSeg")); if (!(N >= 24 && N <= 360)) throw new Error("Facets around must be between 24 and 360."); if (!S.sol) throw new Error("Fix the design errors before exporting."); return { t: S.wall, N }; }
function baseName() { const g = S.geo; return `flowlab_${g.kind}_M${fx(g.kind === "converging" ? 1 : S.sol.th.Msup, 2)}_Dt${fx(2000 * g.r[g.it], 2)}mm`; }
function guard(fn) { return () => { try { fn(); } catch (e) { $("xMsg").textContent = e.message; } }; }
function xyFile(title, ylabel, curves) {
  return `(title "${title}")\n(labels "Position (m)" "${ylabel}")\n` + curves.map(([key, xs, ys]) => `\n((xy/key/label "${key}")\n` + xs.map((x, i) => `${x.toPrecision(8)}\t${ys[i].toPrecision(8)}`).join("\n") + "\n)\n").join("");
}
function setupSheet(t, plenum) {
  const s = S.sol, r = S.real, g = S.geo, n = s.M.length, gm = S.gas.g, R = S.gas.R, cp = gm * R / (gm - 1), MW = 8314.462618 / R, th = s.th, pa = v => `${fx(v, 1)} Pa (${fx(v / PSI, 3)} psia)`, d = g.r.map(v => 2000 * v), fd = fluentDxfLines(t, plenum);
  const L = ["FLOW LAB -> ANSYS FLUENT SETUP SHEET", `Generated ${new Date().toISOString()} from ${location.origin + location.pathname}`, "",
    "GEOMETRY (2-D axisymmetric, x = axis, y = radius, mm)", `  Shape ${g.kind} | inlet D ${fx(d[0], 3)} | throat D ${fx(d[g.it], 3)} | exit D ${fx(d[n - 1], 3)} | length ${fx(1000 * g.x[n - 1], 3)} mm`,
    `  Area ratio Ae/At ${fx(g.Ae / g.At, 4)} | wall thickness (lip) ${t} mm`, plenum ? `  Exhaust plenum: ${fx(fd.Lp, 1)} mm long x ${fx(fd.Rp, 1)} mm radius` : "  No plenum: outlet is the nozzle exit plane",
    "", "GAS (ideal gas)", `  ${S.gas.name}: gamma ${gm} | R ${R} J/(kg K) | cp ${fx(cp, 2)} J/(kg K) | molecular weight ${fx(MW, 4)} kg/kmol`, "  Density: ideal-gas. Viscosity: Sutherland. Energy equation: ON.",
    "", "OPERATING CONDITIONS", "  Operating pressure: 0 Pa, so every pressure below is an absolute value.",
    "", "BOUNDARY CONDITIONS (DXF layer -> Fluent zone type)", `  INLET    -> pressure-inlet: gauge total pressure ${pa(S.P0)}, total temperature ${S.T0} K,`, `              supersonic/initial gauge pressure ${pa(s.P[0])}`,
    `  OUTLET   -> pressure-outlet: gauge pressure ${pa(S.Pb)}, backflow total temperature ${S.T0} K`, plenum ? `  FARFIELD -> pressure-outlet: gauge pressure ${pa(S.Pb)}, backflow total temperature 300 K` : null,
    "  WALL     -> wall: no slip, adiabatic", "  AXIS     -> axis",
    "", "SOLVER (starting point)", "  Density-based, steady, 2D axisymmetric. Viscous: k-omega SST (Inviscid to compare with the ideal model).",
    "  Mesh: quadrilateral, refined near throat and walls; y+ about 1 for SST. Initialise hybrid or FMG; CFL 1-5 at first.", "  Converged when residuals fall 3 orders and inlet/outlet mass flow differ by < 0.1%.",
    "", "PREDICTIONS                     IDEAL (first model)     REALISTIC", `  Regime                        ${REG[s.regime].name.padEnd(24)}${r.sep ? "separated at " + fx(r.sep.frac * 100, 0) + "% of diverging length" : REG[r.sol.regime].name}`,
    `  Mass flow (g/s, full 360°)     ${fx(s.mdot * 1000, 4).padEnd(24)}${fx(r.mdot * 1000, 4)}  (Cd ${fx(r.Cd, 4)})`, `  Exit Mach                     ${fx(s.M[n - 1], 4).padEnd(24)}${fx(r.Me, 4)}`,
    `  Exit pressure (Pa)            ${fx(s.P[n - 1], 1).padEnd(24)}${fx(r.Pe, 1)}`, `  Thrust (N)                    ${fx(s.F, 3).padEnd(24)}${fx(r.F, 3)}`,
    `  Thresholds: choking ${pa(th.Pchoke)}` + (g.kind !== "converging" ? ` | shock at exit ${pa(th.PshockExit)} | ideal expansion ${pa(th.PeIso)}` : ""),
    s.shock ? `  Ideal normal shock at x = ${fx(s.shock.x * 1000, 3)} mm: M ${fx(s.shock.M1, 3)} -> ${fx(s.shock.M2, 3)}` : null,
    "", "WHAT TO COMPARE", "  Load the .xy files (Results > Plots > XY Plot > Load File). Each holds the ideal and realistic curves.",
    "  Expect viscous CFD to sit near the realistic curve when the flow is attached, and to show separation, curved shocks and", "  2-D throat effects that neither 1-D model resolves."].filter(l => l !== null);
  return L.join("\n") + "\n";
}
function wireExports() {
  $("xPartStl").addEventListener("click", guard(() => { const { t, N } = exportOpts(), m = wallMesh(t, N); download(baseName() + "_part.stl", stlBinary(m, "Flow Lab nozzle part, units mm"), "model/stl"); $("xMsg").textContent += ` ${m.T.length} triangles, volume ${fx(m.volume / 1000, 3)} cm³.`; }));
  $("xPartDxf").addEventListener("click", guard(() => { const { t } = exportOpts(); download(baseName() + "_halfsection.dxf", dxf(partDxfLines(t)), "application/dxf"); }));
  $("xContour").addEventListener("click", guard(() => { exportOpts(); download(baseName() + "_contour.csv", "x_mm,r_mm\n" + S.geo.x.map((x, i) => `${(x * 1000).toPrecision(8)},${(S.geo.r[i] * 1000).toPrecision(8)}`).join("\n") + "\n", "text/csv"); }));
  $("xFluentDxf").addEventListener("click", guard(() => { const { t } = exportOpts(), pl = $("xPlenum").checked; download(baseName() + (pl ? "_fluent_domain_plenum.dxf" : "_fluent_domain.dxf"), dxf(fluentDxfLines(t, pl).lines), "application/dxf"); }));
  $("xFluidStl").addEventListener("click", guard(() => { const { N } = exportOpts(); download(baseName() + "_fluid.stl", stlAsciiNamed(fluidMesh(N)), "model/stl"); }));
  $("xSetup").addEventListener("click", guard(() => { const { t } = exportOpts(); download(baseName() + "_fluent_setup.txt", setupSheet(t, $("xPlenum").checked), "text/plain"); }));
  $("xXyP").addEventListener("click", guard(() => { exportOpts(); download(baseName() + "_pressure.xy", xyFile("Static Pressure", "Static Pressure (Pa)", [["Flow Lab ideal", S.geo.x, S.sol.P], ["Flow Lab realistic", S.geo.x, S.real.Pwall]]), "text/plain"); }));
  $("xXyM").addEventListener("click", guard(() => { exportOpts(); download(baseName() + "_mach.xy", xyFile("Mach Number", "Mach Number", [["Flow Lab ideal", S.geo.x, S.sol.M], ["Flow Lab realistic", S.geo.x, S.real.sol.M]]), "text/plain"); }));
  $("xFlow").addEventListener("click", guard(() => { exportOpts(); const s = S.sol, r = S.real, geo = S.geo;
    let txt = `# Flow Lab | ${geo.kind} | ${REG[s.regime].name} | P0 ${fx(S.P0 / PSI, 3)} psia | T0 ${S.T0} K | Pb ${fx(S.Pb / PSI, 3)} psia | ${S.gas.name}\n`;
    txt += "x_mm,radius_mm,area_mm2,Mach,pressure_psia,temperature_K,velocity_mps,density_kgm3,real_Mach,real_wall_pressure_psia,dstar_um\n";
    geo.x.forEach((x, i) => { txt += [x * 1000, geo.r[i] * 1000, geo.A[i] * 1e6, s.M[i], s.P[i] / PSI, s.T[i], s.V[i], s.rho[i], r.sol.M[i], r.Pwall[i] / PSI, r.bl.dstar[i] * 1e6].map(v => v.toPrecision(8)).join(",") + "\n"; });
    download(baseName() + "_flow.csv", txt, "text/csv"); }));
}

/* ===================== wiring ===================== */
window.FlowLabApp = { state: S, recompute };
function init() {
  const pickShape = sh => {
    if (sh !== "converging" && !(num("De") > num("Dt"))) $("De").value = fx(num("Dt") * 1.6, 2);
    setShape(sh); recompute(); seedParticles(); };
  ["shBell", "shCone"].forEach(id => $(id).addEventListener("click", () => pickShape($(id).dataset.shape)));
  $("tyCD").addEventListener("click", () => pickShape(S.lastCD || "bell"));
  $("tyConv").addEventListener("click", () => pickShape("converging"));
  ["Din", "Dt", "De", "alpha", "beta", "rc", "bellPct", "thN", "thE", "P0", "T0", "PbIn", "wall", "sf"].forEach(id => $(id).addEventListener("input", () => recompute()));
  ["gas", "mat", "crit"].forEach(id => $(id).addEventListener("change", () => recompute()));
  $("autoAng").addEventListener("change", () => { $("thN").disabled = $("thE").disabled = $("autoAng").checked; recompute(); });
  $("showReal").addEventListener("change", renderActive);
  $("pb").addEventListener("input", e => { if (S.segments.length) setPb(sliderToPb(+e.target.value)); });
  $("plot2Var").addEventListener("change", drawSimCharts);
  $("playBtn").addEventListener("click", () => { S.playing = !S.playing; $("playBtn").textContent = S.playing ? "Pause flow" : "Play flow"; });
  cv.addEventListener("pointermove", e => probeAt(e.clientX, e.clientY)); cv.addEventListener("pointerdown", e => probeAt(e.clientX, e.clientY)); cv.addEventListener("pointerleave", () => { $("probe").style.display = "none"; });
  ["dMode", "dVal", "dMach"].forEach(id => $(id).addEventListener("input", updateDesignCalc));
  $("dMode").addEventListener("change", () => { $("dVal").value = { M: 3, Pe: 5, mdot: 50 }[$("dMode").value]; updateDesignCalc(); });
  $("dApply").addEventListener("click", () => applyDesign(false)); $("dApplyPb").addEventListener("click", () => applyDesign(true));
  $("saveBtn").addEventListener("click", () => { if (!S.sol) return; const name = $("saveName").value.trim() || `Design ${S.saved.length + 1}`; S.saved.push(currentSnapshot(name)); storeSaved(); $("saveName").value = ""; renderSaved(); });
  window.addEventListener("resize", () => { resizeViz(); if (S.tab === "design") drawDesign(); });
  const rethemer = () => renderActive();
  const mq = window.matchMedia("(prefers-color-scheme: dark)"); if (mq.addEventListener) mq.addEventListener("change", rethemer);
  new MutationObserver(rethemer).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { S.playing = false; $("playBtn").textContent = "Play flow"; }
  wireExports(); buildLessons(); loadSaved();
  setShape("bell"); $("De").value = fx(10 * Math.sqrt(FL.areaMach(2.5, 1.4)), 2);
  recompute(); seedParticles(); showTab(); requestAnimationFrame(tick);
}
init();
