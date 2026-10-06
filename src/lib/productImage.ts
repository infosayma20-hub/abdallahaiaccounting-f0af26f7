import { supabase } from "@/integrations/supabase/client";

/** يصغّر صورة الكاميرا إلى ≤640px وجودة مضغوطة (عادةً 30–80KB) قبل الرفع. */
export async function compressProductImage(file: File, maxSide = 640): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => null);
  let w: number, h: number, src: CanvasImageSource;
  if (bmp) { w = bmp.width; h = bmp.height; src = bmp; }
  else {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    w = img.naturalWidth; h = img.naturalHeight; src = img;
  }
  const s = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * s); canvas.height = Math.round(h * s);
  canvas.getContext("2d")!.drawImage(src, 0, 0, canvas.width, canvas.height);
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  let blob = await toBlob("image/webp", 0.72);
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg", 0.72);
  if (!blob) throw new Error("تعذّر تجهيز الصورة");
  if (blob.size > 250_000) blob = (await toBlob(blob.type, 0.5)) ?? blob;
  return blob;
}

/** يرفع صورة الصنف إلى مجلد المستخدم الحالي ويعيد الرابط العام. */
export async function uploadProductImage(blob: Blob): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("انتهت الجلسة");
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${u.user.id}/products/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("company-assets").upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
  if (error) throw error;
  return supabase.storage.from("company-assets").getPublicUrl(path).data.publicUrl;
}
