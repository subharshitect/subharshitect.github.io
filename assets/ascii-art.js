(() => {
  "use strict";
  const U = window.__UTIL__;
  if (!U) return;

  const chars = " .:-=+*#%@";
  const cols = 72;
  const rows = 14;

  function shouldRun() {
    return !U.prefersReducedMotion() && document.body.dataset.safe !== "on";
  }

  /* ——— Cellular automata (Rule 110–like 1D, scrolled vertically) ——— */
  const cellularEl = U.qs("#ascii-cellular");
  if (cellularEl) {
    let caRow = Array(cols).fill(0).map(() => (Math.random() > 0.7 ? 1 : 0));
    const caHistory = [caRow.map(b => b)];

    function rule110(a, b, c) {
      const n = (a << 2) | (b << 1) | c;
      return [0, 1, 1, 1, 0, 1, 1, 0][n];
    }

    function stepCA() {
      const next = [];
      for (let x = 0; x < cols; x++) {
        const l = caRow[(x - 1 + cols) % cols];
        const c = caRow[x];
        const r = caRow[(x + 1) % cols];
        next.push(rule110(l, c, r));
      }
      caRow = next;
      caHistory.push(caRow.map(b => b));
      if (caHistory.length > rows) caHistory.shift();
    }

    function renderCA() {
      const lines = caHistory.map(row =>
        row.map(v => v ? chars[chars.length - 1] : chars[0]).join("")
      ).join("\n");
      cellularEl.textContent = lines;
    }

    let caRaf = 0;
    let caLast = 0;
    function tickCA(ts) {
      if (!cellularEl.isConnected) return;
      if (ts - caLast > 120) {
        caLast = ts;
        stepCA();
        renderCA();
      }
      if (shouldRun()) caRaf = requestAnimationFrame(tickCA);
    }
    renderCA();
    if (shouldRun()) caRaf = requestAnimationFrame(tickCA);
    window.addEventListener("safe-mode-change", () => {
      if (!shouldRun()) cancelAnimationFrame(caRaf);
      else if (cellularEl.isConnected) caRaf = requestAnimationFrame(tickCA);
    });
  }

  /* ——— Emergent life (organic spreading / reaction–diffusion–like) ——— */
  const emergentEl = U.qs("#ascii-emergent");
  if (emergentEl) {
    const seed = U.seeded(3301);
    let grid = Array(rows).fill(null).map(() =>
      Array(cols).fill(0).map(() => (seed() > 0.92 ? 1 : 0))
    );

    function countNeighbors(g, y, x) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (dx !== 0 || dy !== 0)
            n += g[(y + dy + rows) % rows][(x + dx + cols) % cols];
      return n;
    }

    function stepEmergent() {
      const next = grid.map(row => row.slice());
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const n = countNeighbors(grid, y, x);
          const v = grid[y][x];
          next[y][x] = v ? (n === 2 || n === 3) ? 1 : 0 : n === 3 ? 1 : 0;
        }
      grid = next;
    }

    function renderEmergent() {
      const lines = grid.map(row =>
        row.map(v => chars[Math.min(v * (chars.length - 1), chars.length - 1)]).join("")
      ).join("\n");
      emergentEl.textContent = lines;
    }

    let emRaf = 0;
    let emLast = 0;
    function tickEm(ts) {
      if (!emergentEl.isConnected) return;
      if (ts - emLast > 180) {
        emLast = ts;
        stepEmergent();
        renderEmergent();
      }
      if (shouldRun()) emRaf = requestAnimationFrame(tickEm);
    }
    renderEmergent();
    if (shouldRun()) emRaf = requestAnimationFrame(tickEm);
    window.addEventListener("safe-mode-change", () => {
      if (!shouldRun()) cancelAnimationFrame(emRaf);
      else if (emergentEl.isConnected) emRaf = requestAnimationFrame(tickEm);
    });
  }

  /* ——— Neural (static topology + subtle activation wave) ——— */
  const neuralEl = U.qs("#ascii-neural");
  if (neuralEl) {
    const W = cols;
    const H = rows;
    const rand = U.seeded(7701);
    const nodes = [];
    for (let i = 0; i < 12; i++)
      nodes.push({ x: Math.floor(rand() * (W - 4)) + 2, y: Math.floor(rand() * (H - 2)) + 1, a: 0 });
    const activation = nodes.map(() => 0);

    function renderNeural(frame) {
      const grid = Array(H).fill(null).map(() => Array(W).fill(0));
      nodes.forEach((n, i) => {
        const wave = (Math.sin((frame * 0.03 + i * 0.7)) + 1) / 2;
        grid[n.y][n.x] = 0.3 + wave * 0.7;
      });
      for (let i = 0; i < nodes.length; i++)
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
          if (dx + dy < 14) {
            for (let t = 0; t <= 1; t += 0.05) {
              const x = Math.round(a.x + (b.x - a.x) * t);
              const y = Math.round(a.y + (b.y - a.y) * t);
              if (y >= 0 && y < H && x >= 0 && x < W)
                grid[y][x] = Math.max(grid[y][x], 0.25);
            }
          }
        }
      const lines = grid.map(row =>
        row.map(v => chars[Math.floor(U.clamp(v, 0, 0.999) * chars.length)]).join("")
      ).join("\n");
      neuralEl.textContent = lines;
    }

    let neFrame = 0;
    let neRaf = 0;
    function tickNeural(ts) {
      if (!neuralEl.isConnected) return;
      neFrame++;
      renderNeural(neFrame);
      if (shouldRun()) neRaf = requestAnimationFrame(tickNeural);
    }
    renderNeural(0);
    if (shouldRun()) neRaf = requestAnimationFrame(tickNeural);
    window.addEventListener("safe-mode-change", () => {
      if (!shouldRun()) cancelAnimationFrame(neRaf);
      else if (neuralEl.isConnected) neRaf = requestAnimationFrame(tickNeural);
    });
  }
})();
