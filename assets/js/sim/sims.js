// The three ASCII simulations. Each one separates state (create/step) from
// rendering (frame), so the same run can be replayed, rendered to text, or
// drawn into a PNG without touching the DOM.

import { mulberry32 } from "./core.js";

export const PALETTE = " .:-=+*#%@";
const LAST = PALETTE.length - 1;

function shade(v) {
  return PALETTE[Math.min(LAST, Math.max(0, Math.floor(v * PALETTE.length)))];
}

/* ——— Elementary cellular automaton ——— */

const CA_W = 96;
const CA_H = 40;

export const cellular = {
  id: "cellular",
  title: "Cellular automaton",
  label: "cellular",
  summary: "Each row is generated from the one above it. Change the rule to see how a simple local decision changes the whole pattern.",
  cols: CA_W,
  rows: CA_H,
  defaultSeed: 1,
  replayCap: 200000,
  stillGen: CA_H - 1,
  params: [
    { key: "rule", label: "Rule", min: 0, max: 255, step: 1, default: 90,
      help: "Which of the 256 elementary rules decides each new cell from the three above it." },
    { key: "density", label: "Starting density", min: 0, max: 1, step: 0.05, default: 0,
      help: "0 starts from one live cell. Higher values start from a random row with that share of live cells; the seed picks which ones." },
    { key: "speed", label: "Rows per second", min: 1, max: 60, step: 1, default: 12,
      help: "Only changes how fast it plays, not what it draws." },
  ],
  presets: [
    { name: "Rule 90", params: { rule: 90, density: 0 }, note: "Each cell is the XOR of its two neighbours. One live cell grows into a Sierpiński triangle." },
    { name: "Rule 30", params: { rule: 30, density: 0 }, note: "A regular left edge and an irregular interior, from one cell. Its centre column has been used as a random number generator." },
    { name: "Rule 110", params: { rule: 110, density: 0.5 }, note: "Small travelling structures that collide and interact. This rule is known to be capable of universal computation." },
    { name: "Rule 184", params: { rule: 184, density: 0.4 }, note: "A traffic model: a live cell moves right when the space ahead is empty." },
  ],
  stepsPerSecond: (p) => p.speed,
  describe(p) {
    const start = p.density > 0
      ? `a random starting row with about ${Math.round(p.density * 100)}% live cells`
      : "a single live cell";
    return `Elementary cellular automaton, rule ${p.rule}, starting from ${start}. Each new row is computed from the row above it; newer rows are drawn brighter.`;
  },
  create(params, seed) {
    const table = new Uint8Array(8);
    for (let i = 0; i < 8; i += 1) table[i] = (params.rule >>> i) & 1;
    const rows = Array.from({ length: CA_H }, () => new Uint8Array(CA_W));
    const first = rows[0];
    if (params.density > 0) {
      const rand = mulberry32(seed);
      for (let x = 0; x < CA_W; x += 1) first[x] = rand() < params.density ? 1 : 0;
    } else {
      first[CA_W >> 1] = 1;
    }
    // rows is a ring buffer: `head` is the newest row, `count` how many are filled.
    return { table, rows, head: 0, count: 1, gen: 0 };
  },
  step(s) {
    const cur = s.rows[s.head];
    const nextIndex = (s.head + 1) % CA_H;
    const next = s.rows[nextIndex];
    for (let x = 0; x < CA_W; x += 1) {
      const l = cur[(x - 1 + CA_W) % CA_W];
      const c = cur[x];
      const r = cur[(x + 1) % CA_W];
      next[x] = s.table[(l << 2) | (c << 1) | r];
    }
    s.head = nextIndex;
    if (s.count < CA_H) s.count += 1;
    s.gen += 1;
  },
  current(s) {
    return s.rows[s.head];
  },
  frame(s) {
    const lines = [];
    for (let i = 0; i < CA_H; i += 1) {
      if (i >= s.count) { lines.push(" ".repeat(CA_W)); continue; }
      const age = s.count - 1 - i; // 0 = newest
      const row = s.rows[(s.head - age + CA_H) % CA_H];
      const ch = PALETTE[LAST - Math.floor((age / CA_H) * 6)];
      let line = "";
      for (let x = 0; x < CA_W; x += 1) line += row[x] ? ch : " ";
      lines.push(line);
    }
    return lines.join("\n");
  },
};

