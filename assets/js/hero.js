// The homepage's single moving visual: Plate III (rule 30), drawn by the
// same renderer as the specimens. It pauses offscreen, in hidden tabs, in
// reading view, and when motion is paused or reduced (a settled frame).

import { SIMS } from "./sim/sims.js";
import { makeState, restore } from "./sim/core.js";
import { Runner, StepClock } from "./runner.js";
import { PlateCanvas } from "./plate-canvas.js";

const canvas = document.getElementById("hero-frame");
if (canvas) {
  const def = SIMS[canvas.dataset.sim] || SIMS.cellular;
  const params = Object.fromEntries(def.params.map((p) => [p.key, canvas.dataset[p.key]]));
  const state = makeState(SIMS, { sim: def.id, seed: canvas.dataset.seed, params, gen: def.stillGen });
  const { sim } = restore(def, state);
  const plate = new PlateCanvas(canvas, { cols: def.cols, rows: def.rows, aspect: def.aspect || 1.8, tones: def.tones });
  const clock = new StepClock();
  const render = () => plate.draw(def.frame(sim), def.tonesOf ? def.tonesOf(sim) : null);
  render();
  new Runner(canvas, (dt) => {
    const n = clock.take(dt, def.stepsPerSecond(state.params));
    if (!n) return;
    for (let i = 0; i < n; i += 1) def.step(sim);
    render();
  });
}
