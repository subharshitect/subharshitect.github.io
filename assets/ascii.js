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
  const debugLine = U.qs("#debugLine");

  const pulseEl = U.qs("#pulseVal");
  const controls = { rigor: U.qs("#lens-rigor"), control: U.qs("#lens-control") };

  const buildId = U.qs('meta[name="build-id"]')?.getAttribute("content") || "00000000-0000-0000";
  const STATE = { VOID: 0, MEMBRANE: 1, TISSUE: 2, LESION: 3, SCAR: 4 };
  const OWNER = { BIO: 0, FACE: 1, SYMBOL: 2 };

  const W = 110;
  const H = 60;
  const NSEC = 5;
  const Hs = Math.floor(H / NSEC);
  const B = 3;
  const N = W * H;

  const G = new Uint8Array(N), Gp = new Uint8Array(N), Gn = new Uint8Array(N);
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

  const POR_W = 84;
  const POR_H = 46; // aspect corrected (rough 0.55)
  const Pn = POR_W * POR_H;
  const PI = {
    I: new Float32Array(Pn),
    Inorm: new Float32Array(Pn),
    E: new Float32Array(Pn),
    bin: new Uint8Array(Pn),
    It: new Float32Array(Pn)
  };

  const sim = {
    frame: 0, running: false, raf: 0, last: 0,
    rhoBar: 0.64, muBar: 0.36, kappaBar: 0.39, nuBar: 0.61,
    scroll: 0,
    regime: OWNER.BIO, prevRegime: OWNER.BIO,
    Hs: new Float32Array(NSEC), globalH: 0, bpm: 40,
    renderedOnceReduced: false,
    lastBeatMs: 0,
    loopTick: 0,
    stuckMs: 0,
    stagnantRenders: 0,
    lastSignature: -1
  };

  const BAYER4 = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];

  const BANK_H = "_-~=+";
  const BANK_V = "|!Il1";
  const BANK_D1 = "/7yY";
  const BANK_D2 = "\\vVxX";
  const BANK_FILL = "MW@#%8&B";
  const BANK_LIGHT = " .,:;";
  const BANK_SYMBOL = "|/\\+#+#+#+#+";

  function idx(x, y) { return y * W + x; }
  function pidx(x, y) { return y * POR_W + x; }
  function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  function pinb(x, y) { return x >= 0 && y >= 0 && x < POR_W && y < POR_H; }
  function sidFromY(y) { return U.clamp(Math.floor(y / Hs), 0, NSEC - 1); }
  function clip01(v) { return U.clamp(v, 0, 1); }
  function sigmoid(v) { return 1 / (1 + Math.exp(-v)); }

  function hash5(a, b, c, d0, e0) {
    let h = 2166136261;
    const arr = [String(a), String(b), String(c), String(d0), String(e0)];
    for (let i = 0; i < arr.length; i += 1) {
      const s = arr[i];
      for (let j = 0; j < s.length; j += 1) {
        h ^= s.charCodeAt(j);
        h = Math.imul(h, 16777619);
      }
    }
    return h >>> 0;
  }

  const S0 = hash5(buildId, "seed", 13, 17, 19);

  function eta(x, y, t, k) {
    let h = S0 ^ Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(t + 1, 2246822519) ^ Math.imul(k + 1, 3266489917);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return 2 * ((h >>> 0) / 4294967295) - 1;
  }

  function lin(c) {
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }

  function setupMasks() {
    const y0 = Math.floor(Hs + Hs * 0.35);
    const lx = Math.floor(W * 0.40);
    const rx = Math.floor(W * 0.60);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const l = Math.exp(-(((x - lx) ** 2) / 15 + ((y - y0) ** 2) / 7));
        const r = Math.exp(-(((x - rx) ** 2) / 15 + ((y - y0) ** 2) / 7));
        eyeMask[i] = clip01(l + r);
      }
    }
    const wt = (U.qs("#writing")?.textContent || " ").replace(/\s+/g, " ");
    const ys = Hs * 3 + 1;
    const ye = Hs * 4 - 1;
    for (let y = ys; y <= ye; y += 1) {
      for (let x = 2; x < W - 2; x += 1) {
        const ci = (x + 3 * (y - ys)) % Math.max(1, wt.length);
        textMask[idx(x, y)] = wt.charCodeAt(ci) === 32 ? 0 : 1;
      }
    }
  }

  function initWorld() {
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const sec = sidFromY(y);
        const cy = sec * Hs + Hs * 0.5;
        const r = Math.hypot((x - W * 0.5) / 24, (y - cy) / 5.2);
        G[i] = r < 0.93 && eta(x, y, 0, 31) > -0.1 ? STATE.MEMBRANE : STATE.VOID;
        if (r < 0.65 && eta(x, y, 0, 33) > -0.05) G[i] = STATE.TISSUE;
        e[i] = clip01((1 - r) * 0.62 + 0.06 * (eta(x, y, 0, 35) + 1));
        d[i] = clip01(0.02 * (eta(x, y, 0, 37) + 1));
        m[i] = clip01(0.02 * (eta(x, y, 0, 39) + 1));
        a[i] = eta(x, y, 0, 41) * 0.12;
        u[i] = clip01(0.02 * (eta(x, y, 0, 43) + 1));
        owner[i] = OWNER.BIO;
      }
    }
    Gp.set(G);
  }

  function fallbackFace() {
    for (let y = 0; y < POR_H; y += 1) {
      for (let x = 0; x < POR_W; x += 1) {
        const i = pidx(x, y);
        const cx = POR_W * 0.5, cy = POR_H * 0.54;
        const Mh = Math.max(0, 1 - (((x - cx) / (POR_W * 0.34)) ** 2 + ((y - cy) / (POR_H * 0.42)) ** 2));
        const Me1 = Math.exp(-(((x - POR_W * 0.38) ** 2) / 45 + ((y - POR_H * 0.42) ** 2) / 16));
        const Me2 = Math.exp(-(((x - POR_W * 0.62) ** 2) / 45 + ((y - POR_H * 0.42) ** 2) / 16));
        const Mn = Math.exp(-(((x - cx) ** 2) / 80 + ((y - POR_H * 0.58) ** 2) / 120));
        const Mm = Math.exp(-(((x - cx) ** 2) / 90 + ((y - POR_H * 0.74) ** 2) / 30));
        const bff = clip01(0.55 * Mh + 0.38 * (Me1 + Me2) + 0.24 * Mn + 0.21 * Mm);
        PI.I[i] = clip01(0.2 + 0.8 * bff);
      }
    }
    buildPortraitMaps();
  }

  function loadAvatarAndBuild() {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.addEventListener("load", () => sampleAvatar(img));
    img.addEventListener("error", () => {
      const img2 = new Image();
      img2.crossOrigin = "anonymous";
      img2.addEventListener("load", () => sampleAvatar(img2));
      img2.addEventListener("error", fallbackFace);
      img2.src = "https://raw.githubusercontent.com/subharshitect/subharshitect.github.io/main/assets/avatars/avatar1.jpg";
    });
    img.src = "assets/avatars/avatar1.jpg";
  }

  function sampleAvatar(img) {
    const c = document.createElement("canvas");
    c.width = POR_W;
    c.height = POR_H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return fallbackFace();
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const raw = ctx.getImageData(0, 0, c.width, c.height).data;

    const kExp = 0.04;
    const gammaD = 2.2;
    for (let i = 0, p = 0; i < raw.length; i += 4, p += 1) {
      const R = raw[i] / 255, Gc = raw[i + 1] / 255, Bc = raw[i + 2] / 255;
      const Y = 0.2126 * lin(R) + 0.7152 * lin(Gc) + 0.0722 * lin(Bc);
      const Yexp = clip01(Y * Math.exp(kExp));
      PI.I[p] = clip01(Yexp ** (1 / gammaD));
    }
    buildPortraitMaps();
  }

  function buildPortraitMaps() {
    const r = 2;
    const g0 = 2.1;
    const gLocal = g0 * (0.8 + 0.7 * sim.rhoBar + 0.5 * sim.kappaBar);

    for (let y = 0; y < POR_H; y += 1) {
      for (let x = 0; x < POR_W; x += 1) {
        let sum = 0;
        let count = 0;
        for (let dy = -r; dy <= r; dy += 1) {
          for (let dx = -r; dx <= r; dx += 1) {
            const nx = U.clamp(x + dx, 0, POR_W - 1);
            const ny = U.clamp(y + dy, 0, POR_H - 1);
            sum += PI.I[pidx(nx, ny)];
            count += 1;
          }
        }
        const Bm = sum / count;
        const i = pidx(x, y);
        PI.Inorm[i] = clip01((PI.I[i] - Bm) * gLocal + 0.5);
      }
    }

    const E0 = 0.45;
    for (let y = 1; y < POR_H - 1; y += 1) {
      for (let x = 1; x < POR_W - 1; x += 1) {
        const i = pidx(x, y);
        const gx = PI.Inorm[pidx(x + 1, y)] - PI.Inorm[pidx(x - 1, y)];
        const gy = PI.Inorm[pidx(x, y + 1)] - PI.Inorm[pidx(x, y - 1)];
        PI.E[i] = clip01(Math.hypot(gx, gy) / E0);
        const th = Math.atan2(gy, gx);
        const ath = Math.abs(th);
        if (ath < Math.PI / 8 || ath > 7 * Math.PI / 8) PI.bin[i] = 0;
        else if ((th >= Math.PI / 8 && th <= 3 * Math.PI / 8) || (th >= -7 * Math.PI / 8 && th <= -5 * Math.PI / 8)) PI.bin[i] = 1;
        else if (Math.abs(th - Math.PI / 2) < Math.PI / 8 || Math.abs(th + Math.PI / 2) < Math.PI / 8) PI.bin[i] = 2;
        else PI.bin[i] = 3;
      }
    }

    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const px = Math.floor((x / (W - 1)) * (POR_W - 1));
        const py = Math.floor((y / (H - 1)) * (POR_H - 1));
        const p = pidx(px, py);
        bf[idx(x, y)] = clip01(0.7 * (1 - PI.I[p]) + 0.3 * PI.E[p]);
      }
    }
  }

  function smoothControls() {
    const rho = Number(controls.rigor?.value || 64) / 100;
    const kappa = Number(controls.control?.value || 39) / 100;
    const mu = 1 - rho;
    const nu = 1 - kappa;
    sim.rhoBar += 0.08 * (rho - sim.rhoBar);
    sim.muBar += 0.08 * (mu - sim.muBar);
    sim.kappaBar += 0.08 * (kappa - sim.kappaBar);
    sim.nuBar += 0.08 * (nu - sim.nuBar);
  }

  function tri(p, c, width) { return Math.max(0, 1 - Math.abs(p - c) / width); }
  function phaseWeights() {
    const Tp = 1800;
    const p = (sim.frame % Tp) / Tp;
    let wd = tri(p, 0.125, 0.20), wf = tri(p, 0.375, 0.20), wc = tri(p, 0.625, 0.20), wr = tri(p, 0.875, 0.20);
    const S = wd + wf + wc + wr + 1e-6;
    return { wd: wd / S, wf: wf / S, wc: wc / S, wr: wr / S };
  }

  function scrollProgress() {
    const denom = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    sim.scroll = U.clamp(window.scrollY / denom, 0, 1);
  }

  function neighborhood(x, y) {
    let na = 0, nl = 0, av = 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (!ox && !oy) continue;
        const nx = x + ox, ny = y + oy;
        if (!inb(nx, ny)) continue;
        const s = G[idx(nx, ny)];
        if (s >= STATE.MEMBRANE) na += 1;
        if (s === STATE.LESION) nl += 1;
        av += a[idx(nx, ny)];
      }
    }
    return { na, nl, nah: na / 8, nlh: nl / 8, exc: av / 8 };
  }

  function lapE(x, y) {
    const c = e[idx(x, y)];
    let sum = 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (!ox && !oy) continue;
        const nx = x + ox, ny = y + oy;
        sum += inb(nx, ny) ? e[idx(nx, ny)] : c;
      }
    }
    return sum - 8 * c;
  }

  function regimeAndShock() {
    let meanBf = 0, meanU = 0;
    for (let i = 0; i < N; i += 1) { meanBf += bf[i]; meanU += u[i]; }
    meanBf /= N; meanU /= N;

    const s = sim.scroll;
    const Lb = 0.15 + 1.2 * (1 - sim.kappaBar) + 0.8 * (1 - sim.nuBar);
    const Lf = 0.05 + 1.6 * sim.kappaBar + 1.0 * sim.rhoBar + 0.8 * meanBf + 0.25 * (1 - s);
    const Ls = 0.05 + 1.6 * sim.nuBar + 1.0 * sim.muBar + 0.8 * meanU + 0.25 * s;
    const T = 0.25;
    const eb = Math.exp(Lb / T), ef = Math.exp(Lf / T), es = Math.exp(Ls / T);
    sim.regime = ef > eb && ef > es ? OWNER.FACE : (es > eb ? OWNER.SYMBOL : OWNER.BIO);

    if (sim.regime !== sim.prevRegime) {
      const As = sim.regime === OWNER.SYMBOL ? 0.22 : sim.regime === OWNER.FACE ? 0.16 : 0.12;
      const Bs = sim.regime === OWNER.SYMBOL ? 0.18 : 0.1;
      const Cs = sim.regime === OWNER.SYMBOL ? 0.24 : 0.1;
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          const i = idx(x, y);
          e[i] = clip01(e[i] + As * (0.4 + 0.6 * sim.nuBar) * eta(x, y, sim.frame, 4));
          d[i] = clip01(d[i] + Bs * (0.3 + 0.7 * sim.nuBar));
          u[i] = clip01(u[i] + Cs * (0.2 + 0.8 * sim.nuBar) * Math.abs(eta(x, y, sim.frame, 5)));
        }
      }
      sim.prevRegime = sim.regime;
    }
  }

  function stampSigilsField() {
    const anchors = [
      { id: "hero", x0: 1, y0: 1 },
      { id: "portrait", x0: 1, y0: Hs + 1 },
      { id: "archive", x0: 1, y0: Hs * 2 + 1 },
      { id: "writing", x0: 1, y0: Hs * 3 + 1 },
      { id: "terminal", x0: 1, y0: Hs * 4 + 1 }
    ];
    for (let a0 = 0; a0 < anchors.length; a0 += 1) {
      const an0 = anchors[a0];
      const Ss = hash5(buildId, an0.id, "sig", 7, 11);
      for (let y = 0; y < 12; y += 1) {
        for (let x = 0; x < 24; x += 1) {
          const gx = an0.x0 + x, gy = an0.y0 + y;
          if (!inb(gx, gy)) continue;
          const border = (x === 0 || x === 23 || y === 0 || y === 11);
          const broken = ((x + y + Ss) % 5 !== 0);
          const coreCross = (x === 12 || y === 6);
          const node = ((x - 12) * (x - 12) + (y - 6) * (y - 6) < 8);
          const route = ((x + (Ss % 7)) % 6 === 0 && y > 1 && y < 10);
          const flour = (y === 9 && x > 2 && x < 6) || (y === 2 && x > 16 && x < 21);
          if ((border && broken) || coreCross || node || route || flour) {
            u[idx(gx, gy)] = Math.max(u[idx(gx, gy)], 0.78 + 0.2 * ((Ss + x + y) % 9) / 9);
          }
        }
      }
    }
  }

  function stepWorld() {
    smoothControls();
    scrollProgress();
    regimeAndShock();
    stampSigilsField();

    const ph = phaseWeights();

    const alpha0 = 0.08, beta0 = 0.2, gamma0 = 0.11, lambda0 = 0.12, eta0 = 0.08, omega0 = 0.25;
    let alpha = alpha0 * (0.6 + 0.9 * sim.muBar);
    let beta = beta0 * (0.7 + 0.5 * (1 - sim.nuBar));
    let gamma = gamma0 * (0.6 + 1.2 * sim.nuBar);
    const lambda = lambda0 * (0.4 + 1.2 * sim.rhoBar) * (1.1 - 0.6 * sim.muBar);
    let etaA = eta0 * (0.2 + 1.2 * sim.nuBar) * (1 - 0.7 * sim.rhoBar);
    const omegaSym = omega0 * sim.kappaBar;

    beta *= 1 + 0.35 * ph.wd;
    etaA *= 1 - 0.25 * ph.wd;
    gamma *= 1 + 0.45 * ph.wc;

    const c0 = 0.36, c1 = 1.05, c2 = 0.8;
    const tauM = 0.18, tauD = 0.08;
    let tauH = 0.03 * (1 + 0.40 * ph.wr);

    let thetaBirth = 0.35 + 0.25 * sim.rhoBar - 0.15 * sim.nuBar;
    let thetaTissue = 0.56 + 0.20 * sim.rhoBar - 0.10 * sim.nuBar;
    const thetaCool = 0.32 + 0.15 * sim.rhoBar + 0.10 * sim.kappaBar;
    let thetaErosion = 0.24 + 0.10 * sim.rhoBar - 0.10 * sim.nuBar;
    let pLesion = clip01(0.07 + 0.45 * sim.nuBar - 0.25 * sim.rhoBar + 0.25 * ph.wf);

    let meanA = 0;
    for (let i = 0; i < N; i += 1) meanA += a[i];
    meanA /= N;

    let we = 1.2 * (0.6 + 0.8 * sim.kappaBar);
    let wi = 0.8 * (0.6 + 0.6 * sim.rhoBar);
    let gf = 1.0 * (0.5 + 1.0 * sim.kappaBar) * (1 + 0.20 * ph.wr * sim.kappaBar);
    const etaa0 = 0.35;
    const etaa = etaa0 * (0.2 + 1.0 * sim.nuBar) * (1 - 0.7 * sim.rhoBar);

    let tauU = (0.11 + 0.2 * sim.nuBar) * (1 + 0.35 * ph.wf);
    let xiU = 0.06 + 0.18 * sim.nuBar;
    let thetaU = 0.44 - 0.25 * sim.nuBar - 0.10 * ph.wc;

    const sigmaS = 0.11;
    const epsScroll = 0.07;
    const zetaScroll = 0.08;
    const s = sim.scroll;
    const signScroll = Math.sign(Math.sin(2 * Math.PI * s + 0.5));
    const absScroll = Math.abs(Math.sin(2 * Math.PI * s + 1.1));

    let changedCells = 0;
    for (let y = 0; y < H; y += 1) {
      const sec = sidFromY(y);
      const Fs = Math.exp(-((((y / H) - s) ** 2) / (2 * sigmaS * sigmaS)));

      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y);
        const ns = neighborhood(x, y);

        let aL = alpha, bL = beta, gL = gamma, gfL = gf, weL = we, wiL = wi, tauUL = tauU, xiUL = xiU;
        let tBirthL = thetaBirth, tTissueL = thetaTissue;
        if (sec === 0) { aL *= 1.3; bL *= 1.2; gL *= 0.8; gfL *= 0.6; tauUL *= 0.6; }
        if (sec === 1) { gfL *= 1.8; weL *= 1.5; wiL *= 1.3; tauUL = 0.5; tBirthL -= 0.10 * bf[i]; }
        if (sec === 2) { tauUL *= 1.7; xiUL *= 1.5; gL *= 1.4; gfL *= 0.5; }
        if (sec === 3) {
          e[i] = clip01(e[i] + 0.07 * textMask[i] * (1 - sim.nuBar));
          m[i] = clip01(m[i] + 0.05 * textMask[i]);
        }
        if (sec === 4) {
          const sigt = Math.sin(0.08 * sim.frame) + 0.5 * Math.sin(0.15 * sim.frame + 0.7);
          e[i] = clip01(e[i] + 0.03 * sigt);
          u[i] = clip01(u[i] + 0.04 * Math.abs(sigt));
        }

        const g = c1 * ns.nah + c2 * ns.nlh - c0;
        let ePrime = clip01(e[i] + aL * lapE(x, y) + bL * sigmoid(g) - gL * d[i] - lambda * m[i] + etaA * eta(x, y, sim.frame, 0));
        ePrime = clip01(ePrime + epsScroll * Fs * signScroll);

        const aPrime = Math.tanh(weL * ns.exc - wiL * meanA + gfL * bf[i] + etaa * eta(x, y, sim.frame, 2));
        an[i] = U.clamp(aPrime, -1, 1);

        const phi = sigmoid(2.5 * aPrime);
        tBirthL -= 0.12 * sim.kappaBar * phi;
        tTissueL -= 0.10 * sim.kappaBar * phi;

        ePrime = clip01(ePrime * (1 - 0.55 * sim.kappaBar * eyeMask[i]));
        en[i] = ePrime;

        mn[i] = clip01((1 - tauM) * m[i] + tauM * Math.abs(ePrime - e[i]));
        dn[i] = clip01(d[i] + tauD * (G[i] === STATE.LESION ? 1 : 0) - tauH * (G[i] === STATE.LESION ? 0 : 1) * (1 - sim.nuBar));

        const ex = (inb(x + 1, y) ? e[idx(x + 1, y)] : e[i]) - (inb(x - 1, y) ? e[idx(x - 1, y)] : e[i]);
        const ey = (inb(x, y + 1) ? e[idx(x, y + 1)] : e[i]) - (inb(x, y - 1) ? e[idx(x, y - 1)] : e[i]);
        const bfx = (inb(x + 1, y) ? bf[idx(x + 1, y)] : bf[i]) - (inb(x - 1, y) ? bf[idx(x - 1, y)] : bf[i]);
        const bfy = (inb(x, y + 1) ? bf[idx(x, y + 1)] : bf[i]) - (inb(x, y - 1) ? bf[idx(x, y - 1)] : bf[i]);

        const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
        let rmax = 0;
        for (let q = 0; q < dirs.length; q += 1) {
          const dx = dirs[q][0], dy = dirs[q][1];
          const Rd = sigmoid(2.0 * (ex * dx + ey * dy)) + sigmoid(1.6 * (bfx * dx + bfy * dy));
          const px = x - dx, py = y - dy;
          const up = inb(px, py) ? u[idx(px, py)] : u[i];
          rmax = Math.max(rmax, Rd * up);
        }

        let uPrime = clip01((1 - tauUL) * u[i] + tauUL * rmax + xiUL * eta(x, y, sim.frame, 3));
        uPrime = clip01(uPrime + zetaScroll * Fs * absScroll);
        un[i] = uPrime;

        const rand01 = 0.5 * (1 + eta(x, y, sim.frame, 1));
        let sNew = G[i];
        if (sNew === STATE.VOID && ePrime > tBirthL) sNew = rand01 < pLesion ? STATE.LESION : STATE.MEMBRANE;
        else if (sNew === STATE.MEMBRANE && ePrime > tTissueL) sNew = STATE.TISSUE;
        else if (sNew === STATE.TISSUE && ns.nl > 2 + 3 * sim.nuBar) sNew = STATE.LESION;
        else if (sNew === STATE.LESION && ePrime < thetaCool) sNew = STATE.SCAR;
        else if (sNew === STATE.SCAR && ePrime < thetaErosion) sNew = STATE.VOID;

        if (uPrime > thetaU) {
          owner[i] = OWNER.SYMBOL;
          sNew = STATE.LESION;
          dn[i] = clip01(dn[i] * 0.95);
        } else if (bf[i] > 0.55 && aPrime > 0.45) owner[i] = OWNER.FACE;
        else owner[i] = OWNER.BIO;

        age[i] = sNew === STATE.VOID ? 0 : Math.min(65535, age[i] + 1);
        Gn[i] = sNew;
        if (sNew !== G[i]) changedCells += 1;
      }
    }

    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = idx(x, y), j = idx(W - 1 - x, y);
        en[i] = (1 - omegaSym) * en[i] + omegaSym * en[j];
      }
    }

    for (let s0 = 1; s0 < NSEC; s0 += 1) {
      const y0 = s0 * Hs;
      for (let y = Math.max(0, y0 - B); y <= Math.min(H - 1, y0 + B); y += 1) {
        for (let x = 0; x < W; x += 1) {
          const i = idx(x, y);
          const j = idx(x, U.clamp(y + (y < y0 ? 1 : -1), 0, H - 1));
          en[i] = en[i] * 0.88 + en[j] * 0.12;
          an[i] = an[i] * 0.87 + an[j] * 0.13;
          un[i] = un[i] * 0.84 + un[j] * 0.16;
        }
      }
    }

    Gp.set(G);
    G.set(Gn); e.set(en); d.set(dn); m.set(mn); a.set(an); u.set(un);
    diagnostics(thetaU);
    return changedCells;
  }

  function kickDeadState() {
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (((hash5(S0, x, y, sim.frame, 211) >>> 0) % 100) !== 0) continue;
        const i = idx(x, y);
        e[i] = clip01(e[i] + 0.01 * (0.5 + 0.5 * eta(x, y, sim.frame, 12)));
      }
    }
    const fx = (hash5(S0, sim.frame, 991, 7, 17) % W) >>> 0;
    const fy = (hash5(S0, sim.frame, 997, 11, 23) % H) >>> 0;
    const fi = idx(fx, fy);
    G[fi] = G[fi] === STATE.VOID ? STATE.MEMBRANE : STATE.VOID;
    e[fi] = clip01(e[fi] + 0.05);
  }

  function orientBinFromGrad(gx, gy) {
    const th = Math.atan2(gy, gx);
    const ath = Math.abs(th);
    if (ath < Math.PI / 8 || ath > 7 * Math.PI / 8) return 0;
    if ((th >= Math.PI / 8 && th <= 3 * Math.PI / 8) || (th >= -7 * Math.PI / 8 && th <= -5 * Math.PI / 8)) return 1;
    if (Math.abs(th - Math.PI / 2) < Math.PI / 8 || Math.abs(th + Math.PI / 2) < Math.PI / 8) return 2;
    return 3;
  }

  function bankForBin(bin) {
    if (bin === 0) return BANK_H;
    if (bin === 1) return BANK_D1;
    if (bin === 2) return BANK_V;
    return BANK_D2;
  }

  function pickEdgeAware(Itv, Ev, bin, rho, kappa) {
    const p = 1.3;
    const wEdge = clip01((Ev ** p) * (0.6 + 0.6 * rho + 0.3 * kappa));
    if (wEdge > 0.5) {
      const b = bankForBin(bin);
      return b[Math.min(b.length - 1, Math.floor(Itv * (b.length - 1)))];
    }
    if (Itv > 0.65) return BANK_FILL[Math.min(BANK_FILL.length - 1, Math.floor(Itv * (BANK_FILL.length - 1)))];
    return BANK_LIGHT[Math.min(BANK_LIGHT.length - 1, Math.floor(Itv * (BANK_LIGHT.length - 1)))];
  }

  function organismGlyph(i, x, y, thetaU) {
    const ws = G[i] === STATE.VOID ? 0 : G[i] === STATE.MEMBRANE ? 0.35 : G[i] === STATE.TISSUE ? 0.60 : G[i] === STATE.LESION ? 0.90 : 0.45;
    const C0 = 0.5;
    const C = clip01(Math.abs(lapE(x, y)) / C0);
    const Ds = clip01((u[i] - thetaU) / Math.max(1e-6, (1 - thetaU)));
    const Ro = clip01(0.55 * e[i] + 0.20 * ws + 0.15 * C + 0.25 * Ds);
    if (G[i] === STATE.VOID) return " ";
    if (Ds > 0.6) return BANK_SYMBOL[Math.floor((Ro * 17 + i + sim.frame) % BANK_SYMBOL.length)];

    const gx = (inb(x + 1, y) ? e[idx(x + 1, y)] : e[i]) - (inb(x - 1, y) ? e[idx(x - 1, y)] : e[i]);
    const gy = (inb(x, y + 1) ? e[idx(x, y + 1)] : e[i]) - (inb(x, y - 1) ? e[idx(x, y - 1)] : e[i]);
    const bin = orientBinFromGrad(gx, gy);
    return pickEdgeAware(Ro, C, bin, sim.rhoBar, sim.kappaBar);
  }

  function renderSlice(sec, el, thetaU) {
    const ys = sec * Hs;
    const ye = sec === NSEC - 1 ? H - 1 : (sec + 1) * Hs - 1;
    const lines = [];
    for (let y = ys; y <= ye; y += 1) {
      let row = "";
      for (let x = 0; x < W; x += 1) row += organismGlyph(idx(x, y), x, y, thetaU);
      lines.push(row);
    }
    el.textContent = lines.join("\n");
  }

  function renderPortrait(thetaU) {
    const romance = sim.muBar;
    const surrender = sim.nuBar;
    const d0 = 0.16;
    const dAmp = d0 * (0.4 + 0.6 * romance + 0.8 * surrender);
    const safe = document.body.dataset.safe === "on";
    const reduced = U.prefersReducedMotion();
    const lambdaT = reduced ? 1 : (safe ? 0.05 : 0.15);
    const A0 = 2.2;
    const Atear = A0 * (0.2 + 1.5 * surrender) * (1 - 0.7 * sim.kappaBar);
    const pDrop = clip01(0.04 + 0.35 * surrender - 0.20 * sim.rhoBar - 0.15 * sim.kappaBar);

    const lines = [];
    for (let y = 0; y < POR_H; y += 1) {
      let row = "";
      const phiY = ((hash5(S0, y, 71, 73, 79) % 4096) / 4096) * Math.PI * 2;
      const shift = Math.round(Atear * Math.sin(0.16 * sim.frame + phiY) + 1.2 * eta(0, y, sim.frame, 9));
      for (let x = 0; x < POR_W; x += 1) {
        const sx = U.clamp(x + shift, 0, POR_W - 1);
        const i = pidx(sx, y);
        const bT = (BAYER4[x % 4][y % 4] / 16 - 0.5) * dAmp;
        const Id = clip01(PI.Inorm[i] + bT);
        PI.It[i] = (1 - lambdaT) * PI.It[i] + lambdaT * Id;
        let Itv = PI.It[i];

        const hmask = 0.85 + 0.15 * Math.sign(Math.sin(Math.PI * (x + y)));
        Itv = clip01(Itv * hmask);

        const gx = Math.floor((sx / (POR_W - 1)) * (W - 1));
        const gy = Math.floor(((y / (POR_H - 1)) * (Hs - 1)) + Hs);
        const gi = idx(gx, gy);
        const bp = clip01(0.6 * bf[gi] + 0.25 * e[gi] + 0.15 * u[gi]);
        const mix = clip01(0.7 * Itv + 0.3 * bp);

        const drop = 0.5 * (1 + eta(x, y, sim.frame, 10));
        if (drop < pDrop) {
          row += safe ? "." : " ";
          continue;
        }

        row += pickEdgeAware(mix, PI.E[i], PI.bin[i], sim.rhoBar, sim.kappaBar);
      }
      lines.push(row);
    }
    mounts.portrait.textContent = lines.join("\n");

    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const px = Math.floor((x / (W - 1)) * (POR_W - 1));
        const py = Math.floor((y / (H - 1)) * (POR_H - 1));
        const p = pidx(px, py);
        bf[idx(x, y)] = clip01(0.7 * (1 - PI.It[p]) + 0.3 * PI.E[p]);
      }
    }
  }

  function diagnostics(thetaU) {
    const names = ["HERO ORGANISM", "PORTRAIT FACE", "SIGIL ARCHIVE", "WRITING FLESH", "TERMINAL CONTACT"];
    const nodes = [diagEls.hero, diagEls.portrait, diagEls.archive, diagEls.writing, diagEls.terminal];
    let Hg = 0;
    for (let s = 0; s < NSEC; s += 1) {
      const ys = s * Hs;
      const ye = s === NSEC - 1 ? H - 1 : (s + 1) * Hs - 1;
      let alive = 0, changed = 0, ru = 0, rf = 0, cnt = 0;
      for (let y = ys; y <= ye; y += 1) {
        for (let x = 0; x < W; x += 1) {
          const i = idx(x, y);
          cnt += 1;
          if (G[i] !== STATE.VOID) alive += 1;
          if (G[i] !== Gp[i]) changed += 1;
          if (u[i] > thetaU) ru += 1;
          rf += sigmoid(2.6 * a[i]);
        }
      }
      const ra = alive / cnt, rc = changed / cnt, rus = ru / cnt, rfs = rf / cnt;
      const HsVal = clip01(0.7 * ra + 1.8 * rc + 0.6 * rus + 0.4 * rfs);
      sim.Hs[s] = HsVal;
      Hg += HsVal;
      const flavor = rus > 0.3 ? "SYMBOL" : (rfs > 0.6 ? "FACE" : "BIO");
      if (nodes[s]) nodes[s].textContent = `${names[s]} :: H=${HsVal.toFixed(2)} :: ${flavor}`;
    }
    sim.globalH = Hg / NSEC;
    sim.bpm = U.clamp(Math.round(40 + 140 * sim.globalH), 40, 180);
    if (pulseEl) pulseEl.textContent = String(sim.bpm);
  }

  function drawLine(g, w, h, x0, y0, x1, y1, ch) {
    let dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    while (true) {
      if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = ch;
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  function drawArc(g, w, h, cx, cy, rx, ry, a0, a1, ch) {
    const steps = 28;
    for (let k = 0; k <= steps; k += 1) {
      const t = a0 + (a1 - a0) * (k / steps);
      const x = Math.round(cx + rx * Math.cos(t));
      const y = Math.round(cy + ry * Math.sin(t));
      if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = ch;
    }
  }

  function generateSigil(id) {
    const w = 24, h = 12;
    const g = Array.from({ length: h }, () => Array.from({ length: w }, () => " "));
    const Ss = hash5(buildId, id, "sigil", 101, 131);

    for (let x = 0; x < w; x += 1) {
      if ((x + Ss) % 5 !== 0) g[0][x] = "#";
      if ((x + Ss + 3) % 6 !== 0) g[h - 1][x] = "#";
    }
    for (let y = 0; y < h; y += 1) {
      if ((y + Ss) % 4 !== 0) g[y][0] = "#";
      if ((y + Ss + 1) % 5 !== 0) g[y][w - 1] = "#";
    }

    const core = Ss % 3;
    if (core === 0) {
      drawLine(g, w, h, 12, 2, 12, 9, "+");
      drawLine(g, w, h, 8, 6, 16, 6, "+");
    } else if (core === 1) {
      drawArc(g, w, h, 12, 6, 5, 3, 0, Math.PI * 2, "o");
      g[6][12] = "*";
    } else {
      const points = [[6, 3], [12, 2], [18, 3], [17, 8], [12, 9], [7, 8]];
      for (let i = 0; i < points.length; i += 1) {
        const a0 = points[i], b0 = points[(i + 1) % points.length];
        drawLine(g, w, h, a0[0], a0[1], b0[0], b0[1], "+");
      }
      g[6][12] = "*";
    }

    const routes = 2 + (Ss % 3);
    for (let r = 0; r < routes; r += 1) {
      const x0 = 2 + ((Ss + r * 11) % (w - 4));
      const y0 = 1 + ((Ss + r * 7) % (h - 2));
      const x1 = 2 + ((Ss + r * 17) % (w - 4));
      const y1 = 1 + ((Ss + r * 13) % (h - 2));
      drawLine(g, w, h, x0, y0, x1, y1, "~");
      g[y0][x0] = "+";
      g[y1][x1] = "*";
    }

    const flourishes = ["~~~", "^^^", "/\\/\\", "|=|"];
    const f = flourishes[Ss % flourishes.length];
    for (let i = 0; i < f.length; i += 1) {
      if (2 + i < w) g[h - 2][2 + i] = f[i];
      if (w - 2 - i >= 0) g[1][w - 2 - i] = f[f.length - 1 - i];
    }

    return g.map((r) => r.join("")).join("\n");
  }

  function drawSigils() {
    U.qsa(".sigil").forEach((el) => {
      el.style.opacity = "0.36";
      el.textContent = generateSigil(el.dataset.sigil || "section");
    });
  }

  function renderAll() {
    const thetaU = 0.44 - 0.25 * sim.nuBar;
    renderSlice(0, mounts.hero, thetaU);
    renderPortrait(thetaU);
    renderSlice(2, mounts.archive, thetaU);
    renderSlice(3, mounts.writing, thetaU);
    renderSlice(4, mounts.terminal, thetaU);
  }

  function sampleMotionSignature() {
    let s = 0;
    for (let k = 0; k < 64; k += 1) {
      const i = (k * 97 + sim.frame * 13) % N;
      s += G[i] * 7 + Math.floor(e[i] * 9) + Math.floor(u[i] * 11);
    }
    return s;
  }

  function updateDebug(nowMs, deltaMs) {
    if (!debugLine) return;
    debugLine.hidden = false;
    if (!sim.lastBeatMs || nowMs - sim.lastBeatMs >= 1000) {
      const safe = document.body.dataset.safe === "on" ? 1 : 0;
      const reduced = U.prefersReducedMotion() ? 1 : 0;
      debugLine.textContent = `tick=${sim.loopTick} dt=${Math.round(deltaMs)}ms safe=${safe} reduced=${reduced} vis=${document.visibilityState}`;
      sim.lastBeatMs = nowMs;
    }
  }

  function tick(ts) {
    sim.raf = requestAnimationFrame(tick);
    sim.loopTick += 1;
    const delta = sim.last ? (ts - sim.last) : 0;
    updateDebug(ts, delta);

    if (document.visibilityState !== "visible") return;

    if (U.prefersReducedMotion()) {
      if (!sim.renderedOnceReduced) {
        sim.frame += 1;
        stepWorld();
        renderAll();
        sim.renderedOnceReduced = true;
      }
      sim.last = ts;
      return;
    }

    sim.renderedOnceReduced = false;
    const stepMs = document.body.dataset.safe === "on" ? 1000 : 16;
    if (!sim.last || ts - sim.last >= stepMs) {
      const dtMs = !sim.last ? stepMs : (ts - sim.last);
      sim.last = ts;
      sim.frame += 1;
      const changed = stepWorld();
      renderAll();
      const sig0 = sampleMotionSignature();
      if (sig0 === sim.lastSignature) sim.stagnantRenders += 1;
      else sim.stagnantRenders = 0;
      sim.lastSignature = sig0;
      if (changed === 0) sim.stuckMs += dtMs;
      else sim.stuckMs = 0;
      if (sim.stuckMs > 2000 || sim.stagnantRenders > 3) {
        kickDeadState();
        sim.stuckMs = 0;
        sim.stagnantRenders = 0;
      }
    }
  }

  function sync() {
    if (U.prefersReducedMotion()) {
      sim.renderedOnceReduced = false;
    }
  }

  window.addEventListener("scroll", scrollProgress, { passive: true });
  window.addEventListener("safe-mode-change", sync);
  window.addEventListener("lens-change", () => {
    buildPortraitMaps();
    sync();
  });
  document.addEventListener("visibilitychange", sync);

  setupMasks();
  initWorld();
  drawSigils();
  loadAvatarAndBuild();
  sim.running = true;
  sim.raf = requestAnimationFrame(tick);
})();
