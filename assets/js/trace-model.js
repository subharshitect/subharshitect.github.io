// Pure trace logic for /experiments/trace.html: loading and validating the
// compact format written by tools/trace_extract.py, time ↔ pixel mapping,
// and the questions the viewer asks ("what is running at time t?").
// No DOM here, so tests/trace.test.mjs can import it.

export const TRACE_FORMAT = "sr-trace";

function fail(msg) {
  throw new Error(`Trace file: ${msg}`);
}

// Expand the row-based file into event objects and check every reference.
export function loadTrace(doc) {
  if (!doc || doc.format !== TRACE_FORMAT) fail("not an sr-trace document");
  if (doc.v !== 1) fail(`unsupported version ${doc.v}`);
  const { lanes, labels } = doc;
  if (!Array.isArray(lanes) || !lanes.length) fail("no lanes");
  if (!Array.isArray(labels)) fail("no label table");
  const fields = doc.eventFields || ["lane", "start", "duration", "label"];
  const at = Object.fromEntries(fields.map((f, i) => [f, i]));
  const events = doc.events.map((row, i) => {
    const lane = row[at.lane];
    const start = row[at.start];
    const duration = row[at.duration];
    const label = labels[row[at.label]];
    if (!Number.isInteger(lane) || lane < 0 || lane >= lanes.length) fail(`event ${i} has an unknown lane`);
    if (!(Number.isFinite(start) && start >= 0)) fail(`event ${i} has a bad start`);
    if (!(Number.isFinite(duration) && duration >= 0)) fail(`event ${i} has a bad duration`);
    if (typeof label !== "string") fail(`event ${i} has an unknown label`);
    return { index: i, lane, start, duration, end: start + duration, label };
  });
  const annotations = (doc.annotations || []).map((a, i) => {
    const ev = events[a.event];
    if (!ev) fail(`annotation ${i} points at a missing event`);
    return { index: i, event: ev, title: String(a.title || ""), text: String(a.text || "") };
  }).sort((x, y) => x.event.start - y.event.start || x.event.lane - y.event.lane);
  annotations.forEach((a, i) => { a.order = i; });
  const counters = (doc.counters || []).map((c) => {
    const lane = lanes.indexOf(c.lane);
    if (lane < 0) fail(`counter for unknown lane ${c.lane}`);
    const points = c.points.map(([t, v]) => ({ t, v })).sort((a, b) => a.t - b.t);
    const values = points.map((p) => p.v);
    return { lane, unit: c.unit, label: c.label, points, min: Math.min(...values), max: Math.max(...values) };
  });
  const byLane = lanes.map((_, i) => events.filter((e) => e.lane === i).sort((a, b) => a.start - b.start));
  const duration = Number.isFinite(doc.duration) ? doc.duration : Math.max(...events.map((e) => e.end));
  return {
    title: String(doc.title || "Trace"),
    unit: doc.timeUnit || "ms",
    duration,
    lanes,
    context: doc.context || {},
    events,
    byLane,
    annotations,
    counters,
  };
}

// Linear map from a time window to pixels, with its inverse.
export function timeScale([t0, t1], [x0, x1]) {
  const span = t1 - t0 || 1;
  const k = (x1 - x0) / span;
  const toX = (t) => x0 + (t - t0) * k;
  toX.invert = (x) => t0 + (x - x0) / k;
  return toX;
}

// Events on one lane covering time t. Lanes are sorted by start, so binary
// search for the last event starting at or before t, then walk back over the
// (rare) overlapping ones.
export function eventsAt(laneEvents, t) {
  let lo = 0;
  let hi = laneEvents.length - 1;
  let last = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (laneEvents[mid].start <= t) { last = mid; lo = mid + 1; } else hi = mid - 1;
  }
  const out = [];
  for (let i = last; i >= 0 && i > last - 64; i -= 1) {
    const e = laneEvents[i];
    if (e.start <= t && t < e.end) out.push(e);
  }
  return out.reverse();
}

// Value of a step-wise counter at time t (the last sample at or before t).
export function counterAt(points, t) {
  let lo = 0;
  let hi = points.length - 1;
  let found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) { found = points[mid]; lo = mid + 1; } else hi = mid - 1;
  }
  return found ? found.v : null;
}

// Window around an event for "zoom to this", clamped to the trace.
export function windowAround(event, total, pad = 3) {
  const span = Math.max(event.duration, total / 2000) * (1 + 2 * pad);
  const mid = event.start + event.duration / 2;
  let t0 = mid - span / 2;
  let t1 = mid + span / 2;
  if (t0 < 0) { t1 -= t0; t0 = 0; }
  if (t1 > total) { t0 = Math.max(0, t0 - (t1 - total)); t1 = total; }
  return [t0, t1];
}

// Busy time of a lane inside [t0, t1): sum of the overlapping parts. Useful
// for statements like "the GPU is busy for a tenth of this step".
export function busyTime(laneEvents, t0, t1) {
  let sum = 0;
  for (const e of laneEvents) {
    if (e.end <= t0 || e.start >= t1) continue;
    sum += Math.min(e.end, t1) - Math.max(e.start, t0);
  }
  return sum;
}

// Human-readable time: microseconds below 1 ms, otherwise milliseconds.
export function formatTime(ms) {
  if (!Number.isFinite(ms)) return "–";
  if (ms === 0) return "0 ms";
  const a = Math.abs(ms);
  if (a < 1) return `${(ms * 1000).toFixed(a < 0.01 ? 2 : 1)} µs`;
  if (a < 10) return `${ms.toFixed(3)} ms`;
  return `${ms.toFixed(2)} ms`;
}

// Evenly spaced "nice" tick values for an axis.
export function ticks(t0, t1, target = 6) {
  const span = t1 - t0;
  if (!(span > 0)) return [t0];
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(t0 / step) * step; v <= t1 + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}
