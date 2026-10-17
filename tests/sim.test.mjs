import { test } from "node:test";
import assert from "node:assert/strict";
import { SIMS, cellular, grayScott, feedforward } from "../assets/js/sim/sims.js";
import {
  mulberry32, clampNumber, makeState, encodeState, decodeState, restore,
  migrateSaved, parseSavesFile, serializeSaves, GEN_MAX,
} from "../assets/js/sim/core.js";

const frameAt = (sim, params, gen, seed) => {
  const def = SIMS[sim];
  return def.frame(restore(def, makeState(SIMS, { sim, params, gen, seed })).sim);
};

/* ——— determinism ——— */

test("mulberry32 is deterministic and seed-sensitive", () => {
  const a = mulberry32(42); const b = mulberry32(42); const c = mulberry32(43);
  const xs = Array.from({ length: 5 }, a);
  assert.deepEqual(xs, Array.from({ length: 5 }, b));
  assert.notDeepEqual(xs, Array.from({ length: 5 }, c));
  xs.forEach((x) => assert.ok(x >= 0 && x < 1));
});

test("rule 90 from one cell matches Pascal's triangle mod 2", () => {
  const W = cellular.cols; const c = W >> 1;
  const s = cellular.create({ rule: 90, density: 0, speed: 12 }, 1);
  for (let n = 1; n < c; n += 1) {
    cellular.step(s);
    const row = cellular.current(s);
    for (let k = -n; k <= n; k += 1) {
      // C(n, m) is odd iff (m & n) === m (Lucas); cell c+k is alive iff n+k is even and C(n, (n+k)/2) is odd.
      const m = (n + k) / 2;
      const alive = Number.isInteger(m) && (m & n) === m ? 1 : 0;
      assert.equal(row[c + k], alive, `n=${n} k=${k}`);
    }
  }
});

test("rule 30 matches its boolean definition: left XOR (centre OR right)", () => {
  const W = cellular.cols;
  const s = cellular.create({ rule: 30, density: 0.5, speed: 12 }, 99);
  let ref = Array.from(cellular.current(s));
  for (let n = 0; n < 200; n += 1) {
    cellular.step(s);
    ref = ref.map((_, x) => ref[(x - 1 + W) % W] ^ (ref[x] | ref[(x + 1) % W]));
    assert.deepEqual(Array.from(cellular.current(s)), ref, `generation ${n + 1}`);
  }
});

test("every simulation is reproducible from its seed", () => {
  for (const def of Object.values(SIMS)) {
    const gen = Math.min(300, def.replayCap);
    const a = frameAt(def.id, {}, gen, 1234);
    assert.equal(a, frameAt(def.id, {}, gen, 1234), def.id);
    const lines = a.split("\n");
    assert.equal(lines.length, def.rows, `${def.id} rows`);
    lines.forEach((l) => assert.equal(l.length, def.cols, `${def.id} cols`));
  }
});

test("seeds change randomised starts", () => {
  assert.notEqual(frameAt("gray-scott", {}, 500, 1), frameAt("gray-scott", {}, 500, 2));
  assert.notEqual(frameAt("cellular", { density: 0.5 }, 10, 1), frameAt("cellular", { density: 0.5 }, 10, 2));
  assert.notEqual(frameAt("feedforward", {}, 10, 1), frameAt("feedforward", {}, 10, 2));
});

test("gray–scott mitosis preset actually forms a pattern", () => {
  const f = frameAt("gray-scott", { feed: 0.0367, kill: 0.0649 }, 3000, 7);
  const dense = [...f].filter((ch) => ch === "@" || ch === "%").length;
  assert.ok(dense > 100, `expected spots, got ${dense} dense cells`);
});

test("feedforward bias switches units off", () => {
  const live = (bias) => {
    const s = feedforward.create({ bias, speed: 30 }, 12345);
    s.gen = 40;
    return feedforward.activations(s).slice(1, -1).flat().filter((a) => a > 0).length;
  };
  assert.ok(live(-0.3) < live(0), "negative bias should leave fewer active hidden units");
  assert.ok(live(0.4) >= live(0));
});

/* ——— parameters and URL state ——— */

test("clampNumber parses, clamps and snaps to the step", () => {
  const spec = { min: 0, max: 1, step: 0.05, default: 0.2 };
  assert.equal(clampNumber("0.33", spec), 0.35);
  assert.equal(clampNumber(5, spec), 1);
  assert.equal(clampNumber(-1, spec), 0);
  assert.equal(clampNumber("abc", spec), 0.2);
  assert.equal(clampNumber(null, spec), 0.2);
  assert.equal(clampNumber("", spec), 0.2);
  assert.equal(clampNumber(Infinity, spec), 0.2);
  assert.equal(clampNumber(0.03674, { min: 0.01, max: 0.09, step: 0.0001, default: 0 }), 0.0367);
});

