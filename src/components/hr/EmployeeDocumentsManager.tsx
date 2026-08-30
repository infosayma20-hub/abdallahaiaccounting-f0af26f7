import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Camera, FileText, Loader2, Trash2, Upload, Eye, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  ALL_DOC_TYPES,
  DOC_TYPE_LABELS,
  EmployeeDocType,
  EmployeeDocument,
  REQUIRED_DOC_TYPES,
  deleteEmployeeDocument,
  fetchEmployeeDocuments,
  getEmployeeDocumentUrl,
  openEmployeeDocument,
  uploadEmployeeDocument,
} from "@/lib/hr/employeeDocuments";

interface Props {
  employeeId: string;
  ownerId: string;
  companyId?: string | null;
  /** employee = شاشة الموظف نفسه، hr = بوابة الموارد البشرية */
  mode: "employee" | "hr";
  /** أنواع الوثائق المعروضة (افتراضياً: الهوية وملحقها في وضع الموظف، والكل في وضع HR) */
  docTypes?: EmployeeDocType[];
  compact?: boolean;
}

const isImage = (mime?: string | null, path?: string) =>
  (mime || "").startsWith("image/") || /\.(png|jpe?g|webp|gif|heic)$/i.test(path || "");

function DocSlot({
  docType,
  doc,
  mode,
  uploading,
  onPick,
  onDelete,
}: {
  docType: EmployeeDocType;
  doc?: EmployeeDocument;
  mode: "employee" | "hr";
  uploading: boolean;
  onPick: (docType: EmployeeDocType, file: File) => void;
  onDelete: (doc: EmployeeDocument) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const required = REQUIRED_DOC_TYPES.includes(docType);

  useEffect(() => {
    let alive = true;
    setPreview(null);
    if (doc && isImage(doc.mime_type, doc.file_path)) {
      getEmployeeDocumentUrl(doc.file_path)
        .then((u) => alive && setPreview(u))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [doc?.id, doc?.file_path]);

  const canDelete = doc && (mode === "hr" || doc.uploaded_by_role === "employee");

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate">{DOC_TYPE_LABELS[docType]}</span>
          {required && !doc && (
            <Badge variant="destructive" className="text-[10px]">مطلوب</Badge>
          )}
          {doc && (
            <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> تم الرفع
            </Badge>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => (doc ? openEmployeeDocument(doc.file_path).catch((e) => toast.error(e.message)) : inputRef.current?.click())}
        className="w-full aspect-[16/10] rounded-lg border border-dashed border-border bg-muted/40 overflow-hidden flex items-center justify-center relative"
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : preview ? (
          <img src={preview} alt={DOC_TYPE_LABELS[docType]} className="w-full h-full object-cover" />
        ) : doc ? (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <FileText className="h-7 w-7" />
            <span className="text-[11px]">اضغط للعرض</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <Camera className="h-7 w-7" />
            <span className="text-[11px]">اضغط للتصوير أو الرفع</span>
          </div>
        )}
      </button>

      {doc && (
        <p className="text-[10px] text-muted-foreground">
          رفعها: {doc.uploaded_by_role === "employee" ? "الموظف" : "الموارد البشرية"} ·{" "}
          {new Date(doc.created_at).toLocaleDateString("ar-EG-u-ca-gregory")}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 h-10 gap-1.5"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          {doc ? "استبدال" : "رفع"}
        </Button>
        {doc && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 w-10 p-0"
            onClick={() => openEmployeeDocument(doc.file_path).catch((e) => toast.error(e.message))}
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
        )}
        {canDelete && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 w-10 p-0 text-destructive hover:bg-destructive/10"
            onClick={() => onDelete(doc!)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        capture={mode === "employee" ? "environment" : undefined}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onPick(docType, f);
        }}
      />
    </Card>
  );
}

export default function EmployeeDocumentsManager({
  employeeId,
  ownerId,
  companyId,
  mode,
  docTypes,
  compact,
}: Props) {
  const qc = useQueryClient();
  const [uploadingType, setUploadingType] = useState<EmployeeDocType | null>(null);

  const types = docTypes ?? (mode === "employee" ? REQUIRED_DOC_TYPES : ALL_DOC_TYPES);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["employee-documents", employeeId],
    queryFn: () => fetchEmployeeDocuments(employeeId),
    enabled: !!employeeId,
    staleTime: 15_000,
  });

  const byType = useMemo(() => {
    const map = new Map<EmployeeDocType, EmployeeDocument>();
    (docs || []).forEach((d) => {
      if (!map.has(d.doc_type)) map.set(d.doc_type, d);
    });
    return map;
  }, [docs]);

  const missingRequired = REQUIRED_DOC_TYPES.filter((t) => !byType.has(t));

  const handleUpload = async (docType: EmployeeDocType, file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      toast.error("حجم الملف كبير (الحد الأقصى 15 ميجابايت)");
      return;
    }
    setUploadingType(docType);
    try {
      await uploadEmployeeDocument({
        employeeId,
        ownerId,
        companyId,
        docType,
        file,
        uploadedByRole: mode === "employee" ? "employee" : "hr",
        replaceExisting: true,
      });
      toast.success(`تم رفع ${DOC_TYPE_LABELS[docType]}`);
      qc.invalidateQueries({ queryKey: ["employee-documents", employeeId] });
    } catch (e: any) {
      toast.error(e?.message || "فشل رفع الملف");
    } finally {
      setUploadingType(null);
    }
  };

  const handleDelete = async (doc: EmployeeDocument) => {
    try {
      await deleteEmployeeDocument(doc);
      toast.success("تم الحذف");
      qc.invalidateQueries({ queryKey: ["employee-documents", employeeId] });
    } catch (e: any) {
      toast.error(e?.message || "تعذر الحذف");
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {types.slice(0, 4).map((t) => (
          <Skeleton key={t} className="h-52 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      {missingRequired.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200 leading-relaxed">
            مطلوب رفع: {missingRequired.map((t) => DOC_TYPE_LABELS[t]).join(" و")}.
            <br />
            ملاحظة مهمة: يجب تصوير <strong>ملحق الهوية</strong> أيضاً وليس بطاقة الهوية فقط.
          </p>
        </div>
      )}

      <div className={compact ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"}>
        {types.map((t) => (
          <DocSlot
            key={t}
            docType={t}
            doc={byType.get(t)}
            mode={mode}
            uploading={uploadingType === t}
            onPick={handleUpload}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
