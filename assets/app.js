(() => {
  "use strict";
  const U = window.__UTIL__;
  if (!U) return;

  const modeBtn = U.qs("#mode-toggle");
  const signal = U.qs("#signal-intensity");
  const safe = U.qs("#safe-mode");
  const year = U.qs("#year");
  const lensOut = U.qs("#lens-output");
  const r = U.qs("#lens-rigor");
  const c = U.qs("#lens-compression");
  const k = U.qs("#lens-control");

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
    if (modeBtn) modeBtn.textContent = m === "cmp" ? "CMP" : "EXP";
    U.storageSet("mode", m);
  }

  function applySignal(v) {
    const n = U.clamp(Number(v) || 0, 0, 100) / 100;
    document.documentElement.style.setProperty("--grain-strength", (0.08 + n * 0.42).toFixed(3));
    document.documentElement.style.setProperty("--glow-strength", (0.1 + n * 0.8).toFixed(3));
    document.documentElement.style.setProperty("--scan-strength", (0.05 + n * 0.35).toFixed(3));
    U.storageSet("signal", Math.round(n * 100));
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
    const sentence = `lens report: ${rigorWord} method, ${compWord} evidence, ${ctrlWord} operator state.`;
    lensOut.textContent = sentence;
    document.body.dataset.lensSeed = String(Math.floor(rv * 3 + cv * 5 + kv * 7));
    window.dispatchEvent(new Event("lens-change"));
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
      const p = window.__MUSIC_TEST__?.parseYouTubeId;
      if (p) {
        rows.push(p("https://www.youtube.com/watch?v=abc123xyz09") === "abc123xyz09" ? "PASS youtube watch" : "FAIL youtube watch");
        rows.push(p("https://youtu.be/abc123xyz09?t=1") === "abc123xyz09" ? "PASS youtube short" : "FAIL youtube short");
        rows.push(p("https://www.youtube.com/shorts/abc123xyz09?feature=share") === "abc123xyz09" ? "PASS youtube shorts" : "FAIL youtube shorts");
      } else {
        rows.push("PASS youtube tests skipped on index");
      }
    } catch (_e) { rows.push("FAIL youtube parser exception"); }

    try {
      applyMode("cmp");
      const ok = U.storageGet("mode", "exp") === "cmp";
      rows.push(ok ? "PASS mode persistence" : "FAIL mode persistence");
      applyMode("exp");
    } catch (_e) { rows.push("FAIL mode persistence exception"); }

    try {
      applySignal(70);
      const a = getComputedStyle(document.documentElement).getPropertyValue("--grain-strength").trim();
      rows.push(a ? "PASS slider updates" : "FAIL slider updates");
    } catch (_e) { rows.push("FAIL slider updates exception"); }

    out.textContent = rows.join("\n");
  }

  const bootMode = parseModeQuery() || U.storageGet("mode", "exp");
  applyMode(bootMode);
  const sVal = U.storageGet("signal", 56);
  if (signal) signal.value = String(sVal);
  applySignal(sVal);
  const safeVal = U.storageGet("safe-mode", false);
  if (safe) safe.checked = !!safeVal;
  applySafe(!!safeVal);

  if (modeBtn) {
    modeBtn.addEventListener("click", () => applyMode(document.body.dataset.mode === "cmp" ? "exp" : "cmp"));
  }
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "e") applyMode(document.body.dataset.mode === "cmp" ? "exp" : "cmp");
  });
  if (signal) signal.addEventListener("input", (e) => applySignal(e.target.value));
  if (safe) safe.addEventListener("change", (e) => applySafe(e.target.checked));
  [r, c, k].forEach((el) => el && el.addEventListener("input", lensSentence));

  if (year) year.textContent = String(new Date().getFullYear());
  lensSentence();
  runTests();
})();
