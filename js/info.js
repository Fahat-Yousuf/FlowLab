/* Flow Lab info tips: the ⓘ icons. Hover, tap or Tab to an icon to read what an item is.
 * To add one: give an element data-info="key" (or list an input id in LABEL_KEYS) and add
 * INFO[key] = [title, html]. decorate() adds the icon; the tooltip is shared. */
"use strict";
(function () {
const INFO = {
  /* ---------- sidebar: nozzle ---------- */
  type: ["Nozzle type", "A <b>converging–diverging</b> nozzle narrows to a throat, then widens. Gas reaches Mach 1 at the throat and keeps accelerating to supersonic speed in the widening part. A <b>converging-only</b> nozzle can never exceed Mach 1: it is the simplest way to see choking."],
  wallshape: ["Diverging wall shape", "<b>Bell (Rao):</b> a curved wall that turns the flow outward quickly after the throat, then straightens it. About 20% shorter than a cone with similar losses; used on most rocket engines.<br><b>Conical:</b> a straight cone. Easy to make and analyse, but longer for the same performance."],
  Din: ["Inlet diameter", "Where gas enters from the tank, plenum or combustion chamber. Make it at least about 1.7× the throat diameter (contraction ratio ≥ 3) so the inlet gas is slow and a pressure tap there reads the true supply pressure P₀."],
  Dt: ["Throat diameter", "The narrowest point. Once the flow is choked, mass flow is proportional to throat <i>area</i>, so this is the most important dimension: a 1% diameter error is a 2% flow error. Always measure the as-built throat."],
  De: ["Exit diameter", "Sets the area ratio A<sub>e</sub>/A<sub>t</sub>, which alone sets the design exit Mach number and exit pressure. A bigger exit gives faster, lower-pressure exhaust, but at sea level it can overexpand and separate."],
  alpha: ["Converging half-angle", "Angle between the wall and the axis in the converging section. 20–45° is typical. It has little effect on performance; very steep angles can make the flow separate at the inlet corner."],
  beta: ["Diverging half-angle (cone)", "Angle of the cone after the throat. 12–15° is the usual compromise: steeper cones are shorter but lose thrust because the exhaust spreads sideways (λ = (1 + cos β)/2) and separate more easily; shallower cones are long and add friction."],
  rc: ["Throat radius Rc/Rt", "Radius of the curved wall at the throat, divided by the throat radius. 0 means a sharp corner. 1–2 is recommended: a smoother sonic line, a higher discharge coefficient, lower stress and easier machining."],
  bellPct: ["Bell length", "Length of the bell's diverging section as a percentage of a 15° cone with the same area ratio. 80% is the classic choice: about 20% shorter with almost the same thrust. Shorter bells lose more."],
  autoAng: ["Automatic bell angles", "Takes θn and θe from Rao's 80% chart for your area ratio (approximate values). If those angles cannot reach the exit, Flow Lab adjusts them so the wall stays smooth."],
  thN: ["Initial wall angle θn", "How steeply the bell wall turns outward just after the throat. Larger θn expands the flow faster near the throat. Set automatically unless you untick “Automatic bell angles”."],
  thE: ["Exit wall angle θe", "The wall angle at the exit. A smaller θe makes the exhaust leave more nearly parallel to the axis, which means less divergence loss."],
  /* ---------- sidebar: gas and operating point ---------- */
  operating: ["Gas and operating point", "What flows through the nozzle and the pressures on each side of it. The ratio of supply pressure to back pressure decides which flow regime you get."],
  gas: ["Gas", "Sets γ (ratio of specific heats) and R (gas constant). Light gases like helium and hydrogen flow much faster at the same temperature. γ also changes how big the exit must be for a given Mach number."],
  P0: ["Supply total pressure P₀", "Absolute pressure of the gas at rest before the nozzle: the tank, plenum or combustion chamber. Choked mass flow and thrust are both proportional to P₀."],
  T0: ["Supply total temperature T₀", "Temperature of the gas at rest before the nozzle. Hotter gas leaves faster (velocity ∝ √T₀) but less of it flows (mass flow ∝ 1/√T₀). The gas cools a lot as it expands."],
  PbIn: ["Back pressure P<sub>b</sub>", "Absolute pressure the nozzle exhausts into: 14.7 psia at sea level, lower at altitude or in a vacuum chamber. Comparing it with P₀ decides the regime: unchoked, shock inside, over-, ideally or underexpanded."],
  /* ---------- sidebar: build and model ---------- */
  build: ["Build", "Material and wall thickness of the part you would make. Used for the wall-strength check, the part mass and the CAD exports."],
  mat: ["Material", "Typical room-temperature strength, density and maximum temperature. Check your supplier's data sheet. Plastics and aluminium are for cold-gas tests only, not hot rocket exhaust."],
  wall: ["Wall thickness", "Radial thickness added outside the inner contour. Used for the strength check (thick-wall Lamé stress), part mass, the STL part and the DXF sketch."],
  sf: ["Safety factor", "Allowable stress = yield strength ÷ safety factor. 4 is a cautious choice for 3D-printed plastic (weak layers, heat). Follow your team's standard for metal pressure parts, and proof-test before using gas."],
  realModel: ["Realistic model", "Corrections on top of the ideal theory: boundary-layer thickness, a discharge coefficient for the curved throat flow, divergence loss, and flow separation. They are engineering estimates, not CFD."],
  crit: ["Separation criterion", "When the wall pressure drops far enough below the back pressure, the flow peels off the wall. <b>Summerfield:</b> separates below 0.4 × P<sub>b</sub>. <b>Schmucker:</b> the limit depends on the local Mach number and is generally preferred."],
  showReal: ["Overlay realistic model", "Draws the realistic model (orange, dash-dot) next to the ideal model on the plots, and shows the separated region on the animation."],
  /* ---------- design tab ---------- */
  t_designM: ["Design exit Mach", "Exit Mach number when the flow is fully supersonic with no shock inside. Set only by the area ratio and γ."],
  t_eps: ["Area ratio A<sub>e</sub>/A<sub>t</sub>", "Exit area divided by throat area. The single number that decides the design exit Mach and the design exit pressure."],
  t_len: ["Length", "Axial length from inlet to exit."],
  t_diam: ["Throat and exit diameters", "The two diameters that matter most: the throat sets mass flow, and the exit (through the area ratio) sets exit Mach."],
  t_mdotI: ["Mass flow, ideal", "Gas flow rate with no losses. When choked: ṁ = A<sub>t</sub>·P₀·√(γ/(R·T₀))·(2/(γ+1))<sup>(γ+1)/(2(γ−1))</sup>."],
  t_mdotR: ["Mass flow, realistic", "Ideal mass flow × discharge coefficient C<sub>d</sub>. C<sub>d</sub> accounts for the boundary layer and the curved sonic line at the throat; real nozzles are typically 0.95–0.99."],
  t_thrustR: ["Thrust at P<sub>b</sub>, realistic", "F = λ·ṁ·V<sub>e</sub> + (P<sub>e</sub> − P<sub>b</sub>)·A<sub>e</sub>, with realistic mass flow, exit velocity and divergence factor λ. Uses the separation point instead of the exit if the flow separates."],
  t_mass: ["Part mass", "Wall volume × material density. Excludes flanges, bolts and fittings."],
  h_drawing: ["Dimensioned half-section", "A cut through the nozzle along its axis. Grey hatching is the wall, the dash-dot line is the centre axis, and blue arrows are dimensions in mm. Matches the CAD exports."],
  h_design: ["Design backwards", "Pick a target exit Mach, exit pressure or mass flow. Flow Lab sizes the throat and exit for ideal, shock-free supersonic flow at your gas, P₀ and T₀, and says how it would behave at the current back pressure."],
  /* ---------- simulate tab ---------- */
  h_pb: ["Back-pressure slider", "Each coloured band is one flow regime, given equal width so short regimes are easy to reach. Numbers under the band edges are the threshold pressures (psia). The jump buttons go straight to typical cases."],
  regime: ["Flow regime", "What kind of flow the nozzle has at this back pressure: <b>unchoked</b> (subsonic everywhere), <b>shock inside</b>, <b>overexpanded</b> (exit pressure below P<sub>b</sub>), <b>ideally expanded</b> (equal) or <b>underexpanded</b> (above)."],
  r_sub: ["Unchoked", "Back pressure is too high for the throat to reach Mach 1. The flow speeds up to the throat and slows down after it, like a venturi. Mass flow changes with P<sub>b</sub>."],
  r_shock: ["Shock inside", "The throat is choked, but the back pressure is too high for supersonic flow all the way out. A normal shock stands in the diverging section, wasting total pressure. Lower P<sub>b</sub> pushes it towards the exit."],
  r_over: ["Overexpanded", "Supersonic all the way out, but the exit pressure is below P<sub>b</sub>. Oblique shocks outside squeeze the jet. Strongly overexpanded nozzles separate inside."],
  r_under: ["Underexpanded", "The exit pressure is above P<sub>b</sub>, so the jet keeps expanding outside through expansion fans. A larger exit would turn more of that into thrust."],
  r_chokedC: ["Choked (converging)", "The exit is the throat and it is at Mach 1. Mass flow is fixed: lowering P<sub>b</sub> further changes nothing inside the nozzle."],
  h_viz: ["Animated nozzle", "Colours show the property you choose. White dots are tracer particles whose speed is scaled to the local gas velocity. An orange line marks a normal shock; a pale region near the wall marks separation (realistic model). The jet outside the exit is a sketch, not a calculation. Hover to read local values."],
  colorBy: ["Colour by", "Which property colours the inside of the nozzle. The scale next to it shows the range."],
  s_M: ["Exit Mach", "Mach number at the exit plane: gas speed divided by the local speed of sound. The small number is the realistic model, which is lower because the boundary layer shrinks the effective area ratio."],
  s_V: ["Exit velocity", "Gas speed at the exit. This is what produces thrust."],
  s_mdot: ["Mass flow", "Kilograms of gas per second through the nozzle (shown in g/s). Constant once the throat is choked."],
  s_Pe: ["Exit pressure", "Static pressure of the gas at the exit plane. Higher than P<sub>b</sub> means underexpanded, lower means overexpanded."],
  s_F: ["Thrust", "Ideal F = ṁ·V<sub>e</sub> + (P<sub>e</sub> − P<sub>b</sub>)·A<sub>e</sub>: momentum of the jet plus a pressure term. Realistic thrust also includes losses and separation."],
  s_sep: ["Separation", "Where the realistic model predicts the flow leaves the wall, as a percentage of the diverging length from the throat. Separation is unsteady and creates side loads, so avoid it in real hardware."],
  h_plotP: ["Wall pressure P/P₀", "Static pressure along the nozzle divided by supply pressure. Dotted: the limiting subsonic (choking) curve. Dashed: shock-free supersonic. Thick line: the current flow. The black bar at the right is the back pressure."],
  h_plot2: ["Along the nozzle", "Mach number, temperature, velocity or density along the nozzle. On the Mach plot the horizontal line is Mach 1; it is crossed at the throat when choked."],
  h_plotM: ["Mass flow vs back pressure", "As P<sub>b</sub> drops, mass flow rises until the throat chokes (dotted line), then stays flat: lowering the back pressure further cannot pull more gas through. The dot is the current point."],
  h_explain: ["What is happening", "A plain-language description of the current regime, with the numbers that matter, updated every time you change something."],
  /* ---------- compare tab ---------- */
  h_cmp: ["First vs realistic model", "The first model is the ideal quasi-1D theory (no friction, no losses). The realistic model adds engineering corrections. The difference column shows how much the corrections matter for this design."],
  c_mdot: ["Mass flow", "Gas flow rate. Realistic = ideal × discharge coefficient."],
  c_Cd: ["Discharge coefficient C<sub>d</sub>", "Actual mass flow ÷ ideal mass flow. Below 1 because the boundary layer narrows the throat and the sonic line at a curved throat is not flat. Typically 0.95–0.99."],
  c_Me: ["Exit Mach", "Realistic exit Mach is lower because the boundary layer reduces the effective area ratio."],
  c_Pe: ["Exit or separation pressure", "Gas pressure where it leaves the wall: at the exit, or at the separation point if the flow separates."],
  c_Ve: ["Exit velocity", "Gas speed where it leaves the wall."],
  c_F: ["Thrust", "Force produced at the current back pressure. A separated nozzle can show more thrust than the ideal model, because the separated wall no longer sees the very low overexpanded pressure that pulls backwards."],
  c_Cf: ["Thrust coefficient C<sub>f</sub>", "Thrust ÷ (P₀ × throat area). Measures how well the nozzle turns pressure into thrust, independent of size. About 1.2–1.8 for real nozzles."],
  c_eps: ["Effective area ratio", "Area ratio of the smaller nozzle the gas actually sees once the boundary-layer displacement thickness is subtracted from the wall."],
  c_lambda: ["Divergence factor λ", "Fraction of the exhaust momentum that points along the axis: (1 + cos θ)/2 for exit wall angle θ. 1 would mean perfectly parallel exhaust."],
  c_regime: ["Regime", "Flow regime from each model. The realistic model may predict separation where the ideal model does not."],
  h_cmpP: ["Wall pressure comparison", "Ideal versus realistic wall pressure. A dotted line marks the separation point, after which the realistic wall pressure rises towards P<sub>b</sub>."],
  h_cmpM: ["Mach comparison", "Ideal versus realistic Mach number along the nozzle, assuming the flow stays attached."],
  h_saved: ["Saved designs", "Save the current design under a name to compare it later. Saved designs stay in this browser only. Tick “Show” to overlay them in the plots, or “Load” to make one current again."],
  h_savedGeo: ["Wall contours", "Inner wall shapes of the ticked designs, drawn to the same scale."],
  h_savedP: ["Saved wall pressure", "Ideal wall pressure of each ticked design at its own saved operating point."],
  /* ---------- checks, python, export ---------- */
  h_checks: ["Check & fix", "Flow Lab tests the design against gas-dynamics, viscous, strength and manufacturing rules of thumb. Red items are problems, amber are warnings. “Apply fix” changes the design for you."],
  h_py: ["Python lab", "Real Python in your browser. The flowlab package here is the same engine as the website. Use it to run sweeps, print tables and make your own plots."],
  h_pyOut: ["Output", "Everything your code prints, and any error messages."],
  h_pyPlot: ["Plot", "Charts drawn from Python with flowlab.plot.line(x, {\"name\": y})."],
  h_export: ["Export", "Files generated from the current design, in millimetres. CAD files are for modelling and printing; CFD files are for ANSYS Fluent."],
  h_cad: ["CAD files", "<b>STL part:</b> a closed solid (triangles) for NX import or 3D printing. <b>DXF half-section:</b> a 2-D outline to revolve in NX for an exact, editable solid. <b>CSV:</b> wall points."],
  h_cfd: ["CFD files", "<b>2-D domain DXF:</b> the gas region for an axisymmetric Fluent run, with named boundary layers. <b>3-D fluid STL:</b> the gas volume. <b>Setup sheet:</b> boundary conditions and settings. <b>XY files:</b> Flow Lab's curves to overlay on the CFD."],
  xSeg: ["Facets around", "How many flat facets approximate the circle in the STL files. More facets make a smoother but larger file. 96 is plenty for printing."],
  xPlenum: ["Exhaust plenum", "Adds an open region downstream of the exit so CFD can show the jet, external shocks and expansion fans. Leave it off to simulate only the inside of the nozzle."]
};
const LABEL_KEYS = ["Din", "Dt", "De", "alpha", "beta", "rc", "bellPct", "autoAng", "thN", "thE", "gas", "P0", "T0", "PbIn", "mat", "wall", "sf", "crit", "showReal", "colorBy", "xSeg", "xPlenum"];

const tip = document.createElement("div");
tip.className = "tip"; tip.id = "flTip"; tip.setAttribute("role", "tooltip"); tip.hidden = true;
document.body.appendChild(tip);
let pinned = null, current = null;

function icon(key) {
  const title = (INFO[key] || [key])[0].replace(/<[^>]+>/g, "");
  return `<span class="info-i" role="button" tabindex="0" data-info="${key}" aria-label="What is ${title}?">i</span>`;
}
function decorate(root) {
  (root || document).querySelectorAll("[data-info]:not(.info-i)").forEach(el => {
    if (!INFO[el.dataset.info] || el.querySelector(":scope > .info-i")) return;
    el.insertAdjacentHTML("beforeend", " " + icon(el.dataset.info));
  });
}
function show(el) {
  const v = INFO[el.dataset.info]; if (!v) return;
  current = el;
  tip.innerHTML = `<b>${v[0]}</b><p>${v[1]}</p>`; tip.hidden = false;
  const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  let x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)), y = r.bottom + 8;
  if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 8);
  tip.style.left = x + "px"; tip.style.top = y + "px";
  el.setAttribute("aria-describedby", "flTip");
}
function hide() { tip.hidden = true; pinned = null; current = null; }

