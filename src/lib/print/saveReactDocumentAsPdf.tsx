import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

/**
 * Save an inline-styled React document as an A4 PDF.
 * Arabic is rendered by the browser itself (SVG foreignObject via html-to-image),
 * then embedded as an image — so letters stay connected and RTL is correct.
 */
export async function saveReactDocumentAsPdf(node: ReactNode, fileName: string): Promise<void> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import("html-to-image"), import("jspdf")]);

  const host = document.createElement("div");
  host.setAttribute("dir", "rtl");
  host.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;background:#fff;color:#172033;font-family:Cairo,system-ui,sans-serif;letter-spacing:normal;padding:24px;";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<>{node}</>));
    await document.fonts?.ready;
    await Promise.all(
      Array.from(host.querySelectorAll("img")).map((img) =>
        img.complete ? Promise.resolve() : new Promise<void>((r) => { img.onload = img.onerror = () => r(); }),
      ),
    );
    await new Promise((r) => setTimeout(r, 300));

    const canvas = await toCanvas(host, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210, pageH = 297, margin = 8;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2;
    const pxPerMm = canvas.width / contentW;
    const slicePx = Math.floor(contentH * pxPerMm);

    for (let y = 0, page = 0; y < canvas.height; y += slicePx, page++) {
      const h = Math.min(slicePx, canvas.height - y);
      const part = document.createElement("canvas");
      part.width = canvas.width;
      part.height = h;
      part.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (page > 0) pdf.addPage();
      pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, contentW, h / pxPerMm);
    }
    const safe = fileName.replace(/[\\/:*?"<>|]+/g, " ").trim() || "document";
    pdf.save(`${safe}.pdf`);
  } finally {
    root.unmount();
    host.remove();
  }
}