/* ——— Gray–Scott reaction–diffusion ——— */

const GS_W = 96;
const GS_H = 72;
const GS_DU = 0.2097;
const GS_DV = 0.105;

export const grayScott = {
  id: "gray-scott",
  title: "Gray–Scott",
  label: "gray–scott",
  summary: "Two chemicals spread and react on a grid. Small changes to how fast one is fed in and removed produce spots, stripes, or mazes.",
  cols: GS_W,
  rows: GS_H,
  aspect: 1,
  defaultSeed: 7,
  replayCap: 40000,
  stillGen: 4000,
  genLabel: "step",
  params: [
    { key: "feed", label: "Feed rate (F)", min: 0.01, max: 0.09, step: 0.0001, default: 0.0367,
      help: "How quickly U is replenished. Higher feed keeps more U available for V to consume." },
    { key: "kill", label: "Kill rate (k)", min: 0.045, max: 0.07, step: 0.0001, default: 0.0649,
      help: "How quickly V is removed. Too high and V dies out; too low and it fills the grid." },
    { key: "patches", label: "Starting patches", min: 1, max: 12, step: 1, default: 4,
      help: "How many small squares of V are placed at the start; the seed decides where." },
    { key: "speed", label: "Steps per second", min: 20, max: 1200, step: 20, default: 300,
      help: "Only changes how fast it plays, not what it draws." },
  ],
  presets: [
    { name: "Mitosis", params: { feed: 0.0367, kill: 0.0649 }, note: "Spots grow, split in two, and fill the space." },
    { name: "Coral", params: { feed: 0.0545, kill: 0.062 }, note: "Branching growth that fills the grid with connected lines." },
    { name: "Maze", params: { feed: 0.029, kill: 0.057 }, note: "Lines that wind until they nearly touch." },
    { name: "Worms", params: { feed: 0.078, kill: 0.061 }, note: "Short strands that stay separate." },
  ],
  stepsPerSecond: (p) => p.speed,
  describe(p) {
    return `Gray–Scott reaction–diffusion with feed rate ${p.feed} and kill rate ${p.kill}, started from ${p.patches} patch${p.patches === 1 ? "" : "es"}. Denser characters mean more of chemical V.`;
  },
  create(params, seed) {
    const n = GS_W * GS_H;
    const u = new Float64Array(n).fill(1);
    const v = new Float64Array(n);
    const rand = mulberry32(seed);
    for (let p = 0; p < params.patches; p += 1) {
      const cx = Math.floor(rand() * GS_W);
      const cy = Math.floor(rand() * GS_H);
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          const i = ((cy + dy + GS_H) % GS_H) * GS_W + ((cx + dx + GS_W) % GS_W);
          u[i] = 0.5 + (rand() - 0.5) * 0.02;
          v[i] = 0.25 + (rand() - 0.5) * 0.02;
        }
      }
    }
    return { u, v, u2: new Float64Array(n), v2: new Float64Array(n), feed: params.feed, kill: params.kill, gen: 0 };
  },
  step(s) {
    const { u, v, u2, v2, feed, kill } = s;
    for (let y = 0; y < GS_H; y += 1) {
      const up = ((y - 1 + GS_H) % GS_H) * GS_W;
      const row = y * GS_W;
      const down = ((y + 1) % GS_H) * GS_W;
      for (let x = 0; x < GS_W; x += 1) {
        const l = (x - 1 + GS_W) % GS_W;
        const r = (x + 1) % GS_W;
        const i = row + x;
        const uu = u[i];
        const vv = v[i];
        const lapU = u[up + x] + u[down + x] + u[row + l] + u[row + r] - 4 * uu;
        const lapV = v[up + x] + v[down + x] + v[row + l] + v[row + r] - 4 * vv;
        const uvv = uu * vv * vv;
        u2[i] = Math.min(1, Math.max(0, uu + GS_DU * lapU - uvv + feed * (1 - uu)));
        v2[i] = Math.min(1, Math.max(0, vv + GS_DV * lapV + uvv - (feed + kill) * vv));
      }
    }
    s.u = u2; s.u2 = u;
    s.v = v2; s.v2 = v;
    s.gen += 1;
  },
  frame(s) {
    const lines = [];
    for (let y = 0; y < GS_H; y += 1) {
      let line = "";
      for (let x = 0; x < GS_W; x += 1) line += shade(s.v[y * GS_W + x] * 3);
      lines.push(line);
    }
    return lines.join("\n");
  },
};

