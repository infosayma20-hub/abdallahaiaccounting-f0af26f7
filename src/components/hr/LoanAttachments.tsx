import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Paperclip, Upload, Trash2, FileText, Image, X, Eye } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface LoanAttachmentsProps {
  loanId: string;
  userId: string;
}

export default function LoanAttachments({ loanId, userId }: LoanAttachmentsProps) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: attachments = [] } = useQuery({
    queryKey: ["loan-attachments", loanId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loan_attachments" as any)
        .select("*")
        .eq("loan_id", loanId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`الملف ${file.name} أكبر من 10MB`);
          continue;
        }

        const ext = file.name.split(".").pop();
        const path = `${userId}/${loanId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("loan-attachments")
          .upload(path, file);

        if (uploadError) {
          toast.error(`فشل رفع ${file.name}`);
          continue;
        }

        const { data: urlData } = supabase.storage.from("loan-attachments").getPublicUrl(path);

        await supabase.from("loan_attachments" as any).insert({
          loan_id: loanId,
          user_id: userId,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          file_size: file.size,
        } as any);
      }

      toast.success("تم رفع المرفقات بنجاح");
      queryClient.invalidateQueries({ queryKey: ["loan-attachments", loanId] });
    } catch {
      toast.error("حدث خطأ أثناء الرفع");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleDelete = async (att: any) => {
    try {
      // Extract path from URL
      const urlParts = att.file_url.split("/loan-attachments/");
      if (urlParts[1]) {
        await supabase.storage.from("loan-attachments").remove([decodeURIComponent(urlParts[1])]);
      }
      await supabase.from("loan_attachments" as any).delete().eq("id", att.id);
      queryClient.invalidateQueries({ queryKey: ["loan-attachments", loanId] });
      toast.success("تم حذف المرفق");
    } catch {
      toast.error("فشل حذف المرفق");
    }
  };

  const isImage = (type: string) => type?.startsWith("image/");

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-3 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5" />
          العقود والمعززات ({attachments.length})
        </h4>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
          disabled={uploading}
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "جاري الرفع..." : "رفع ملف"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx"
          className="hidden"
          onChange={handleUpload}
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {attachments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {attachments.map((att: any) => (
            <div
              key={att.id}
              className="group relative border border-border rounded-lg overflow-hidden bg-background hover:border-primary/30 transition-colors"
            >
              {isImage(att.file_type) ? (
                <div
                  className="h-24 bg-muted/30 cursor-pointer flex items-center justify-center overflow-hidden"
                  onClick={(e) => { e.stopPropagation(); setPreviewUrl(att.file_url); }}
                >
                  <img
                    src={att.file_url}
                    alt={att.file_name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <Eye className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ) : (
                <div
                  className="h-24 bg-muted/30 flex items-center justify-center cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); window.open(att.file_url, "_blank"); }}
                >
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="p-1.5">
                <p className="text-[10px] font-medium text-foreground truncate">{att.file_name}</p>
                <p className="text-[9px] text-muted-foreground">{formatSize(att.file_size || 0)}</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(att); }}
                className="absolute top-1 left-1 h-5 w-5 rounded-full bg-destructive/80 text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {attachments.length === 0 && (
        <div
          className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/30 transition-colors"
          onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
        >
          <Image className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
          <p className="text-[11px] text-muted-foreground">اضغط لرفع عقود أو صور للتوثيق</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">صور، PDF، مستندات (حد أقصى 10MB)</p>
        </div>
      )}

      {/* Image Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-3xl p-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute top-2 left-2 z-10 h-8 w-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
          >
            <X className="h-4 w-4" />
          </button>
          {previewUrl && (
            <img src={previewUrl} alt="Preview" className="w-full h-auto max-h-[80vh] object-contain rounded" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
