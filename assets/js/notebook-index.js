// Progressive enhancement for the notebook index. The list itself is static
// HTML (written by tools/build.py). Tag filters appear once there are enough
// entries to need them, and title/summary search once browsing gets long.

export const TAGS_AFTER = 6;
export const SEARCH_AFTER = 10;

const list = document.getElementById("note-list");
const tools = document.getElementById("note-tools");

if (list && tools) {
  const showDrafts = window.SRPrefs && window.SRPrefs.drafts();
  const entries = Array.from(list.querySelectorAll("[data-note]"))
    .filter((li) => showDrafts || !li.hasAttribute("data-draft"));
  const tagInput = tools.querySelector("[data-note-tags]");
  const search = tools.querySelector("[data-note-search]");
  const empty = document.getElementById("note-empty-filter");
  let activeTag = "";

  function apply() {
    const q = search ? search.value.trim().toLowerCase() : "";
    let shown = 0;
    entries.forEach((li) => {
      const tags = (li.dataset.tags || "").split(" ");
      const text = `${li.dataset.title} ${li.dataset.summary}`.toLowerCase();
      const ok = (!activeTag || tags.includes(activeTag)) && (!q || text.includes(q));
      li.hidden = !ok;
      if (ok) shown += 1;
    });
    if (empty) empty.hidden = shown > 0;
  }

  if (entries.length >= TAGS_AFTER && tagInput) {
    const counts = new Map();
    entries.forEach((li) => (li.dataset.tags || "").split(" ").filter(Boolean)
      .forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
    const all = ["", ...Array.from(counts.keys()).sort()];
    tagInput.replaceChildren(...all.map((tag) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = tag ? `${tag} (${counts.get(tag)})` : "all";
      b.setAttribute("aria-pressed", String(tag === activeTag));
      b.addEventListener("click", () => {
        activeTag = tag;
        tagInput.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        apply();
      });
      return b;
    }));
    tagInput.hidden = false;
    tools.hidden = false;
  }
  if (entries.length >= SEARCH_AFTER && search) {
    search.closest("label").hidden = false;
    search.addEventListener("input", apply);
    tools.hidden = false;
  }
}
