// Evolving cellular automata for density classification, after
// Mitchell, Crutchfield & Das (Das, Mitchell & Crutchfield, PPSN III, 1994;
// Crutchfield, Mitchell & Das, "The evolutionary design of collective
// computation in cellular automata", 1998, arXiv:adap-org/9809001).
//
// One-dimensional, binary, radius r = 3 (7-cell neighbourhood, 128-entry
// rule table), periodic lattice of N = 149 cells. A rule succeeds on an
// initial configuration if within 2N steps it settles to all 1s when the
// initial density is above 1/2, and to all 0s otherwise.
//
// GA as in the paper: 100 rules, fitness on 100 fresh density-uniform
// initial conditions per generation, the best 20 copied unchanged, 80
// offspring by single-point crossover of two elite parents (chosen with
// replacement) followed by per-bit mutation with probability 0.016.
// Pure module: no DOM, so the tests and the Web Worker import it directly.

import { mulberry32 } from "./core.js";

export const R = 3;
export const NEIGH = 2 * R + 1;
export const TABLE = 1 << NEIGH; // 128
export const N = 149;
export const T_MAX = 2 * N;

export const GA = { population: 100, ics: 100, elite: 20, mutation: 0.016, generations: 100 };

// Rule tables print as 32 hex digits; the leftmost bit is the output for
// neighbourhood 0000000, then lexicographic order (paper, Table 2 notes).
export function ruleFromHex(hex) {
  const clean = hex.replace(/\s+/g, "");
  if (!/^[0-9A-Fa-f]{32}$/.test(clean)) throw new Error("a rule is 32 hex digits");
  const t = new Uint8Array(TABLE);
  for (let d = 0; d < 32; d += 1) {
    const v = parseInt(clean[d], 16);
    for (let b = 0; b < 4; b += 1) t[d * 4 + b] = (v >> (3 - b)) & 1;
  }
  return t;
}

export function ruleToHex(t) {
  let s = "";
  for (let d = 0; d < 32; d += 1) {
    let v = 0;
    for (let b = 0; b < 4; b += 1) v = (v << 1) | t[d * 4 + b];
    s += v.toString(16).toUpperCase();
  }
  return s;
}

// The best evolved rule reported in the paper (Table 2), φpar. A second
// published rule did not reproduce its reported performance from the table
// as retrieved, so it is left out.
export const PUBLISHED = {
  parA: { hex: "0504058605000F77037755877BFFB77F", name: "φpar", p149: 0.775 },
};

// Index of a neighbourhood: bit 6 is the leftmost cell (x−3), bit 0 the rightmost (x+3).
function tableFrom(fn) {
  const t = new Uint8Array(TABLE);
  for (let i = 0; i < TABLE; i += 1) {
    const cell = (k) => (i >> (6 - (k + 3))) & 1; // k in −3..3
    t[i] = fn(cell);
  }
  return t;
}

// Gacs–Kurdyumov–Levin (1978), the classic hand-designed rule: a 0 takes the
// majority of itself and the cells 1 and 3 to its left; a 1 takes the
// majority of itself and the cells 1 and 3 to its right.
export const GKL = tableFrom((c) => {
  const maj = (a, b, d) => (a + b + d >= 2 ? 1 : 0);
  return c(0) === 0 ? maj(c(0), c(-1), c(-3)) : maj(c(0), c(1), c(3));
});

// Local majority of the 7 cells: the "obvious" rule, which fails completely.
export const MAJORITY = tableFrom((c) => {
  let s = 0;
  for (let k = -3; k <= 3; k += 1) s += c(k);
  return s >= 4 ? 1 : 0;
});

// One synchronous step on a periodic lattice. Returns the number of cells
// that changed, so callers can stop at fixed points.
export function stepCA(rule, cur, next) {
  const n = cur.length;
  let idx = 0;
  for (let k = -R; k <= R; k += 1) idx = (idx << 1) | cur[(k + n) % n];
  let changed = 0;
  for (let x = 0; x < n; x += 1) {
    const v = rule[idx];
    next[x] = v;
    if (v !== cur[x]) changed += 1;
    idx = ((idx << 1) | cur[(x + R + 1) % n]) & (TABLE - 1);
  }
  return changed;
}

