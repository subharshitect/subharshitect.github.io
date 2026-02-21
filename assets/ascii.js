(() => {
  "use strict";
  const U = window.__UTIL__;
  if (!U) return;

  const el = U.qs("#ascii-hero");
  if (!el) return;

  const state = { raf: 0, frame: 0, seed: 9127, running: false };

  function render(seed, frame = 0) {
    const cols = 108;
    const rows = 18;
    const rand = U.seeded(seed + frame * 97);
    const chars = " .:-=+*#%@";
    const lines = [];
    for (let y = 0; y < rows; y += 1) {
      let row = "";
      for (let x = 0; x < cols; x += 1) {
        const wave = Math.sin((x + frame * 0.45) * 0.12) + Math.cos((y + frame * 0.22) * 0.45);
        const n = rand();
        const v = (wave * 0.5 + 0.5) * 0.7 + n * 0.3;
        row += chars[Math.floor(U.clamp(v, 0, 0.999) * chars.length)];
      }
      lines.push(row);
    }
    el.textContent = lines.join("\n");
  }

  function shouldAnimate() {
    return !U.prefersReducedMotion() && document.body.dataset.safe !== "on";
  }

  function tick(ts) {
    if (!state.running) return;
    if (!state.last || ts - state.last > 55) {
      state.frame += 1;
      state.last = ts;
      render(state.seed, state.frame);
    }
    state.raf = requestAnimationFrame(tick);
  }

  function start() {
    if (state.running) return;
    state.running = true;
    state.raf = requestAnimationFrame(tick);
  }

  function stop() {
    state.running = false;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
  }

  function sync() {
    const seedHint = Number(document.body.dataset.lensSeed || 0);
    state.seed = 9127 + seedHint;
    if (shouldAnimate()) start();
    else {
      stop();
      render(state.seed, 1);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else sync();
  });
  window.addEventListener("safe-mode-change", sync);
  window.addEventListener("lens-change", sync);
  sync();
})();
