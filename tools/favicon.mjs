// Write assets/images/favicon.svg from the site's own cellular automaton:
// 16 rows of rule 90 grown from one cell, the rows the browser tab shows.
//   node tools/favicon.mjs
import { writeFileSync } from "node:fs";
import { cellular } from "../assets/js/sim/sims.js";
import { makeState, restore } from "../assets/js/sim/core.js";
import { SIMS } from "../assets/js/sim/sims.js";

const ROWS = 16;
const state = makeState(SIMS, { sim: "cellular", params: { rule: 90, density: 0 }, gen: ROWS - 1 });
const { sim } = restore(cellular, state);
const lines = cellular.frame(sim).split("\n").slice(0, ROWS);
const mid = cellular.cols >> 1;
const cells = [];
lines.forEach((line, y) => {
  for (let x = 0; x < 2 * ROWS; x += 1) {
    if (line[mid - ROWS + x] && line[mid - ROWS + x] !== " ") cells.push(`M${x} ${y * 2}h1v2h-1z`);
  }
});
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 34 34"><rect x="-1" y="-1" width="34" height="34" rx="4" fill="#030507"/><path fill="#4eb8e0" d="${cells.join("")}"/></svg>\n`;
writeFileSync(new URL("../assets/images/favicon.svg", import.meta.url), svg);
console.log(`favicon.svg: ${cells.length} cells`);
