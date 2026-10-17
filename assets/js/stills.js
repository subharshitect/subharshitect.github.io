// Still frames for the specimens catalogue: each <canvas data-still="id">
// gets one settled frame of its plate. Nothing here animates.

import { SIMS } from "./sim/sims.js";
import { makeState, restore, mulberry32 } from "./sim/core.js";
import { N, PUBLISHED, ruleFromHex, spaceTime, filterRow, randomIC } from "./sim/evca.js";
import { PlateCanvas } from "./plate-canvas.js";

function simStill(canvas, def) {
  const params = JSON.parse(canvas.dataset.params || "{}");
  const state = makeState(SIMS, { sim: def.id, params, seed: canvas.dataset.seed, gen: Number(canvas.dataset.gen) || def.stillGen });
  const { sim } = restore(def, state);
  new PlateCanvas(canvas, { cols: def.cols, rows: def.rows, aspect: def.aspect || 1.8, tones: def.tones })
    .draw(def.frame(sim), def.tonesOf ? def.tonesOf(sim) : null);
}

function evcaStill(canvas) {
  const rows = spaceTime(ruleFromHex(PUBLISHED.parA.hex), randomIC(mulberry32(24), N, 0.5), 148);
  const tones = new Uint8Array(N * rows.length);
  let text = "";
  rows.forEach((row, t) => {
    const f = filterRow(row);
    let line = "";
    for (let x = 0; x < N; x += 1) { tones[t * N + x] = f[x]; line += f[x] === 3 ? "@" : "."; }
    text += (t ? "\n" : "") + line;
  });
  new PlateCanvas(canvas, { cols: N, rows: rows.length, aspect: 1, tones: ["specimen-domain-0", "specimen-domain-1", "specimen-domain-checker", "specimen-particle"] })
    .draw(text, tones);
}

// A tiny drawing of the trace: steps on top, GPU kernel occupancy below.
async function traceStill(canvas) {
  const res = await fetch(canvas.dataset.src);
  const doc = await res.json();
  const cols = 120;
  const lanes = [doc.lanes.indexOf("Steps"), doc.lanes.indexOf("CPU: PyTorch ops"), doc.lanes.indexOf("GPU kernels")];
  const busy = lanes.map(() => new Float64Array(cols));
  const scale = cols / doc.duration;
  for (const [lane, start, dur] of doc.events) {
    const k = lanes.indexOf(lane);
    if (k < 0) continue;
    const a = start * scale;
    const b = (start + dur) * scale;
    for (let c = Math.floor(a); c < Math.min(cols, Math.ceil(b)); c += 1) busy[k][c] += Math.min(b, c + 1) - Math.max(a, c);
  }
  const palette = " .:-=+*#%@";
  const lines = [];
  busy.forEach((row) => {
    const line = Array.from(row, (v) => palette[Math.min(9, Math.round(Math.min(1, v) * 9))]).join("");
    for (let r = 0; r < 6; r += 1) lines.push(line);
    lines.push(" ".repeat(cols));
  });
  new PlateCanvas(canvas, { cols, rows: lines.length, aspect: 1.8 }).draw(lines.join("\n"));
}

document.querySelectorAll("canvas[data-still]").forEach((canvas) => {
  const id = canvas.dataset.still;
  try {
    if (id === "evca") evcaStill(canvas);
    else if (id === "trace") traceStill(canvas).catch(() => {});
    else if (SIMS[id]) simStill(canvas, SIMS[id]);
  } catch (_e) { /* a still is decoration; the card reads without it */ }
});
