(() => {
  "use strict";
  const U = window.__UTIL__;
  if (!U) return;

  const hero = U.qs("#ascii-hero");
  const portrait = U.qs("#ascii-portrait");
  if (!hero || !portrait) return;

  const st = {
    raf: 0,
    running: false,
    frame: 0,
    cols: 88,
    rows: 22,
    grid: [],
    next: [],
    portraitBase: null,
    reduced: U.prefersReducedMotion(),
    transitions: 0,
    phase: 0,
    lastTs: 0,
    portraitLast: 0
  };

  const target = { rigor: 0.64, romance: 0.36, control: 0.39, surrender: 0.61, signal: 0.56, mode: "exp" };
  const live = { ...target };

  function initGrid() {
    const size = st.cols * st.rows;
    const seed = U.hash((U.qs('meta[name="build-id"]')?.getAttribute("content") || "seed") + "::organism");
    const rand = U.seeded(seed);
    st.grid = new Array(size).fill(0).map(() => (rand() > 0.9 ? 1 : 0));
    st.next = new Array(size).fill(0);
  }

  function idx(x, y) {
    const xx = (x + st.cols) % st.cols;
    const yy = (y + st.rows) % st.rows;
    return yy * st.cols + xx;
  }

  function readTargets() {
    const rigor = U.qs("#lens-rigor");
    const comp = U.qs("#lens-compression");
    const ctrl = U.qs("#lens-control");
    const sig = U.qs("#signal-intensity");
    target.rigor = U.clamp(Number(rigor?.value || 64) / 100, 0, 1);
    target.romance = 1 - target.rigor;
    target.control = U.clamp(Number(ctrl?.value || 39) / 100, 0, 1);
    target.surrender = 1 - target.control;
    target.signal = U.clamp(Number(sig?.value || 56) / 100, 0, 1);
    target.mode = document.body.dataset.mode || "exp";
    if (comp) {
      const cv = U.clamp(Number(comp.value) / 100, 0, 1);
      target.mode = cv < 0.5 ? "cmp" : "exp";
    }

    live.rigor = U.lerp(live.rigor, target.rigor, 0.08);
    live.romance = U.lerp(live.romance, target.romance, 0.08);
    live.control = U.lerp(live.control, target.control, 0.08);
    live.surrender = U.lerp(live.surrender, target.surrender, 0.08);
    live.signal = U.lerp(live.signal, target.signal, 0.08);
    live.mode = target.mode;
  }

  function resize() {
    const exp = live.mode === "exp";
    const w = Math.max(hero.clientWidth || 680, 360);
    st.cols = U.clamp(Math.floor(w / (exp ? 8 : 12)), 42, exp ? 148 : 96);
    st.rows = exp ? 24 : 16;
    initGrid();
  }

  function step() {
    const kMem = 0.22 + live.romance * 0.25;
    const kLes = 0.36 + live.surrender * 0.25;
    const bias = 1.34 + live.rigor * 0.7;
    const tBirth = 0.82 + live.rigor * 0.7;
    const tDeath = 0.5 + live.surrender * 0.35;
    const tCool = 0.62 + live.rigor * 0.2;
    const lesionP = 0.04 + live.surrender * 0.1 + st.phase * 0.08;
    let transitions = 0;

    for (let y = 0; y < st.rows; y += 1) {
      for (let x = 0; x < st.cols; x += 1) {
        const i = idx(x, y);
        const g = st.grid[i];
        let n1 = 0;
        let n2 = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (!ox && !oy) continue;
            const v = st.grid[idx(x + ox, y + oy)];
            if (v >= 1) n1 += 1;
            if (v === 2) n2 += 1;
          }
        }
        let a = (n1 * kMem + n2 * kLes) - bias;
        const wave = Math.sin((x * 0.11) + st.frame * 0.03) * Math.cos((y * 0.19) - st.frame * 0.02);
        a += wave * (0.25 + live.surrender * 0.2 + st.phase * 0.2);

        let n = g;
        if (g === 0 && a > tBirth) n = Math.abs(wave) > 0.42 && live.surrender > 0.46 ? 2 : 1;
        else if (g === 1 && a < tDeath) n = 0;
        else if (g === 2 && a < tCool) n = 3;
        else if (g === 3) n = live.rigor > 0.7 ? 3 : (a > tDeath ? 1 : 0);

        const seed = U.hash(`${x}:${y}:${st.frame}`);
        const rand = U.seeded(seed)();
        if (rand < lesionP && g === 1) n = 2;

        st.next[i] = n;
        if (n !== g) transitions += 1;
      }
    }

    if (live.control > 0.66) {
      for (let y = 0; y < st.rows; y += 1) {
        for (let x = Math.floor(st.cols / 2); x < st.cols; x += 1) {
          const left = idx(st.cols - x - 1, y);
          const right = idx(x, y);
          if ((x + y + st.frame) % 5 === 0) st.next[right] = st.next[left];
        }
      }
    }

    st.transitions = transitions / Math.max(1, st.cols * st.rows);
    const t = st.grid;
    st.grid = st.next;
    st.next = t;
    st.phase = Math.max(0, st.phase * 0.94 - 0.005);
  }

  function renderHero() {
    const exp = live.mode === "exp";
    const pal = live.signal > 0.6 ? "  .,:;i1tfLCG08@" : " .:-=+*#%@";
    const map = [" ", pal[Math.floor(pal.length * 0.38)] || ":", pal[Math.floor(pal.length * 0.82)] || "#", pal[Math.floor(pal.length * 0.55)] || "+"];
    const lines = [];
    let alive = 0;

    const stepX = exp ? 1 : 2;
    const stepY = exp ? 1 : 2;
    for (let y = 0; y < st.rows; y += stepY) {
      const tear = Math.round(Math.sin(y * 0.41 + st.frame * 0.05) * (live.surrender * 1.8 + st.phase * 1.5));
      let row = "";
      for (let x = 0; x < st.cols; x += stepX) {
        const v = st.grid[idx(x + tear, y)];
        if (v >= 1) alive += 1;
        row += map[v] || " ";
      }
      lines.push(row);
    }
    hero.textContent = lines.join("\n");

    const total = Math.max(1, st.cols * st.rows / (stepX * stepY));
    const aliveRatio = alive / total;
    const entropy = U.clamp(0.7 * aliveRatio + 1.8 * st.transitions, 0, 1);
    window.dispatchEvent(new CustomEvent("organism-heartbeat", { detail: { entropy } }));
  }

  function fallbackPortrait(cols, rows) {
    const out = [];
    for (let y = 0; y < rows; y += 1) {
      let row = "";
      for (let x = 0; x < cols; x += 1) {
        const nx = (x / cols) * 2 - 1;
        const ny = (y / rows) * 2 - 1;
        const head = (nx * nx) / 0.56 + (ny * ny) / 0.9;
        const eye = (((nx + 0.24) ** 2) / 0.028 + ((ny + 0.15) ** 2) / 0.03 < 1) || (((nx - 0.24) ** 2) / 0.028 + ((ny + 0.15) ** 2) / 0.03 < 1);
        const mouth = ((nx ** 2) / 0.09 + ((ny - 0.33) ** 2) / 0.02) < 1;
        let l = head < 1 ? 0.75 : 0.1;
        if (eye) l = 0.18;
        if (mouth) l = 0.26;
        row += " .,:;irsXA253hMHGS#9B&@"[Math.floor(U.clamp(l, 0, 0.99) * 23)] || " ";
      }
      out.push(row);
    }
    return out;
  }

  function loadPortrait() {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            const cols = 96;
            const rows = 32;
            const c = document.createElement("canvas");
            c.width = cols;
            c.height = rows;
            const g = c.getContext("2d", { willReadFrequently: true });
            if (!g) { resolve(fallbackPortrait(cols, rows)); return; }
            g.drawImage(img, 0, 0, cols, rows);
            const d = g.getImageData(0, 0, cols, rows).data;
            const lines = [];
            for (let y = 0; y < rows; y += 1) {
              let row = "";
              for (let x = 0; x < cols; x += 1) {
                const i = (y * cols + x) * 4;
                const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
                row += " .,:;irsXA253hMHGS#9B&@"[Math.floor((1 - lum) * 23)] || " ";
              }
              lines.push(row);
            }
            resolve(lines);
          } catch (_e) { resolve(fallbackPortrait(96, 32)); }
        };
        img.onerror = () => resolve(fallbackPortrait(96, 32));
        img.src = "assets/avatars/avatar1.jpg";
      } catch (_e) { resolve(fallbackPortrait(96, 32)); }
    });
  }

  function renderPortrait() {
    const base = st.portraitBase;
    if (!base || !base.length) return;
    const rows = base.length;
    const cols = base[0].length;
    const rr = U.seeded(U.hash(`${st.frame}:${Math.floor(live.signal * 1000)}`));
    const dissolve = 0.03 + live.surrender * 0.22;
    const sharpen = 0.2 + (live.rigor + live.control) * 0.4;
    const smear = live.romance * 0.18;
    const tearAmp = live.surrender * 2 + st.phase * 2;
    const breath = 1 + 0.03 * Math.sin(st.frame * 0.04);
    const out = [];

    for (let y = 0; y < rows; y += 1) {
      const shift = Math.round(Math.sin(y * 0.5 + st.frame * 0.09) * tearAmp);
      let row = "";
      for (let x = 0; x < cols; x += 1) {
        const sx = U.clamp(x + shift, 0, cols - 1);
        let ch = base[y][sx] || " ";
        const n = rr();
        if (((x + y + st.frame) & 1) === 0 && n < 0.08 + live.romance * 0.06) ch = ".";
        if (n < dissolve) ch = " .:;+-~#@"[Math.floor(rr() * 9)] || " ";
        if (n < smear && x > 0) ch = row[row.length - 1] || ch;
        if (n < 0.06 + (1 - sharpen) * 0.12) ch = " ";
        if (breath > 1.02 && n < 0.04) ch = "~";
        row += ch;
      }
      out.push(row);
    }
    portrait.textContent = out.join("\n");
  }

  function frame(ts) {
    if (!st.running) return;
    readTargets();
    const safe = document.body.dataset.safe === "on";
    const tickMs = st.reduced ? Infinity : (safe ? 1000 : (130 - live.signal * 80));
    const portraitMs = st.reduced ? Infinity : (safe ? 1000 : 140);

    if (!st.lastTs || ts - st.lastTs >= tickMs) {
      st.frame += 1;
      st.lastTs = ts;
      step();
      renderHero();
    }
    if (!st.portraitLast || ts - st.portraitLast >= portraitMs) {
      st.portraitLast = ts;
      renderPortrait();
    }
    if (!st.reduced) st.raf = requestAnimationFrame(frame);
  }

  function start() {
    if (st.running) return;
    st.running = true;
    if (st.reduced) {
      readTargets();
      step();
      renderHero();
      renderPortrait();
      st.running = false;
      return;
    }
    st.raf = requestAnimationFrame(frame);
  }

  function stop() {
    st.running = false;
    if (st.raf) cancelAnimationFrame(st.raf);
    st.raf = 0;
  }

  function sync() {
    st.reduced = U.prefersReducedMotion();
    resize();
    start();
  }

  window.addEventListener("phase-shift", () => { st.phase = 1; });
  window.addEventListener("safe-mode-change", sync);
  window.addEventListener("mode-change", sync);
  window.addEventListener("lens-change", () => { st.phase = 1; });
  window.addEventListener("resize", U.debounce(sync, 130));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else sync();
  });

  loadPortrait().then((b) => {
    st.portraitBase = b;
    sync();
  });
})();
