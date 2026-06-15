import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "@/integrations/supabase/client";

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

  // Render the HTML element to canvas
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
  });

  const imgData = canvas.toDataURL("image/jpeg", 0.92);
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let position = 0;
  let heightLeft = imgHeight;
  pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position -= pageHeight;
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;
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
  await supabase
    .from("employee_forms")
    .update({ pdf_url: signed.signedUrl, pdf_storage_path: storagePath })
    .eq("id", formId);

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