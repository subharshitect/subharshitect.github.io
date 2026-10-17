import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  loadTrace, timeScale, eventsAt, counterAt, windowAround, busyTime, formatTime, ticks,
} from "../assets/js/trace-model.js";

const tiny = () => ({
  format: "sr-trace",
  v: 1,
  title: "tiny",
  duration: 120,
  lanes: ["CPU", "GPU", "Memory"],
  labels: ["a", "b", "c"],
  eventFields: ["lane", "start", "duration", "label"],
  events: [[1, 10, 18, 0], [1, 30, 5, 1], [0, 0, 50, 2], [1, 32, 4, 2]],
  counters: [{ lane: "Memory", unit: "MiB", label: "allocated", points: [[0, 100], [40, 120], [90, 110]] }],
  annotations: [{ event: 1, title: "second", text: "t2" }, { event: 0, title: "first", text: "t1" }],
});

test("loadTrace expands rows and orders annotations by time", () => {
  const t = loadTrace(tiny());
  assert.equal(t.events.length, 4);
  assert.deepEqual(t.events[0], { index: 0, lane: 1, start: 10, duration: 18, end: 28, label: "a" });
  assert.deepEqual(t.annotations.map((a) => a.title), ["first", "second"]);
  assert.deepEqual(t.annotations.map((a) => a.order), [0, 1]);
  assert.deepEqual(t.byLane[1].map((e) => e.start), [10, 30, 32]);
  assert.equal(t.counters[0].min, 100);
  assert.equal(t.counters[0].max, 120);
});

test("loadTrace rejects broken references", () => {
  const bad = (mut) => { const d = tiny(); mut(d); return () => loadTrace(d); };
  assert.throws(bad((d) => { d.format = "x"; }), /not an sr-trace/);
  assert.throws(bad((d) => { d.v = 2; }), /unsupported version/);
  assert.throws(bad((d) => { d.events[0][0] = 9; }), /unknown lane/);
  assert.throws(bad((d) => { d.events[0][1] = -1; }), /bad start/);
  assert.throws(bad((d) => { d.events[0][3] = 99; }), /unknown label/);
  assert.throws(bad((d) => { d.annotations[0].event = 99; }), /missing event/);
  assert.throws(bad((d) => { d.counters[0].lane = "Disk"; }), /unknown lane/);
});

test("timeScale maps time to pixels and back", () => {
  const x = timeScale([10, 30], [0, 1000]);
  assert.equal(x(10), 0);
  assert.equal(x(30), 1000);
  assert.equal(x(20), 500);
  assert.equal(x.invert(250), 15);
  assert.equal(x.invert(x(17.25)), 17.25);
});

test("eventsAt uses half-open intervals and handles overlap", () => {
  const t = loadTrace(tiny());
  const gpu = t.byLane[1];
  assert.deepEqual(eventsAt(gpu, 10).map((e) => e.label), ["a"]);
  assert.deepEqual(eventsAt(gpu, 28).map((e) => e.label), [], "end is exclusive");
  assert.deepEqual(eventsAt(gpu, 33).map((e) => e.label), ["b", "c"]);
  assert.deepEqual(eventsAt(gpu, 5), []);
  assert.deepEqual(eventsAt([], 5), []);
});

test("counterAt holds the last sample", () => {
  const pts = loadTrace(tiny()).counters[0].points;
  assert.equal(counterAt(pts, -1), null);
  assert.equal(counterAt(pts, 0), 100);
  assert.equal(counterAt(pts, 39.9), 100);
  assert.equal(counterAt(pts, 40), 120);
  assert.equal(counterAt(pts, 1000), 110);
});

test("windowAround stays inside the trace", () => {
  const ev = { start: 1, duration: 2 };
  const [a, b] = windowAround(ev, 100);
  assert.ok(a >= 0 && b <= 100 && a < 1 && b > 3);
  const [c, d] = windowAround({ start: 99, duration: 1 }, 100);
  assert.equal(d, 100);
  assert.ok(c < 99);
});

test("busyTime counts only the overlapping part", () => {
  const gpu = loadTrace(tiny()).byLane[1];
  assert.equal(busyTime(gpu, 0, 120), 18 + 5 + 4);
  assert.equal(busyTime(gpu, 20, 31), 8 + 1);
});

test("formatTime switches to microseconds below 1 ms", () => {
  assert.equal(formatTime(0.0238), "23.8 µs");
  assert.equal(formatTime(0.0019), "1.90 µs");
  assert.equal(formatTime(6.9397), "6.940 ms");
  assert.equal(formatTime(65.3694), "65.37 ms");
  assert.equal(formatTime(NaN), "–");
  assert.equal(formatTime(0), "0 ms");
});

test("ticks are evenly spaced round numbers", () => {
  assert.deepEqual(ticks(0, 65.4, 6), [0, 10, 20, 30, 40, 50, 60]);
  assert.deepEqual(ticks(9.5, 16.6, 6), [10, 11, 12, 13, 14, 15, 16]);
  assert.deepEqual(ticks(5, 5), [5]);
});

test("the published example trace loads and its notes match the measurements", () => {
  const doc = JSON.parse(readFileSync(new URL("../data/traces/opt125m-decode.json", import.meta.url)));
  const t = loadTrace(doc);
  const steps = t.byLane[t.lanes.indexOf("Steps")];
  const gpu = t.byLane[t.lanes.indexOf("GPU kernels")];
  assert.equal(steps.length, 9);
  for (const s of steps.slice(1)) {
    const kernels = gpu.filter((k) => k.start >= s.start && k.start < s.end);
    assert.equal(kernels.length, 207, `${s.label} kernel count`);
    const share = busyTime(gpu, s.start, s.end) / s.duration;
    assert.ok(share > 0.08 && share < 0.12, `${s.label}: GPU busy share ${share.toFixed(3)} (note says roughly a tenth)`);
    assert.ok(Math.abs(s.duration - 6.9) < 0.15, `${s.label} duration ${s.duration}`);
  }
  assert.equal(t.annotations.length, 6);
  assert.ok(JSON.stringify(doc).length < 200_000, "the browser should load a compact extract");
});
