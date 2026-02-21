(() => {
  "use strict";
  const U = window.__UTIL__;
  if (!U) return;

  const hero = U.qs("#ascii-hero");
  const portrait = U.qs("#ascii-portrait");
  if (!hero || !portrait) return;

  const state = {
    raf: 0,
    frame: 0,
    running: false,
    phaseBurst: 0,
    cols: 96,
    rows: 20,
    grid: [],
    next: [],
    portraitBase: null,
    reduced: U.prefersReducedMotion(),
    transitions: 0
  };

  const knob = {
    rigor: 0.64,
    compression: 0.72,
    control: 0.39,
    signal: 0.56,
    mode: "exp"
  };
  const live = { rigor: knob.rigor, compression: knob.compression, control: knob.control, signal: knob.signal };

  function readKnobs() {
    const r = U.qs("#lens-rigor");
    const c = U.qs("#lens-compression");
    const k = U.qs("#lens-control");
    const s = U.qs("#signal-intensity");
    if (r) knob.rigor = U.clamp(Number(r.value) / 100, 0, 1);
    if (c) knob.compression = U.clamp(Number(c.value) / 100, 0, 1);
    if (k) knob.control = U.clamp(Number(k.value) / 100, 0, 1);
    if (s) knob.signal = U.clamp(Number(s.value) / 100, 0, 1);
    knob.mode = document.body.dataset.mode || "exp";
    live.rigor = U.lerp(live.rigor, knob.rigor, 0.14);
    live.compression = U.lerp(live.compression, knob.compression, 0.14);
    live.control = U.lerp(live.control, knob.control, 0.14);
    live.signal = U.lerp(live.signal, knob.signal, 0.14);
  }

  function resizeGrid() {
    const w = Math.max(hero.clientWidth || 640, 320);
    const exp = knob.mode === "exp";
    const densityBias = exp ? (0.9 + live.compression * 0.28) : (1.16 + (1 - live.compression) * 0.22);
    state.cols = U.clamp(Math.floor(w / (8.6 * densityBias)), 38, exp ? 152 : 92);
    state.rows = exp ? 24 : 16;
    const size = state.cols * state.rows;
    state.grid = new Array(size).fill(0).map((_v, i) => ((i + 7) % 13 === 0 ? 1 : 0));
    state.next = new Array(size).fill(0);
  }

  function idx(x, y) {
    const xx = (x + state.cols) % state.cols;
    const yy = (y + state.rows) % state.rows;
    return yy * state.cols + xx;
  }

  function stepOrganism() {
    const seed = U.hash(`${Math.round(live.control * 1000)}-${Math.round(live.rigor * 1000)}-${state.frame}`);
    const rand = U.seeded(seed);
    const controlBias = live.control * 0.34;
    const rigorBias = live.rigor * 0.28;
    const romance = 1 - live.rigor;
    const surrender = 1 - live.control;
    const mutateRate = 0.005 + surrender * 0.03 + romance * 0.02 + state.phaseBurst * 0.06;

    let transitions = 0;
    for (let y = 0; y < state.rows; y += 1) {
      for (let x = 0; x < state.cols; x += 1) {
        const i = idx(x, y);
        const alive = state.grid[i] > 0.5 ? 1 : 0;

        let n = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (!ox && !oy) continue;
            n += state.grid[idx(x + ox, y + oy)] > 0.45 ? 1 : 0;
          }
        }

        const axial = (state.grid[idx(x - 1, y)] + state.grid[idx(x + 1, y)] + state.grid[idx(x, y - 1)] + state.grid[idx(x, y + 1)]) * 0.25;
        const diag = (state.grid[idx(x - 1, y - 1)] + state.grid[idx(x + 1, y + 1)] + state.grid[idx(x - 1, y + 1)] + state.grid[idx(x + 1, y - 1)]) * 0.25;
        const membrane = (axial * (0.7 + controlBias) + diag * (0.3 - controlBias * 0.3));

        let v = state.grid[i] * (0.62 + rigorBias);
        if (alive) {
          if (n < (2 - romance * 0.5) || n > (3.6 + surrender * 0.7)) v *= 0.45;
          else v = U.lerp(v, 1, 0.26 + controlBias);
        } else if (n > (2.6 - romance * 0.9) && n < (3.8 + surrender * 0.4)) {
          v = U.lerp(v, 0.86, 0.45 + romance * 0.2);
        }

        if (live.control > 0.68 && x > state.cols / 2) {
          const mirror = idx(state.cols - x - 1, y);
          v = U.lerp(v, state.grid[mirror], 0.28 + controlBias);
        }

        v = U.lerp(v, membrane, romance * 0.16);
        if (rand() < mutateRate) v = rand() * (0.4 + romance * 0.45);
        if (rand() < 0.001 + surrender * 0.01) v = 1;

        const nv = U.clamp(v, 0, 1);
        if ((state.grid[i] > 0.5) !== (nv > 0.5)) transitions += 1;
        state.next[i] = nv;
      }
    }

    state.transitions = transitions / Math.max(state.cols * state.rows, 1);
    const tmp = state.grid;
    state.grid = state.next;
    state.next = tmp;
  }

  function organismText() {
    const exp = knob.mode === "exp";
    const base = live.signal;
    const harsh = U.clamp(base + state.phaseBurst * 0.5, 0, 1);
    const palette = exp
      ? (harsh > 0.6 ? " .'`:-=+*#%@" : "  ..::-=+*##")
      : (harsh > 0.6 ? "  .:-=*#" : "   .:-+");

    const lines = [];
    let entropy = 0;
    let transitions = 0;
    for (let y = 0; y < state.rows; y += 1) {
      let row = "";
      for (let x = 0; x < state.cols; x += 1) {
        const v = state.grid[idx(x, y)];
        entropy += Math.abs(v - 0.5);
        const lesion = Math.sin((x * 0.09) + state.frame * 0.03) * Math.cos((y * 0.17) - state.frame * 0.02);
        const noisy = U.clamp(v + lesion * (0.08 + (1 - live.control) * 0.14), 0, 1);
        row += palette[Math.floor(noisy * (palette.length - 1))] || " ";
      }
      lines.push(row);
    }
    const aliveVar = entropy / (state.cols * state.rows);
    const entropyMix = U.clamp(aliveVar * 0.62 + state.transitions * 0.38, 0, 1);
    return { text: lines.join("\n"), entropy: entropyMix };
  }

  function fallbackPortrait(cols, rows) {
    const out = [];
    for (let y = 0; y < rows; y += 1) {
      let row = "";
      for (let x = 0; x < cols; x += 1) {
        const nx = (x / cols) * 2 - 1;
        const ny = (y / rows) * 2 - 1;
        const head = (nx * nx) / 0.52 + (ny * ny) / 0.86;
        const eyeL = ((nx + 0.28) ** 2) / 0.02 + ((ny + 0.12) ** 2) / 0.03;
        const eyeR = ((nx - 0.28) ** 2) / 0.02 + ((ny + 0.12) ** 2) / 0.03;
        const mouth = ((nx) ** 2) / 0.07 + ((ny - 0.32) ** 2) / 0.02;
        let l = head < 1 ? 0.74 : 0.1;
        if (eyeL < 1 || eyeR < 1) l = 0.14;
        if (mouth < 1) l = 0.2;
        row += " .:-=+*#%@"[Math.floor(U.clamp(l, 0, 0.99) * 10)] || " ";
      }
      out.push(row);
    }
    return out;
  }

  function loadPortraitBase() {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const cols = U.clamp(Math.floor((portrait.clientWidth || 520) / 8), 34, 72);
            const rows = 18;
            const c = document.createElement("canvas");
            c.width = cols;
            c.height = rows;
            const g = c.getContext("2d", { willReadFrequently: true });
            if (!g) {
              resolve(fallbackPortrait(cols, rows));
              return;
            }
            g.drawImage(img, 0, 0, cols, rows);
            const data = g.getImageData(0, 0, cols, rows).data;
            const lines = [];
            for (let y = 0; y < rows; y += 1) {
              let row = "";
              for (let x = 0; x < cols; x += 1) {
                const i = (y * cols + x) * 4;
                const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
                row += " .,:;irsXA253hMHGS#9B&@"[Math.floor((1 - lum) * 23)] || " ";
              }
              lines.push(row);
            }
            resolve(lines);
          } catch (_e) {
            resolve(fallbackPortrait(60, 18));
          }
        };
        img.onerror = () => resolve(fallbackPortrait(60, 18));
        img.src = "assets/avatars/avatar1.jpg";
      } catch (_e) {
        resolve(fallbackPortrait(60, 18));
      }
    });
  }

  function contaminatePortrait(baseLines) {
    const rows = baseLines.length;
    const cols = baseLines[0] ? baseLines[0].length : 0;
    const rr = U.seeded(U.hash(`${state.frame}:${Math.round(live.signal * 1000)}`));
    const breathe = Math.sin(state.frame * 0.035) * 0.08;
    const coherence = 0.3 + live.control * 0.6;
    const sharp = 0.2 + live.rigor * 0.7;
    const smear = (1 - live.rigor) * 0.22;
    const dissolve = (1 - live.control) * 0.22;
    const out = [];

    for (let y = 0; y < rows; y += 1) {
      let row = "";
      const band = Math.sin(y * 0.45 + state.frame * 0.08) * 0.08;
      for (let x = 0; x < cols; x += 1) {
        let ch = baseLines[y][x] || " ";
        const noise = rr();
        const mask = ((x * 3 + y * 5 + state.frame) % 11) === 0 ? 1 : 0;
        if (noise < dissolve + mask * 0.02) ch = " .,:;-=+*#@"[Math.floor(rr() * 10)] || " ";
        if (noise < smear && x > 0) ch = baseLines[y][x - 1] || ch;
        if (noise < 0.06 + (1 - sharp) * 0.14) ch = " ";
        if (Math.abs(band + breathe) > coherence && noise < 0.36) ch = "~";
        row += ch;
      }
      out.push(row);
    }
    return out.join("\n");
  }

  function safeTickRate() {
    if (state.reduced) return 0;
    if (document.body.dataset.safe === "on") return 1000;
    return 118 - live.signal * 72;
  }

  function renderOnce() {
    readKnobs();
    stepOrganism();
    const org = organismText();
    if (hero) hero.textContent = org.text;
    if (portrait && state.portraitBase) portrait.textContent = contaminatePortrait(state.portraitBase);
    window.dispatchEvent(new CustomEvent("organism-heartbeat", { detail: { entropy: org.entropy } }));
    state.phaseBurst = Math.max(0, state.phaseBurst * 0.94 - 0.004);
  }

  function tick(ts) {
    if (!state.running) return;
    const rate = safeTickRate();
    if (rate === 0) {
      renderOnce();
      state.running = false;
      return;
    }
    if (!state.last || ts - state.last >= rate) {
      state.frame += 1;
      state.last = ts;
      renderOnce();
    }
    state.raf = requestAnimationFrame(tick);
  }

  function start() {
    if (state.running || state.reduced) return;
    state.running = true;
    state.raf = requestAnimationFrame(tick);
  }

  function stop() {
    state.running = false;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
  }

  function syncAll() {
    readKnobs();
    resizeGrid();
    if (state.reduced) {
      stop();
      renderOnce();
    } else {
      start();
    }
  }

  window.addEventListener("phase-shift", () => { state.phaseBurst = 1; });
  window.addEventListener("safe-mode-change", syncAll);
  window.addEventListener("mode-change", syncAll);
  window.addEventListener("lens-change", syncAll);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else syncAll();
  });
  window.addEventListener("resize", U.debounce(syncAll, 120));

  loadPortraitBase().then((base) => {
    state.portraitBase = base;
    syncAll();
  });
})();
