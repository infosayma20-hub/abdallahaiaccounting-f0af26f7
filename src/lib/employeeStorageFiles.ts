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

  const storagePath = getEmployeeFormsStoragePath(fileUrl);
  if (!storagePath) {
    window.open(fileUrl, "_blank", "noopener,noreferrer");
    return;
  }

  const previewWindow = window.open("about:blank", "_blank");

  // Prefer a signed URL (regular https) — blob: URLs get blocked by ad blockers like uBlock.
  const { data: signed, error: signedError } = await supabase
    .storage
    .from(BUCKET_NAME)
    .createSignedUrl(storagePath, 60 * 10);

  if (!signedError && signed?.signedUrl) {
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.location.href = signed.signedUrl;
    } else {
      window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
    }
    return;
  }

  previewWindow?.close();

  // Fallback: download the file and trigger a save (avoids blob: navigation blocks).
  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(storagePath);
  if (error || !data) {
    const message = error?.message || signedError?.message || "تعذر تحميل الملف";
    onError?.(message);
    return;
  }

  const blobUrl = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = storagePath.split("/").pop() || "file";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
};