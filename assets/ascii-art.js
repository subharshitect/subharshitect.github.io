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

  /* ——— 1D Cellular Automata: Rule 30 (Wolfram) ———
   * Next cell = XOR(left, current, right). Renders as 2D history (time downward).
   * Produces the classic fractal/chaotic triangle. */
  const cellularEl = U.qs("#ascii-cellular");
  if (cellularEl) {
    const W = 79;
    const H = 28;
    let row = Array(W).fill(0);
    row[Math.floor(W / 2)] = 1;
    const history = [row.slice()];

    function rule30(l, c, r) {
      const idx = (l << 2) | (c << 1) | r;
      return [0, 1, 1, 1, 1, 0, 0, 0][idx];
    }

    function step() {
      const next = [];
      for (let x = 0; x < W; x++) {
        const l = row[(x - 1 + W) % W];
        const m = row[x];
        const r = row[(x + 1) % W];
        next.push(rule30(l, m, r));
      }
      row = next;
      history.push(row.slice());
      if (history.length > H) history.shift();
    }

    function render() {
      const lines = history.map((r, i) => {
        const age = 1 - (history.length - 1 - i) / H;
        return r.map((v, x) => {
          const t = v * (0.4 + 0.6 * age);
          return valToChar(t);
        }).join("");
      }).join("\n");
      cellularEl.textContent = lines;
    }

    let raf = 0, last = 0;
    function tick(ts) {
      if (!cellularEl.isConnected) return;
      if (ts - last > 80) {
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

  /* ——— Gray-Scott reaction-diffusion (Turing patterns) ———
   * du/dt = Du·∇²u - u·v² + F·(1-u)
   * dv/dt = Dv·∇²v + u·v² - (F+k)·v
   * Parameters: F=0.037, k=0.06 → spots; F=0.014, k=0.054 → stripes. */
  const emergentEl = U.qs("#ascii-emergent");
  if (emergentEl) {
    const W = 100;
    const H = 38;
    const Du = 0.2097;
    const Dv = 0.105;
    const F = 0.037;
    const k = 0.06;

    let U_grid = Array(H).fill(null).map(() => Array(W).fill(1));
    let V_grid = Array(H).fill(null).map(() => Array(W).fill(0));
    const seed = U.seeded(42);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (seed() < 0.002) {
          U_grid[y][x] = 0.5;
          V_grid[y][x] = 0.25;
        }
      }
    U_grid[Math.floor(H / 2)][Math.floor(W / 2)] = 0.5;
    V_grid[Math.floor(H / 2)][Math.floor(W / 2)] = 0.25;

    function laplacian(M) {
      const L = Array(H).fill(null).map(() => Array(W).fill(0));
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const ym = (y - 1 + H) % H, yp = (y + 1) % H;
          const xm = (x - 1 + W) % W, xp = (x + 1) % W;
          L[y][x] = M[ym][x] + M[yp][x] + M[y][xm] + M[y][xp] - 4 * M[y][x];
        }
      return L;
    }

    const dtSafe = 0.4;
    function step() {
      const Lu = laplacian(U_grid);
      const Lv = laplacian(V_grid);
      const U_next = Array(H).fill(null).map(() => Array(W).fill(0));
      const V_next = Array(H).fill(null).map(() => Array(W).fill(0));
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const u = U_grid[y][x], v = V_grid[y][x];
          const uv2 = u * v * v;
          U_next[y][x] = u + dtSafe * (Du * Lu[y][x] - uv2 + F * (1 - u));
          V_next[y][x] = v + dtSafe * (Dv * Lv[y][x] + uv2 - (F + k) * v);
          U_next[y][x] = U.clamp(U_next[y][x], 0, 1);
          V_next[y][x] = U.clamp(V_next[y][x], 0, 1);
        }
      U_grid = U_next;
      V_grid = V_next;
    }

    function render() {
      const lines = U_grid.map((row, y) =>
        row.map((_, x) => valToChar(1 - U_grid[y][x])).join("")
      ).join("\n");
      emergentEl.textContent = lines;
    }

    let raf = 0, last = 0;
    function tick(ts) {
      if (!emergentEl.isConnected) return;
      if (ts - last > 50) {
        last = ts;
        step();
        render();
      }
      if (shouldRun()) raf = requestAnimationFrame(tick);
    }
    for (let i = 0; i < 200; i++) step();
    render();
    if (shouldRun()) raf = requestAnimationFrame(tick);
    window.addEventListener("safe-mode-change", () => {
      if (!shouldRun()) cancelAnimationFrame(raf);
      else if (emergentEl.isConnected) raf = requestAnimationFrame(tick);
    });
  }

  /* ——— Feedforward network: 4 → 8 → 4 with ReLU ———
   * Inputs = sin(t + phase). Forward pass. Render nodes + edges by activation. */
  const neuralEl = U.qs("#ascii-neural");
  if (neuralEl) {
    const GW = 64;
    const GH = 20;
    const seed = U.seeded(12345);

    function rand() {
      return seed() * 2 - 1;
    }

    const nIn = 4, nHid = 8, nOut = 4;
    const W1 = Array(nHid).fill(null).map(() => Array(nIn).fill(0).map(() => rand() * 0.8));
    const W2 = Array(nOut).fill(null).map(() => Array(nHid).fill(0).map(() => rand() * 0.8));

    const xIn = [0, 0.25, 0.5, 0.75];
    const yIn = 0.15;
    const xHid = Array.from({ length: nHid }, (_, i) => 0.15 + (i / (nHid - 1)) * 0.7);
    const yHid = 0.5;
    const xOut = [0.2, 0.4, 0.6, 0.8];
    const yOut = 0.85;

    function toGrid(x, y) {
      return {
        gx: Math.floor(x * (GW - 1)),
        gy: Math.floor((1 - y) * (GH - 1))
      };
    }

    function relu(x) { return x > 0 ? x : 0; }

    function forward(t) {
      const inp = Array(nIn).fill(0).map((_, i) => (Math.sin(t * 0.02 + i * 1.5) + 1) / 2);
      const hid = Array(nHid).fill(0).map((_, j) =>
        relu(W1[j].reduce((s, w, i) => s + w * inp[i], 0))
      );
      const out = Array(nOut).fill(0).map((_, k) =>
        relu(W2[k].reduce((s, w, j) => s + w * hid[j], 0))
      );
      const maxH = Math.max(...hid, 1e-6);
      const maxO = Math.max(...out, 1e-6);
      return {
        inp: inp,
        hid: hid.map(h => h / maxH),
        out: out.map(o => o / maxO)
      };
    }

    function render(t) {
      const grid = Array(GH).fill(null).map(() => Array(GW).fill(0));
      const a = forward(t);

      function drawLine(x0, y0, x1, y1, v) {
        const p0 = toGrid(x0, y0), p1 = toGrid(x1, y1);
        const steps = Math.max(Math.abs(p1.gx - p0.gx), Math.abs(p1.gy - p0.gy), 1);
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const gx = Math.round(p0.gx + (p1.gx - p0.gx) * u);
          const gy = Math.round(p0.gy + (p1.gy - p0.gy) * u);
          if (gx >= 0 && gx < GW && gy >= 0 && gy < GH)
            grid[gy][gx] = Math.max(grid[gy][gx], v * 0.35);
        }
      }

      for (let j = 0; j < nHid; j++)
        for (let i = 0; i < nIn; i++)
          drawLine(xIn[i], yIn, xHid[j], yHid, a.inp[i] * a.hid[j]);
      for (let k = 0; k < nOut; k++)
        for (let j = 0; j < nHid; j++)
          drawLine(xHid[j], yHid, xOut[k], yOut, a.hid[j] * a.out[k]);

      [a.inp, a.hid, a.out].flat().forEach((v, idx) => {});
      a.inp.forEach((v, i) => {
        const { gx, gy } = toGrid(xIn[i], yIn);
        if (gy >= 0 && gy < GH && gx >= 0 && gx < GW)
          grid[gy][gx] = Math.max(grid[gy][gx], 0.2 + v * 0.8);
      });
      a.hid.forEach((v, j) => {
        const { gx, gy } = toGrid(xHid[j], yHid);
        if (gy >= 0 && gy < GH && gx >= 0 && gx < GW)
          grid[gy][gx] = Math.max(grid[gy][gx], 0.2 + v * 0.8);
      });
      a.out.forEach((v, k) => {
        const { gx, gy } = toGrid(xOut[k], yOut);
        if (gy >= 0 && gy < GH && gx >= 0 && gx < GW)
          grid[gy][gx] = Math.max(grid[gy][gx], 0.2 + v * 0.8);
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
