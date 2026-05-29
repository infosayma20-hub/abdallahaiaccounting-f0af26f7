import { supabase } from "@/integrations/supabase/client";

const BUCKET_NAME = "employee-forms";

export const getEmployeeFormsStoragePath = (fileUrl?: string | null) => {
  if (!fileUrl) return null;

  const extractFromPathname = (pathname: string) => {
    const decodedPath = decodeURIComponent(pathname);
    const publicMarker = `/storage/v1/object/public/${BUCKET_NAME}/`;
    const signedMarker = `/storage/v1/object/sign/${BUCKET_NAME}/`;
    const marker = decodedPath.includes(publicMarker) ? publicMarker : signedMarker;
    const index = decodedPath.indexOf(marker);
    return index >= 0 ? decodedPath.slice(index + marker.length) : null;
  };

  try {
    const parsed = new URL(fileUrl);
    const path = extractFromPathname(parsed.pathname);
    if (path) return path.split("?")[0];
  } catch {
    const marker = `${BUCKET_NAME}/`;
    const index = fileUrl.indexOf(marker);
    if (index >= 0) {
      return decodeURIComponent(fileUrl.slice(index + marker.length).split("?")[0]);
    }
  }

  return null;
};

export const openEmployeeFormsStorageFile = async (
  fileUrl?: string | null,
  onError?: (message: string) => void,
) => {
  if (!fileUrl) {
    onError?.("رابط الملف غير موجود");
    return;
  }

  const previewWindow = window.open("", "_blank");
  if (previewWindow) {
    previewWindow.document.write("<p dir='rtl' style='font-family:sans-serif;padding:24px'>جاري فتح الملف...</p>");
  }

  const storagePath = getEmployeeFormsStoragePath(fileUrl);
  if (!storagePath) {
    if (previewWindow) previewWindow.location.href = fileUrl;
    else window.open(fileUrl, "_blank", "noopener,noreferrer");
    return;
  }

  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(storagePath);
  if (error || !data) {
    const message = error?.message || "تعذر تحميل الملف";
    onError?.(message);
    if (previewWindow) {
      previewWindow.document.body.innerHTML = `<p dir='rtl' style='font-family:sans-serif;padding:24px'>تعذر فتح الملف: ${message}</p>`;
    }
    return;
  }

  const blobUrl = URL.createObjectURL(data);
  if (previewWindow) previewWindow.location.href = blobUrl;
  else window.open(blobUrl, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
};