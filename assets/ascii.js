(() => {
  "use strict";
  const U = window.__UTIL__;
  if (!U) return;

  const mounts = {
    hero: U.qs("#ascii-hero"),
    portrait: U.qs("#ascii-portrait"),
    archive: U.qs("#ascii-archive"),
    writing: U.qs("#ascii-writing"),
    terminal: U.qs("#ascii-terminal")
  };
  if (!mounts.hero || !mounts.portrait || !mounts.archive || !mounts.writing || !mounts.terminal) return;

  const diagEls = {
    hero: U.qs("#diag-hero"),
    portrait: U.qs("#diag-portrait"),
    archive: U.qs("#diag-archive"),
    writing: U.qs("#diag-writing"),
    terminal: U.qs("#diag-terminal")
  };
  const pulseEl = U.qs("#pulseVal");
  const controls = { rigor: U.qs("#lens-rigor"), control: U.qs("#lens-control") };

  const buildId = U.qs('meta[name="build-id"]')?.getAttribute("content") || "00000000-0000-0000";

  const STATE = { VOID: 0, MEMBRANE: 1, TISSUE: 2, LESION: 3, SCAR: 4 };
  const OWNER = { BIO: 0, FACE: 1, SYMBOL: 2 };
  const NSEC = 5;
  const W = 110;
  const H = 60;
  const N = W * H;
  const Hs = Math.floor(H / NSEC);
  const B = 3;

  const G = new Uint8Array(N);
  const Gprev = new Uint8Array(N);
  const Gnext = new Uint8Array(N);
  const e = new Float32Array(N), en = new Float32Array(N);
  const d = new Float32Array(N), dn = new Float32Array(N);
  const m = new Float32Array(N), mn = new Float32Array(N);
  const a = new Float32Array(N), an = new Float32Array(N);
  const u = new Float32Array(N), un = new Float32Array(N);
  const bf = new Float32Array(N);
  const owner = new Uint8Array(N);
  const age = new Uint16Array(N);
  const eyeMask = new Float32Array(N);
  const textMask = new Float32Array(N);

  const portrait = { w: 84, h: 96, L: new Float32Array(84 * 96), E: new Float32Array(84 * 96) };

  const sim = {
    frame: 0, running: false, raf: 0, last: 0,
    rhoBar: 0.64, muBar: 0.36, kappaBar: 0.39, nuBar: 0.61,
    regime: OWNER.BIO, prevRegime: OWNER.BIO, bpm: 40,
    Hs: new Float32Array(NSEC), globalH: 0, scroll: 0
  };

  const seed = hash(buildId, 7, 19, 23, 29);

  function idx(x, y) { return y * W + x; }
  function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  function sidFromY(y) { return U.clamp(Math.floor(y / Hs), 0, NSEC - 1); }
  function clamp01(v) { return U.clamp(v, 0, 1); }
  function sig(v) { return 1 / (1 + Math.exp(-v)); }

  function hash(a, b, c, d, e0) {
    let h = 2166136261 ^ a.toString().length;
    const arr = [a, b, c, d, e0];
    for (let i = 0; i < arr.length; i += 1) {
      const s = String(arr[i]);
      for (let j = 0; j < s.length; j += 1) {
        h ^= s.charCodeAt(j);
        h = Math.imul(h, 16777619);
      }
    }
    return h >>> 0;
  }

  function noise(x, y, t, k) {
    let h = seed ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(t + 1, 2246822519) ^ Math.imul(k + 1, 1597334677);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h >>> 0) / 4294967295) * 2 - 1;
  }

  function tri(p, c, w) { return Math.max(0, 1 - Math.abs(p - c) / w); }

  function controlRaw() {
    const rho = Number(controls.rigor?.value || 64) / 100;
    const kappa = Number(controls.control?.value || 39) / 100;
    return { rho, mu: 1 - rho, kappa, nu: 1 - kappa };
  }

  function smoothControls() {
    const r = controlRaw();
    sim.rhoBar += 0.08 * (r.rho - sim.rhoBar);
    sim.muBar += 0.08 * (r.mu - sim.muBar);
    sim.kappaBar += 0.08 * (r.kappa - sim.kappaBar);
    sim.nuBar += 0.08 * (r.nu - sim.nuBar);
  }

  function setupMasks() {
    const yEye = Math.floor((Hs + 2) + Hs * 0.36);
    const lx = Math.floor(W * 0.39), rx = Math.floor(W * 0.61);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const l = Math.exp(-(((x - lx) ** 2) / 18 + ((y - yEye) ** 2) / 8));
        const r = Math.exp(-(((x - rx) ** 2) / 18 + ((y - yEye) ** 2) / 8));
        eyeMask[i] = clamp01(l + r);
      }
    }

    const wt = (U.qs("#writing")?.textContent || "").replace(/\s+/g, " ").trim();
    const y0 = Hs * 3 + 1;
    const y1 = Math.min(H - 1, Hs * 4 - 1);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = 2; x < W - 2; x += 1) {
        const ci = (x + (y - y0) * 3) % Math.max(1, wt.length);
        const ch = wt.charCodeAt(ci) || 32;
        textMask[idx(x, y)] = ch === 32 ? 0 : 1;
      }
    }
  }

  function initWorld() {
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const s = sidFromY(y);
        const cx = W / 2;
        const cy = s * Hs + Hs * 0.5;
        const r = Math.hypot((x - cx) / 26, (y - cy) / 5.5);
        G[i] = r < 0.95 && noise(x, y, 0, 31) > -0.2 ? STATE.MEMBRANE : STATE.VOID;
        if (r < 0.66 && noise(x, y, 0, 33) > -0.1) G[i] = STATE.TISSUE;
        e[i] = clamp01((1 - r) * 0.6 + (noise(x, y, 0, 35) + 1) * 0.05);
        d[i] = clamp01((noise(x, y, 0, 37) + 1) * 0.02);
        m[i] = clamp01((noise(x, y, 0, 39) + 1) * 0.03);
        a[i] = noise(x, y, 0, 41) * 0.1;
        u[i] = clamp01((noise(x, y, 0, 43) + 1) * 0.02);
        owner[i] = OWNER.BIO;
      }
    }
    Gprev.set(G);
  }

  function loadPortrait() {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return fallbackFace();
    const img = new Image();
    img.addEventListener("load", () => {
      c.width = portrait.w; c.height = portrait.h;
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const raw = ctx.getImageData(0, 0, c.width, c.height).data;
      for (let i = 0, p = 0; i < raw.length; i += 4, p += 1) {
        portrait.L[p] = (0.2126 * raw[i] + 0.7152 * raw[i + 1] + 0.0722 * raw[i + 2]) / 255;
      }
      edgeMap();
      projectFace();
    });
    img.addEventListener("error", fallbackFace);
    img.src = "assets/avatars/avatar1.jpg";
  }

  function fallbackFace() {
    const cx = portrait.w * 0.5, cy = portrait.h * 0.52;
    for (let y = 0; y < portrait.h; y += 1) {
      for (let x = 0; x < portrait.w; x += 1) {
        const i = y * portrait.w + x;
        const mh = Math.max(0, 1 - (((x - cx) / (portrait.w * 0.34)) ** 2 + ((y - cy) / (portrait.h * 0.42)) ** 2));
        const me1 = Math.exp(-(((x - portrait.w * 0.38) ** 2) / 70 + ((y - portrait.h * 0.45) ** 2) / 26));
        const me2 = Math.exp(-(((x - portrait.w * 0.62) ** 2) / 70 + ((y - portrait.h * 0.45) ** 2) / 26));
        const mn = Math.exp(-(((x - cx) ** 2) / 95 + ((y - portrait.h * 0.60) ** 2) / 180));
        const mm = Math.exp(-(((x - cx) ** 2) / 130 + ((y - portrait.h * 0.73) ** 2) / 36));
        portrait.L[i] = clamp01(0.8 - (0.55 * mh + 0.35 * (me1 + me2) + 0.2 * mn + 0.22 * mm));
      }
    }
    edgeMap();
    projectFace();
  }

  function edgeMap() {
    const w = portrait.w;
    for (let y = 1; y < portrait.h - 1; y += 1) {
      for (let x = 1; x < portrait.w - 1; x += 1) {
        const i = y * w + x;
        const gx = portrait.L[i + 1] - portrait.L[i - 1];
        const gy = portrait.L[i + w] - portrait.L[i - w];
        portrait.E[i] = clamp01(Math.hypot(gx, gy) * 1.7);
      }
    }
  }

  function projectFace() {
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const px = Math.floor((x / (W - 1)) * (portrait.w - 1));
        const py = Math.floor((y / (H - 1)) * (portrait.h - 1));
        const p = py * portrait.w + px;
        bf[i] = clamp01(0.7 * (1 - portrait.L[p]) + 0.3 * portrait.E[p]);
      }
    }
  }

  function stats(x, y) {
    let na = 0, nl = 0, as = 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (!ox && !oy) continue;
        const nx = x + ox, ny = y + oy;
        if (!inb(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (G[ni] >= STATE.MEMBRANE) na += 1;
        if (G[ni] === STATE.LESION) nl += 1;
        as += a[ni];
      }
    }
    return { na, nl, nah: na / 8, nlh: nl / 8, exc: as / 8 };
  }

  function lap(x, y) {
    const i = idx(x, y); const c = e[i];
    let s = 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (!ox && !oy) continue;
        const nx = x + ox, ny = y + oy;
        s += inb(nx, ny) ? e[idx(nx, ny)] : c;
      }
    }
    return s - 8 * c;
  }

  function phaseWeights() {
    const Tp = 1800;
    const p = (sim.frame % Tp) / Tp;
    let wd = tri(p, 0.125, 0.2), wf = tri(p, 0.375, 0.2), wc = tri(p, 0.625, 0.2), wr = tri(p, 0.875, 0.2);
    const S = wd + wf + wc + wr + 1e-6;
    wd /= S; wf /= S; wc /= S; wr /= S;
    return { wd, wf, wc, wr };
  }

  function scrollProgress() {
    const denom = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    sim.scroll = U.clamp(window.scrollY / denom, 0, 1);
  }

  function regimeAndShock() {
    let mb = 0, mu = 0;
    for (let i = 0; i < N; i += 1) { mb += bf[i]; mu += u[i]; }
    mb /= N; mu /= N;

    const s = sim.scroll;
    const Lb = 0.15 + 1.2 * (1 - sim.kappaBar) + 0.8 * (1 - sim.nuBar);
    const Lf = 0.05 + 1.6 * sim.kappaBar + 1.0 * sim.rhoBar + 0.8 * mb + 0.25 * (1 - s);
    const Ls = 0.05 + 1.6 * sim.nuBar + 1.0 * sim.muBar + 0.8 * mu + 0.25 * s;
    const t = 0.25;
    const eb = Math.exp(Lb / t), ef = Math.exp(Lf / t), es = Math.exp(Ls / t), z = eb + ef + es;
    const wb = eb / z, wf = ef / z, ws = es / z;
    sim.regime = wf > wb && wf > ws ? OWNER.FACE : (ws > wb ? OWNER.SYMBOL : OWNER.BIO);
    if (sim.regime !== sim.prevRegime) {
      const As = sim.regime === OWNER.SYMBOL ? 0.22 : sim.regime === OWNER.FACE ? 0.16 : 0.12;
      const Bs = sim.regime === OWNER.SYMBOL ? 0.19 : 0.1;
      const Cs = sim.regime === OWNER.SYMBOL ? 0.24 : 0.1;
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          const i = idx(x, y);
          e[i] = clamp01(e[i] + As * (0.4 + 0.6 * sim.nuBar) * noise(x, y, sim.frame, 4));
          d[i] = clamp01(d[i] + Bs * (0.3 + 0.7 * sim.nuBar));
          u[i] = clamp01(u[i] + Cs * (0.2 + 0.8 * sim.nuBar) * Math.abs(noise(x, y, sim.frame, 5)));
        }
      }
      sim.prevRegime = sim.regime;
    }
  }

  function stampSigilsIntoField() {
    const stamps = [
      { id: "hero", sx: 2, sy: 1 },
      { id: "portrait", sx: 2, sy: Hs + 1 },
      { id: "archive", sx: 2, sy: Hs * 2 + 1 },
      { id: "writing", sx: 2, sy: Hs * 3 + 1 },
      { id: "terminal", sx: 2, sy: Hs * 4 + 1 }
    ];
    for (let s = 0; s < stamps.length; s += 1) {
      const st = stamps[s];
      const ss = hash(buildId, st.id, 17, 33, 51);
      for (let j = 0; j < 10; j += 1) {
        for (let i = 0; i < 18; i += 1) {
          const x = st.sx + i, y = st.sy + j;
          if (!inb(x, y)) continue;
          const edge = i === 0 || j === 0 || i === 17 || j === 9;
          const cross = i === 9 || j === 5;
          const flour = (j === 8 && i >= 2 && i <= 4) || (j === 1 && i >= 13 && i <= 15);
          const broken = ((i + j + ss) % 4 !== 0);
          if ((edge && broken) || cross || flour) {
            const ii = idx(x, y);
            u[ii] = Math.max(u[ii], 0.82 + 0.15 * ((ss + i + j) % 7) / 7);
          }
        }
      }
    }
  }

  function step() {
    smoothControls();
    scrollProgress();
    regimeAndShock();
    stampSigilsIntoField();

    const ph = phaseWeights();

    const alpha0 = 0.08, beta0 = 0.2, gamma0 = 0.11, lambda0 = 0.12, eta0 = 0.08, omega0 = 0.25;
    let alpha = alpha0 * (0.6 + 0.9 * sim.muBar);
    let beta = beta0 * (0.7 + 0.5 * (1 - sim.nuBar));
    let gamma = gamma0 * (0.6 + 1.2 * sim.nuBar);
    let lambda = lambda0 * (0.4 + 1.2 * sim.rhoBar) * (1.1 - 0.6 * sim.muBar);
    let etaA = eta0 * (0.2 + 1.2 * sim.nuBar) * (1 - 0.7 * sim.rhoBar);
    const omegaSym = omega0 * sim.kappaBar;

    beta *= (1 + 0.35 * ph.wd);
    etaA *= (1 - 0.25 * ph.wd);
    gamma *= (1 + 0.45 * ph.wc);

    const c0 = 0.36, c1 = 1.02, c2 = 0.82;
    const tauM = 0.18, tauD = 0.08;
    let tauH = 0.03 * (1 + 0.4 * ph.wr);

    const tb0 = 0.35, tt0 = 0.56, tc0 = 0.32, te0 = 0.24;
    let thetaBirth = tb0 + 0.25 * sim.rhoBar - 0.15 * sim.nuBar;
    let thetaTissue = tt0 + 0.2 * sim.rhoBar - 0.1 * sim.nuBar;
    const thetaCool = tc0 + 0.15 * sim.rhoBar + 0.1 * sim.kappaBar;
    let thetaErosion = te0 + 0.1 * sim.rhoBar - 0.1 * sim.nuBar;
    let pLesion = clamp01(0.07 + 0.45 * sim.nuBar - 0.25 * sim.rhoBar + 0.25 * ph.wf);

    let meanA = 0;
    for (let i = 0; i < N; i += 1) meanA += a[i];
    meanA /= N;

    let we = 1.2 * (0.6 + 0.8 * sim.kappaBar);
    let wi = 0.8 * (0.6 + 0.6 * sim.rhoBar);
    let gf = 1.0 * (0.5 + 1.0 * sim.kappaBar) * (1 + 0.2 * ph.wr * sim.kappaBar);
    let etaAct = 0.35 * (0.2 + 1.0 * sim.nuBar) * (1 - 0.7 * sim.rhoBar);

    let tauUBase = (0.11 + 0.2 * sim.nuBar) * (1 + 0.35 * ph.wf);
    let xiUBase = 0.06 + 0.18 * sim.nuBar;
    let thetaU = 0.44 - 0.25 * sim.nuBar - 0.1 * ph.wc;

    const s = sim.scroll;
    const sigmaS = 0.11;
    const epsScroll = 0.07;
    const zetaScroll = 0.08;
    const scrollSign = Math.sign(Math.sin(2 * Math.PI * s + 0.4));
    const scrollAbs = Math.abs(Math.sin(2 * Math.PI * s + 1.1));

    for (let y = 0; y < H; y += 1) {
      const sec = sidFromY(y);
      const sy = y / H;
      const Fs = Math.exp(-(((sy - s) ** 2) / (2 * sigmaS * sigmaS)));
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const ns = stats(x, y);

        let aL = alpha, bL = beta, gL = gamma, gfL = gf, weL = we, wiL = wi, tauUL = tauUBase, xiUL = xiUBase;
        if (sec === 0) { aL *= 1.3; bL *= 1.2; gL *= 0.8; gfL *= 0.6; tauUL *= 0.6; }
        if (sec === 1) { gfL *= 1.8; weL *= 1.5; wiL *= 1.3; tauUL = 0.5; thetaBirth -= 0.1 * bf[i]; }
        if (sec === 2) { tauUL *= 1.7; xiUL *= 1.5; gL *= 1.4; gfL *= 0.5; }
        if (sec === 3) {
          e[i] = clamp01(e[i] + 0.07 * textMask[i] * (1 - sim.nuBar));
          m[i] = clamp01(m[i] + 0.05 * textMask[i]);
        }
        if (sec === 4) {
          const sigt = Math.sin(0.07 * sim.frame) + 0.5 * Math.sin(0.13 * sim.frame + 0.8);
          e[i] = clamp01(e[i] + 0.03 * sigt);
          u[i] = clamp01(u[i] + 0.04 * Math.abs(sigt));
        }

        const g = c1 * ns.nah + c2 * ns.nlh - c0;
        let ePrime = e[i] + aL * lap(x, y) + bL * sig(g) - gL * d[i] - lambda * m[i] + etaA * noise(x, y, sim.frame, 0);

        ePrime += epsScroll * Fs * scrollSign;
        const aPrime = Math.tanh(weL * ns.exc - wiL * meanA + gfL * bf[i] + etaAct * noise(x, y, sim.frame, 2));
        an[i] = U.clamp(aPrime, -1, 1);

        const phi = sig(2.6 * aPrime);
        const tBirthLocal = thetaBirth - 0.12 * sim.kappaBar * phi;
        const tTissueLocal = thetaTissue - 0.1 * sim.kappaBar * phi;

        ePrime *= (1 - 0.55 * sim.kappaBar * eyeMask[i]);
        ePrime = clamp01(ePrime);
        en[i] = ePrime;

        mn[i] = clamp01((1 - tauM) * m[i] + tauM * Math.abs(ePrime - e[i]));
        dn[i] = clamp01(d[i] + tauD * (G[i] === STATE.LESION ? 1 : 0) - tauH * (G[i] === STATE.LESION ? 0 : 1) * (1 - sim.nuBar));

        const ex = (inb(x + 1, y) ? e[idx(x + 1, y)] : e[i]) - (inb(x - 1, y) ? e[idx(x - 1, y)] : e[i]);
        const ey = (inb(x, y + 1) ? e[idx(x, y + 1)] : e[i]) - (inb(x, y - 1) ? e[idx(x, y - 1)] : e[i]);
        const bx = (inb(x + 1, y) ? bf[idx(x + 1, y)] : bf[i]) - (inb(x - 1, y) ? bf[idx(x - 1, y)] : bf[i]);
        const by = (inb(x, y + 1) ? bf[idx(x, y + 1)] : bf[i]) - (inb(x, y - 1) ? bf[idx(x, y - 1)] : bf[i]);
        const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
        let rmax = 0;
        for (let k = 0; k < dirs.length; k += 1) {
          const dx = dirs[k][0], dy = dirs[k][1];
          const rd = sig(2.0 * (ex * dx + ey * dy)) + sig(1.7 * (bx * dx + by * dy));
          const px = x - dx, py = y - dy;
          const up = inb(px, py) ? u[idx(px, py)] : u[i];
          rmax = Math.max(rmax, rd * up);
        }
        let uPrime = clamp01((1 - tauUL) * u[i] + tauUL * rmax + xiUL * noise(x, y, sim.frame, 3));
        uPrime = clamp01(uPrime + zetaScroll * Fs * scrollAbs);
        un[i] = uPrime;

        let sNew = G[i];
        const r01 = 0.5 * (1 + noise(x, y, sim.frame, 1));
        if (sNew === STATE.VOID && ePrime > tBirthLocal) sNew = r01 < pLesion ? STATE.LESION : STATE.MEMBRANE;
        else if (sNew === STATE.MEMBRANE && ePrime > tTissueLocal) sNew = STATE.TISSUE;
        else if (sNew === STATE.TISSUE && ns.nl > 2 + 3 * sim.nuBar) sNew = STATE.LESION;
        else if (sNew === STATE.LESION && ePrime < thetaCool) sNew = STATE.SCAR;
        else if (sNew === STATE.SCAR && ePrime < thetaErosion) sNew = STATE.VOID;

        if (uPrime > thetaU) {
          owner[i] = OWNER.SYMBOL;
          sNew = STATE.LESION;
        } else if (bf[i] > 0.58 && aPrime > 0.5) owner[i] = OWNER.FACE;
        else owner[i] = OWNER.BIO;

        if (owner[i] === OWNER.SYMBOL) {
          dn[i] = clamp01(dn[i] * 0.96);
          en[i] = clamp01(en[i] + 0.03 * Math.abs(noise(x, y, sim.frame, 7)));
        }

        age[i] = sNew === STATE.VOID ? 0 : Math.min(65535, age[i] + 1);
        Gnext[i] = sNew;
      }
    }

    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y), j = idx(W - 1 - x, y);
        en[i] = (1 - omegaSym) * en[i] + omegaSym * en[j];
      }
    }

    for (let s = 1; s < NSEC; s += 1) {
      const y0 = s * Hs;
      for (let y = Math.max(0, y0 - B); y <= Math.min(H - 1, y0 + B); y += 1) {
        for (let x = 0; x < W; x += 1) {
          const i = idx(x, y);
          const yb = U.clamp(y + (y < y0 ? 1 : -1), 0, H - 1);
          const j = idx(x, yb);
          en[i] = (en[i] * 0.88 + en[j] * 0.12);
          an[i] = (an[i] * 0.86 + an[j] * 0.14);
          un[i] = (un[i] * 0.84 + un[j] * 0.16);
        }
      }
    }

    Gprev.set(G);
    G.set(Gnext); e.set(en); d.set(dn); m.set(mn); a.set(an); u.set(un);

    sectionDiagnostics(thetaU);
  }

  function sectionDiagnostics(thetaU) {
    const names = ["HERO ORGANISM", "PORTRAIT FACE", "SIGIL ARCHIVE", "WRITING FLESH", "TERMINAL CONTACT"];
    const diagOrder = [diagEls.hero, diagEls.portrait, diagEls.archive, diagEls.writing, diagEls.terminal];

    let Hacc = 0;
    for (let s = 0; s < NSEC; s += 1) {
      const ys = s * Hs;
      const ye = s === NSEC - 1 ? H - 1 : (s + 1) * Hs - 1;
      let alive = 0, changed = 0, ru = 0, rf = 0, cnt = 0;
      for (let y = ys; y <= ye; y += 1) {
        for (let x = 0; x < W; x += 1) {
          const i = idx(x, y);
          cnt += 1;
          if (G[i] !== STATE.VOID) alive += 1;
          if (G[i] !== Gprev[i]) changed += 1;
          if (u[i] > thetaU) ru += 1;
          rf += sig(2.6 * a[i]);
        }
      }
      const ra = alive / cnt, rc = changed / cnt, rus = ru / cnt, rfs = rf / cnt;
      const HsVal = clamp01(0.7 * ra + 1.8 * rc + 0.6 * rus + 0.4 * rfs);
      sim.Hs[s] = HsVal;
      Hacc += HsVal;
      const flavor = rus > 0.32 ? "SYMBOL" : (rfs > 0.6 ? "FACE" : "BIO");
      if (diagOrder[s]) diagOrder[s].textContent = `${names[s]} :: H=${HsVal.toFixed(2)} :: ${flavor}`;
    }
    sim.globalH = Hacc / NSEC;
    sim.bpm = U.clamp(Math.round(40 + 140 * sim.globalH), 40, 180);
    if (pulseEl) pulseEl.textContent = String(sim.bpm);
  }

  function stateRampChar(sec, i) {
    const ramps = [
      " .:-=+#%@",
      " .,:;i1tfLCG08@",
      " |/\\+#+#+#+#+",
      " .:-=+#ABCDEFGHIJKLMNOPQRSTUVWXYZ",
      " |_./\\-~0123456789"
    ];
    const r = ramps[sec];
    const thetaU = 0.44 - 0.25 * sim.nuBar;
    if (G[i] === STATE.VOID) return " ";
    if (u[i] > thetaU) {
      const sr = "|/\\+#+#+#+#+";
      return sr[Math.floor((u[i] * 31 + i + sim.frame) % sr.length)];
    }

    let b = clamp01(0.55 * e[i] + 0.25 * sig(2.6 * a[i]) + 0.2 * u[i]);
    if (G[i] === STATE.SCAR) b *= 0.72;
    const len = r.length;
    let lo = 0, hi = len - 1;
    if (G[i] === STATE.MEMBRANE) hi = Math.max(1, Math.floor(len / 3));
    else if (G[i] === STATE.TISSUE) { lo = Math.floor(len / 3); hi = Math.floor(2 * len / 3); }
    else if (G[i] === STATE.LESION) lo = Math.floor(2 * len / 3);
    else if (G[i] === STATE.SCAR) { lo = Math.floor(len / 5); hi = Math.floor(len / 2); }
    const k = U.clamp(lo + Math.floor(b * Math.max(1, hi - lo)), 0, len - 1);
    return r[k];
  }

  function renderSlice(sec, el) {
    const ys = sec * Hs;
    const ye = sec === NSEC - 1 ? H - 1 : (sec + 1) * Hs - 1;
    const lines = [];
    for (let y = ys; y <= ye; y += 1) {
      let row = "";
      for (let x = 0; x < W; x += 1) row += stateRampChar(sec, idx(x, y));
      lines.push(row);
    }
    el.textContent = lines.join("\n");
  }

  function renderPortrait() {
    const chars = " .,:;i1tfLCG08@";
    const lines = [];
    const A = 3 + Math.floor(sim.nuBar * 4);
    const pDrop = clamp01(0.06 + 0.25 * sim.nuBar - 0.15 * sim.rhoBar);
    for (let y = 0; y < portrait.h; y += 2) {
      let row = "";
      const phiY = (y * 0.11) + (seed % 17) * 0.2;
      const dx = Math.floor(A * Math.sin(0.16 * sim.frame + phiY));
      for (let x = 0; x < portrait.w; x += 1) {
        const sx = U.clamp(x + dx, 0, portrait.w - 1);
        const gx = Math.floor((sx / (portrait.w - 1)) * (W - 1));
        const gy = Math.floor(((y / (portrait.h - 1)) * (Hs - 1)) + Hs);
        const gi = idx(gx, gy);
        const bp = clamp01(0.6 * bf[gi] + 0.25 * e[gi] + 0.15 * u[gi]);
        const rd = 0.5 * (1 + noise(x, y, sim.frame, 9));
        if (rd < pDrop) { row += " "; continue; }
        row += chars[Math.floor(bp * (chars.length - 1))];
      }
      lines.push(row);
    }
    mounts.portrait.textContent = lines.join("\n");
  }

  function renderAll() {
    renderSlice(0, mounts.hero);
    renderPortrait();
    renderSlice(2, mounts.archive);
    renderSlice(3, mounts.writing);
    renderSlice(4, mounts.terminal);
  }

  function shouldRun() {
    return !U.prefersReducedMotion() && document.body.dataset.safe !== "on" && !document.hidden;
  }

  function tick(ts) {
    if (!sim.running) return;
    const stepMs = U.prefersReducedMotion() ? 260 : (document.body.dataset.safe === "on" ? 220 : 90);
    if (!sim.last || ts - sim.last > stepMs) {
      sim.last = ts;
      sim.frame += 1;
      step();
      renderAll();
    }
    sim.raf = requestAnimationFrame(tick);
  }

  function sync() {
    if (shouldRun()) {
      if (!sim.running) { sim.running = true; sim.raf = requestAnimationFrame(tick); }
    } else {
      sim.running = false;
      if (sim.raf) cancelAnimationFrame(sim.raf);
      sim.frame += 1;
      step();
      renderAll();
    }
  }

  function drawSigils() {
    U.qsa(".sigil").forEach((el) => {
      const id = el.dataset.sigil || "section";
      const ss = hash(buildId, id, 1, 2, 3);
      const w = 18, h = 10;
      const g = Array.from({ length: h }, () => Array.from({ length: w }, () => " "));
      for (let x = 0; x < w; x += 1) { if ((x + ss) % 4) g[0][x] = "─"; if ((x + ss) % 5) g[h - 1][x] = "─"; }
      for (let y = 0; y < h; y += 1) { if ((y + ss) % 3) g[y][0] = "│"; if ((y + ss) % 4) g[y][w - 1] = "│"; }
      g[5][9] = "◉"; g[5][8] = "╳"; g[5][10] = "╳";
      ["~~~", "^^^", "///", "|||"][(ss % 4)].split("").forEach((ch, i) => { g[8][2 + i] = ch; g[1][13 + i] = ch; });
      el.textContent = g.map((r) => r.join("")).join("\n");
    });
  }

  window.addEventListener("scroll", scrollProgress, { passive: true });
  window.addEventListener("safe-mode-change", sync);
  window.addEventListener("lens-change", sync);
  document.addEventListener("visibilitychange", sync);

  setupMasks();
  initWorld();
  loadPortrait();
  drawSigils();
  sync();
})();
