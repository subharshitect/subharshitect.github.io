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

  const STATE = { VOID: 0, MEMBRANE: 1, TISSUE: 2, LESION: 3, SCAR: 4 };
  const REGIME = { BIO: 0, FACE: 1, SYMBOL: 2 };

  const buildId = U.qs('meta[name="build-id"]')?.getAttribute("content") || "00000000-0000-0000";
  const baseSeed = hashText(buildId);

  const W = 108;
  const H = 24;
  const N = W * H;

  const stateGrid = new Uint8Array(N);
  const prevStateGrid = new Uint8Array(N);
  const nextStateGrid = new Uint8Array(N);

  const e = new Float32Array(N);
  const eNext = new Float32Array(N);
  const d = new Float32Array(N);
  const dNext = new Float32Array(N);
  const m = new Float32Array(N);
  const mNext = new Float32Array(N);
  const a = new Float32Array(N);
  const aNext = new Float32Array(N);
  const uField = new Float32Array(N);
  const uNext = new Float32Array(N);
  const bf = new Float32Array(N);

  const eyeMask = new Float32Array(N);

  const sim = {
    frame: 0,
    raf: 0,
    running: false,
    lastTs: 0,
    regime: REGIME.BIO,
    prevRegime: REGIME.BIO,
    smooth: { rho: 0.64, mu: 0.36, kappa: 0.39, nu: 0.61 },
    H: 0,
    bpm: 40,
    meanBf: 0,
    meanU: 0
  };

  const portrait = {
    w: 84,
    h: 96,
    L: new Float32Array(84 * 96),
    E: new Float32Array(84 * 96)
  };

  function idx(x, y) { return y * W + x; }
  function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  function clamp01(v) { return U.clamp(v, 0, 1); }
  function sigmoid(v) { return 1 / (1 + Math.exp(-v)); }

  function hashText(t) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i += 1) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function hashNoise(x, y, t) {
    let h = baseSeed ^ (x * 374761393) ^ (y * 668265263) ^ (t * 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= (h >>> 16);
    return ((h >>> 0) / 4294967295) * 2 - 1;
  }

  function softmax3(a0, a1, a2, temp) {
    const s0 = Math.exp(a0 / temp);
    const s1 = Math.exp(a1 / temp);
    const s2 = Math.exp(a2 / temp);
    const z = s0 + s1 + s2;
    return [s0 / z, s1 / z, s2 / z];
  }

  function controlsRaw() {
    const rho = Number(controls.rigor?.value || 64) / 100;
    const kappa = Number(controls.control?.value || 39) / 100;
    return { rho, mu: 1 - rho, kappa, nu: 1 - kappa };
  }

  function smoothControls() {
    const raw = controlsRaw();
    sim.smooth.rho += 0.08 * (raw.rho - sim.smooth.rho);
    sim.smooth.mu += 0.08 * (raw.mu - sim.smooth.mu);
    sim.smooth.kappa += 0.08 * (raw.kappa - sim.smooth.kappa);
    sim.smooth.nu += 0.08 * (raw.nu - sim.smooth.nu);
  }

  function initWorld() {
    const rand = U.seeded(baseSeed + 17);
    const cx = W / 2;
    const cy = H / 2;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const r = Math.hypot((x - cx) / 34, (y - cy) / 10);
        stateGrid[i] = r < 0.8 && rand() > 0.28 ? STATE.MEMBRANE : STATE.VOID;
        if (r < 0.55 && rand() > 0.35) stateGrid[i] = STATE.TISSUE;
        e[i] = clamp01((1 - r) * 0.65 + rand() * 0.1);
        d[i] = rand() * 0.03;
        m[i] = rand() * 0.05;
        a[i] = (1 - r) * 0.25;
        uField[i] = rand() * 0.03;
        prevStateGrid[i] = stateGrid[i];
      }
    }
    buildEyeMask();
  }

  function buildEyeMask() {
    const y0 = Math.floor(H * 0.42);
    const lx = Math.floor(W * 0.38);
    const rx = Math.floor(W * 0.62);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const l = Math.exp(-(((x - lx) ** 2) / 14 + ((y - y0) ** 2) / 6));
        const r = Math.exp(-(((x - rx) ** 2) / 14 + ((y - y0) ** 2) / 6));
        eyeMask[i] = clamp01(l + r);
      }
    }
  }

  function makeFallbackPortrait() {
    const cx = portrait.w * 0.5;
    const cy = portrait.h * 0.52;
    for (let y = 0; y < portrait.h; y += 1) {
      for (let x = 0; x < portrait.w; x += 1) {
        const i = y * portrait.w + x;
        const dx = (x - cx) / (portrait.w * 0.33);
        const dy = (y - cy) / (portrait.h * 0.42);
        const head = Math.max(0, 1 - (dx * dx + dy * dy));
        const eyeL = Math.exp(-(((x - portrait.w * 0.38) ** 2) / 62 + ((y - portrait.h * 0.44) ** 2) / 24));
        const eyeR = Math.exp(-(((x - portrait.w * 0.62) ** 2) / 62 + ((y - portrait.h * 0.44) ** 2) / 24));
        const nose = Math.exp(-(((x - cx) ** 2) / 75 + ((y - portrait.h * 0.58) ** 2) / 140));
        const mouth = Math.exp(-(((x - cx) ** 2) / 130 + ((y - portrait.h * 0.72) ** 2) / 38));
        portrait.L[i] = clamp01(0.18 + head * 0.72 - (eyeL + eyeR) * 0.38 - nose * 0.16 - mouth * 0.3);
      }
    }
    computePortraitEdge();
    projectFaceBias();
  }

  function computePortraitEdge() {
    const w = portrait.w;
    const h = portrait.h;
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const i = y * w + x;
        const gx = portrait.L[i + 1] - portrait.L[i - 1];
        const gy = portrait.L[i + w] - portrait.L[i - w];
        portrait.E[i] = clamp01(Math.hypot(gx, gy) * 1.8);
      }
    }
  }

  function projectFaceBias() {
    let sum = 0;
    const w1 = 0.7;
    const w2 = 0.3;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const px = Math.floor((x / (W - 1)) * (portrait.w - 1));
        const py = Math.floor((y / (H - 1)) * (portrait.h - 1));
        const p = py * portrait.w + px;
        const val = clamp01(w1 * (1 - portrait.L[p]) + w2 * portrait.E[p]);
        bf[i] = val;
        sum += val;
      }
    }
    sim.meanBf = sum / N;
  }

  function loadPortrait() {
    const canvas = document.createElement("canvas");
    const cx = canvas.getContext("2d", { willReadFrequently: true });
    if (!cx) {
      makeFallbackPortrait();
      return;
    }
    const img = new Image();
    img.addEventListener("load", () => {
      canvas.width = portrait.w;
      canvas.height = portrait.h;
      cx.drawImage(img, 0, 0, portrait.w, portrait.h);
      const raw = cx.getImageData(0, 0, portrait.w, portrait.h).data;
      for (let i = 0, p = 0; i < raw.length; i += 4, p += 1) {
        portrait.L[p] = (0.2126 * raw[i] + 0.7152 * raw[i + 1] + 0.0722 * raw[i + 2]) / 255;
      }
      computePortraitEdge();
      projectFaceBias();
    });
    img.addEventListener("error", makeFallbackPortrait);
    img.src = "assets/avatars/avatar1.jpg";
  }

  function neighborhoodStats(x, y) {
    let nAlive = 0;
    let nLesion = 0;
    let eSum = 0;
    let aSum = 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (!ox && !oy) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (!inb(nx, ny)) continue;
        const ni = idx(nx, ny);
        const s = stateGrid[ni];
        if (s >= STATE.MEMBRANE) nAlive += 1;
        if (s === STATE.LESION) nLesion += 1;
        eSum += e[ni];
        aSum += a[ni];
      }
    }
    return { nAlive, nLesion, nAliveHat: nAlive / 8, nLesionHat: nLesion / 8, exc: aSum / 8, eNbr: eSum / 8 };
  }

  function lapE(x, y) {
    const i = idx(x, y);
    const c = e[i];
    let sum = 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (!ox && !oy) continue;
        const nx = x + ox;
        const ny = y + oy;
        sum += inb(nx, ny) ? e[idx(nx, ny)] : c;
      }
    }
    return sum - 8 * c;
  }

  function regimeWeights() {
    const { rho, mu, kappa, nu } = sim.smooth;
    let uMean = 0;
    for (let i = 0; i < N; i += 1) uMean += uField[i];
    sim.meanU = uMean / N;

    const Lbio = 0.2 + 1.2 * (1 - kappa) + 0.8 * (1 - nu);
    const Lface = 0.1 + 1.6 * kappa + 1.0 * rho + 0.8 * sim.meanBf;
    const Lsym = 0.05 + 1.6 * nu + 1.0 * mu + 0.8 * sim.meanU;
    return softmax3(Lbio, Lface, Lsym, 0.25);
  }

  function regimeShock(regime) {
    const { nu } = sim.smooth;
    const As = regime === REGIME.SYMBOL ? 0.3 : regime === REGIME.FACE ? 0.18 : 0.12;
    const Bs = regime === REGIME.SYMBOL ? 0.2 : 0.1;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const n = hashNoise(x, y, sim.frame);
        e[i] = clamp01(e[i] + As * n);
        d[i] = clamp01(d[i] + Bs * (0.3 + 0.7 * nu));
      }
    }
  }

  function updateSystem() {
    smoothControls();

    const wr = regimeWeights();
    sim.regime = wr[1] > wr[0] && wr[1] > wr[2] ? REGIME.FACE : (wr[2] > wr[0] ? REGIME.SYMBOL : REGIME.BIO);
    if (sim.regime !== sim.prevRegime) {
      regimeShock(sim.regime);
      sim.prevRegime = sim.regime;
    }

    const { rho, mu, kappa, nu } = sim.smooth;
    const alpha0 = 0.085;
    const beta0 = 0.2;
    const gamma0 = 0.12;
    const lambda0 = 0.13;
    const eta0 = 0.08;
    const alpha = alpha0 * (0.6 + 0.9 * mu);
    const beta = beta0 * (0.7 + 0.5 * (1 - nu));
    const gamma = gamma0 * (0.6 + 1.2 * nu);
    const lambda = lambda0 * (0.4 + 1.2 * rho) * (1.1 - 0.6 * mu);
    const etaA = eta0 * (0.2 + 1.2 * nu) * (1 - 0.7 * rho);

    const c0 = 0.36;
    const c1 = 1.05;
    const c2 = 0.8;

    const tauM = 0.18;
    const tauD = 0.08;
    const tauH = 0.03;

    const thetaB0 = 0.35;
    const thetaT0 = 0.56;
    const thetaC0 = 0.32;
    const thetaE0 = 0.24;
    const p0 = 0.07;
    const L0 = 2;
    const L1 = 3;

    const thetaBirth = thetaB0 + 0.25 * rho - 0.15 * nu;
    const thetaTissue = thetaT0 + 0.2 * rho - 0.1 * nu;
    const thetaCool = thetaC0 + 0.15 * rho + 0.1 * kappa;
    const thetaErosion = thetaE0 + 0.1 * rho - 0.1 * nu;
    const pLesion = clamp01(p0 + 0.45 * nu - 0.25 * rho);

    let inh = 0;
    for (let i = 0; i < N; i += 1) inh += a[i];
    inh /= N;

    const we0 = 1.2;
    const wi0 = 0.8;
    const gf0 = 1.0;
    const etaA0 = 0.35;
    const we = we0 * (0.6 + 0.8 * kappa);
    const wi = wi0 * (0.6 + 0.6 * rho);
    const gf = gf0 * (0.5 + 1.0 * kappa);
    const etaAct = etaA0 * (0.2 + 1.0 * nu) * (1 - 0.7 * rho);

    const tauU = 0.11 + 0.2 * nu;
    const xiU = 0.06 + 0.18 * nu;
    const thetaU = 0.44 - 0.18 * nu;

    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const n = neighborhoodStats(x, y);
        const noise = hashNoise(x, y, sim.frame);
        const g = c1 * n.nAliveHat + c2 * n.nLesionHat - c0;

        let eNew = e[i] + alpha * lapE(x, y) + beta * sigmoid(g) - gamma * d[i] - lambda * m[i] + etaA * noise;

        const phi = sigmoid(2.6 * a[i]);
        const thetaBirthLocal = thetaBirth - 0.12 * kappa * phi;
        const thetaTissueLocal = thetaTissue - 0.1 * kappa * phi;

        eNew *= (1 - 0.55 * kappa * eyeMask[i]);
        eNew = clamp01(eNew);
        eNext[i] = eNew;

        mNext[i] = clamp01((1 - tauM) * m[i] + tauM * Math.abs(eNew - e[i]));

        const lesionFlag = stateGrid[i] === STATE.LESION ? 1 : 0;
        dNext[i] = clamp01(d[i] + tauD * lesionFlag - tauH * (1 - lesionFlag) * (1 - nu));

        const aNew = Math.tanh(we * n.exc - wi * inh + gf * bf[i] + etaAct * noise);
        aNext[i] = U.clamp(aNew, -1, 1);

        const ex = inb(x + 1, y) ? e[idx(x + 1, y)] - e[i] : 0;
        const ey = inb(x, y + 1) ? e[idx(x, y + 1)] - e[i] : 0;
        const bx = inb(x + 1, y) ? bf[idx(x + 1, y)] - bf[i] : 0;
        const by = inb(x, y + 1) ? bf[idx(x, y + 1)] - bf[i] : 0;

        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
        let rMax = 0;
        for (let k = 0; k < dirs.length; k += 1) {
          const dir = dirs[k];
          const dx = dir[0];
          const dy = dir[1];
          const dotE = ex * dx + ey * dy;
          const dotB = bx * dx + by * dy;
          const rd = sigmoid(2.2 * dotE) + sigmoid(1.8 * dotB);
          const px = x - dx;
          const py = y - dy;
          const prevU = inb(px, py) ? uField[idx(px, py)] : uField[i];
          rMax = Math.max(rMax, rd * prevU);
        }
        uNext[i] = clamp01((1 - tauU) * uField[i] + tauU * rMax + xiU * noise);

        const lesionRand = (hashNoise(x, y, sim.frame + 313) + 1) * 0.5;
        let s = stateGrid[i];
        if (s === STATE.VOID && eNew > thetaBirthLocal) s = lesionRand < pLesion ? STATE.LESION : STATE.MEMBRANE;
        else if (s === STATE.MEMBRANE && eNew > thetaTissueLocal) s = STATE.TISSUE;
        else if (s === STATE.TISSUE && n.nLesion > L0 + L1 * nu) s = STATE.LESION;
        else if (s === STATE.LESION && eNew < thetaCool) s = STATE.SCAR;
        else if (s === STATE.SCAR && eNew < thetaErosion) s = STATE.VOID;

        if (uNext[i] > thetaU) {
          if (hashNoise(x, y, sim.frame + 701) > -0.1) s = STATE.LESION;
        }

        nextStateGrid[i] = s;
      }
    }

    prevStateGrid.set(stateGrid);
    stateGrid.set(nextStateGrid);
    e.set(eNext);
    d.set(dNext);
    m.set(mNext);
    a.set(aNext);
    uField.set(uNext);

    let alive = 0;
    let changed = 0;
    let ru = 0;
    for (let i = 0; i < N; i += 1) {
      if (stateGrid[i] !== STATE.VOID) alive += 1;
      if (stateGrid[i] !== prevStateGrid[i]) changed += 1;
      if (uField[i] > (0.44 - 0.18 * sim.smooth.nu)) ru += 1;
    }
    const ra = alive / N;
    const rc = changed / N;
    const rru = ru / N;
    sim.H = clamp01(0.7 * ra + 1.8 * rc + 0.6 * rru);
    sim.bpm = U.clamp(Math.round(40 + 140 * sim.H), 40, 180);
    if (pulseEl) pulseEl.textContent = String(sim.bpm);
  }

  function glyphFor(i) {
    const stateVal = stateGrid[i];
    const sym = uField[i] > (0.44 - 0.18 * sim.smooth.nu);
    if (sym) {
      const symbols = "|/\\+#+#+#+#+#+";
      const k = Math.abs(Math.floor((uField[i] * 17 + sim.frame + i) % symbols.length));
      return symbols[k];
    }

    if (stateVal === STATE.VOID) return " ";
    if (stateVal === STATE.MEMBRANE) {
      const mChars = ".:-";
      return mChars[Math.min(2, Math.floor(e[i] * 3))];
    }
    if (stateVal === STATE.TISSUE) {
      const tChars = "=+*";
      return tChars[Math.min(2, Math.floor(e[i] * 3))];
    }
    if (stateVal === STATE.LESION) {
      const lChars = "#%@";
      return lChars[Math.min(2, Math.floor(e[i] * 3))];
    }
    const sChars = ";,'";
    return sChars[Math.min(2, Math.floor(e[i] * 3))];
  }

  function renderHero() {
    const lines = [];
    for (let y = 0; y < H; y += 1) {
      let row = "";
      for (let x = 0; x < W; x += 1) row += glyphFor(idx(x, y));
      lines.push(row);
    }
    heroEl.textContent = lines.join("\n");
  }

  function renderPortrait() {
    if (!portraitEl) return;
    const chars = " .'`^,:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
    const out = [];
    const A = 3 + Math.floor(sim.smooth.nu * 4);
    const omega = 0.17;
    const pDrop = clamp01(0.06 + 0.25 * sim.smooth.nu - 0.15 * sim.smooth.rho);

    for (let y = 0; y < portrait.h; y += 2) {
      let row = "";
      const phiY = (y * 13 + baseSeed % 97) * 0.09;
      const dx = Math.floor(A * Math.sin(omega * sim.frame + phiY));
      for (let x = 0; x < portrait.w; x += 1) {
        const sx = U.clamp(x + dx, 0, portrait.w - 1);
        const p = y * portrait.w + sx;
        const gx = Math.floor((sx / (portrait.w - 1)) * (W - 1));
        const gy = Math.floor((y / (portrait.h - 1)) * (H - 1));
        const gi = idx(gx, gy);

        const bp = clamp01(0.6 * bf[gi] + 0.25 * e[gi] + 0.15 * uField[gi]);
        const dropNoise = (hashNoise(x, y, sim.frame + 991) + 1) * 0.5;
        if (dropNoise < pDrop) {
          row += " ";
          continue;
        }
        const mix = clamp01(bp * (0.7 + 0.3 * (1 - portrait.L[p])) + portrait.E[p] * 0.25);
        row += chars[Math.floor(mix * (chars.length - 1))];
      }
      out.push(row);
    }
    portraitEl.textContent = out.join("\n");
  }

  function drawSigils() {
    U.qsa(".sigil").forEach((el) => {
      const sid = el.dataset.sigil || "section";
      const seed = hashText(`${buildId}:${sid}`);
      const w = 18;
      const h = 10;
      const g = Array.from({ length: h }, () => Array.from({ length: w }, () => " "));

      function setp(x, y, ch) {
        if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = ch;
      }

      function bline(x0, y0, x1, y1, ch) {
        let dx = Math.abs(x1 - x0);
        let sx = x0 < x1 ? 1 : -1;
        let dy = -Math.abs(y1 - y0);
        let sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        let x = x0;
        let y = y0;
        while (true) {
          setp(x, y, ch);
          if (x === x1 && y === y1) break;
          const e2 = 2 * err;
          if (e2 >= dy) { err += dy; x += sx; }
          if (e2 <= dx) { err += dx; y += sy; }
        }
      }

      for (let x = 0; x < w; x += 1) {
        if ((x + seed) % 4 !== 0) setp(x, 0, "─");
        if ((x + seed) % 5 !== 0) setp(x, h - 1, "─");
      }
      for (let y = 0; y < h; y += 1) {
        if ((y + seed) % 3 !== 0) setp(0, y, "│");
        if ((y + seed) % 4 !== 0) setp(w - 1, y, "│");
      }

      const cx = Math.floor(w / 2);
      const cy = Math.floor(h / 2);
      const mode = seed % 3;
      if (mode === 0) {
        bline(cx - 3, cy, cx + 3, cy, "─");
        bline(cx, cy - 3, cx, cy + 3, "│");
      } else if (mode === 1) {
        setp(cx, cy, "◉");
        bline(cx - 3, cy - 2, cx + 3, cy + 2, "╱");
        bline(cx - 3, cy + 2, cx + 3, cy - 2, "╲");
      } else {
        for (let k = 0; k < 6; k += 1) setp(cx + Math.floor(Math.cos((k / 6) * Math.PI * 2) * 3), cy + Math.floor(Math.sin((k / 6) * Math.PI * 2) * 2), "○");
      }

      const flourishes = ["~~~", "^^^", "///", "|||"];
      const f = flourishes[seed % flourishes.length];
      for (let i = 0; i < f.length; i += 1) {
        setp(2 + i, h - 2, f[i]);
        setp(w - 5 + i, 1, f[i]);
      }

      el.textContent = g.map((r) => r.join("")).join("\n");
    });
  }

  function shouldAnimate() {
    return !U.prefersReducedMotion() && document.body.dataset.safe !== "on" && !document.hidden;
  }

  function renderFrame() {
    updateSystem();
    renderHero();
    renderPortrait();
  }

  function tick(ts) {
    if (!sim.running) return;
    if (!sim.lastTs || ts - sim.lastTs > 70) {
      sim.lastTs = ts;
      sim.frame += 1;
      renderFrame();
    }
    sim.raf = requestAnimationFrame(tick);
  }

  function sync() {
    if (shouldAnimate()) {
      if (!sim.running) {
        sim.running = true;
        sim.raf = requestAnimationFrame(tick);
      }
    } else {
      sim.running = false;
      if (sim.raf) cancelAnimationFrame(sim.raf);
      sim.frame += 1;
      renderFrame();
    }
  }

  window.addEventListener("safe-mode-change", sync);
  window.addEventListener("lens-change", () => {
    sim.frame += 1;
    sync();
  });
  document.addEventListener("visibilitychange", sync);

  initWorld();
  loadPortrait();
  drawSigils();
  sync();
})();
