// Each new plate checked against the behaviour its paper reports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SIMS, kaleidoscope as K, sectors as S } from "../assets/js/sim/sims.js";
import { makeState, mulberry32 } from "../assets/js/sim/core.js";
import * as E from "../assets/js/sim/evca.js";

const make = (def, params, seed = 1) => def.create(makeState(SIMS, { sim: def.id, params, seed }).params, seed);

/* ——— Plate IV: Nowak & May (1992) ——— */

function symmetric(s) {
  const n = K.cols;
  const at = (x, y) => s.strat[y * n + x];
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const v = at(x, y);
      if (v !== at(n - 1 - x, y) || v !== at(x, n - 1 - y) || v !== at(y, x)) return false;
    }
  }
  return true;
}

test("one defector unfolds into a pattern with the square's full symmetry", () => {
  const s = make(K, { b: 1.85, start: 0 });
  let coexisted = 0;
  for (let g = 0; g < 300; g += 1) {
    K.step(s);
    assert.ok(symmetric(s), `symmetry lost at round ${g + 1}`);
    const c = K.cooperators(s);
    if (c > 0.05 && c < 0.95) coexisted += 1;
  }
  assert.ok(coexisted > 250, "cooperators and defectors should keep coexisting");
});

test("from a random start at b = 1.85 cooperators settle near 0.32 (reported ≈ 0.318)", () => {
  const shares = [];
  for (const seed of [1, 2, 3]) {
    const s = make(K, { b: 1.85, start: 0.1 }, seed);
    for (let g = 0; g < 600; g += 1) { K.step(s); if (g >= 300) shares.push(K.cooperators(s)); }
  }
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  assert.ok(Math.abs(mean - 0.318) < 0.03, `mean cooperator share ${mean.toFixed(3)}`);
});

test("the regimes: frozen below b = 9/8, defectors dominate above b = 2", () => {
  const frozen = make(K, { b: 1.05, start: 0.1 });
  for (let g = 0; g < 200; g += 1) K.step(frozen);
  const before = Uint8Array.from(frozen.strat);
  K.step(frozen);
  assert.deepEqual(frozen.strat, before, "the lattice should be frozen");
  assert.ok(K.cooperators(frozen) > 0.9);

  const lost = make(K, { b: 2.2, start: 0.1 });
  for (let g = 0; g < 300; g += 1) K.step(lost);
  assert.ok(K.cooperators(lost) < 0.1, `cooperators ${K.cooperators(lost)}`);
});

/* ——— Plate VI: Hallatschek et al. (2007) ——— */

const grow = (params, seed) => {
  const s = make(S, { speed: 3000, ...params }, seed);
  while (!s.done) S.step(s);
  return s;
};

test("the colony grows to the rim and only ever copies existing strains", () => {
  const s = grow({ mix: 0.5, homeland: 12 }, 3);
  const values = new Set(s.cell);
  assert.ok([...values].every((v) => v === 0 || v === 1 || v === 255));
  assert.ok(S.frontRadius(s) >= S.limit - 1, `front radius ${S.frontRadius(s)}`);
});

test("sectors coarsen: fewer boundaries at the rim than near the homeland", () => {
  let near = 0;
  let rim = 0;
  for (let seed = 1; seed <= 6; seed += 1) {
    const s = grow({ mix: 0.5, homeland: 12 }, seed);
    near += S.boundariesAt(s, 15);
    rim += S.boundariesAt(s, S.limit - 6);
  }
  assert.ok(rim < near, `boundaries near homeland ${near}, at rim ${rim}`);
});

test("a larger homeland leaves more sectors at the rim (paper: set by homeland size)", () => {
  const mean = (homeland) => {
    let t = 0;
    for (let seed = 1; seed <= 8; seed += 1) t += S.boundariesAt(grow({ mix: 0.5, homeland }, seed), S.limit - 6);
    return t / 8;
  };
  const small = mean(4);
  const large = mean(30);
  assert.ok(large > small, `homeland 4: ${small}, homeland 30: ${large}`);
});

test("neutral growth: averaged over runs, a strain's share at the rim matches its share at home", () => {
  // Individual runs drift a long way (that is the point), but nothing favours
  // either strain, so the average over many colonies stays put.
  for (const mix of [0.5, 0.95]) {
    let home = 0, homeN = 0, rim = 0, rimN = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const s = grow({ mix, homeland: 12 }, seed);
      const c = S.cols >> 1;
      for (let i = 0; i < s.cell.length; i += 1) {
        if (s.cell[i] === 255) continue;
        const x = i % S.cols;
        const r = Math.hypot(x - c, (i - x) / S.cols - c);
        if (r <= 12) { home += s.cell[i]; homeN += 1; } else if (r > S.limit - 8) { rim += s.cell[i]; rimN += 1; }
      }
    }
    const diff = Math.abs(rim / rimN - home / homeN);
    assert.ok(diff < 0.1, `mix ${mix}: home ${(home / homeN).toFixed(3)}, rim ${(rim / rimN).toFixed(3)}`);
  }
});

/* ——— Plate V: Das, Mitchell & Crutchfield (1994) ——— */

test("rule tables round-trip through hex", () => {
  const t = E.ruleFromHex(E.PUBLISHED.parA.hex);
  assert.equal(E.ruleToHex(t), E.PUBLISHED.parA.hex);
  assert.throws(() => E.ruleFromHex("ABC"));
});

test("φpar reproduces its published performance P149 = 0.775", () => {
  const p = E.performance(E.ruleFromHex(E.PUBLISHED.parA.hex), { trials: 3000, seed: 11 });
  assert.ok(Math.abs(p - 0.775) < 0.025, `measured ${p}`);
});

test("GKL classifies about 0.81 of unbiased rows; local majority never succeeds", () => {
  const gkl = E.performance(E.GKL, { trials: 3000, seed: 12 });
  assert.ok(gkl > 0.78 && gkl < 0.84, `GKL measured ${gkl}`);
  assert.equal(E.performance(E.MAJORITY, { trials: 500, seed: 13 }), 0);
});

test("the GKL table encodes its definition", () => {
  // A 0 surrounded by 1s on its left becomes 1; a 1 with 0s on its right becomes 0.
  const idx = (cells) => cells.reduce((a, c) => (a << 1) | c, 0);
  assert.equal(E.GKL[idx([1, 1, 1, 0, 0, 0, 0])], 1);
  assert.equal(E.GKL[idx([1, 1, 1, 1, 0, 0, 0])], 0);
  assert.equal(E.GKL[idx([0, 0, 0, 0, 0, 0, 0])], 0);
  assert.equal(E.GKL[idx([1, 1, 1, 1, 1, 1, 1])], 1);
});

test("φpar's filtered diagram shows particles that die out as it settles", () => {
  const rows = E.spaceTime(E.ruleFromHex(E.PUBLISHED.parA.hex), E.randomIC(mulberry32(1), E.N, 0.45), 2 * E.N);
  const particles = (row) => E.filterRow(row).filter((v) => v === E.PARTICLE).length;
  assert.ok(particles(rows[10]) > 0, "particles early on");
  assert.equal(particles(rows[rows.length - 1]), 0, "a settled row has no particles");
});

test("the GA is reproducible from its seed and leaves the 'default' epoch", () => {
  const a = E.createGA(1994);
  const b = E.createGA(1994);
  const sa = E.stepGA(a);
  assert.deepEqual(E.stepGA(b), sa);
  let best = sa.best;
  for (let g = 1; g < 25; g += 1) best = Math.max(best, E.stepGA(a).best);
  assert.ok(best > 0.6, `best fitness after 25 generations: ${best}`);
});
