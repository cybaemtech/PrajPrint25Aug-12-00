export interface PrintWindowOptions {
  url: string;
  filename: string;
  copies: number;
  colorMode: "bw" | "color";
  pageSize: string;
  duplex: boolean;
}

/**
 * Opens a print window for the given file.
 *
 * PDFs: navigates the new window directly to the blob URL so the browser's
 * native PDF viewer renders the full document before print() is triggered.
 * Embedding a PDF inside an iframe caused window.print() to fire before the
 * renderer had finished painting, producing a blank/screenshot-like output.
 *
 * Images: written into the new window with grayscale CSS applied.
 */
export function openPrintWindow(opts: PrintWindowOptions): Promise<boolean> {
  const { url, filename, copies, colorMode, pageSize, duplex } = opts;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "docx") {
    return Promise.resolve(false);
  }

  const settingsSummary = [
    `${copies} cop${copies === 1 ? "y" : "ies"}`,
    colorMode === "bw" ? "Black & White" : "Colour",
    pageSize,
    duplex ? "Duplex" : "Single-sided",
  ].join(" · ");

  return new Promise((resolve) => {
    try {
      const w = window.open("", "_blank");
      if (!w) { resolve(false); return; }

      let resolved = false;
      const done = (v = true) => { if (!resolved) { resolved = true; resolve(v); } };

      if (ext === "pdf") {
        // Navigate the window directly to the PDF blob URL.
        // The browser's native PDF viewer loads and fully renders the document,
        // then we call print() after a generous delay so the dialog shows the
        // complete document — not a partial/screenshot rendering.
        w.location.href = url;

        let printed = false;
        const tryPrint = () => {
          if (printed) return;
          printed = true;
          try { w.focus(); w.print(); } catch { /* popup may have been closed */ }
          setTimeout(done, 500);
        };

        // Primary trigger: poll until the window has fully navigated, then
        // wait an extra 1.5 s for the PDF renderer to finish painting.
        let polls = 0;
        const poll = setInterval(() => {
          polls++;
          try {
            const ready = w.document.readyState === "complete" || w.location.href !== "about:blank";
            if (ready || polls > 20) {
              clearInterval(poll);
              setTimeout(tryPrint, 1500);
            }
          } catch {
            // cross-origin frame guard — PDF viewer is loaded, safe to print
            clearInterval(poll);
            setTimeout(tryPrint, 1500);
          }
        }, 150);

        // Hard fallback: 5 s from now regardless of poll result
        setTimeout(() => { clearInterval(poll); tryPrint(); }, 5000);

      } else {
        // Images — write into the window directly, apply grayscale via CSS
        const grayscaleCss = colorMode === "bw"
          ? `filter:grayscale(100%) !important;
             -webkit-filter:grayscale(100%) !important;
             -webkit-print-color-adjust:economy !important;
             print-color-adjust:economy !important;`
          : `-webkit-print-color-adjust:exact;print-color-adjust:exact;`;

        const imgBlock = (i: number) => `
          <div style="display:flex;align-items:center;justify-content:center;
                      min-height:100vh;page-break-after:${i < copies - 1 ? "always" : "auto"};
                      ${grayscaleCss}">
            <img src="${url}" style="max-width:100%;max-height:100vh;object-fit:contain"/>
          </div>`;
        const allCopies = Array.from({ length: copies }, (_, i) => imgBlock(i)).join("");

        w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${filename}</title>
          <style>
            *{margin:0;padding:0}
            body{background:#fff}
            .banner{background:#1a3355;color:#fff;padding:10px 18px;display:flex;align-items:center;gap:12px;font-size:12px}
            @page{size:${pageSize};margin:10mm}
            @media print{.banner{display:none !important} div{${grayscaleCss}}}
          </style>
        </head><body>
          <div class="banner">
            <strong>&#x1F5A8; Print settings</strong>
            <span style="background:rgba(255,255,255,.18);border-radius:4px;padding:2px 10px;font-size:11px">${settingsSummary}</span>
            ${copies > 1 ? `<span style="opacity:.55;font-size:11px">${copies} copies embedded</span>` : ""}
          </div>
          ${allCopies}
          <script>window.onload=function(){setTimeout(function(){window.focus();window.print();},600);}<\/script>
        </body></html>`);
        w.document.close();
        done();
      }
    } catch {
      resolve(false);
    }
  });
}
