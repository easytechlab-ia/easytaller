// EasyTaller — print one element of the page (e.g. a quote) as its own sheet.
// The element is copied into a hidden frame together with the page styles, so
// it prints cleanly (or saves as PDF) wherever it is shown, even in a dialog.

export function printElement(el: HTMLElement | null, title = "Documento"): void {
  if (!el || typeof document === "undefined") return;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }

  // Same styles as the app (Tailwind build + fonts), plus the current colours.
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join("\n");
  const rootStyle = document.documentElement.getAttribute("style") ?? "";

  doc.open();
  doc.write(`<!doctype html><html lang="es" style="${rootStyle.replace(/"/g, "&quot;")}"><head>
<meta charset="utf-8"><title>${title.replace(/</g, "&lt;")}</title>
<base href="${document.baseURI}">
${styles}
<style>
  @page { margin: 14mm; }
  html, body { background: #fff !important; }
  body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head><body>${el.outerHTML}</body></html>`);
  doc.close();

  const cleanup = () => window.setTimeout(() => frame.remove(), 500);
  const go = () => {
    win.focus();
    win.print();
    cleanup();
  };
  // Give the styles and fonts a moment to load before printing.
  if (doc.readyState === "complete") window.setTimeout(go, 300);
  else frame.addEventListener("load", () => window.setTimeout(go, 300));
}