/* ——— Feedforward network ——— */

const FF_W = 96;
const FF_H = 40;
const FF_LAYERS = [6, 12, 10, 6];

function ffNodes() {
  const out = [];
  for (let L = 0; L < FF_LAYERS.length; L += 1) {
    const n = FF_LAYERS[L];
    const gx = Math.round((0.08 + (L / (FF_LAYERS.length - 1)) * 0.84) * (FF_W - 1));
    const ys = [];
    for (let i = 0; i < n; i += 1) ys.push(Math.round((0.06 + (i / Math.max(n - 1, 1)) * 0.88) * (FF_H - 1)));
    out.push(ys.map((gy) => ({ gx, gy })));
  }
  return out;
}
const FF_NODES = ffNodes();

export const feedforward = {
  id: "feedforward",
  title: "Feedforward",
  label: "feedforward",
  summary: "A tiny neural network with fixed random weights, fed slowly changing inputs. Brighter lines carry more signal from one layer to the next.",
  cols: FF_W,
  rows: FF_H,
  defaultSeed: 12345,
  replayCap: Infinity, // state is a closed-form function of gen, so replay is free
  stillGen: 40,
  params: [
    { key: "unit", label: "Unit", min: 0, max: 1, step: 1, default: 0,
      options: [{ value: 0, label: "ReLU (modern)" }, { value: 1, label: "All-or-none (1943)" }],
      help: "ReLU passes on how far the total is above zero. The all-or-none unit, like McCulloch and Pitts', only fires or stays silent." },
    { key: "bias", label: "Bias", min: -0.5, max: 0.5, step: 0.01, default: 0,
      help: "Added to every unit's total. Negative values switch units off." },
    { key: "speed", label: "Input speed", min: 5, max: 120, step: 5, default: 30,
      help: "How fast the input waves change. Only affects playback." },
  ],
  presets: [
    { name: "Default", params: { bias: 0 }, note: "Roughly half of the hidden units are active at any moment." },
    { name: "Sparse", params: { bias: -0.15 }, note: "A negative bias silences most units; only strong paths survive." },
    { name: "Saturated", params: { bias: 0.3 }, note: "A positive bias keeps nearly every unit on, so the pattern changes less." },
    { name: "1943 units", params: { unit: 1, bias: 0 }, note: "All-or-none units: every node is either fully lit or dark, as in McCulloch and Pitts' model." },
  ],
  stepsPerSecond: (p) => p.speed,
  describe(p) {
    return `A feedforward network with layers of ${FF_LAYERS.join(", ")} units, ${p.unit === 1 ? "all-or-none" : "ReLU"} units and bias ${p.bias}. Inputs on the left change over time; brighter lines and nodes carry more activation.`;
  },
  create(params, seed) {
    const rand = mulberry32(seed);
    const weights = [];
    for (let L = 0; L < FF_LAYERS.length - 1; L += 1) {
      const rows = [];
      for (let j = 0; j < FF_LAYERS[L + 1]; j += 1) {
        const row = new Float64Array(FF_LAYERS[L]);
        for (let i = 0; i < row.length; i += 1) row[i] = (rand() * 2 - 1) * 0.6;
        rows.push(row);
      }
      weights.push(rows);
    }
    return { weights, bias: params.bias, unit: params.unit, gen: 0 };
  },
  step(s) {
    s.gen += 1;
  },
  activations(s) {
    let act = Array.from({ length: FF_LAYERS[0] }, (_, i) => (Math.sin(s.gen * 0.05 + i * 0.9) + 1) / 2);
    const all = [act];
    for (const layer of s.weights) {
      act = layer.map((row) => {
        let sum = s.bias;
        for (let i = 0; i < row.length; i += 1) sum += row[i] * act[i];
        if (s.unit === 1) return sum > 0 ? 1 : 0;
        return sum > 0 ? sum : 0;
      });
      const max = Math.max(...act, 1e-6);
      act = act.map((a) => a / max);
      all.push(act);
    }
    return all;
  },
  frame(s) {
    const grid = Array.from({ length: FF_H }, () => new Float64Array(FF_W));
    const acts = feedforward.activations(s);
    for (let L = 0; L < FF_NODES.length - 1; L += 1) {
      for (let i = 0; i < FF_NODES[L].length; i += 1) {
        for (let j = 0; j < FF_NODES[L + 1].length; j += 1) {
          const a = FF_NODES[L][i];
          const b = FF_NODES[L + 1][j];
          const val = acts[L][i] * acts[L + 1][j] * 0.4;
          const n = Math.max(Math.abs(b.gx - a.gx), Math.abs(b.gy - a.gy), 1);
          for (let k = 1; k < n; k += 1) {
            const gx = Math.round(a.gx + ((b.gx - a.gx) * k) / n);
            const gy = Math.round(a.gy + ((b.gy - a.gy) * k) / n);
            if (val > grid[gy][gx]) grid[gy][gx] = val;
          }
        }
      }
    }
    for (let L = 0; L < FF_NODES.length; L += 1) {
      FF_NODES[L].forEach((p, i) => { grid[p.gy][p.gx] = 0.35 + acts[L][i] * 0.65; });
    }
    return grid.map((row) => Array.from(row, shade).join("")).join("\n");
  },
};

