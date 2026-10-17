// Site-wide preferences. Loaded as a classic script in <head> so the page
// renders in the right presentation from the first paint.
//
//   motion:        "system" | "paused"     (visitor's choice)
//   presentation:  "standard" | "reading"  (visitor's choice)
//
// Effective motion is off when the visitor paused it, chose reading view, or
// the system asks for reduced motion. The result lands on <html> as
// data-motion="on|off" and data-presentation, and "sr:prefs" fires on change.
//
// ?drafts=1 shows draft material for this browser session (?drafts=0 hides it).
(() => {
  "use strict";
  const KEY = "sr.prefs.v1";
  const root = document.documentElement;
  const reduced = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const prefs = { motion: "system", presentation: "standard" };

  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (saved.motion === "paused") prefs.motion = "paused";
    if (saved.presentation === "reading") prefs.presentation = "reading";
  } catch (_e) { /* storage unavailable: defaults */ }

  let drafts = false;
  try {
    const q = new URLSearchParams(location.search).get("drafts");
    if (q === "1") sessionStorage.setItem("sr.drafts", "1");
    if (q === "0") sessionStorage.removeItem("sr.drafts");
    drafts = sessionStorage.getItem("sr.drafts") === "1";
  } catch (_e) {
    drafts = new URLSearchParams(location.search).get("drafts") === "1";
  }

  const systemReduced = () => !!(reduced && reduced.matches);
  const motionAllowed = () => prefs.motion !== "paused" && prefs.presentation !== "reading" && !systemReduced();

  function syncButtons() {
    document.querySelectorAll("[data-pref-toggle]").forEach((btn) => {
      const key = btn.dataset.prefToggle;
      const on = key === "motion" ? prefs.motion === "paused" : prefs.presentation === "reading";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (key === "motion") {
        btn.title = systemReduced()
          ? "Your system asks for reduced motion, so animations stay still."
          : "Pause or resume the animations on this site.";
      }
    });
  }

  function apply() {
    root.dataset.motion = motionAllowed() ? "on" : "off";
    root.dataset.presentation = prefs.presentation;
    root.dataset.drafts = drafts ? "on" : "off";
    syncButtons();
  }

  function set(key, value) {
    prefs[key] = value;
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_e) { /* not persisted */ }
    apply();
    window.dispatchEvent(new CustomEvent("sr:prefs", { detail: { ...prefs } }));
  }

  if (reduced && reduced.addEventListener) {
    reduced.addEventListener("change", () => {
      apply();
      window.dispatchEvent(new CustomEvent("sr:prefs", { detail: { ...prefs } }));
    });
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest("[data-pref-toggle]");
    if (!btn) return;
    if (btn.dataset.prefToggle === "motion") set("motion", prefs.motion === "paused" ? "system" : "paused");
    else set("presentation", prefs.presentation === "reading" ? "standard" : "reading");
  });
  document.addEventListener("DOMContentLoaded", syncButtons);

  window.SRPrefs = {
    get: () => ({ ...prefs }),
    set,
    motionAllowed,
    drafts: () => drafts,
  };
  apply();
})();
