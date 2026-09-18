import { supabase } from "@/integrations/supabase/client";

/**
 * رفع مرفقات النماذج (صور متعددة) مع ضغط الصور قبل الرفع.
 *
 * - الصور تُصغَّر إلى 1600px كحد أقصى وتُحوَّل إلى JPEG بجودة 0.72
 *   (يوفّر عادةً 70–90% من الحجم مقابل صورة الجوال الأصلية).
 * - الملفات المؤقتة (نماذج التشييك اليومية) تُرفع تحت المجلد `<uid>/t90/`
 *   ليتم حذفها تلقائياً بعد 3 شهور. باقي النماذج تبقى كما هي (بدون حذف).
 */

export const FORM_ATTACH_BUCKET = "employee-forms";
export const EPHEMERAL_FOLDER = "t90";
export const MAX_FORM_IMAGES = 5;

const MAX_BYTES = 5 * 1024 * 1024; // 5MB بعد الضغط
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.72;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export type FormAttachment = {
  path: string;
  url: string;
  name: string;
  size: number;
};

function randomId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** ضغط الصورة داخل المتصفح. يعيد الملف الأصلي إذا تعذّر الضغط أو لم يكن صورة. */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) return file;
    // لا نستبدل الملف إذا كان الضغط أكبر من الأصل (صور صغيرة أصلاً)
    if (blob.size >= file.size && file.size <= MAX_BYTES) return file;

    const base = (file.name.replace(/\.[^.]+$/, "") || "image").slice(0, 40);
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export type UploadResult = {
  attachments: FormAttachment[];
  errors: string[];
};

/** يرفع مجموعة ملفات ويعيد مساراتها وروابطها الموقّعة. */
export async function uploadFormAttachments(
  files: File[],
  opts: { ephemeral?: boolean } = {},
): Promise<UploadResult> {
  const attachments: FormAttachment[] = [];
  const errors: string[] = [];

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  const uid = authData?.user?.id;
  if (authErr || !uid) {
    return { attachments, errors: ["تعذر التحقق من جلسة المستخدم، يرجى تسجيل الدخول من جديد"] };
  }

  for (const original of files) {
    const mime = (original.type || "").toLowerCase();
    if (mime && !ALLOWED_MIME.has(mime)) {
      errors.push(`${original.name}: نوع الملف غير مسموح (صور أو PDF فقط)`);
      continue;
    }

    const file = await compressImage(original);
    if (file.size > MAX_BYTES) {
      errors.push(`${original.name}: الحجم أكبر من 5MB بعد الضغط`);
      continue;
    }

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const folder = opts.ephemeral ? `${uid}/${EPHEMERAL_FOLDER}` : uid;
    const path = `${folder}/${Date.now()}-${randomId()}.${ext || "jpg"}`;

    const { error: upErr } = await supabase.storage
      .from(FORM_ATTACH_BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (upErr) {
      errors.push(`${original.name}: ${upErr.message}`);
      continue;
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(FORM_ATTACH_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (signErr || !signed?.signedUrl) {
      errors.push(`${original.name}: تم الرفع لكن تعذر إنشاء رابط العرض`);
      continue;
    }

    attachments.push({ path, url: signed.signedUrl, name: original.name, size: file.size });
  }

  return { attachments, errors };
}

export async function removeFormAttachment(path: string) {
  try {
    await supabase.storage.from(FORM_ATTACH_BUCKET).remove([path]);
  } catch {
    /* المرفق سيُنظَّف لاحقاً تلقائياً */
  }
}
