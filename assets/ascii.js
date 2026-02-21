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

  const W = 108;
  const H = 18;
  const G = new Uint8Array(W * H);
  const nextG = new Uint8Array(W * H);
  const state = { running: false, raf: 0, last: 0, frame: 0, entropy: 0, bpm: 0, tear: 0 };
  const buildId = (U.qs('meta[name="build-id"]')?.getAttribute("content") || "00000000-0000-0000");

  function seededFromText(t) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i += 1) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function setSeedPattern(seed) {
    const rand = U.seeded(seed);
    for (let i = 0; i < G.length; i += 1) G[i] = 0;
    const cx = Math.floor(W / 2);
    const cy = Math.floor(H / 2);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const d = Math.hypot((x - cx) / 36, (y - cy) / 8);
        if (d < 1.12 && rand() > d * 0.75) G[y * W + x] = rand() > 0.85 ? 2 : 1;
      }
    }
  }

  function controlVals() {
    const rv = Number(controls.rigor?.value || 64) / 100;
    const cv = Number(controls.compression?.value || 72) / 100;
    const kv = Number(controls.control?.value || 39) / 100;
    return { rv, cv, kv };
  }

  function updateOrganism() {
    const { rv, cv, kv } = controlVals();
    let changed = 0;
    const bias = 0.14 + cv * 0.2 - kv * 0.1;
    const lesionGain = (1 - kv) * 0.32 + (1 - rv) * 0.2;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const i = y * W + x;
        const cur = G[i];
        let live = 0;
        let lesions = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (!ox && !oy) continue;
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const n = G[ny * W + nx];
            if (n >= 1) live += 1;
            if (n === 2) lesions += 1;
          }
        }
        const activation = live * (0.09 + rv * 0.09) + lesions * lesionGain + bias;
        let nxt = cur;
        if (cur === 0) {
          if (activation > 1.0 && live >= 2) nxt = activation > 1.95 ? 2 : 1;
        } else if (cur === 1) {
          if (activation < (0.45 + kv * 0.5)) nxt = 0;
          else if (lesions >= (3 - Math.floor((1 - kv) * 2))) nxt = 2;
        } else if (cur === 2) {
          if (activation > (1.3 + rv * 0.6)) nxt = 3;
          else if (activation < 0.6) nxt = 0;
        } else if (cur === 3) {
          if (activation < (1.0 + kv * 0.3)) nxt = 0;
        }
        nextG[i] = nxt;
        if (nxt !== cur) changed += 1;
      }
    }
    G.set(nextG);
    state.entropy = changed / G.length;
    state.bpm = Math.round(48 + state.entropy * 520);
    if (pulseEl) pulseEl.textContent = String(state.bpm);
  }

  function renderOrganism() {
    const { cv } = controlVals();
    const ramp = [" ", "░", "▒", "▓"];
    const lines = [];
    for (let y = 0; y < H; y += 1) {
      let row = "";
      for (let x = 0; x < W; x += 1) {
        let ch = ramp[G[y * W + x]];
        if (cv > 0.6 && (x + y + state.frame) % 17 === 0 && ch !== " ") ch = ".";
        row += ch;
      }
      lines.push(row);
    }
    heroEl.textContent = lines.join("\n");
  }

  function createFallbackFace(width, height) {
    const arr = new Float32Array(width * height);
    const cx = width * 0.5;
    const cy = height * 0.52;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const ix = y * width + x;
        const dx = (x - cx) / (width * 0.35);
        const dy = (y - cy) / (height * 0.4);
        let v = 0.08;
        const head = 1 - (dx * dx + dy * dy);
        if (head > 0) v += head * 0.45;
        const eyeL = Math.exp(-(((x - width * 0.38) ** 2) / 65 + ((y - height * 0.45) ** 2) / 28));
        const eyeR = Math.exp(-(((x - width * 0.62) ** 2) / 65 + ((y - height * 0.45) ** 2) / 28));
        v -= (eyeL + eyeR) * 0.37;
        const nose = Math.exp(-(((x - cx) ** 2) / 90 + ((y - height * 0.58) ** 2) / 160));
        v -= nose * 0.15;
        const mouth = Math.exp(-(((x - cx) ** 2) / 120 + ((y - height * 0.72) ** 2) / 40));
        v -= mouth * 0.26;
        arr[ix] = U.clamp(v, 0, 1);
      }
    }
    return { data: arr, width, height };
  }

  function contaminate(src) {
    const { rv, cv, kv } = controlVals();
    const chars = " .'`^,:;Il!i~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";
    const out = [];
    const tear = 1 + Math.floor((1 - kv) * 4);
    const breath = 1 + Math.sin(state.frame * 0.13) * (0.2 + cv * 0.35);
    for (let y = 0; y < src.height; y += 2) {
      let row = "";
      const shift = ((y + state.frame) % 11 === 0) ? tear : 0;
      for (let x = 0; x < src.width; x += 1) {
        const sx = U.clamp(x + shift, 0, src.width - 1);
        const i = y * src.width + sx;
        const left = src.data[i - 1] ?? src.data[i];
        const right = src.data[i + 1] ?? src.data[i];
        const edge = Math.abs(right - left) * (0.8 + rv * 1.4);
        let lum = src.data[i] * breath;
        lum = U.clamp(lum + edge * 0.6, 0, 1);
        const halftone = ((x + y + state.frame) % (3 + Math.floor(rv * 3))) === 0 ? -0.08 : 0.03;
        lum = U.clamp(lum + halftone - cv * 0.04, 0, 1);
        if (((x * 7 + y * 13 + state.frame * 5) % 97) < (6 + cv * 14)) lum *= 0.5;
        row += chars[Math.floor(lum * (chars.length - 1))];
      }
      out.push(row);
    }
    return out.join("\n");
  }

  function drawSigils() {
    U.qsa('.sigil').forEach((sig) => {
      const sid = sig.dataset.sigil || "section";
      const rand = U.seeded(seededFromText(`${buildId}:${sid}`));
      const w = 19;
      const h = 7;
      const g = Array.from({ length: h }, () => Array.from({ length: w }, () => " "));
      for (let x = 0; x < w; x += 1) { g[0][x] = x % 2 ? "─" : "┄"; g[h - 1][x] = x % 3 ? "─" : "┄"; }
      for (let y = 0; y < h; y += 1) { g[y][0] = y % 2 ? "│" : "┆"; g[y][w - 1] = y % 3 ? "│" : "┆"; }
      for (let k = 0; k < 24; k += 1) {
        const x = 1 + Math.floor(rand() * (w - 2));
        const y = 1 + Math.floor(rand() * (h - 2));
        g[y][x] = rand() > 0.5 ? "┼" : "·";
      }
      g[3][9] = "◉";
      g[2][8] = "⟁";
      g[4][10] = "✶";
      sig.textContent = g.map((r) => r.join("")).join("\n");
    });
  }

  const canvas = document.createElement("canvas");
  const cx = canvas.getContext("2d", { willReadFrequently: true });
  let portraitData = createFallbackFace(84, 96);

  function loadPortrait() {
    if (!cx || !portraitEl) return;
    const img = new Image();
    img.addEventListener("load", () => {
      canvas.width = 84;
      canvas.height = 96;
      cx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const raw = cx.getImageData(0, 0, canvas.width, canvas.height).data;
      const data = new Float32Array(canvas.width * canvas.height);
      for (let i = 0, p = 0; i < raw.length; i += 4, p += 1) {
        const l = (raw[i] * 0.2126 + raw[i + 1] * 0.7152 + raw[i + 2] * 0.0722) / 255;
        data[p] = l;
      }
      portraitData = { data, width: canvas.width, height: canvas.height };
    });
    img.addEventListener("error", () => { portraitData = createFallbackFace(84, 96); });
    img.src = "assets/avatars/avatar1.jpg";
  }

  function shouldAnimate() {
    return !U.prefersReducedMotion() && document.body.dataset.safe !== "on" && !document.hidden;
  }

  function renderAll() {
    updateOrganism();
    renderOrganism();
    if (portraitEl) portraitEl.textContent = contaminate(portraitData);
  }

  function tick(ts) {
    if (!state.running) return;
    if (!state.last || ts - state.last > 72) {
      state.last = ts;
      state.frame += 1;
      renderAll();
    }
    portraitEl.textContent = out.join("\n");
  }

  function sync() {
    if (!state.frame) setSeedPattern(seededFromText(buildId + (document.body.dataset.lensSeed || "0")));
    drawSigils();
    if (shouldAnimate()) {
      if (!state.running) {
        state.running = true;
        state.raf = requestAnimationFrame(tick);
      }
    } else {
      state.running = false;
      if (state.raf) cancelAnimationFrame(state.raf);
      renderAll();
    }
  }

  window.addEventListener("safe-mode-change", sync);
  window.addEventListener("lens-change", () => {
    state.frame += 1;
    sync();
  });
  document.addEventListener("visibilitychange", sync);

  loadPortrait();
  sync();
})();
