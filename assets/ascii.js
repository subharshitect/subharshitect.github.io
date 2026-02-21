(() => {
  "use strict";
  const U = window.__UTIL__;
  if (!U) return;

  const heroEl = U.qs("#ascii-hero");
  if (!heroEl) return;

  const portraitEl = U.qs("#ascii-portrait");
  const pulseEl = U.qs("#pulseVal");
  const controls = {
    rigor: U.qs("#lens-rigor"),
    compression: U.qs("#lens-compression"),
    control: U.qs("#lens-control")
  };

  const STATE = {
    VOID: 0,
    MEMBRANE: 1,
    TISSUE: 2,
    LESION: 3,
    SCAR: 4,
    SYMBOL: 5,
    FACE_ANCHOR: 6
  };

  const REGIME = { BIO: 0, FACE: 1, SYMBOL: 2 };
  const buildId = U.qs('meta[name="build-id"]')?.getAttribute("content") || "00000000-0000-0000";
  const W = 108;
  const H = 24;
  const N = W * H;

  const cellState = new Uint8Array(N);
  const nextState = new Uint8Array(N);
  const energy = new Float32Array(N);
  const nextEnergy = new Float32Array(N);
  const activation = new Float32Array(N);
  const nextActivation = new Float32Array(N);
  const age = new Uint16Array(N);
  const damage = new Float32Array(N);
  const memory0 = new Float32Array(N);
  const memory1 = new Float32Array(N);
  const memory2 = new Float32Array(N);
  const neuralBias = new Float32Array(N);
  const symbolicBias = new Float32Array(N);
  const faceBias = new Float32Array(N);
  const regimeOwner = new Uint8Array(N);

  const state = {
    frame: 0,
    raf: 0,
    running: false,
    last: 0,
    entropy: 0,
    bpm: 0,
    regime: REGIME.BIO,
    prevRegime: REGIME.BIO,
    symmetryError: 1,
    bilateral: 0,
    smooth: { rigor: 0.64, romance: 0.36, control: 0.39, surrender: 0.61, compression: 0.72 }
  };

  const portraitData = { width: 84, height: 96, lum: new Float32Array(84 * 96), edge: new Float32Array(84 * 96) };

  function hash4(a, b, c, d) {
    let h = 2166136261 ^ a;
    h = Math.imul(h ^ b, 16777619);
    h = Math.imul(h ^ c, 16777619);
    h = Math.imul(h ^ d, 16777619);
    return ((h >>> 0) % 10000) / 10000;
  }

  function seedFromText(t) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i += 1) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  const baseSeed = seedFromText(buildId);

  function idx(x, y) { return y * W + x; }
  function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  function sigmoid(v) { return 1 / (1 + Math.exp(-v)); }

  function readControls() {
    const r = Number(controls.rigor?.value || 64) / 100;
    const c = Number(controls.control?.value || 39) / 100;
    const p = Number(controls.compression?.value || 72) / 100;
    return { rigor: r, romance: 1 - r, control: c, surrender: 1 - c, compression: p };
  }

  function smoothControls() {
    const raw = readControls();
    const k = 0.08;
    Object.keys(state.smooth).forEach((name) => {
      state.smooth[name] += (raw[name] - state.smooth[name]) * k;
    });
  }

  function initGrid() {
    const rand = U.seeded(baseSeed + 404);
    const cx = W / 2;
    const cy = H / 2;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const d = Math.hypot((x - cx) / 32, (y - cy) / 10);
        cellState[i] = d < 1.05 && rand() > d * 0.8 ? STATE.MEMBRANE : STATE.VOID;
        if (d < 0.62 && rand() > 0.52) cellState[i] = STATE.TISSUE;
        energy[i] = U.clamp((1 - d) * 0.8 + rand() * 0.12, 0, 1);
        activation[i] = U.clamp((1 - d) * 0.6, 0, 1);
        damage[i] = rand() * 0.04;
        memory0[i] = rand() * 0.1;
        memory1[i] = rand() * 0.1;
        memory2[i] = rand() * 0.1;
        symbolicBias[i] = hash4(x, y, baseSeed, 17) * 0.4;
      }
    }
  }

  function buildFallbackFace() {
    const w = portraitData.width;
    const h = portraitData.height;
    const cx = w * 0.5;
    const cy = h * 0.52;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = y * w + x;
        const dx = (x - cx) / (w * 0.33);
        const dy = (y - cy) / (h * 0.42);
        const head = Math.max(0, 1 - (dx * dx + dy * dy));
        const eyeL = Math.exp(-(((x - w * 0.38) ** 2) / 60 + ((y - h * 0.44) ** 2) / 26));
        const eyeR = Math.exp(-(((x - w * 0.62) ** 2) / 60 + ((y - h * 0.44) ** 2) / 26));
        const nose = Math.exp(-(((x - cx) ** 2) / 70 + ((y - h * 0.58) ** 2) / 140));
        const mouth = Math.exp(-(((x - cx) ** 2) / 130 + ((y - h * 0.72) ** 2) / 34));
        const l = U.clamp(0.1 + head * 0.6 - (eyeL + eyeR) * 0.35 - nose * 0.16 - mouth * 0.3, 0, 1);
        portraitData.lum[i] = l;
      }
    }
    computeEdge();
    applyFaceBias();
  }

  function computeEdge() {
    const w = portraitData.width;
    const h = portraitData.height;
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x;
        const gx = portraitData.lum[i + 1] - portraitData.lum[i - 1];
        const gy = portraitData.lum[i + w] - portraitData.lum[i - w];
        portraitData.edge[i] = Math.min(1, Math.hypot(gx, gy) * 1.7);
      }
    }
  }

  function applyFaceBias() {
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const px = Math.floor((x / (W - 1)) * (portraitData.width - 1));
        const py = Math.floor((y / (H - 1)) * (portraitData.height - 1));
        const p = py * portraitData.width + px;
        faceBias[i] = portraitData.lum[p] * 0.65 + portraitData.edge[p] * 0.35;
        neuralBias[i] = faceBias[i] * 0.7 + (1 - Math.abs((x - W / 2) / (W / 2))) * 0.12;
      }
    }
  }

  function loadPortrait() {
    const canvas = document.createElement("canvas");
    const cx = canvas.getContext("2d", { willReadFrequently: true });
    if (!cx) {
      buildFallbackFace();
      return;
    }
    const img = new Image();
    img.addEventListener("load", () => {
      canvas.width = portraitData.width;
      canvas.height = portraitData.height;
      cx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const raw = cx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 0, p = 0; i < raw.length; i += 4, p += 1) {
        portraitData.lum[p] = (raw[i] * 0.2126 + raw[i + 1] * 0.7152 + raw[i + 2] * 0.0722) / 255;
      }
      computeEdge();
      applyFaceBias();
    });
    img.addEventListener("error", buildFallbackFace);
    img.src = "assets/avatars/avatar1.jpg";
  }

  function dominantRegime() {
    const p = state.smooth;
    if (p.control > 0.7 && p.rigor > 0.6) return REGIME.FACE;
    if (p.surrender > 0.6 && p.romance > 0.5) return REGIME.SYMBOL;
    return REGIME.BIO;
  }

  function regimeSpike(newRegime) {
    for (let i = 0; i < N; i += 1) {
      const spike = newRegime === REGIME.SYMBOL ? 0.55 : 0.35;
      energy[i] = U.clamp(energy[i] + spike * (cellState[i] !== STATE.VOID ? 1 : 0.25), 0, 1.4);
      damage[i] = U.clamp(damage[i] + (newRegime === REGIME.SYMBOL ? 0.15 : 0.08), 0, 1);
    }
  }

  function neighborhood(x, y) {
    let alive = 0;
    let lesion = 0;
    let meanEnergy = 0;
    let aSum = 0;
    let count = 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (!ox && !oy) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (!inb(nx, ny)) continue;
        const ni = idx(nx, ny);
        const ns = cellState[ni];
        if (ns === STATE.MEMBRANE || ns === STATE.TISSUE || ns === STATE.FACE_ANCHOR) alive += 1;
        if (ns === STATE.LESION) lesion += 1;
        meanEnergy += energy[ni];
        aSum += activation[ni];
        count += 1;
      }
    }
    return { alive, lesion, meanEnergy: count ? meanEnergy / count : 0, meanActivation: count ? aSum / count : 0 };
  }

  function laplacianEnergy(x, y) {
    const i = idx(x, y);
    const c = energy[i];
    const l = inb(x - 1, y) ? energy[idx(x - 1, y)] : c;
    const r = inb(x + 1, y) ? energy[idx(x + 1, y)] : c;
    const u = inb(x, y - 1) ? energy[idx(x, y - 1)] : c;
    const d = inb(x, y + 1) ? energy[idx(x, y + 1)] : c;
    return l + r + u + d - 4 * c;
  }

  function neuralStep(x, y, i) {
    const n = neighborhood(x, y);
    const inhibition = damage[i] * (0.55 + state.smooth.surrender * 0.5) + memory2[i] * 0.2;
    const weighted = n.meanActivation * (0.9 + state.smooth.control * 0.9);
    return sigmoid(weighted + neuralBias[i] * (0.6 + state.smooth.control * 0.7) + faceBias[i] * 0.5 - inhibition);
  }

  function symbolGrammarBurst() {
    const centerX = Math.floor(W * 0.5);
    const centerY = Math.floor(H * 0.42);
    const lines = [
      { dx: 1, dy: 0, len: 16 },
      { dx: 0, dy: 1, len: 6 },
      { dx: 1, dy: 1, len: 7 },
      { dx: -1, dy: 1, len: 7 }
    ];
    lines.forEach((l) => {
      for (let s = -l.len; s <= l.len; s += 1) {
        const x = centerX + l.dx * s;
        const y = centerY + l.dy * s;
        if (!inb(x, y)) continue;
        const i = idx(x, y);
        cellState[i] = STATE.SYMBOL;
        energy[i] = Math.max(energy[i], 0.8);
        regimeOwner[i] = REGIME.SYMBOL;
      }
    });
  }

  function updateWorld() {
    smoothControls();
    state.regime = dominantRegime();
    if (state.regime !== state.prevRegime) {
      regimeSpike(state.regime);
      if (state.regime === REGIME.SYMBOL) symbolGrammarBurst();
      state.prevRegime = state.regime;
    }

    const alpha = 0.12 + state.smooth.romance * 0.22;
    const beta = 0.05 + state.smooth.compression * 0.22;
    const gamma = 0.04 + state.smooth.surrender * 0.12;
    const eta = 0.02;
    const thetaBirth = 0.34 + state.smooth.rigor * 0.18;
    const thetaTissue = 0.55 + state.smooth.rigor * 0.2;
    const thetaCool = 0.3 + state.smooth.control * 0.2;
    const thetaErosion = 0.22 + state.smooth.surrender * 0.12;
    const lesionL = 2 + Math.floor(state.smooth.surrender * 3);

    let changed = 0;
    let symErr = 0;
    let bilateral = 0;

    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const n = neighborhood(x, y);
        const lap = laplacianEnergy(x, y);
        const noise = hash4(x, y, state.frame, baseSeed) - 0.5;
        const de = alpha * lap + beta * n.alive - gamma * damage[i] + eta * noise;

        nextEnergy[i] = U.clamp(energy[i] + de + faceBias[i] * 0.05 * state.smooth.control, 0, 1.4);
        nextActivation[i] = neuralStep(x, y, i);

        memory0[i] = U.clamp(memory0[i] * 0.92 + (cellState[i] === STATE.LESION ? 0.1 : 0), 0, 1);
        memory1[i] = U.clamp(memory1[i] * 0.95 + nextEnergy[i] * 0.03, 0, 1);
        memory2[i] = U.clamp(memory2[i] * 0.9 + (cellState[i] === STATE.SYMBOL ? 0.06 : 0), 0, 1);

        let s = cellState[i];
        if (s === STATE.VOID && nextEnergy[i] > thetaBirth) s = STATE.MEMBRANE;
        else if (s === STATE.MEMBRANE && nextEnergy[i] > thetaTissue) s = STATE.TISSUE;
        else if (s === STATE.TISSUE && (n.lesion > lesionL || damage[i] > 0.72)) s = STATE.LESION;
        else if (s === STATE.LESION && nextEnergy[i] < thetaCool) s = STATE.SCAR;
        else if (s === STATE.SCAR && nextEnergy[i] < thetaErosion && memory0[i] < 0.2) s = STATE.VOID;

        if (state.regime === REGIME.FACE && faceBias[i] > 0.45 && nextActivation[i] > 0.64) {
          s = STATE.FACE_ANCHOR;
          regimeOwner[i] = REGIME.FACE;
        }

        if (state.regime === REGIME.SYMBOL) {
          const grad = nextEnergy[i] - n.meanEnergy;
          const spread = hash4(i, state.frame, baseSeed, 71);
          if ((s === STATE.SYMBOL || symbolicBias[i] + grad > 0.3) && spread < 0.12 + state.smooth.surrender * 0.28) {
            s = STATE.SYMBOL;
            regimeOwner[i] = REGIME.SYMBOL;
          }
        }

        if (s === STATE.SYMBOL && hash4(i, state.frame, baseSeed, 91) < 0.06) {
          const nx = x + (hash4(i, state.frame, 13, 5) > 0.5 ? 1 : -1);
          const ny = y + (hash4(i, state.frame, 17, 6) > 0.5 ? 1 : -1);
          if (inb(nx, ny)) nextState[idx(nx, ny)] = STATE.SYMBOL;
        }

        damage[i] = U.clamp(damage[i] * 0.965 + (s === STATE.LESION ? 0.03 : -0.008), 0, 1);
        age[i] = s === STATE.VOID ? 0 : Math.min(65535, age[i] + 1);

        if (nextState[i] !== STATE.SYMBOL) nextState[i] = s;
        if (nextState[i] !== cellState[i]) changed += 1;

        const mx = W - 1 - x;
        const mi = idx(mx, y);
        symErr += Math.abs(nextActivation[i] - activation[mi]);
        bilateral += nextActivation[i] * activation[mi];
      }
    }

    cellState.set(nextState);
    energy.set(nextEnergy);
    activation.set(nextActivation);
    nextState.fill(STATE.VOID);

    state.symmetryError = symErr / N;
    state.bilateral = bilateral / N;
    state.entropy = changed / N;
    state.bpm = Math.round(44 + state.entropy * 420 + (1 - state.symmetryError) * 80 + state.bilateral * 20);
    if (pulseEl) pulseEl.textContent = String(state.bpm);
  }

  function charFor(i) {
    const s = cellState[i];
    const e = energy[i];
    if (s === STATE.VOID) return " ";
    if (s === STATE.MEMBRANE) return e > 0.65 ? "-" : e > 0.45 ? ":" : ".";
    if (s === STATE.TISSUE || s === STATE.FACE_ANCHOR) return e > 0.8 ? "*" : e > 0.6 ? "+" : "=";
    if (s === STATE.LESION) return e > 0.7 ? "%" : e > 0.45 ? "@" : "#";
    if (s === STATE.SCAR) return e > 0.4 ? ";" : e > 0.25 ? "," : "'";
    return (state.frame + i) % 3 ? "|" : "#";
  }

  function renderHero() {
    const lines = [];
    for (let y = 0; y < H; y += 1) {
      let row = "";
      for (let x = 0; x < W; x += 1) row += charFor(idx(x, y));
      lines.push(row);
    }
    heroEl.textContent = lines.join("\n");
  }

  function renderPortrait() {
    if (!portraitEl) return;
    const chars = " .'`^,:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
    const out = [];
    const w = portraitData.width;
    const h = portraitData.height;
    const breath = 1 + Math.sin(state.frame * 0.11) * (0.16 + state.smooth.romance * 0.24);
    const tear = 1 + Math.floor(state.smooth.surrender * 4);
    for (let y = 0; y < h; y += 2) {
      let row = "";
      const shift = (y + state.frame) % 13 === 0 ? tear : 0;
      for (let x = 0; x < w; x += 1) {
        const sx = U.clamp(x + shift, 0, w - 1);
        const p = y * w + sx;
        const gx = Math.floor((sx / (w - 1)) * (W - 1));
        const gy = Math.floor((y / (h - 1)) * (H - 1));
        const gi = idx(gx, gy);
        let lum = portraitData.lum[p] * breath;
        lum += portraitData.edge[p] * (0.35 + state.smooth.rigor * 0.6);
        lum += activation[gi] * 0.25 + faceBias[gi] * 0.2;
        if (((x * 11 + y * 7 + state.frame * 5) % 97) < (5 + state.smooth.compression * 18)) lum *= 0.48;
        if ((x + y + state.frame) % (3 + Math.floor(state.smooth.rigor * 3)) === 0) lum -= 0.08;
        lum = U.clamp(lum, 0, 1);
        row += chars[Math.floor(lum * (chars.length - 1))];
      }
      out.push(row);
    }
    portraitEl.textContent = out.join("\n");
  }

  function drawSigils() {
    U.qsa(".sigil").forEach((el) => {
      const id = el.dataset.sigil || "section";
      const rand = U.seeded(seedFromText(`${buildId}:${id}`));
      const w = 19;
      const h = 7;
      const g = Array.from({ length: h }, () => Array.from({ length: w }, () => " "));
      for (let x = 0; x < w; x += 1) { g[0][x] = x % 2 ? "─" : "┄"; g[h - 1][x] = x % 3 ? "─" : "┄"; }
      for (let y = 0; y < h; y += 1) { g[y][0] = y % 2 ? "│" : "┆"; g[y][w - 1] = y % 3 ? "│" : "┆"; }
      for (let n = 0; n < 25; n += 1) {
        const x = 1 + Math.floor(rand() * (w - 2));
        const y = 1 + Math.floor(rand() * (h - 2));
        g[y][x] = rand() > 0.45 ? "┼" : "·";
      }
      g[3][9] = "◉";
      g[2][9] = "╫";
      g[4][9] = "╪";
      g[3][8] = "<";
      g[3][10] = ">";
      el.textContent = g.map((r) => r.join("")).join("\n");
    });
  }

  function shouldAnimate() {
    return !U.prefersReducedMotion() && document.body.dataset.safe !== "on" && !document.hidden;
  }

  function renderFrame() {
    updateWorld();
    renderHero();
    renderPortrait();
  }

  function tick(ts) {
    if (!state.running) return;
    if (!state.last || ts - state.last > 68) {
      state.last = ts;
      state.frame += 1;
      renderFrame();
    }
    state.raf = requestAnimationFrame(tick);
  }

  function sync() {
    if (shouldAnimate()) {
      if (!state.running) {
        state.running = true;
        state.raf = requestAnimationFrame(tick);
      }
    } else {
      state.running = false;
      if (state.raf) cancelAnimationFrame(state.raf);
      state.frame += 1;
      renderFrame();
    }
  }

  window.addEventListener("safe-mode-change", sync);
  window.addEventListener("lens-change", () => {
    state.frame += 1;
    sync();
  });
  document.addEventListener("visibilitychange", sync);

  initGrid();
  loadPortrait();
  drawSigils();
  sync();
})();
