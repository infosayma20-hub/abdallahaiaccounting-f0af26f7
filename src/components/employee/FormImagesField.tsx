import { useRef, useState } from "react";
import { Upload, X, Loader2, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  MAX_FORM_IMAGES,
  removeFormAttachment,
  uploadFormAttachments,
} from "@/lib/hr/formImageUpload";

interface Props {
  label: string;
  hint?: string;
  required?: boolean;
  /** صور هذا النموذج تُحذف تلقائياً بعد 3 شهور (نماذج التشييك اليومية). */
  ephemeral?: boolean;
  accept?: string;
  urls: string[];
  paths: string[];
  onChange: (next: { urls: string[]; paths: string[] }) => void;
}

export default function FormImagesField({
  label,
  hint,
  required,
  ephemeral,
  accept = "image/*,.pdf",
  urls,
  paths,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;

    const room = MAX_FORM_IMAGES - urls.length;
    if (room <= 0) {
      toast({ title: `الحد الأقصى ${MAX_FORM_IMAGES} صور`, variant: "destructive" });
      return;
    }
    const batch = picked.slice(0, room);
    if (picked.length > room) {
      toast({ title: `تم قبول ${room} صور فقط`, description: `الحد الأقصى ${MAX_FORM_IMAGES} صور للنموذج.` });
    }

    setBusy(true);
    const { attachments, errors } = await uploadFormAttachments(batch, { ephemeral });
    setBusy(false);

    if (attachments.length) {
      onChange({
        urls: [...urls, ...attachments.map((a) => a.url)],
        paths: [...paths, ...attachments.map((a) => a.path)],
      });
      toast({ title: `تم رفع ${attachments.length} ملف ✅` });
    }
    if (errors.length) {
      toast({ title: "تعذر رفع بعض الملفات", description: errors.join(" • "), variant: "destructive" });
    }
  };

  const handleRemove = async (idx: number) => {
    const path = paths[idx];
    if (path) await removeFormAttachment(path);
    onChange({
      urls: urls.filter((_, i) => i !== idx),
      paths: paths.filter((_, i) => i !== idx),
    });
  };

  const isPdf = (u: string) => /\.pdf(\?|$)/i.test(u);

  return (
    <div>
      <label className="text-xs text-muted-foreground mb-1 block">
        {label}{required ? " *" : ""}
      </label>
      {hint && <p className="text-[10px] text-muted-foreground mb-1">{hint}</p>}

      {urls.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {urls.map((u, i) => (
            <div key={`${u}-${i}`} className="relative rounded-xl overflow-hidden border border-border bg-muted/30">
              {isPdf(u) ? (
                <div className="h-20 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-muted-foreground" />
                </div>
              ) : (
                <img src={u} alt={`مرفق ${i + 1}`} className="h-20 w-full object-cover" loading="lazy" />
              )}
              <button
                type="button"
                onClick={() => handleRemove(i)}
                className="absolute top-1 left-1 h-6 w-6 rounded-full bg-destructive/85 text-destructive-foreground flex items-center justify-center"
                aria-label="حذف المرفق"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {urls.length < MAX_FORM_IMAGES && (
        <label className="border-2 border-dashed border-border rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors">
          {busy ? <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
          <span className="text-xs text-primary">
            {busy ? "جاري رفع الصور..." : "اختر صورة أو أكثر أو اسحبها هنا"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            حتى {MAX_FORM_IMAGES} صور • يتم ضغط الصور تلقائياً
            {ephemeral ? " • تُحذف الصور بعد 3 شهور" : ""}
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept={accept}
            disabled={busy}
            onChange={handleSelect}
          />
        </label>
      )}

      {urls.length > 0 && (
        <p className="text-[10px] text-muted-foreground mt-1">{urls.length} / {MAX_FORM_IMAGES} مرفقات</p>
      )}
    </div>
  );
}
