// "A question I'm thinking about": one per browser session, stable while the
// visitor navigates, never rotated on a timer. ?q=<id> opens a specific one.

export const SESSION_KEY = "sr.question";

// Pure selection logic (tested in tests/questions.test.mjs).
export function pickQuestion(ids, { requested, stored, rand = Math.random } = {}) {
  if (!ids.length) return null;
  if (requested && ids.includes(requested)) return requested;
  if (stored && ids.includes(stored)) return stored;
  return ids[Math.floor(rand() * ids.length)];
}

export function nextQuestion(ids, current, rand = Math.random) {
  const others = ids.filter((id) => id !== current);
  if (!others.length) return current;
  return others[Math.floor(rand() * others.length)];
}

function init(box) {
  const showDrafts = window.SRPrefs && window.SRPrefs.drafts();
  const items = Array.from(box.querySelectorAll("[data-qid]"))
    .filter((li) => showDrafts || !li.hasAttribute("data-draft"));
  if (!items.length) return;
  const ids = items.map((li) => li.dataset.qid);
  let stored = null;
  try { stored = sessionStorage.getItem(SESSION_KEY); } catch (_e) { /* no session storage */ }
  const requested = new URLSearchParams(location.search).get("q");

  function show(id) {
    items.forEach((li) => { li.hidden = li.dataset.qid !== id; });
    try { sessionStorage.setItem(SESSION_KEY, id); } catch (_e) { /* not persisted */ }
  }

  let current = pickQuestion(ids, { requested, stored });
  show(current);
  box.hidden = false;
  const row = box.closest("[data-question-row]");
  if (row) row.hidden = false;
  const another = box.querySelector("[data-question-next]");
  if (another && ids.length > 1) {
    another.hidden = false;
    another.addEventListener("click", () => {
      current = nextQuestion(ids, current);
      show(current);
    });
  }
}

if (typeof document !== "undefined") {
  document.querySelectorAll("[data-questions]").forEach(init);
}