/* ——— Spatial Prisoner's Dilemma (Nowak & May, Nature 359, 1992) ———
   Every site is a cooperator (C) or a defector (D). Each round it plays the
   game with its eight neighbours and with itself; payoffs are R = 1 for
   C meeting C, T = b for D meeting C, and 0 otherwise. Then every site, all
   at once, adopts the strategy of the highest scorer among itself and its
   eight neighbours. Scores are integer counts times 1 or b, so symmetric
   sites get bit-identical scores and the symmetry of the start is kept. */

const PD_N = 99;
const PD_C = 0;
const PD_D = 1;

export const kaleidoscope = {
  id: "kaleidoscope",
  title: "Kaleidoscopes of cooperation",
  label: "kaleidoscope",
  summary: "One defector in a sea of cooperators. Every round each site copies its most successful neighbour.",
  cols: PD_N,
  rows: PD_N,
  aspect: 1,
  defaultSeed: 1,
  replayCap: 20000,
  stillGen: 60,
  tones: ["specimen-c", "specimen-d", "specimen-new-c", "specimen-new-d"],
  params: [
    { key: "b", label: "Temptation to defect (b)", min: 1.01, max: 2.5, step: 0.01, default: 1.85,
      help: "What a defector earns from each cooperator it meets. A cooperator earns 1 from each cooperator." },
    { key: "start", label: "Starting defectors", min: 0, max: 0.9, step: 0.05, default: 0,
      help: "0 places a single defector at the centre. Higher values scatter that share of defectors at random; the seed picks where." },
    { key: "speed", label: "Rounds per second", min: 1, max: 30, step: 1, default: 8,
      help: "Only changes how fast it plays." },
  ],
  presets: [
    { name: "Kaleidoscope", params: { b: 1.85, start: 0 }, note: "A single defector at b = 1.85 unfolds into a symmetric pattern that never settles." },
    { name: "Frozen", params: { b: 1.05, start: 0.1 }, note: "Below b = 9/8 defectors stay isolated and the lattice freezes." },
    { name: "Chaos from noise", params: { b: 1.85, start: 0.1 }, note: "The same b from a random start: cooperators and defectors coexist in shifting proportions." },
    { name: "Defectors win", params: { b: 2.2, start: 0.1 }, note: "Above b = 2 cooperators can no longer hold straight fronts and are mostly wiped out." },
  ],
  stepsPerSecond: (p) => p.speed,
  genLabel: "round",
  readout: (s) => `cooperators ${(kaleidoscope.cooperators(s) * 100).toFixed(1)}%`,
  describe(p) {
    const start = p.start > 0 ? `about ${Math.round(p.start * 100)}% defectors placed at random` : "a single defector at the centre";
    return `Spatial Prisoner's Dilemma on a ${PD_N} by ${PD_N} lattice with temptation b = ${p.b}, starting from ${start}. Four colours: cooperators that stayed cooperators, defectors that stayed defectors, sites that just became cooperators, and sites that just became defectors.`;
  },
  create(params, seed) {
    const n = PD_N * PD_N;
    const strat = new Uint8Array(n);
    if (params.start > 0) {
      const rand = mulberry32(seed);
      for (let i = 0; i < n; i += 1) strat[i] = rand() < params.start ? PD_D : PD_C;
    } else {
      strat[(PD_N >> 1) * PD_N + (PD_N >> 1)] = PD_D;
    }
    return { strat, prev: Uint8Array.from(strat), next: new Uint8Array(n), score: new Float64Array(n), b: params.b, gen: 0 };
  },
  step(s) {
    const { strat, score, next, b } = s;
    for (let y = 0; y < PD_N; y += 1) {
      for (let x = 0; x < PD_N; x += 1) {
        let coop = 0; // cooperators among the 9 opponents (8 neighbours + self)
        for (let dy = -1; dy <= 1; dy += 1) {
          const row = ((y + dy + PD_N) % PD_N) * PD_N;
          for (let dx = -1; dx <= 1; dx += 1) if (strat[row + ((x + dx + PD_N) % PD_N)] === PD_C) coop += 1;
        }
        const i = y * PD_N + x;
        score[i] = strat[i] === PD_C ? coop : coop * b; // a defector's own self-game pays 0
      }
    }
    for (let y = 0; y < PD_N; y += 1) {
      for (let x = 0; x < PD_N; x += 1) {
        const i = y * PD_N + x;
        let best = score[i];
        let choice = strat[i];
        for (let dy = -1; dy <= 1; dy += 1) {
          const row = ((y + dy + PD_N) % PD_N) * PD_N;
          for (let dx = -1; dx <= 1; dx += 1) {
            const j = row + ((x + dx + PD_N) % PD_N);
            if (score[j] > best) { best = score[j]; choice = strat[j]; }
          }
        }
        next[i] = choice;
      }
    }
    s.prev.set(strat);
    strat.set(next);
    s.gen += 1;
  },
  cooperators(s) {
    let c = 0;
    for (let i = 0; i < s.strat.length; i += 1) if (s.strat[i] === PD_C) c += 1;
    return c / s.strat.length;
  },
  toneAt(s, i) {
    const now = s.strat[i];
    const was = s.prev[i];
    if (now === was) return now === PD_C ? 0 : 1;
    return now === PD_C ? 2 : 3;
  },
  frame(s) {
    const chars = ".#+@"; // stayed C, stayed D, became C, became D
    const lines = [];
    for (let y = 0; y < PD_N; y += 1) {
      let line = "";
      for (let x = 0; x < PD_N; x += 1) line += chars[kaleidoscope.toneAt(s, y * PD_N + x)];
      lines.push(line);
    }
    return lines.join("\n");
  },
  tonesOf(s) {
    const t = new Uint8Array(PD_N * PD_N);
    for (let i = 0; i < t.length; i += 1) t[i] = kaleidoscope.toneAt(s, i);
    return t;
  },
};

