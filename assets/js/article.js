// Small enhancements for long notes: a thin reading-progress bar and the
// figure inspector (result / annotation / data). Both are optional; the
// article reads the same without them.

function readingProgress() {
  const bar = document.querySelector(".reading-progress");
  const article = document.querySelector("article.note");
  if (!bar || !article) return;
  let queued = false;
  const paint = () => {
    queued = false;
    const rect = article.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    const p = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1;
    bar.style.transform = `scaleX(${p.toFixed(4)})`;
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  paint();
}

// <figure class="inspect"> with children [data-view="result|annotation|data"].
// Without JS all views stay visible, stacked.
function figureInspectors() {
  document.querySelectorAll("figure.inspect").forEach((fig, n) => {
    const views = Array.from(fig.querySelectorAll(":scope > [data-view]"));
    if (views.length < 2) return;
    const bar = document.createElement("div");
    bar.className = "inspect-bar";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Show figure as");
    const buttons = views.map((view, i) => {
      view.id = view.id || `fig${n}-${view.dataset.view}`;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = view.dataset.label || view.dataset.view;
      b.setAttribute("aria-controls", view.id);
      b.addEventListener("click", () => select(i));
      return b;
    });
    function select(i) {
      views.forEach((v, j) => { v.hidden = j !== i; });
      buttons.forEach((b, j) => b.setAttribute("aria-pressed", String(j === i)));
    }
    bar.append(...buttons);
    fig.prepend(bar);
    fig.classList.add("is-enhanced");
    select(0);
  });
}

readingProgress();
figureInspectors();