// Run to a fixed point or T_MAX steps. Returns 1 if the rule classified
// the configuration correctly.
export function classify(rule, ic, steps = 2 * ic.length) {
  const n = ic.length;
  let ones = 0;
  for (let i = 0; i < n; i += 1) ones += ic[i];
  const want = 2 * ones > n ? 1 : 0;
  let a = Uint8Array.from(ic);
  let b = new Uint8Array(n);
  for (let t = 0; t < steps; t += 1) {
    const changed = stepCA(rule, a, b);
    [a, b] = [b, a];
    if (!changed) break;
  }
  for (let i = 0; i < n; i += 1) if (a[i] !== want) return 0;
  return 1;
}

// Initial conditions: "unbiased" flips a fair coin per cell (densities
// cluster near 1/2, the hard cases); "uniform" first draws the density
// uniformly from [0, 1], as the GA does.
export function randomIC(rand, n = N, density = 0.5) {
  const ic = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) ic[i] = rand() < density ? 1 : 0;
  return ic;
}

export function uniformIC(rand, n = N) {
  return randomIC(rand, n, rand());
}

// Performance P_N: share of unbiased random ICs classified correctly.
export function performance(rule, { trials = 1000, n = N, seed = 1 } = {}) {
  const rand = mulberry32(seed);
  let ok = 0;
  for (let i = 0; i < trials; i += 1) ok += classify(rule, randomIC(rand, n));
  return ok / trials;
}

/* ——— the genetic algorithm ——— */

export function randomRule(rand) {
  // Density-uniform initial population: each rule's share of 1s is uniform.
  const p = rand();
  const t = new Uint8Array(TABLE);
  for (let i = 0; i < TABLE; i += 1) t[i] = rand() < p ? 1 : 0;
  return t;
}

export function createGA(seed) {
  const rand = mulberry32(seed);
  const pop = Array.from({ length: GA.population }, () => randomRule(rand));
  return { rand, pop, generation: 0, history: [], best: null, bestFitness: 0 };
}

// Evaluate the population on fresh ICs, record the best, breed the next
// generation. Returns the generation's summary.
export function stepGA(ga) {
  const ics = Array.from({ length: GA.ics }, () => uniformIC(ga.rand));
  const scored = ga.pop.map((rule) => {
    let ok = 0;
    for (const ic of ics) ok += classify(rule, ic);
    return { rule, fitness: ok / ics.length };
  });
  scored.sort((x, y) => y.fitness - x.fitness);
  const elite = scored.slice(0, GA.elite).map((s) => s.rule);
  const mean = scored.reduce((s, x) => s + x.fitness, 0) / scored.length;
  const summary = { generation: ga.generation, best: scored[0].fitness, mean, rule: ruleToHex(scored[0].rule) };
  ga.history.push(summary);
  ga.best = scored[0].rule;
  ga.bestFitness = scored[0].fitness;

  const next = elite.map((r) => Uint8Array.from(r));
  while (next.length < GA.population) {
    const p1 = elite[Math.floor(ga.rand() * elite.length)];
    const p2 = elite[Math.floor(ga.rand() * elite.length)];
    const cut = 1 + Math.floor(ga.rand() * (TABLE - 1));
    const child = new Uint8Array(TABLE);
    for (let i = 0; i < TABLE; i += 1) {
      child[i] = i < cut ? p1[i] : p2[i];
      if (ga.rand() < GA.mutation) child[i] ^= 1;
    }
    next.push(child);
  }
  ga.pop = next;
  ga.generation += 1;
  return summary;
}

/* ——— space-time diagrams ——— */

// Rows of the lattice over time, from one initial configuration.
export function spaceTime(rule, ic, steps) {
  const rows = [Uint8Array.from(ic)];
  let a = Uint8Array.from(ic);
  let b = new Uint8Array(ic.length);
  for (let t = 0; t < steps; t += 1) {
    stepCA(rule, a, b);
    [a, b] = [b, a];
    rows.push(Uint8Array.from(a));
  }
  return rows;
}

// Domain filter for the regular domains of φpar: all 0s, all 1s and the
// checkerboard (01)*. A cell inside one of them is labelled with its domain;
// anything else is a boundary between domains, a "particle".
export const DOMAIN_ZERO = 0;
export const DOMAIN_ONE = 1;
export const DOMAIN_CHECKER = 2;
export const PARTICLE = 3;

export function filterRow(row) {
  const n = row.length;
  const out = new Uint8Array(n);
  for (let x = 0; x < n; x += 1) {
    const l = row[(x - 1 + n) % n];
    const c = row[x];
    const r = row[(x + 1) % n];
    if (l === c && c === r) out[x] = c ? DOMAIN_ONE : DOMAIN_ZERO;
    else if (l !== c && c !== r) out[x] = DOMAIN_CHECKER;
    else out[x] = PARTICLE;
  }
  return out;
}