test("every default and preset value sits on its parameter's step grid", () => {
  // Otherwise the in-memory state and the same state decoded from a link differ.
  for (const def of Object.values(SIMS)) {
    for (const p of def.params) assert.equal(clampNumber(p.default, p), p.default, `${def.id}.${p.key} default`);
    for (const preset of def.presets) {
      for (const [k, v] of Object.entries(preset.params)) {
        const p = def.params.find((x) => x.key === k);
        assert.ok(p, `${def.id} preset ${preset.name} sets unknown ${k}`);
        assert.equal(clampNumber(v, p), v, `${def.id} preset ${preset.name}.${k}`);
      }
    }
    const fresh = makeState(SIMS, { sim: def.id });
    assert.deepEqual(decodeState(encodeState(fresh), SIMS), fresh, `${def.id} default state round-trips`);
  }
});

test("URL state round-trips for every simulation", () => {
  for (const def of Object.values(SIMS)) {
    const params = Object.fromEntries(def.params.map((p) => [p.key, p.max]));
    const s = makeState(SIMS, { sim: def.id, seed: 4242, params, gen: 777 });
    assert.deepEqual(decodeState(`?${encodeState(s)}`, SIMS), s, def.id);
    const noGen = decodeState(encodeState(s, { includeGen: false }), SIMS);
    assert.equal(noGen.gen, 0);
  }
});

test("decoding a link reproduces the same frame", () => {
  const s = makeState(SIMS, { sim: "gray-scott", seed: 31, params: { feed: 0.029, kill: 0.057 }, gen: 1200 });
  const back = decodeState(encodeState(s), SIMS);
  assert.equal(grayScott.frame(restore(grayScott, back).sim), grayScott.frame(restore(grayScott, s).sim));
});

test("hostile URLs are clamped, not trusted", () => {
  assert.equal(decodeState("sim=nope&seed=1", SIMS), null);
  assert.equal(decodeState("", SIMS), null);
  const s = decodeState("sim=cellular&rule=9999&density=-3&seed=1e12&gen=-5", SIMS);
  assert.equal(s.params.rule, 255);
  assert.equal(s.params.density, 0);
  assert.equal(s.seed, 999999);
  assert.equal(s.gen, 0);
  assert.equal(decodeState(`sim=cellular&gen=${1e15}`, SIMS).gen, GEN_MAX);
  assert.equal(decodeState("sim=cellular&rule=<script>", SIMS).params.rule, cellular.params[0].default);
});

test("replay is capped so huge generations cannot hang the page", () => {
  const s = makeState(SIMS, { sim: "gray-scott", gen: GEN_MAX });
  const r = restore(grayScott, { ...s, gen: grayScott.replayCap + 10 });
  assert.equal(r.reached, grayScott.replayCap);
  assert.equal(r.capped, true);
  assert.equal(restore(grayScott, { ...s, gen: 10 }).capped, false);
});

/* ——— saved and imported states ——— */

const good = () => ({
  v: 1, id: "abc-123", name: " my rule 30 ", sim: "cellular", seed: 5,
  params: { rule: 30, density: 0, speed: 12 }, gen: 40,
  savedAt: "2026-10-17T10:00:00.000Z", thumb: "data:image/png;base64,AAAA",
});

test("a valid save survives validation, trimmed", () => {
  const s = migrateSaved(good(), SIMS);
  assert.equal(s.name, "my rule 30");
  assert.equal(s.params.rule, 30);
  assert.equal(s.thumb, "data:image/png;base64,AAAA");
});

test("invalid saves are rejected or sanitised", () => {
  assert.equal(migrateSaved(null, SIMS), null);
  assert.equal(migrateSaved([], SIMS), null);
  assert.equal(migrateSaved({ ...good(), v: 2 }, SIMS), null, "newer format");
  assert.equal(migrateSaved({ ...good(), sim: "x" }, SIMS), null, "unknown sim");
  assert.equal(migrateSaved({ ...good(), id: "../etc" }, SIMS), null, "bad id");
  assert.equal(migrateSaved({ ...good(), savedAt: "yesterday" }, SIMS), null, "bad date");
  assert.equal(migrateSaved({ ...good(), thumb: "javascript:alert(1)" }, SIMS).thumb, "", "unsafe thumbnail dropped");
  assert.equal(migrateSaved({ ...good(), params: { rule: 4000 } }, SIMS).params.rule, 255);
  assert.equal(migrateSaved({ ...good(), name: "x".repeat(500) }, SIMS).name.length, 80);
  const legacy = { ...good() };
  delete legacy.v;
  assert.ok(migrateSaved(legacy, SIMS), "missing version is treated as v1");
});

test("export → import round-trips and reports skipped items", () => {
  const saves = [migrateSaved(good(), SIMS)];
  const back = parseSavesFile(serializeSaves(saves), SIMS);
  assert.equal(back.error, null);
  assert.deepEqual(back.saves, saves);

  const mixed = JSON.stringify({ format: "sr-sim-saves", v: 1, saves: [good(), { junk: true }, 7] });
  const r = parseSavesFile(mixed, SIMS);
  assert.equal(r.saves.length, 1);
  assert.equal(r.skipped, 2);

  assert.match(parseSavesFile("{nope", SIMS).error, /not valid JSON/);
  assert.match(parseSavesFile('{"format":"other","saves":[]}', SIMS).error, /not a saved-experiments export/);
  assert.match(parseSavesFile('{"format":"sr-sim-saves","v":9,"saves":[]}', SIMS).error, /newer version/);
});
