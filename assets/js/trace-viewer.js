// Annotated inference trace. A guided sequence of notes, an SVG timeline
// with one lane per resource, a time cursor, and a text table of the same
// key events. Selection works by click, keyboard, the prev/next buttons or
// the table; nothing depends on hover.

import { loadTrace, timeScale, eventsAt, counterAt, windowAround, formatTime, ticks } from "./trace-model.js";

const root = document.getElementById("trace");
if (root) init(root).catch((err) => {
  const msg = root.querySelector("[data-trace-error]");
  msg.hidden = false;
  msg.textContent = `The trace could not be loaded (${err.message}).`;
});

const SVG_NS = "http://www.w3.org/2000/svg";
const W = 1000;
const LANE_H = 34;
const LANE_GAP = 22;
const AXIS_H = 26;

function svg(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

async function init(root) {
  const res = await fetch(root.dataset.src);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const trace = loadTrace(await res.json());
  const q = (sel) => root.querySelector(sel);
  const el = {
    context: q("[data-trace-context]"),
    note: q("[data-trace-note]"),
    noteCount: q("[data-trace-count]"),
    noteTitle: q("[data-trace-note-title]"),
    noteText: q("[data-trace-note-text]"),
    noteEvent: q("[data-trace-note-event]"),
    prev: q("[data-trace-prev]"),
    next: q("[data-trace-next]"),
    zoomEvent: q("[data-trace-zoom-event]"),
    zoomIn: q("[data-trace-zoom-in]"),
    zoomAll: q("[data-trace-zoom-all]"),
    plot: q("[data-trace-plot]"),
    window: q("[data-trace-window]"),
    cursor: q("[data-trace-cursor]"),
    readout: q("[data-trace-readout]"),
    table: q("[data-trace-table]"),
    status: q("[data-trace-status]"),
  };

  const view = { t0: 0, t1: trace.duration, cursor: 0, selected: null, note: 0 };
  const plotTop = (lane) => AXIS_H + lane * (LANE_H + LANE_GAP) + 16;
  const height = AXIS_H + trace.lanes.length * (LANE_H + LANE_GAP) + 4;

  renderContext();
  renderTable();
  el.cursor.max = "1000";

  /* ——— timeline ——— */

  const svgRoot = svg("svg", {
    viewBox: `0 0 ${W} ${height}`,
    class: "trace-svg",
    role: "group",
    "aria-label": `Timeline of ${trace.title}, ${formatTime(trace.duration)} long, with lanes: ${trace.lanes.join(", ")}. Use the notes, the cursor or the table below to explore it.`,
  });
  el.plot.replaceChildren(svgRoot);
  const layers = {
    axis: svg("g", { class: "trace-axis" }),
    lanes: svg("g"),
    marks: svg("g", { class: "trace-marks" }),
    cursor: svg("line", { class: "trace-cursor-line", y1: AXIS_H - 6, y2: height }),
  };
  svgRoot.append(layers.axis, layers.lanes, layers.marks, layers.cursor);

  function scale() {
    return timeScale([view.t0, view.t1], [0, W]);
  }

  function drawAxis(x) {
    layers.axis.replaceChildren();
    for (const t of ticks(view.t0, view.t1, 6)) {
      const px = x(t);
      layers.axis.append(svg("line", { x1: px, x2: px, y1: AXIS_H - 6, y2: height, class: "trace-grid" }));
      const label = svg("text", { x: px + 3, y: AXIS_H - 10, class: "trace-tick" });
      label.textContent = formatTime(t);
      layers.axis.append(label);
    }
  }

  // Sub-pixel events are merged into one rect per pixel run so a dense lane
  // still shows where it is busy without drawing thousands of nodes.
  function drawLane(lane, x) {
    const g = svg("g", { class: `trace-lane lane-${lane}` });
    const top = plotTop(lane);
    const name = svg("text", { x: 0, y: top - 5, class: "trace-lane-name" });
    name.textContent = trace.lanes[lane];
    g.append(name, svg("rect", { x: 0, y: top, width: W, height: LANE_H, class: "trace-lane-bg" }));
    const counter = trace.counters.find((c) => c.lane === lane);
    if (counter) {
      drawCounter(g, counter, top, x);
      return g;
    }
    let run = null;
    const flush = () => {
      if (run) g.append(svg("rect", { x: run.x0, y: top + 4, width: Math.max(0.6, run.x1 - run.x0), height: LANE_H - 8, class: "trace-event" }));
      run = null;
    };
    for (const e of trace.byLane[lane]) {
      if (e.end < view.t0 || e.start > view.t1) continue;
      const x0 = Math.max(0, x(e.start));
      const x1 = Math.min(W, x(e.end));
      if (lane === 0 && x1 - x0 > 40) {
        // Wide step markers get their own labelled box.
        flush();
        g.append(svg("rect", { x: x0, y: top + 4, width: x1 - x0, height: LANE_H - 8, class: "trace-event trace-step" }));
        const t = svg("text", { x: x0 + 4, y: top + LANE_H / 2 + 4, class: "trace-step-label" });
        t.textContent = e.label;
        g.append(t);
        continue;
      }
      if (run && x0 - run.x1 < 0.5) run.x1 = Math.max(run.x1, x1);
      else { flush(); run = { x0, x1 }; }
    }
    flush();
    return g;
  }

  function drawCounter(g, c, top, x) {
    const pad = (c.max - c.min) * 0.08 || 1;
    const lo = c.min - pad;
    const hi = c.max + pad;
    const y = (v) => top + LANE_H - ((v - lo) / (hi - lo)) * LANE_H;
    let d = "";
    let prevV = null;
    for (const p of c.points) {
      if (p.t < view.t0 && prevV !== null) { prevV = p.v; continue; }
      const px = Math.min(W, Math.max(0, x(p.t)));
      d += d ? ` H${px.toFixed(1)} V${y(p.v).toFixed(1)}` : `M${px.toFixed(1)},${y(p.v).toFixed(1)}`;
      prevV = p.v;
      if (p.t > view.t1) break;
    }
    g.append(svg("path", { d, class: "trace-counter" }));
    const cap = svg("text", { x: W - 4, y: top - 5, class: "trace-lane-name trace-counter-range" });
    cap.textContent = `${c.min.toFixed(1)}–${c.max.toFixed(1)} ${c.unit} ${c.label}`;
    g.append(cap);
  }

  function drawMarks(x) {
    layers.marks.replaceChildren();
    for (const a of trace.annotations) {
      const e = a.event;
      if (e.end < view.t0 || e.start > view.t1) continue;
      const top = plotTop(e.lane);
      const x0 = Math.max(0, x(e.start));
      const w = Math.max(3, Math.min(W, x(e.end)) - x0);
      const g = svg("g", {
        class: `trace-mark${view.selected === e ? " is-selected" : ""}`,
        tabindex: 0,
        role: "button",
        "aria-label": `Note ${a.order + 1}: ${a.title}`,
      });
      g.append(svg("rect", { x: x0 - 1.5, y: top + 1, width: w + 3, height: LANE_H - 2, class: "trace-mark-box" }));
      const num = svg("text", { x: x0 + w / 2, y: top - 5, class: "trace-mark-num", "text-anchor": "middle" });
      num.textContent = String(a.order + 1);
      g.append(num);
      g.addEventListener("click", (ev) => { ev.stopPropagation(); showNote(a.order); });
      g.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); showNote(a.order); }
      });
      layers.marks.append(g);
    }
    if (view.selected && !trace.annotations.some((a) => a.event === view.selected)) {
      const e = view.selected;
      const top = plotTop(e.lane);
      const x0 = Math.max(0, x(e.start));
      layers.marks.append(svg("rect", { x: x0 - 1.5, y: top + 1, width: Math.max(3, x(e.end) - x0) + 3, height: LANE_H - 2, class: "trace-mark-box is-plain" }));
    }
  }

  function draw() {
    const x = scale();
    drawAxis(x);
    layers.lanes.replaceChildren(...trace.lanes.map((_, i) => drawLane(i, x)));
    drawMarks(x);
    drawCursor();
    el.window.textContent = `Showing ${formatTime(view.t0)} to ${formatTime(view.t1)} of ${formatTime(trace.duration)}.`;
    el.zoomAll.disabled = view.t0 === 0 && view.t1 === trace.duration;
  }

  function drawCursor() {
    const x = scale();
    const px = x(Math.min(view.t1, Math.max(view.t0, view.cursor)));
    layers.cursor.setAttribute("x1", px);
    layers.cursor.setAttribute("x2", px);
    el.cursor.value = String(Math.round(((view.cursor - view.t0) / (view.t1 - view.t0)) * 1000));
    el.cursor.setAttribute("aria-valuetext", formatTime(view.cursor));
    renderReadout();
  }

  /* ——— cursor readout ——— */

  function renderReadout() {
    const t = view.cursor;
    const rows = trace.lanes.map((name, lane) => {
      const counter = trace.counters.find((c) => c.lane === lane);
      let value;
      if (counter) {
        const v = counterAt(counter.points, t);
        value = v === null ? "no sample yet" : `${v.toFixed(2)} ${counter.unit} ${counter.label}`;
      } else {
        const now = eventsAt(trace.byLane[lane], t);
        value = now.length ? now.map((e) => `${e.label} (${formatTime(e.duration)})`).join(", ") : "idle";
      }
      const dt = document.createElement("dt");
      dt.textContent = name;
      const dd = document.createElement("dd");
      dd.textContent = value;
      return [dt, dd];
    });
    const head = document.createElement("dt");
    head.className = "trace-readout-time";
    head.textContent = "Cursor";
    const headVal = document.createElement("dd");
    headVal.className = "trace-readout-time";
    headVal.textContent = formatTime(t);
    el.readout.replaceChildren(head, headVal, ...rows.flat());
  }

  /* ——— notes ——— */

  function eventLine(e) {
    return `${trace.lanes[e.lane]} · ${e.label} · starts at ${formatTime(e.start)} · lasts ${formatTime(e.duration)}`;
  }

  function showNote(i) {
    const a = trace.annotations[i];
    if (!a) return;
    view.note = i;
    select(a.event);
    el.noteCount.textContent = `Note ${i + 1} of ${trace.annotations.length}`;
    el.noteTitle.textContent = a.title;
    el.noteText.textContent = a.text;
    el.noteEvent.textContent = eventLine(a.event);
    el.prev.disabled = i === 0;
    el.next.disabled = i === trace.annotations.length - 1;
    el.table.querySelectorAll("tr[data-note]").forEach((tr) => tr.setAttribute("aria-selected", String(Number(tr.dataset.note) === i)));
  }

  function select(e) {
    view.selected = e;
    view.cursor = e.start + e.duration / 2;
    if (e.end < view.t0 || e.start > view.t1) [view.t0, view.t1] = [0, trace.duration];
    draw();
  }

  function selectPlain(e) {
    const a = trace.annotations.find((x) => x.event === e);
    if (a) { showNote(a.order); return; }
    select(e);
    el.noteCount.textContent = "Selected event";
    el.noteTitle.textContent = e.label;
    el.noteText.textContent = "There is no note for this event. The numbered marks have notes.";
    el.noteEvent.textContent = eventLine(e);
  }

  // Click anywhere on a lane: pick the event under the pointer, or the
  // nearest one within a few pixels.
  svgRoot.addEventListener("click", (ev) => {
    const pt = svgRoot.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const p = pt.matrixTransform(svgRoot.getScreenCTM().inverse());
    const lane = trace.lanes.findIndex((_, i) => p.y >= plotTop(i) && p.y <= plotTop(i) + LANE_H);
    const x = scale();
    const t = x.invert(p.x);
    view.cursor = t;
    if (lane < 0 || trace.counters.some((c) => c.lane === lane)) { drawCursor(); return; }
    const tol = x.invert(p.x + 4) - t;
    const near = trace.byLane[lane].filter((e) => e.end >= t - tol && e.start <= t + tol);
    if (!near.length) { drawCursor(); return; }
    const hit = near.find((e) => e.start <= t && t < e.end) || near[0];
    selectPlain(hit);
  });

  el.prev.addEventListener("click", () => showNote(view.note - 1));
  el.next.addEventListener("click", () => showNote(view.note + 1));
  el.zoomEvent.addEventListener("click", () => {
    if (!view.selected) return;
    [view.t0, view.t1] = windowAround(view.selected, trace.duration);
    draw();
    announce(`Zoomed to ${formatTime(view.t0)} – ${formatTime(view.t1)}.`);
  });
  el.zoomIn.addEventListener("click", () => {
    const span = (view.t1 - view.t0) / 4;
    view.t0 = Math.max(0, view.cursor - span / 2);
    view.t1 = Math.min(trace.duration, view.t0 + span);
    draw();
    announce(`Zoomed to ${formatTime(view.t0)} – ${formatTime(view.t1)}.`);
  });
  el.zoomAll.addEventListener("click", () => {
    [view.t0, view.t1] = [0, trace.duration];
    draw();
    announce("Showing the whole run.");
  });
  el.cursor.addEventListener("input", () => {
    view.cursor = view.t0 + (Number(el.cursor.value) / 1000) * (view.t1 - view.t0);
    drawCursor();
  });

  function announce(text) { el.status.textContent = text; }

  /* ——— static parts ——— */

  function renderContext() {
    const labels = { hardware: "Hardware", software: "Software", workload: "Workload", settings: "Settings", source: "Source" };
    const items = Object.entries(trace.context).flatMap(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = labels[k] || k;
      const dd = document.createElement("dd");
      dd.textContent = String(v);
      return [dt, dd];
    });
    const unit = document.createElement("dt");
    unit.textContent = "Units";
    const unitVal = document.createElement("dd");
    unitVal.textContent = `Times in milliseconds (ms) and microseconds (µs) from the start of the run; memory in MiB.`;
    el.context.replaceChildren(...items, unit, unitVal);
  }

  function renderTable() {
    const body = el.table.querySelector("tbody");
    body.replaceChildren(...trace.annotations.map((a) => {
      const tr = document.createElement("tr");
      tr.dataset.note = String(a.order);
      const num = document.createElement("th");
      num.scope = "row";
      num.textContent = String(a.order + 1);
      const noteCell = document.createElement("td");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-quiet";
      b.textContent = a.title;
      b.addEventListener("click", () => { showNote(a.order); el.note.scrollIntoView({ block: "nearest" }); });
      noteCell.append(b);
      tr.append(num, noteCell);
      for (const text of [formatTime(a.event.start), trace.lanes[a.event.lane], a.event.label, formatTime(a.event.duration)]) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.append(td);
      }
      return tr;
    }));
  }

  root.querySelector("[data-trace-loading]").hidden = true;
  root.querySelectorAll("[data-trace-ready]").forEach((n) => { n.hidden = false; });
  showNote(0);
}
