// Optional in-page player for the listening shelf. Nothing from YouTube loads
// until the visitor presses "Play here", and the direct link stays visible
// in case the embed fails or is blocked. No autoplay.

document.querySelectorAll("[data-embed-id]").forEach((btn) => {
  btn.hidden = false;
  btn.addEventListener("click", () => {
    const slot = btn.closest(".track").querySelector(".track-player");
    if (slot.childElementCount) {
      slot.replaceChildren();
      slot.hidden = true;
      btn.textContent = "Play here";
      btn.setAttribute("aria-expanded", "false");
      return;
    }
    const frame = document.createElement("iframe");
    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(btn.dataset.embedId)}`;
    frame.title = `YouTube player: ${btn.dataset.title}`;
    frame.width = "560";
    frame.height = "315";
    frame.loading = "lazy";
    frame.allow = "encrypted-media; picture-in-picture";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allowFullscreen = true;
    slot.replaceChildren(frame);
    slot.hidden = false;
    btn.textContent = "Close player";
    btn.setAttribute("aria-expanded", "true");
  });
});
