// Runs the genetic algorithm off the main thread. Same seed, same evolution.
//   → { cmd: "start", seed }   begin (or restart) a run
//   → { cmd: "resume" } / { cmd: "pause" }
//   → { cmd: "measure", hex, trials, id }   estimate P149 on unbiased ICs
//   ← { type: "generation", summary }   after every generation
//   ← { type: "done" }   after the paper's 100 generations
//   ← { type: "measured", id, p }

import { createGA, stepGA, GA, ruleFromHex, performance } from "./sim/evca.js";

let ga = null;
let running = false;

function loop() {
  if (!running || !ga) return;
  if (ga.generation >= GA.generations) {
    running = false;
    postMessage({ type: "done" });
    return;
  }
  postMessage({ type: "generation", summary: stepGA(ga) });
  setTimeout(loop, 0); // yield so pause/measure messages are handled between generations
}

onmessage = (e) => {
  const m = e.data;
  if (m.cmd === "start") {
    ga = createGA(m.seed >>> 0);
    running = true;
    loop();
  } else if (m.cmd === "resume") {
    if (!running) { running = true; loop(); }
  } else if (m.cmd === "pause") {
    running = false;
  } else if (m.cmd === "measure") {
    const p = performance(ruleFromHex(m.hex), { trials: m.trials || 1000, seed: m.seed || 1 });
    postMessage({ type: "measured", id: m.id, p });
  }
};
