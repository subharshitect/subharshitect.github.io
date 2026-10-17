// Save a text, Blob or canvas as a file the visitor downloads.

export function download(name, blobOrText, type = "text/plain") {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCanvas(name, canvas) {
  canvas.toBlob((blob) => { if (blob) download(name, blob); }, "image/png");
}
