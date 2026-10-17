// Pure simulation plumbing: seeded randomness, parameter validation,
// URL state, saved-state validation and replay. No DOM access here, so
// tests/sim.test.mjs can import it directly under node.

export const STATE_VERSION = 1;
export const SEED_MAX = 999999;
export const GEN_MAX = 10_000_000;

// mulberry32: small, fast, and identical across JS engines.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function decimalsOf(step) {
  const s = String(step);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

// Parse, clamp to [min, max] and snap to the step grid. Anything that is not
// a finite number falls back to the default.
export function clampNumber(raw, spec) {
  if (raw === null || raw === undefined || raw === "") return spec.default;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return spec.default;
  const c = Math.min(spec.max, Math.max(spec.min, n));
  const k = Math.round((c - spec.min) / spec.step);
  const snapped = Math.min(spec.max, spec.min + k * spec.step);
  return Number(snapped.toFixed(decimalsOf(spec.step)));
}

const SEED_SPEC = { min: 0, max: SEED_MAX, step: 1, default: 1 };
const GEN_SPEC = { min: 0, max: GEN_MAX, step: 1, default: 0 };

export function normalizeParams(sim, raw = {}) {
  const out = {};
  for (const p of sim.params) out[p.key] = clampNumber(raw[p.key], p);
  return out;
}

// A normalized description of a run: everything needed to rebuild it.
export function makeState(registry, { sim, seed, params, gen } = {}) {
  const def = registry[sim];
  if (!def) return null;
  return {
    v: STATE_VERSION,
    sim: def.id,
    seed: clampNumber(seed, { ...SEED_SPEC, default: def.defaultSeed }),
    params: normalizeParams(def, params),
    gen: clampNumber(gen, GEN_SPEC),
  };
}

export function encodeState(state, { includeGen = true } = {}) {
  const q = new URLSearchParams();
  q.set("sim", state.sim);
  q.set("seed", String(state.seed));
  for (const [k, v] of Object.entries(state.params)) q.set(k, String(v));
  if (includeGen && state.gen > 0) q.set("gen", String(state.gen));
  return q.toString();
}

// Returns null when the query does not name a known simulation, so callers can
// fall back to their own default.
export function decodeState(search, registry) {
  const q = new URLSearchParams(search);
  const sim = q.get("sim");
  if (!sim || !registry[sim]) return null;
  const params = {};
  for (const p of registry[sim].params) params[p.key] = q.get(p.key);
  return makeState(registry, { sim, seed: q.get("seed"), params, gen: q.get("gen") });
}

// Rebuild a simulation at a generation by replaying from the seed. Replay is
// capped per simulation so a hostile or huge `gen` cannot hang the page.
export function restore(def, state) {
  const s = def.create(state.params, state.seed);
  const target = Math.min(state.gen, def.replayCap);
  for (let i = 0; i < target; i += 1) def.step(s);
  return { sim: s, reached: target, capped: state.gen > target };
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const THUMB_PREFIX = "data:image/png;base64,";
const THUMB_MAX = 60000;

// Validate one saved state from localStorage or an imported file. Returns a
// clean copy, or null if it cannot be used. Unknown fields are dropped.
export function migrateSaved(raw, registry) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw.v === undefined ? 1 : raw.v;
  if (v !== 1) return null; // only one format exists so far; newer ones are refused
  const base = makeState(registry, raw);
  if (!base) return null;
  if (typeof raw.id !== "string" || !ID_RE.test(raw.id)) return null;
  const savedAt = typeof raw.savedAt === "string" && !Number.isNaN(Date.parse(raw.savedAt))
    ? new Date(raw.savedAt).toISOString()
    : null;
  if (!savedAt) return null;
  const name = typeof raw.name === "string" ? raw.name.trim().slice(0, 80) : "";
  const thumb = typeof raw.thumb === "string" && raw.thumb.startsWith(THUMB_PREFIX) && raw.thumb.length <= THUMB_MAX
    ? raw.thumb
    : "";
  return { ...base, id: raw.id, name, savedAt, thumb };
}

export const SAVES_FORMAT = "sr-sim-saves";

export function parseSavesFile(text, registry) {
  let data;
  try { data = JSON.parse(text); } catch (_e) { return { saves: [], skipped: 0, error: "That file is not valid JSON." }; }
  if (!data || data.format !== SAVES_FORMAT || !Array.isArray(data.saves)) {
    return { saves: [], skipped: 0, error: "That file is not a saved-experiments export." };
  }
  if (typeof data.v === "number" && data.v > STATE_VERSION) {
    return { saves: [], skipped: 0, error: "That file was made by a newer version of this page." };
  }
  const saves = [];
  let skipped = 0;
  for (const item of data.saves) {
    const s = migrateSaved(item, registry);
    if (s) saves.push(s); else skipped += 1;
  }
  return { saves, skipped, error: null };
}

export function serializeSaves(saves) {
  return JSON.stringify({ format: SAVES_FORMAT, v: STATE_VERSION, saves }, null, 2);
}
