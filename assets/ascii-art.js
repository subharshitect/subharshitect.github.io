(() => {
  "use strict";
  const U = window.__UTIL__;
  if (!U) return;

  const CHARS = " .:-=+*#%@";
  const CHAR_LEN = CHARS.length;

  function shouldRun() {
    return !U.prefersReducedMotion() && document.body.dataset.safe !== "on";
  }

  function valToChar(v) {
    return CHARS[Math.floor(U.clamp(v, 0, 0.999) * CHAR_LEN)];
  }

  /* ——— Gray-Scott reaction-diffusion (Turing patterns) ———
   * du/dt = Du·∇²u - u·v² + F·(1-u)
   * dv/dt = Dv·∇²v + u·v² - (F+k)·v
   * Double-buffered, small dt, classic spot/stripe parameters. */
  const emergentEl = U.qs("#ascii-emergent");
  if (emergentEl) {
    const W = 120;
    const H = 44;
    const Du = 0.2097;
    const Dv = 0.105;
    const F = 0.037;
    const k = 0.06;
    const dt = 0.02;
    const substeps = 25;

    let u0 = Array(H).fill(null).map(() => Array(W).fill(1));
    let v0 = Array(H).fill(null).map(() => Array(W).fill(0));
    let u1 = Array(H).fill(null).map(() => Array(W).fill(0));
    let v1 = Array(H).fill(null).map(() => Array(W).fill(0));

    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++)
        if (dx * dx + dy * dy <= 16) {
          const y = (cy + dy + H) % H, x = (cx + dx + W) % W;
          u0[y][x] = 0.5;
          v0[y][x] = 0.25;
        }

    function laplacian(M, y, x) {
      const ym = (y - 1 + H) % H, yp = (y + 1) % H;
      const xm = (x - 1 + W) % W, xp = (x + 1) % W;
      return M[ym][x] + M[yp][x] + M[y][xm] + M[y][xp] - 4 * M[y][x];
    }

    function step() {
      for (let s = 0; s < substeps; s++) {
        for (let y = 0; y < H; y++)
          for (let x = 0; x < W; x++) {
            const u = u0[y][x], v = v0[y][x];
            const lapU = laplacian(u0, y, x);
            const lapV = laplacian(v0, y, x);
            const uvv = u * v * v;
            const du = Du * lapU - uvv + F * (1 - u);
            const dv = Dv * lapV + uvv - (F + k) * v;
            u1[y][x] = Math.max(0, Math.min(1.2, u + dt * du));
            v1[y][x] = Math.max(0, Math.min(1.2, v + dt * dv));
          }
        let tmp = u0; u0 = u1; u1 = tmp;
        tmp = v0; v0 = v1; v1 = tmp;
      }
    }

    function render() {
      const lines = u0.map((row, y) =>
        row.map((_, x) => {
          const u = u0[y][x], v = v0[y][x];
          const display = (1 - u) * 0.6 + v * 0.4;
          return valToChar(U.clamp(display, 0, 1));
        }).join("")
      ).join("\n");
      emergentEl.textContent = lines;
    }

    for (let i = 0; i < 180; i++) step();
    render();

    let raf = 0, last = 0;
    function tick(ts) {
      if (!emergentEl.isConnected) return;
      if (ts - last > 45) {
        last = ts;
        step();
        render();
      }
      if (shouldRun()) raf = requestAnimationFrame(tick);
    }
    if (shouldRun()) raf = requestAnimationFrame(tick);
    window.addEventListener("safe-mode-change", () => {
      if (!shouldRun()) cancelAnimationFrame(raf);
      else if (emergentEl.isConnected) raf = requestAnimationFrame(tick);
    });
  }

  /* ——— Simple 1D automaton: Rule 90 (Sierpiński) ———
   * Clean fractal, reliable. Next = XOR(left, right). */
  const cellularEl = U.qs("#ascii-cellular");
  if (cellularEl) {
    const W = 61;
    const H = 24;
    let row = Array(W).fill(0);
    row[Math.floor(W / 2)] = 1;
    const history = [row.slice()];

    function rule90(l, r) { return l ^ r; }

    function step() {
      const next = [];
      for (let x = 0; x < W; x++) {
        const l = row[(x - 1 + W) % W];
        const r = row[(x + 1) % W];
        next.push(rule90(l, r));
      }
      row = next;
      history.push(row.slice());
      if (history.length > H) history.shift();
    }

    function render() {
      const lines = history.map((r, i) => {
        const age = 1 - (history.length - 1 - i) / H;
        return r.map(v => valToChar(v * (0.5 + 0.5 * age))).join("");
      }).join("\n");
      cellularEl.textContent = lines;
    }

    let raf = 0, last = 0;
    function tick(ts) {
      if (!cellularEl.isConnected) return;
      if (ts - last > 90) {
        last = ts;
        step();
        render();
      }
      if (shouldRun()) raf = requestAnimationFrame(tick);
    }
    render();
    if (shouldRun()) raf = requestAnimationFrame(tick);
    window.addEventListener("safe-mode-change", () => {
      if (!shouldRun()) cancelAnimationFrame(raf);
      else if (cellularEl.isConnected) raf = requestAnimationFrame(tick);
    });
  }

  /* ——— Feedforward network: 6 → 12 → 10 → 6 (deeper, denser) ———
   * Inputs = sin(t + phase). Forward pass. Centered layout in grid. */
  const neuralEl = U.qs("#ascii-neural");
  if (neuralEl) {
    const GW = 80;
    const GH = 32;
    const seed = U.seeded(12345);
    function rand() { return seed() * 2 - 1; }

    const layers = [6, 12, 10, 6];
    const weights = [];
    for (let L = 0; L < layers.length - 1; L++)
      weights.push(Array(layers[L + 1]).fill(null).map(() =>
        Array(layers[L]).fill(0).map(() => rand() * 0.6)
      ));

    const nLayers = layers.length;
    const nodePos = [];
    for (let L = 0; L < nLayers; L++) {
      const n = layers[L];
      const y = 0.15 + (L / (nLayers - 1)) * 0.7;
      const xs = Array.from({ length: n }, (_, i) => 0.12 + (i / Math.max(n - 1, 1)) * 0.76);
      nodePos.push(xs.map(x => ({ x, y })));
    }

    function toGrid(x, y) {
      return {
        gx: Math.floor(x * (GW - 1)),
        gy: Math.floor((1 - y) * (GH - 1))
      };
    }

    function relu(x) { return x > 0 ? x : 0; }

    function forward(t) {
      let act = Array(layers[0]).fill(0).map((_, i) =>
        (Math.sin(t * 0.015 + i * 0.9) + 1) / 2
      );
      const all = [act.slice()];
      for (let L = 0; L < weights.length; L++) {
        act = weights[L].map(row =>
          relu(row.reduce((s, w, i) => s + w * act[i], 0))
        );
        const max = Math.max(...act, 1e-6);
        act = act.map(a => a / max);
        all.push(act.slice());
      }
      return all;
    }

    function render(t) {
      const grid = Array(GH).fill(null).map(() => Array(GW).fill(0));
      const acts = forward(t);

      function drawLine(x0, y0, x1, y1, v) {
        const p0 = toGrid(x0, y0), p1 = toGrid(x1, y1);
        const steps = Math.max(Math.abs(p1.gx - p0.gx), Math.abs(p1.gy - p0.gy), 1);
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const gx = Math.round(p0.gx + (p1.gx - p0.gx) * u);
          const gy = Math.round(p0.gy + (p1.gy - p0.gy) * u);
          if (gx >= 0 && gx < GW && gy >= 0 && gy < GH)
            grid[gy][gx] = Math.max(grid[gy][gx], v * 0.4);
        }
      }

      for (let L = 0; L < nLayers - 1; L++)
        for (let i = 0; i < nodePos[L].length; i++)
          for (let j = 0; j < nodePos[L + 1].length; j++) {
            const a = nodePos[L][i], b = nodePos[L + 1][j];
            drawLine(a.x, a.y, b.x, b.y, acts[L][i] * acts[L + 1][j]);
          }

      for (let L = 0; L < nLayers; L++)
        nodePos[L].forEach((p, i) => {
          const { gx, gy } = toGrid(p.x, p.y);
          if (gy >= 0 && gy < GH && gx >= 0 && gx < GW)
            grid[gy][gx] = Math.max(grid[gy][gx], 0.25 + acts[L][i] * 0.7);
        });

      const lines = grid.map(row =>
        row.map(v => valToChar(v)).join("")
      ).join("\n");
      neuralEl.textContent = lines;
    }

    let frame = 0, raf = 0;
    function tick() {
      if (!neuralEl.isConnected) return;
      frame++;
      render(frame);
      if (shouldRun()) raf = requestAnimationFrame(tick);
    }
    render(0);
    if (shouldRun()) raf = requestAnimationFrame(tick);
    window.addEventListener("safe-mode-change", () => {
      if (!shouldRun()) cancelAnimationFrame(raf);
      else if (neuralEl.isConnected) raf = requestAnimationFrame(tick);
    });
  }
})();
