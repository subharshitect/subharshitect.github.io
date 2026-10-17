// One plate page. The simulation is chosen by <section id="plate" data-sim>.
//
//   state → simulation step → render (PlateCanvas)
//             ↑
//         conditions
//
// `desc` is the reproducible description (sim, seed, params); `run` is the
// live simulation built from it. Links carry desc + generation and replay
// from the seed, so a link reopens the exact plate someone was looking at.

import { SIMS } from "./sim/sims.js";
import { makeState, encodeState, decodeState, restore, parseSavesFile, serializeSaves, SEED_MAX } from "./sim/core.js";
import { Runner, StepClock } from "./runner.js";
import { PlateCanvas } from "./plate-canvas.js";
import { download, downloadCanvas } from "./download.js";
import { SaveStore, newSaveId } from "./saves.js";

const root = document.getElementById("plate");
if (root && SIMS[root.dataset.sim]) init(root, SIMS[root.dataset.sim]);

function init(root, def) {
  const q = (sel) => root.querySelector(sel) || document.querySelector(sel);
  const el = {
    canvas: q("[data-plate-canvas]"),
    caption: q("[data-plate-caption]"),
    readout: q("[data-plate-readout]"),
    status: q("[data-plate-status]"),
    observe: q("[data-observe]"),
    step: q("[data-step]"),
    reset: q("[data-reset]"),
    conditions: q("[data-conditions]"),
    studies: q("[data-studies]"),
    studyNote: q("[data-study-note]"),
    seed: q("[data-seed]"),
    reseed: q("[data-reseed]"),
    copy: q("[data-copy]"),
    saveTxt: q("[data-save-txt]"),
    savePng: q("[data-save-png]"),
    postcard: q("[data-postcard]"),
    saveForm: q("[data-save-form]"),
    saveName: q("[data-save-name]"),
    saves: q("[data-saves]"),
    savesEmpty: q("[data-saves-empty]"),
    exportSaves: q("[data-export]"),
    importSaves: q("[data-import]"),
  };
  const plateNo = root.dataset.plate || "";
  const store = new SaveStore(SIMS);
  const clock = new StepClock();
  const plate = new PlateCanvas(el.canvas, { cols: def.cols, rows: def.rows, aspect: def.aspect || 1.8, tones: def.tones });
  let desc = null;
  let run = null;

  const runner = new Runner(el.canvas, (dt) => {
    if (run.done) { runner.setWanted(false); announce("The colony has reached the edge of the plate."); return; }
    const n = clock.take(dt, def.stepsPerSecond(desc.params));
    if (!n) return;
    for (let i = 0; i < n && !run.done; i += 1) def.step(run);
    render();
  });
  runner.onChange = (active) => {
    el.observe.textContent = active ? "Pause" : "Observe";
    el.observe.setAttribute("aria-pressed", String(active));
  };

  function announce(text) {
    el.status.textContent = "";
    requestAnimationFrame(() => { el.status.textContent = text; });
  }

  const currentState = () => ({ ...desc, gen: run.gen });

  function shareUrl() {
    const url = new URL(location.href);
    url.search = encodeState(currentState());
    url.hash = "";
    return url.toString();
  }

  function conditionsLine() {
    return def.params
      .filter((p) => p.key !== "speed")
      .map((p) => {
        const v = desc.params[p.key];
        const opt = p.options && p.options.find((o) => o.value === v);
        return `${p.label.replace(/ \(.*\)$/, "").toLowerCase()} ${opt ? opt.label : v}`;
      })
      .concat(`seed ${desc.seed}`)
      .join(" · ");
  }

  function render() {
    plate.draw(def.frame(run), def.tonesOf ? def.tonesOf(run) : null);
    el.caption.textContent = `${conditionsLine()} · ${def.genLabel || "generation"} ${run.gen.toLocaleString("en")}`;
    if (el.readout) el.readout.textContent = def.readout ? def.readout(run) : "";
  }

  function load(state, { announceReplay = false } = {}) {
    desc = { v: state.v, sim: state.sim, seed: state.seed, params: state.params };
    const restored = restore(def, state);
    run = restored.sim;
    clock.reset();
    if (announceReplay && restored.capped) {
      announce(`This link asked for ${state.gen.toLocaleString("en")} steps; replay stops at ${restored.reached.toLocaleString("en")}.`);
    }
    history.replaceState(null, "", `?${encodeState(currentState(), { includeGen: false })}`);
    el.canvas.setAttribute("aria-label", def.describe(desc.params));
    el.seed.value = String(desc.seed);
    syncConditions();
    render();
  }

  function restart(changes = {}) {
    load(makeState(SIMS, { ...desc, ...changes, params: { ...desc.params, ...(changes.params || {}) }, gen: 0 }));
  }

  /* ——— conditions: sliders, or segmented buttons for options ——— */

  const inputs = new Map();
  function buildConditions() {
    el.conditions.replaceChildren(...def.params.map((p) => {
      const id = `cond-${p.key}`;
      const row = document.createElement("div");
      row.className = "param";
      const help = document.createElement("p");
      help.className = "param-help";
      help.id = `${id}-help`;
      help.textContent = p.help;
      if (p.options) {
        const group = document.createElement("div");
        group.className = "button-row";
        group.setAttribute("role", "group");
        const label = document.createElement("p");
        label.className = "param-label";
        label.id = `${id}-label`;
        label.textContent = p.label;
        group.setAttribute("aria-labelledby", label.id);
        const buttons = p.options.map((o) => {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "chip";
          b.textContent = o.label;
          b.addEventListener("click", () => { restart({ params: { [p.key]: o.value } }); announce(`${p.label}: ${o.label}.`); });
          return b;
        });
        group.append(...buttons);
        inputs.set(p.key, { sync: (v) => buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(p.options[i].value === v))) });
        row.append(label, group, help);
        return row;
      }
      const head = document.createElement("div");
      head.className = "param-head";
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = p.label;
      const out = document.createElement("output");
      out.htmlFor = id;
      const input = document.createElement("input");
      Object.assign(input, { type: "range", id, min: String(p.min), max: String(p.max), step: String(p.step) });
      input.setAttribute("aria-describedby", help.id);
      input.addEventListener("input", () => { out.textContent = input.value; });
      input.addEventListener("change", () => {
        if (p.key === "speed") {
          desc.params.speed = Number(input.value); // pace only; the pattern is unchanged
          history.replaceState(null, "", `?${encodeState(currentState(), { includeGen: false })}`);
          return;
        }
        restart({ params: { [p.key]: input.value } });
        el.studyNote.textContent = "";
        announce(`${p.label} set to ${desc.params[p.key]}. Started again from the seed.`);
      });
      inputs.set(p.key, { sync: (v) => { input.value = String(v); out.textContent = String(v); } });
      head.append(label, out);
      row.append(head, input, help);
      return row;
    }));
  }

  function syncConditions() {
    for (const p of def.params) inputs.get(p.key).sync(desc.params[p.key]);
  }

  function buildStudies() {
    el.studies.replaceChildren(...def.presets.map((preset) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-quiet";
      b.textContent = preset.name;
      b.addEventListener("click", () => {
        restart({ params: preset.params });
        el.studyNote.textContent = preset.note;
        announce(`${preset.name}.`);
      });
      return b;
    }));
  }

  /* ——— the record: links, images, saves ——— */

  function renderSaves() {
    const mine = store.items.filter((s) => s.sim === def.id);
    el.savesEmpty.hidden = mine.length > 0;
    el.savesEmpty.textContent = store.available ? "Nothing kept yet." : "This browser is not allowing local storage, so nothing can be kept here.";
    el.saves.replaceChildren(...mine.map((s) => {
      const li = document.createElement("li");
      li.className = "save";
      if (s.thumb) {
        const img = document.createElement("img");
        img.src = s.thumb;
        img.alt = "";
        li.append(img);
      }
      const body = document.createElement("div");
      body.className = "save-body";
      const name = document.createElement("input");
      Object.assign(name, { type: "text", value: s.name, maxLength: 80 });
      name.setAttribute("aria-label", "Name of this kept plate");
      name.addEventListener("change", () => { store.rename(s.id, name.value); announce("Renamed."); });
      const info = document.createElement("p");
      info.className = "save-info";
      info.textContent = `seed ${s.seed} · ${(def.genLabel || "generation")} ${s.gen.toLocaleString("en")} · ${s.savedAt.slice(0, 10)}`;
      const actions = document.createElement("div");
      actions.className = "save-actions";
      const open = document.createElement("button");
      Object.assign(open, { type: "button", className: "btn btn-quiet", textContent: "Open" });
      open.addEventListener("click", () => { load(s, { announceReplay: true }); announce(`Opened “${s.name || "kept plate"}”.`); el.canvas.scrollIntoView({ block: "nearest" }); });
      const del = document.createElement("button");
      Object.assign(del, { type: "button", className: "btn btn-quiet", textContent: "Delete" });
      del.addEventListener("click", () => { store.remove(s.id); renderSaves(); announce("Deleted."); });
      actions.append(open, del);
      body.append(name, info, actions);
      li.append(body);
      return li;
    }));
  }

  const fileStem = () => `${def.id}-seed${desc.seed}-${run.gen}`;
  const plateTitle = () => `${plateNo ? `Plate ${plateNo}. ` : ""}${def.title}`;

  el.observe.addEventListener("click", () => {
    const pausing = runner.active;
    if (!pausing && run.done) restart();
    runner.setWanted(!pausing, { explicit: true });
    announce(pausing ? "Paused." : "Observing.");
  });
  el.step.addEventListener("click", () => {
    if (runner.active) runner.setWanted(false);
    def.step(run);
    render();
  });
  el.reset.addEventListener("click", () => { restart(); announce("Back to the beginning."); });
  el.reseed.addEventListener("click", () => { restart({ seed: Math.floor(Math.random() * SEED_MAX) }); announce(`New seed ${desc.seed}.`); });
  el.seed.addEventListener("change", () => { restart({ seed: el.seed.value }); announce(`Seed ${desc.seed}.`); });
  el.copy.addEventListener("click", async () => {
    const url = shareUrl();
    try { await navigator.clipboard.writeText(url); announce("Link copied. It reopens this exact plate."); }
    catch (_e) { window.prompt("Copy this link:", url); }
  });
  el.saveTxt.addEventListener("click", () => download(`${fileStem()}.txt`, `${def.frame(run)}\n\n${plateTitle()}\n${conditionsLine()}\n${shareUrl()}\n`));
  el.savePng.addEventListener("click", () => downloadCanvas(`${fileStem()}.png`, plate.compose()));
  el.postcard.addEventListener("click", () => downloadCanvas(`${fileStem()}-postcard.png`, plate.compose([plateTitle(), el.caption.textContent, shareUrl()])));
  el.saveForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const ok = store.add({
      ...currentState(),
      id: newSaveId(),
      name: el.saveName.value.trim() || `${def.title}, seed ${desc.seed}`,
      savedAt: new Date().toISOString(),
      thumb: plate.thumb(80),
    });
    el.saveName.value = "";
    renderSaves();
    announce(ok ? "Kept in this browser." : "Could not keep it: this browser is not allowing local storage.");
  });
  el.exportSaves.addEventListener("click", () => download("specimens-kept.json", serializeSaves(store.items), "application/json"));
  el.importSaves.addEventListener("change", async () => {
    const file = el.importSaves.files && el.importSaves.files[0];
    if (!file) return;
    const result = parseSavesFile(await file.text(), SIMS);
    el.importSaves.value = "";
    if (result.error) { announce(result.error); return; }
    const added = store.merge(result.saves);
    renderSaves();
    announce(`Imported ${added}.${result.skipped ? ` ${result.skipped} could not be read and were skipped.` : ""}`);
  });

  buildConditions();
  buildStudies();
  // Plates open still, on a settled frame; "Observe" sets them going.
  const fromUrl = decodeState(location.search, SIMS);
  const defaults = JSON.parse(root.dataset.params || "{}");
  const first = fromUrl && fromUrl.sim === def.id ? fromUrl : makeState(SIMS, { sim: def.id, params: defaults });
  if (!new URLSearchParams(location.search).has("gen")) first.gen = def.stillGen;
  load(first, { announceReplay: true });
  runner.setWanted(false);
  renderSaves();
}
