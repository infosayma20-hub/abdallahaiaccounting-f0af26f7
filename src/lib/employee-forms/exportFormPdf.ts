import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "@/integrations/supabase/client";

/**
 * A4 portrait width @ 96dpi ≈ 794px. We render the printable element inside a
 * FIXED-WIDTH off-screen clone so the captured canvas is identical on any
 * device — independent of the mobile viewport. This eliminates the RTL
 * "cropped from the right side" bug on Arabic content viewed on phones.
 */
const A4_WIDTH_PX = 794;

async function renderClonedToCanvas(source: HTMLElement): Promise<HTMLCanvasElement> {
  const host = document.createElement("div");
  host.setAttribute("dir", "rtl");
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.left = "-100000px"; // off-screen but laid out
  host.style.width = `${A4_WIDTH_PX}px`;
  host.style.background = "#ffffff";
  host.style.zIndex = "-1";
  host.style.pointerEvents = "none";

  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.width = `${A4_WIDTH_PX}px`;
  clone.style.maxWidth = `${A4_WIDTH_PX}px`;
  clone.style.boxSizing = "border-box";
  clone.style.margin = "0";
  clone.style.padding = clone.style.padding || "16px";
  clone.style.background = "#ffffff";
  clone.style.color = "#111827";
  clone.style.direction = "rtl";

  host.appendChild(clone);
  document.body.appendChild(host);

  // Give the browser a tick to lay out the cloned tree (fonts, images).
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await (document as any).fonts?.ready?.catch?.(() => undefined);

  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      foreignObjectRendering: true,
      width: A4_WIDTH_PX,
      windowWidth: A4_WIDTH_PX,
      windowHeight: Math.max(clone.scrollHeight, 1123), // ≥ A4 height
    });
    return canvas;
  } finally {
    host.remove();
  }
}

/**
 * Renders a DOM element to a multi-page A4 PDF, uploads it to
 * `employee-form-exports/{companyId}/{formId}/{ts}.pdf`, updates the
 * `employee_forms.pdf_url` field, and returns a signed URL.
 */
export async function exportEmployeeFormPdf(opts: {
  element: HTMLElement;
  formId: string;
  companyId: string;
  fileName?: string;
}): Promise<{ blob: Blob; storagePath: string; signedUrl: string }> {
  const { element, formId, companyId } = opts;

  // Render via an off-screen A4-width clone so the output is identical on
  // mobile and desktop, with no RTL overflow / cropping.
  const canvas = await renderClonedToCanvas(element);

  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const imgWidth = pageWidth - margin * 2;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let position = margin;
  let heightLeft = imgHeight;
  pdf.addImage(imgData, "JPEG", margin, position, imgWidth, imgHeight, undefined, "FAST");
  heightLeft -= pageHeight - margin * 2;

  while (heightLeft > 0) {
    position -= pageHeight - margin * 2;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", margin, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight - margin * 2;
  }

  const blob = pdf.output("blob");
  const ts = Date.now();
  const fileName = (opts.fileName || `form-${formId}`).replace(/[^a-zA-Z0-9-_]/g, "_");
  const storagePath = `${companyId}/${formId}/${ts}-${fileName}.pdf`;

  const { error: uploadErr } = await supabase.storage
    .from("employee-form-exports")
    .upload(storagePath, blob, { contentType: "application/pdf", upsert: true });
  if (uploadErr) throw uploadErr;

  const { data: signed, error: signedErr } = await supabase.storage
    .from("employee-form-exports")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7); // 7 days
  if (signedErr) throw signedErr;

  // Persist on the form row (uses RLS; safe if user can update)
  const { error: updateErr } = await supabase
    .from("employee_forms")
    .update({ pdf_url: signed.signedUrl, pdf_storage_path: storagePath })
    .eq("id", formId);
  if (updateErr) throw updateErr;

  return { blob, storagePath, signedUrl: signed.signedUrl };
}

/**
 * Trigger a local download of an existing PDF blob.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}