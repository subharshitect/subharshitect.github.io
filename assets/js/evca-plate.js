// Plate V: evolving cellular automata. Left, the space-time diagram of a
// rule on one initial configuration (raw, or filtered so only the
// "particles" between regular domains remain). Right, the run's fitness
// history. The rule shown can be the run's current best, the published
// evolved rule φpar, the hand-designed GKL rule, or local majority.

import {
  N, ruleFromHex, ruleToHex, GKL, MAJORITY, PUBLISHED, spaceTime, filterRow, randomIC, GA,
  DOMAIN_ONE, DOMAIN_CHECKER, PARTICLE,
} from "./sim/evca.js";
import { mulberry32, clampNumber, SEED_MAX } from "./sim/core.js";
import { PlateCanvas } from "./plate-canvas.js";
import { downloadCanvas } from "./download.js";

const ROWS = 149; // show the first 149 steps: a square plate

function init(root) {
  const q = (s) => root.querySelector(s);
  const el = {
    canvas: q("[data-plate-canvas]"),
    caption: q("[data-plate-caption]"),
    status: q("[data-plate-status]"),
    evolve: q("[data-evolve]"),
    restart: q("[data-restart]"),
    seed: q("[data-seed]"),
    which: q("[data-which]"),
    view: q("[data-view]"),
    newIc: q("[data-new-ic]"),
    density: q("[data-density]"),
    densityOut: q("[data-density-out]"),
    chart: q("[data-chart]"),
    gen: q("[data-gen]"),
    best: q("[data-best]"),
    epochs: q("[data-epochs]"),
    measure: q("[data-measure]"),
    measured: q("[data-measured]"),
    savePng: q("[data-save-png]"),
    copy: q("[data-copy]"),
  };

  const params = new URLSearchParams(location.search);
  const state = {
    seed: clampNumber(params.get("seed"), { min: 0, max: SEED_MAX, step: 1, default: 1994 }),
    which: params.get("rule") || "par",
    filtered: params.get("view") !== "raw",
    icSeed: 24, // a row near one half that φpar resolves inside the plate's 149 steps
    density: 0.5,
    history: [],
    runBest: null,
    running: false,
    done: false,
  };

  const plate = new PlateCanvas(el.canvas, {
    cols: N, rows: ROWS, aspect: 1,
    tones: ["specimen-domain-0", "specimen-domain-1", "specimen-domain-checker", "specimen-particle", "specimen-raw-one"],
  });

  const worker = new Worker(new URL("./evca-worker.js", import.meta.url), { type: "module" });

  function announce(t) { el.status.textContent = ""; requestAnimationFrame(() => { el.status.textContent = t; }); }

  function currentRule() {
    if (state.which === "gkl") return { table: GKL, label: "GKL (designed by hand, 1978)" };
    if (state.which === "majority") return { table: MAJORITY, label: "local majority" };
    if (state.which === "run") {
      if (state.runBest) return { table: ruleFromHex(state.runBest.rule), label: `best of this run, generation ${state.runBest.generation}` };
      return { table: ruleFromHex(PUBLISHED.parA.hex), label: `${PUBLISHED.parA.name} (no generation yet)` };
    }
    return { table: ruleFromHex(PUBLISHED.parA.hex), label: `${PUBLISHED.parA.name}, evolved by the genetic algorithm` };
  }

  function drawDiagram() {
    const { table, label } = currentRule();
    const ic = randomIC(mulberry32(state.icSeed), N, state.density);
    const rows = spaceTime(table, ic, ROWS - 1);
    const tones = new Uint8Array(N * ROWS);
    let text = "";
    rows.forEach((row, t) => {
      const f = filterRow(row);
      let line = "";
      for (let x = 0; x < N; x += 1) {
        const i = t * N + x;
        if (state.filtered) {
          tones[i] = f[x];
          line += f[x] === PARTICLE ? "@" : f[x] === DOMAIN_CHECKER ? ":" : f[x] === DOMAIN_ONE ? "#" : ".";
        } else {
          tones[i] = row[x] ? 4 : 255;
          line += row[x] ? "#" : " ";
        }
      }
      text += (t ? "\n" : "") + line;
    });
    plate.draw(text, tones);
    const ones = ic.reduce((a, b) => a + b, 0);
    const final = rows[rows.length - 1];
    const verdict = final.every((v) => v === 1) ? "settled to all 1s" : final.every((v) => v === 0) ? "settled to all 0s" : "had not settled";
    const want = 2 * ones > N ? "all 1s" : "all 0s";
    el.caption.textContent = `${label} · ${ones} of ${N} cells start as 1 (${(ones / N).toFixed(2)}), so the right answer is ${want}; after ${ROWS - 1} steps it ${verdict}.`;
    el.canvas.setAttribute("aria-label", `Space-time diagram: time runs downward for ${ROWS} steps across ${N} cells, rule ${label}. ${el.caption.textContent}`);
  }

  /* ——— fitness chart (SVG) ——— */

  const SVG = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); return n; };
  function drawChart() {
    const W = 320, H = 200, L = 34, B = 26, T = 10, Rr = 8;
    const x = (g) => L + (g / (GA.generations - 1)) * (W - L - Rr);
    const y = (f) => T + (1 - f) * (H - T - B);
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "fitness-chart", role: "img",
      "aria-label": state.history.length ? `Fitness by generation. Best so far ${Math.max(...state.history.map((h) => h.best)).toFixed(2)} after ${state.history.length} generations.` : "Fitness by generation. No generations yet." });
    for (const f of [0, 0.5, 1]) {
      svg.append(svgEl("line", { x1: L, x2: W - Rr, y1: y(f), y2: y(f), class: f === 0.5 ? "chart-ref" : "chart-grid" }));
      const t = svgEl("text", { x: L - 6, y: y(f) + 4, class: "chart-tick", "text-anchor": "end" });
      t.textContent = f.toFixed(1);
      svg.append(t);
    }
    for (const g of [0, 50, 99]) {
      const t = svgEl("text", { x: x(g), y: H - 8, class: "chart-tick", "text-anchor": "middle" });
      t.textContent = String(g);
      svg.append(t);
    }
    const ref = svgEl("text", { x: W - Rr, y: y(0.5) - 5, class: "chart-tick", "text-anchor": "end" });
    ref.textContent = "always guess one answer";
    svg.append(ref);
    const path = (key, cls) => {
      if (state.history.length < 1) return;
      const d = state.history.map((h, i) => `${i ? "L" : "M"}${x(h.generation).toFixed(1)},${y(h[key]).toFixed(1)}`).join("");
      svg.append(svgEl("path", { d, class: cls }));
    };
    path("mean", "chart-mean");
    path("best", "chart-best");
    el.chart.replaceChildren(svg);
  }

  // "Epochs of innovation": generations where the best fitness jumps.
  function renderEpochs() {
    const items = [];
    let prev = 0;
    for (const h of state.history) {
      if (h.best >= prev + 0.08) {
        items.push(h);
        prev = h.best;
      }
    }
    el.epochs.replaceChildren(...items.map((h) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-quiet";
      b.textContent = `generation ${h.generation}: fitness ${h.best.toFixed(2)}`;
      b.addEventListener("click", () => {
        state.which = "run";
        state.runBest = h;
        el.which.value = "run";
        drawDiagram();
      });
      li.append(b);
      return li;
    }));
  }

  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "generation") {
      state.history.push(m.summary);
      if (!state.runBest || m.summary.best >= state.runBest.best) state.runBest = m.summary;
      el.gen.textContent = `${m.summary.generation + 1} of ${GA.generations}`;
      el.best.textContent = `${Math.max(...state.history.map((h) => h.best)).toFixed(2)}`;
      drawChart();
      renderEpochs();
      if (state.which === "run") drawDiagram();
    } else if (m.type === "done") {
      state.running = false;
      state.done = true;
      el.evolve.textContent = "Evolve";
      announce("The run has reached the paper's 100 generations.");
    } else if (m.type === "measured") {
      el.measured.textContent = m.p.toFixed(3);
      el.measure.disabled = false;
    }
  };

  function start() {
    state.history = [];
    state.runBest = null;
    state.done = false;
    state.running = true;
    worker.postMessage({ cmd: "start", seed: state.seed });
    el.evolve.textContent = "Pause";
    drawChart();
    renderEpochs();
    syncUrl();
  }

  function syncUrl() {
    const p = new URLSearchParams({ seed: String(state.seed), rule: state.which, view: state.filtered ? "filtered" : "raw" });
    history.replaceState(null, "", `?${p}`);
  }

  el.evolve.addEventListener("click", () => {
    if (!state.history.length || state.done) { start(); announce(`Evolving from seed ${state.seed}.`); return; }
    state.running = !state.running;
    worker.postMessage({ cmd: state.running ? "resume" : "pause" });
    el.evolve.textContent = state.running ? "Pause" : "Evolve";
    announce(state.running ? "Evolving." : "Paused.");
  });
  el.restart.addEventListener("click", () => {
    state.seed = Math.floor(Math.random() * SEED_MAX);
    el.seed.value = String(state.seed);
    start();
    announce(`New run, seed ${state.seed}.`);
  });
  el.seed.value = String(state.seed);
  el.seed.addEventListener("change", () => {
    state.seed = clampNumber(el.seed.value, { min: 0, max: SEED_MAX, step: 1, default: 1994 });
    el.seed.value = String(state.seed);
    start();
  });
  el.which.value = state.which;
  el.which.addEventListener("change", () => { state.which = el.which.value; el.measured.textContent = "–"; drawDiagram(); syncUrl(); });
  el.view.setAttribute("aria-pressed", String(state.filtered));
  el.view.addEventListener("click", () => {
    state.filtered = !state.filtered;
    el.view.setAttribute("aria-pressed", String(state.filtered));
    drawDiagram();
    syncUrl();
  });
  el.newIc.addEventListener("click", () => { state.icSeed += 1; drawDiagram(); });
  el.density.addEventListener("input", () => {
    state.density = Number(el.density.value);
    el.densityOut.textContent = state.density.toFixed(2);
    drawDiagram();
  });
  el.measure.addEventListener("click", () => {
    el.measure.disabled = true;
    el.measured.textContent = "measuring…";
    worker.postMessage({ cmd: "measure", hex: ruleToHex(currentRule().table), trials: 2000, id: 1 });
  });
  el.savePng.addEventListener("click", () => downloadCanvas(`evolving-computers-${state.which}.png`, plate.compose(["Plate V. Evolving computers", el.caption.textContent.slice(0, 110)])));
  el.copy.addEventListener("click", async () => {
    const hex = ruleToHex(currentRule().table);
    try { await navigator.clipboard.writeText(hex); announce(`Rule table copied: ${hex}`); }
    catch (_e) { window.prompt("Rule table (hex):", hex); }
  });

  el.densityOut.textContent = state.density.toFixed(2);
  drawChart();
  drawDiagram();
  syncUrl();
}

const root = document.getElementById("evca");
if (root) init(root);
