/* Flow Lab Python lab: runs the flowlab package in the browser with Pyodide. */
"use strict";
(function () {
  const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
  const FILES = ["__init__.py", "isentropic.py", "geometry.py", "solver.py", "realistic.py", "plot.py"];
  const el = id => document.getElementById(id);
  let py = null, loading = null;

  const SNIPPETS = {
    "Quick start: solve the current design": `from flowlab import *

# 'design' is created by "Insert current design" (or use your own numbers)
geo = build_geometry(**design["geometry"])
sol = solve(geo, design["P0"], design["T0"], design["Pb"], design["gamma"], design["R"])

print("Regime:", sol.regime_name)
print(f"Exit Mach {sol.M[-1]:.3f}, mass flow {sol.mdot*1000:.2f} g/s, thrust {sol.F:.2f} N")
print(sol.table(geo, every=30))
plot.line([x*1000 for x in geo.x], {"Mach": sol.M}, title="Mach number", xlabel="x (mm)", ylabel="M")
`,
    "Ideal vs realistic": `from flowlab import *

geo = build_geometry(**design["geometry"])
print(compare(geo, design["P0"], design["T0"], design["Pb"], design["gas"]))

r = realistic(geo, design["P0"], design["T0"], design["Pb"], design["gas"])
x = [v*1000 for v in geo.x]
plot.line(x, {"ideal": [p/design["P0"] for p in r["ideal"].P],
              "realistic": [p/design["P0"] for p in r["Pwall"]]},
          title="Wall pressure", xlabel="x (mm)", ylabel="P/P0")
`,
    "Area–Mach table": `from flowlab import *

g = 1.4
print(" Mach     A/A*     P/P0     T/T0")
for M in [0.2, 0.5, 0.8, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0]:
    print(f"{M:5.2f} {area_mach(M, g):8.4f} {pressure_ratio(M, g):8.5f} {temperature_ratio(M, g):8.4f}")

Ms = [0.1 + 0.02*i for i in range(200)]
plot.line(Ms, {"A/A*": [area_mach(M, g) for M in Ms]}, title="Area–Mach relation", xlabel="Mach", ylabel="A/A*")
`,
    "Back-pressure sweep": `from flowlab import *

geo = build_geometry(**design["geometry"])
P0, T0, g, R = design["P0"], design["T0"], design["gamma"], design["R"]
ratios = [0.02 + 0.01*i for i in range(97)]
mdot, Me = [], []
for pr in ratios:
    s = solve(geo, P0, T0, pr*P0, g, R)
    mdot.append(s.mdot*1000); Me.append(s.M[-1])
th = thresholds(geo, g, P0)
print("Choking below Pb/P0 =", round(th["Pchoke"]/P0, 4))
plot.line(ratios, {"mass flow (g/s)": mdot, "exit Mach x 100": [m*100 for m in Me]},
          title="Back-pressure sweep", xlabel="Pb/P0", ylabel="")
`,
    "Design a Mach 3 nozzle": `from flowlab import *

g, R, P0, T0 = 1.4, 287.05, 100*PSI, 300
Me = 3.0
eps = area_mach(Me, g)
Dt = 10.0                       # mm
De = Dt * eps**0.5
Pe = P0 * pressure_ratio(Me, g)
print(f"Area ratio {eps:.4f}, exit diameter {De:.3f} mm, design exit pressure {Pe/PSI:.3f} psia")
print(f"P0 needed for ideal expansion into 14.7 psia: {14.696*PSI/pressure_ratio(Me, g)/PSI:.0f} psia")

for shape in ["conical", "bell"]:
    geo = build_geometry(shape, Din=30, Dt=Dt, De=De, alpha=30, beta=15, rc=1.5)
    print(f"\\n{shape}: length {geo.length*1000:.1f} mm")
    print(compare(geo, 540*PSI, T0, 14.696*PSI, "air"))
`,
    "Compare gases": `from flowlab import *

geo = build_geometry(**design["geometry"])
for key in ["air", "he", "h2", "co2"]:
    gas = GASES[key]
    s = solve(geo, design["P0"], design["T0"], design["Pb"], gas["g"], gas["R"])
    print(f"{gas['name']:9s} exit M {s.M[-1]:.3f}  V {s.V[-1]:7.1f} m/s  mdot {s.mdot*1000:7.2f} g/s  thrust {s.F:6.2f} N")
`
  };

  function out(text, cls) {
    const o = el("pyOut"), span = document.createElement("span");
    if (cls) span.className = cls;
    span.textContent = text; o.appendChild(span); o.scrollTop = o.scrollHeight;
  }
  function status(t) { el("pyStatus").textContent = t; }

  // Called from Python: flowlab.plot.line(...)
  window.flowlabPlot = function (json) {
    const d = JSON.parse(json), css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const pal = ["--accent", "--r-over", "--r-ideal", "--r-under", "--r-shock"];
    const traces = Object.entries(d.series).map(([name, y], i) => ({ x: d.x, y, name, mode: "lines", line: { width: 2.5, color: css(pal[i % pal.length]) } }));
    const line = css("--line"), muted = css("--muted");
    Plotly.react("pyPlot", traces, { margin: { l: 56, r: 12, t: 30, b: 44 }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      title: { text: d.title, font: { size: 14 } }, font: { family: "IBM Plex Sans, sans-serif", size: 12, color: css("--ink") },
      xaxis: { title: { text: d.xlabel, font: { color: muted } }, gridcolor: line, zerolinecolor: line },
      yaxis: { title: { text: d.ylabel, font: { color: muted } }, gridcolor: line, zerolinecolor: line },
      legend: { orientation: "h", y: -0.3 } }, { displayModeBar: false, responsive: true });
  };

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Could not download Python (Pyodide). Check your internet connection.")); document.head.appendChild(s); });
  }
  async function ensurePython() {
    if (py) return py;
    if (loading) return loading;
    loading = (async () => {
      status("Downloading Python (first time only)…");
      await loadScript(PYODIDE + "pyodide.js");
      const p = await loadPyodide({ indexURL: PYODIDE });
      p.setStdout({ batched: t => out(t + "\n") });
      p.setStderr({ batched: t => out(t + "\n", "err") });
      status("Loading the flowlab package…");
      p.FS.mkdirTree("/home/pyodide/flowlab");
      for (const f of FILES) {
        const r = await fetch("python/flowlab/" + f);
        if (!r.ok) throw new Error("Could not load flowlab/" + f);
        p.FS.writeFile("/home/pyodide/flowlab/" + f, await r.text());
      }
      await p.runPythonAsync("import sys\nsys.path.insert(0, '/home/pyodide')\nimport flowlab\nprint('flowlab', flowlab.__version__, 'ready')");
      py = p; status("Python ready."); return p;
    })();
    try { return await loading; } catch (e) { loading = null; status("Python failed to load."); throw e; }
  }

  function designCode() {
    const S = window.FlowLabApp.state, sp = S.spec, gm = S.gas;
    const geo = { shape: sp.shape, Din: sp.Din, Dt: sp.Dt, alpha: sp.alpha };
    if (sp.shape !== "converging") geo.De = sp.De;
    if (sp.shape === "conical") { geo.beta = sp.beta; geo.rc = sp.rc; }
    if (sp.shape === "bell") { geo.bell_pct = sp.bellPct; if (!sp.autoAngles) { geo.theta_n = sp.thetaN; geo.theta_e = sp.thetaE; } }
    const pyval = v => typeof v === "string" ? JSON.stringify(v) : String(v);
    return `# Current design from the website (pressures in Pa, temperature in K, diameters in mm)
design = {
    "geometry": {${Object.entries(geo).map(([k, v]) => `"${k}": ${pyval(v)}`).join(", ")}},
    "P0": ${S.P0}, "T0": ${S.T0}, "Pb": ${S.Pb},
    "gas": "${S.gasKey}", "gamma": ${gm.g}, "R": ${gm.R},
}
`;
  }
  function loadSnippet(name) {
    let code = SNIPPETS[name];
    if (code.includes("design[")) code = designCode() + "\n" + code;
    el("pyCode").value = code;
  }
  async function run() {
    const code = el("pyCode").value;
    el("pyOut").textContent = ""; el("pyRun").disabled = true;
    try {
      const p = await ensurePython();
      status("Running…");
      await p.runPythonAsync(code);
      status("Done.");
    } catch (e) {
      out(String(e.message || e).split("\n").filter(l => !l.includes("_pyodide") && !l.includes("pyodide.asm")).join("\n") + "\n", "err");
      status("Error. See the output.");
    } finally { el("pyRun").disabled = false; }
  }

  function init() {
    const sel = el("pySnip");
    Object.keys(SNIPPETS).forEach(k => { const o = document.createElement("option"); o.textContent = k; sel.appendChild(o); });
    loadSnippet(Object.keys(SNIPPETS)[0]);
    el("pyLoadSnip").addEventListener("click", () => loadSnippet(sel.value));
    el("pyDesign").addEventListener("click", () => {
      const t = el("pyCode"), code = t.value.replace(/^# Current design from the website[\s\S]*?\n}\n\n?/, "");
      t.value = designCode() + "\n" + code;
    });
    el("pyRun").addEventListener("click", run);
    el("pyCode").addEventListener("keydown", e => {
      if (e.key === "Tab") { e.preventDefault(); const t = e.target, s = t.selectionStart; t.value = t.value.slice(0, s) + "    " + t.value.slice(t.selectionEnd); t.selectionStart = t.selectionEnd = s + 4; }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    });
    // Start downloading Python in the background the first time the tab is opened.
    const warm = () => { if (location.hash === "#python") ensurePython().catch(e => out(e.message + "\n", "err")); };
    window.addEventListener("hashchange", warm); warm();
  }
  init();
})();
