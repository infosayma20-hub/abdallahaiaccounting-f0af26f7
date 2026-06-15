import { supabase } from "@/integrations/supabase/client";

/**
 * Returns a fresh signed URL for a stored employee form PDF.
 * Falls back to the existing `pdf_url` if no storage path is recorded.
 * Refreshes the URL on the row when re-signing succeeds.
 */
export async function getFreshFormPdfUrl(
  formId: string,
  pdfUrl: string | null,
  storagePath: string | null,
  ttlSeconds = 60 * 60 * 24 * 7
): Promise<string | null> {
  if (!storagePath) return pdfUrl;
  const { data, error } = await supabase.storage
    .from("employee-form-exports")
    .createSignedUrl(storagePath, ttlSeconds);
  if (error || !data?.signedUrl) return pdfUrl;
  // Best-effort persist (ignore failures – RLS may block non-owners)
  supabase
    .from("employee_forms")
    .update({ pdf_url: data.signedUrl })
    .eq("id", formId)
    .then(() => {}, () => {});
  return data.signedUrl;
}