/* ——— Genetic sectors in an expanding colony
   (Hallatschek, Hersen, Ramanathan & Nelson, PNAS 104, 2007) ———
   Eden growth, the simple model the paper compares its colonies with: a
   circular homeland of two neutral strains, mixed at random; at each step a
   random empty site on the colony's edge is filled by a copy of a random
   occupied neighbour. Nothing favours either strain. */

const SC_N = 181;
const SC_EMPTY = 255;

export const sectors = {
  id: "sectors",
  title: "Genetic sectors",
  label: "sectors",
  summary: "A colony of two identical strains grows outward. Only the cells at the edge reproduce, and chance alone sorts them into sectors.",
  cols: SC_N,
  rows: SC_N,
  aspect: 1,
  defaultSeed: 3,
  replayCap: 30000,
  stillGen: 30000,
  tones: ["specimen-cfp", "specimen-yfp", "specimen-ring-cfp", "specimen-ring-yfp"],
  params: [
    { key: "mix", label: "Share of the first strain", min: 0.05, max: 0.95, step: 0.05, default: 0.5,
      help: "The paper grew colonies from 50:50 and 95:5 mixtures." },
    { key: "homeland", label: "Homeland radius", min: 3, max: 40, step: 1, default: 12,
      help: "Radius of the well-mixed founding droplet, in cells." },
    { key: "speed", label: "Cells per second", min: 200, max: 12000, step: 200, default: 3000,
      help: "Only changes how fast it plays." },
  ],
  presets: [
    { name: "50 : 50", params: { mix: 0.5, homeland: 12 }, note: "Equal founders. Many thin flares form at the homeland's edge and coarsen into a few sectors." },
    { name: "95 : 5", params: { mix: 0.95, homeland: 12 }, note: "A rare strain. Most of its founders are squeezed out early; only a few reach the rim." },
    { name: "Small homeland", params: { mix: 0.5, homeland: 4 }, note: "Fewer sectors survive from a smaller homeland, whatever the number of founders." },
  ],
  // A "step" is one new cell. The run ends when the colony reaches the grid's edge.
  stepsPerSecond: (p) => p.speed,
  genLabel: "cells grown",
  readout: (s) => {
    const r = sectors.frontRadius(s);
    return r > 14 ? `sector boundaries at the edge: ${sectors.boundariesAt(s, r - 3)}` : "";
  },
  describe(p) {
    return `An Eden-model colony of two neutral strains growing from a well-mixed homeland of radius ${p.homeland} cells, ${Math.round(p.mix * 100)}% of the first strain. The faint rings mark the colony's edge at regular intervals of growth.`;
  },
  create(params, seed) {
    const n = SC_N * SC_N;
    const cell = new Uint8Array(n).fill(SC_EMPTY);
    const born = new Uint32Array(n);
    const rand = mulberry32(seed);
    const c = SC_N >> 1;
    const r2 = params.homeland * params.homeland;
    for (let y = 0; y < SC_N; y += 1) {
      for (let x = 0; x < SC_N; x += 1) {
        const d2 = (x - c) ** 2 + (y - c) ** 2;
        if (d2 <= r2) cell[y * SC_N + x] = rand() < params.mix ? 0 : 1;
      }
    }
    // `time` is Eden time: every edge site divides at rate 1, so each new
    // cell advances the clock by 1 / (number of edge sites).
    const s = { cell, born, ring: new Uint8Array(n), time: 0, nextRing: sectors.ringEvery, rand, edge: [], where: new Int32Array(n).fill(-1), gen: 0, done: false };
    for (let i = 0; i < n; i += 1) if (cell[i] === SC_EMPTY && sectors.hasNeighbour(s, i)) sectors.addEdge(s, i);
    return s;
  },
  limit: (SC_N >> 1) - 2,
  hasNeighbour(s, i) {
    const x = i % SC_N;
    const y = (i - x) / SC_N;
    return (x > 0 && s.cell[i - 1] !== SC_EMPTY) || (x < SC_N - 1 && s.cell[i + 1] !== SC_EMPTY)
      || (y > 0 && s.cell[i - SC_N] !== SC_EMPTY) || (y < SC_N - 1 && s.cell[i + SC_N] !== SC_EMPTY);
  },
  addEdge(s, i) {
    const c = SC_N >> 1;
    const x = i % SC_N;
    const y = (i - x) / SC_N;
    if ((x - c) ** 2 + (y - c) ** 2 > sectors.limit ** 2) return; // the plate's rim
    if (s.where[i] >= 0) return;
    s.where[i] = s.edge.length;
    s.edge.push(i);
  },
  removeEdge(s, i) {
    const k = s.where[i];
    const last = s.edge.pop();
    if (last !== i) { s.edge[k] = last; s.where[last] = k; }
    s.where[i] = -1;
  },
  step(s) {
    s.gen += 1;
    if (!s.edge.length) { s.done = true; return; }
    const i = s.edge[Math.floor(s.rand() * s.edge.length)];
    const x = i % SC_N;
    const nb = [];
    if (x > 0 && s.cell[i - 1] !== SC_EMPTY) nb.push(i - 1);
    if (x < SC_N - 1 && s.cell[i + 1] !== SC_EMPTY) nb.push(i + 1);
    if (i >= SC_N && s.cell[i - SC_N] !== SC_EMPTY) nb.push(i - SC_N);
    if (i < SC_N * (SC_N - 1) && s.cell[i + SC_N] !== SC_EMPTY) nb.push(i + SC_N);
    s.cell[i] = s.cell[nb[Math.floor(s.rand() * nb.length)]];
    s.born[i] = s.gen;
    s.time += 1 / s.edge.length;
    if (s.time >= s.nextRing) { sectors.markRing(s); s.nextRing += sectors.ringEvery; }
    sectors.removeEdge(s, i);
    for (const j of [i - 1, i + 1, i - SC_N, i + SC_N]) {
      if (j < 0 || j >= s.cell.length) continue;
      if (Math.abs((j % SC_N) - x) > 1) continue;
      if (s.cell[j] === SC_EMPTY) sectors.addEdge(s, j);
    }
  },
  // Strain changes met walking once around the colony at radius r: the
  // number of sector boundaries crossing that circle.
  boundariesAt(s, r) {
    const c = SC_N >> 1;
    const steps = Math.max(64, Math.round(2 * Math.PI * r * 2));
    let prev = -1;
    let first = -1;
    let count = 0;
    for (let k = 0; k <= steps; k += 1) {
      const a = (2 * Math.PI * k) / steps;
      const v = s.cell[Math.round(c + r * Math.sin(a)) * SC_N + Math.round(c + r * Math.cos(a))];
      if (v === SC_EMPTY) continue;
      if (first < 0) first = v;
      if (prev >= 0 && v !== prev) count += 1;
      prev = v;
    }
    return count;
  },
  // Rough radius of the colony's front: mean distance of the edge sites.
  frontRadius(s) {
    if (!s.edge.length) return sectors.limit;
    const c = SC_N >> 1;
    let sum = 0;
    for (const i of s.edge) { const x = i % SC_N; const y = (i - x) / SC_N; sum += Math.hypot(x - c, y - c); }
    return sum / s.edge.length;
  },
  // Growth rings, like the lines in the paper's figures that record where
  // the front was at regular times: every `ringEvery` units of Eden time,
  // take the front's mean radius in each of 96 directions, smooth it, and
  // mark the lattice sites on that curve.
  ringEvery: 4.5,
  markRing(s) {
    const BINS = 96;
    const c = SC_N >> 1;
    const sum = new Float64Array(BINS);
    const cnt = new Uint32Array(BINS);
    for (const i of s.edge) {
      const x = i % SC_N;
      const y = (i - x) / SC_N;
      const b = Math.floor(((Math.atan2(y - c, x - c) + Math.PI) / (2 * Math.PI)) * BINS) % BINS;
      sum[b] += Math.hypot(x - c, y - c);
      cnt[b] += 1;
    }
    const raw = Array.from(sum, (v, b) => (cnt[b] ? v / cnt[b] : NaN));
    const radius = raw.map((_, b) => {
      let t = 0;
      let w = 0;
      for (let d = -3; d <= 3; d += 1) {
        const v = raw[(b + d + BINS) % BINS];
        if (Number.isFinite(v)) { t += v; w += 1; }
      }
      return w ? t / w : NaN;
    });
    for (let k = 0; k < BINS * 8; k += 1) {
      const a = (k / (BINS * 8)) * 2 * Math.PI - Math.PI;
      const r = radius[Math.floor(((a + Math.PI) / (2 * Math.PI)) * BINS) % BINS];
      if (!Number.isFinite(r) || r > sectors.limit) continue;
      const x = Math.round(c + r * Math.cos(a));
      const y = Math.round(c + r * Math.sin(a));
      s.ring[y * SC_N + x] = 1;
    }
  },
  toneAt(s, i) {
    const v = s.cell[i];
    if (v === SC_EMPTY) return 255;
    return s.ring[i] ? v + 2 : v;
  },
  frame(s) {
    const lines = [];
    for (let y = 0; y < SC_N; y += 1) {
      let line = "";
      for (let x = 0; x < SC_N; x += 1) {
        const t = sectors.toneAt(s, y * SC_N + x);
        line += t === 255 ? " " : "oxOX"[t]; // strains o / x; on a growth ring O / X
      }
      lines.push(line);
    }
    return lines.join("\n");
  },
  tonesOf(s) {
    const t = new Uint8Array(SC_N * SC_N);
    for (let i = 0; i < t.length; i += 1) t[i] = sectors.toneAt(s, i);
    return t;
  },
};

export const SIMS = {
  [cellular.id]: cellular,
  [grayScott.id]: grayScott,
  [feedforward.id]: feedforward,
  [kaleidoscope.id]: kaleidoscope,
  [sectors.id]: sectors,
};
export const SIM_ORDER = [feedforward.id, grayScott.id, cellular.id, kaleidoscope.id, sectors.id];
