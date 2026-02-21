(() => {
  "use strict";
  const U = window.__UTIL__;
  if (!U) return;

  const modeBtn = U.qs("#mode-toggle");
  const signal = U.qs("#signal-intensity");
  const safe = U.qs("#safe-mode");
  const year = U.qs("#year");
  const lensOut = U.qs("#lens-output");
  const heartbeat = U.qs("#heartbeat");
  const r = U.qs("#lens-rigor");
  const c = U.qs("#lens-compression");
  const k = U.qs("#lens-control");

  const live = { signal: 56, phase: 0, pulse: 0, raf: 0 };

  function parseModeQuery() {
    try {
      const q = new URLSearchParams(window.location.search);
      const m = q.get("mode");
      if (m === "cmp") return "cmp";
      if (m === "exp") return "exp";
      return null;
    } catch (_e) { return null; }
  }

  function applyMode(mode) {
    const m = mode === "cmp" ? "cmp" : "exp";
    document.body.dataset.mode = m;
    if (modeBtn) modeBtn.textContent = `MODE: ${m === "cmp" ? "COMPRESSION" : "EXPLOSION"}`;
    U.storageSet("mode", m);
    window.dispatchEvent(new Event("mode-change"));
  }

  function applySignal(v) {
    live.signal = U.clamp(Number(v) || 0, 0, 100);
    U.storageSet("signal", Math.round(live.signal));
  }

  function materializeSignal(now) {
    const n = now / 100;
    document.documentElement.style.setProperty("--grain-strength", (0.08 + n * 0.42 + live.phase * 0.06).toFixed(3));
    document.documentElement.style.setProperty("--glow-strength", (0.1 + n * 0.8 + live.phase * 0.03).toFixed(3));
    document.documentElement.style.setProperty("--scan-strength", (0.05 + n * 0.35 + live.phase * 0.03).toFixed(3));
  }

  function applySafe(on) {
    document.body.dataset.safe = on ? "on" : "off";
    U.storageSet("safe-mode", !!on);
    window.dispatchEvent(new Event("safe-mode-change"));
  }

  function lensSentence() {
    if (!(lensOut && r && c && k)) return;
    const rv = Number(r.value), cv = Number(c.value), kv = Number(k.value);
    const rigorWord = rv > 66 ? "forensic" : rv > 33 ? "balanced" : "lyrical";
    const compWord = cv > 66 ? "exploded" : cv > 33 ? "layered" : "compressed";
    const ctrlWord = kv > 66 ? "disciplined" : kv > 33 ? "adaptive" : "surrendered";
    lensOut.textContent = `lens report: ${rigorWord} method, ${compWord} evidence, ${ctrlWord} operator state.`;
    document.body.dataset.lensSeed = String(Math.floor(rv * 3 + cv * 5 + kv * 7));
    live.phase = 1;
    window.dispatchEvent(new Event("phase-shift"));
    window.dispatchEvent(new Event("lens-change"));
  }

  function stampSigils() {
    const chars = "|/\\_=:;+*#@~^";
    U.qsa("main .section").forEach((sec) => {
      if (!sec.id || U.qs(".sigil", sec)) return;
      const h = U.hash(sec.id);
      const rand = U.seeded(h);
      const lines = [];
      for (let y = 0; y < 5; y += 1) {
        let row = "";
        for (let x = 0; x < 14; x += 1) {
          const gate = (x + y + (h % 7)) % 3 === 0;
          row += gate ? chars[Math.floor(rand() * chars.length)] : " ";
        }
        lines.push(row);
      }
      const pre = document.createElement("pre");
      pre.className = "sigil";
      pre.setAttribute("aria-hidden", "true");
      pre.textContent = lines.join("\n");
      sec.appendChild(pre);
    });
  }

  function animateCluster() {
    const reduced = U.prefersReducedMotion();
    if (reduced) {
      materializeSignal(live.signal);
      return;
    }
    const loop = () => {
      const current = Number(getComputedStyle(document.documentElement).getPropertyValue("--grain-strength")) || 0.28;
      const targetGrain = 0.08 + (live.signal / 100) * 0.42 + live.phase * 0.06;
      const smoothed = U.lerp(current, targetGrain, 0.11);
      const nowSignal = U.clamp((smoothed - 0.08) / 0.42 * 100, 0, 100);
      materializeSignal(nowSignal);
      live.phase = Math.max(0, live.phase * 0.93 - 0.004);
      const pulse = live.pulse;
      document.documentElement.style.setProperty("--cluster-pulse", (pulse * 3).toFixed(3));
      document.documentElement.style.setProperty("--phase-boost", live.phase.toFixed(3));
      live.raf = requestAnimationFrame(loop);
    };
    if (!live.raf) live.raf = requestAnimationFrame(loop);
  }

  function runTests() {
    const pane = U.qs("#__test");
    const out = U.qs("#test-output");
    if (!pane || !out) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("test") !== "1") return;
    pane.hidden = false;
    const rows = [];

    try {
      applyMode("cmp");
      rows.push(U.storageGet("mode", "exp") === "cmp" ? "PASS mode persistence" : "FAIL mode persistence");
      applyMode("exp");
    } catch (_e) { rows.push("FAIL mode persistence exception"); }

    try {
      applySignal(70);
      materializeSignal(70);
      const a = getComputedStyle(document.documentElement).getPropertyValue("--grain-strength").trim();
      rows.push(a ? "PASS slider updates" : "FAIL slider updates");
    } catch (_e) { rows.push("FAIL slider updates exception"); }

    try {
      rows.push(parseModeQuery() === "cmp" || parseModeQuery() === "exp" || parseModeQuery() === null ? "PASS mode query parse" : "FAIL mode query parse");
    } catch (_e) { rows.push("FAIL mode query parse exception"); }

    out.textContent = rows.join("\n");
  }

  const bootMode = parseModeQuery() || U.storageGet("mode", "exp");
  applyMode(bootMode);
  const sVal = U.storageGet("signal", 56);
  if (signal) signal.value = String(sVal);
  applySignal(sVal);
  materializeSignal(sVal);
  const safeVal = U.storageGet("safe-mode", false);
  if (safe) safe.checked = !!safeVal;
  applySafe(!!safeVal);

  if (modeBtn) modeBtn.addEventListener("click", () => applyMode(document.body.dataset.mode === "cmp" ? "exp" : "cmp"));
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "e") applyMode(document.body.dataset.mode === "cmp" ? "exp" : "cmp");
  });
  if (signal) signal.addEventListener("input", (e) => { applySignal(e.target.value); live.phase = 1; window.dispatchEvent(new Event("phase-shift")); });
  if (safe) safe.addEventListener("change", (e) => applySafe(e.target.checked));
  [r, c, k].forEach((el) => el && el.addEventListener("input", lensSentence));

  window.addEventListener("organism-heartbeat", (e) => {
    const ent = U.clamp(Number(e.detail?.entropy) || 0, 0, 1);
    live.pulse = U.lerp(live.pulse, ent, 0.25);
    if (heartbeat) heartbeat.textContent = `pulse ${ent.toFixed(2)}`;
  });

  if (year) year.textContent = String(new Date().getFullYear());
  stampSigils();
  lensSentence();
  animateCluster();
  runTests();
})();
