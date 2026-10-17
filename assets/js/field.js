// Enlarged view for the visual field notebook. Each grid item is a link to
// the full image, so it works without JS; with JS it opens in a <dialog>
// with Escape to close, arrow keys to move, and focus returned on close.

const grid = document.getElementById("field-grid");
const dialog = document.getElementById("field-viewer");

if (grid && dialog && typeof dialog.showModal === "function") {
  const links = Array.from(grid.querySelectorAll("a[data-field]"));
  const img = dialog.querySelector("img");
  const caption = dialog.querySelector("[data-field-caption]");
  const meta = dialog.querySelector("[data-field-meta]");
  const more = dialog.querySelector("[data-field-more]");
  const count = dialog.querySelector("[data-field-count]");
  let index = 0;
  let opener = null;

  function show(i) {
    index = (i + links.length) % links.length;
    const a = links[index];
    img.src = a.href;
    img.alt = a.dataset.alt || "";
    img.width = Number(a.dataset.w) || 0;
    img.height = Number(a.dataset.h) || 0;
    caption.textContent = a.dataset.caption || "";
    meta.textContent = [a.dataset.date, a.dataset.context].filter(Boolean).join(" · ");
    if (a.dataset.note) { more.href = a.dataset.note; more.hidden = false; } else { more.hidden = true; }
    count.textContent = `${index + 1} of ${links.length}`;
  }

  links.forEach((a, i) => a.addEventListener("click", (e) => {
    e.preventDefault();
    opener = a;
    show(i);
    dialog.showModal();
  }));
  dialog.querySelector("[data-field-prev]").addEventListener("click", () => show(index - 1));
  dialog.querySelector("[data-field-next]").addEventListener("click", () => show(index + 1));
  dialog.querySelector("[data-field-close]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); show(index - 1); }
    if (e.key === "ArrowRight") { e.preventDefault(); show(index + 1); }
  });
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => {
    img.removeAttribute("src");
    if (opener) opener.focus();
  });
}