document.addEventListener("mouseover", e => { const i = e.target.closest && e.target.closest(".info-i"); if (i && !pinned) show(i); });
document.addEventListener("mouseout", e => { const i = e.target.closest && e.target.closest(".info-i"); if (i && !pinned && !(e.relatedTarget && i.contains(e.relatedTarget))) tip.hidden = true; });
document.addEventListener("focusin", e => { if (e.target.classList && e.target.classList.contains("info-i")) show(e.target); });
document.addEventListener("focusout", e => { if (e.target.classList && e.target.classList.contains("info-i") && !pinned) tip.hidden = true; });
// Click or tap pins the tip (needed on phones). Capture phase, so a click on an icon
// inside a <label> or <button> does not also operate that control.
document.addEventListener("click", e => {
  const i = e.target.closest && e.target.closest(".info-i");
  if (i) { e.preventDefault(); e.stopPropagation(); if (pinned === i) hide(); else { pinned = i; show(i); } return; }
  if (pinned && !tip.contains(e.target)) hide();
}, true);
document.addEventListener("keydown", e => {
  if (e.key === "Escape") hide();
  else if ((e.key === "Enter" || e.key === " ") && e.target.classList && e.target.classList.contains("info-i")) { e.preventDefault(); pinned = e.target; show(e.target); }
});
// While scrolling, keep the tip attached to its icon; close it once the icon leaves the screen.
window.addEventListener("scroll", () => {
  if (tip.hidden || !current) return;
  const r = current.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight || !current.isConnected) hide(); else show(current);
}, true);
window.addEventListener("resize", hide);

LABEL_KEYS.forEach(id => { const l = document.querySelector(`label[for="${id}"]`); if (l) l.dataset.info = id; });
const auto = document.getElementById("autoAng"); if (auto && auto.parentElement.tagName === "LABEL") auto.parentElement.dataset.info = "autoAng";
const plen = document.getElementById("xPlenum"); if (plen && plen.parentElement.tagName === "LABEL") plen.parentElement.dataset.info = "xPlenum";
const show2 = document.getElementById("showReal"); if (show2 && show2.parentElement.tagName === "LABEL") show2.parentElement.dataset.info = "showReal";
decorate(document);

window.FLInfo = { INFO, decorate };
})();
