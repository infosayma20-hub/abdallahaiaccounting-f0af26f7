import { supabase } from "@/integrations/supabase/client";

export const EMPLOYEE_DOCS_BUCKET = "employee-documents";

export type EmployeeDocType =
  | "id_card_front"
  | "id_card_appendix"
  | "photo"
  | "contract"
  | "cv"
  | "qualification"
  | "passport"
  | "other";

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  owner_id: string;
  company_id: string | null;
  doc_type: EmployeeDocType;
  title: string | null;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_by_role: "employee" | "hr";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const DOC_TYPE_LABELS: Record<EmployeeDocType, string> = {
  id_card_front: "صورة الهوية",
  id_card_appendix: "ملحق الهوية",
  photo: "صورة شخصية",
  contract: "عقد العمل",
  cv: "السيرة الذاتية",
  qualification: "المؤهل العلمي",
  passport: "جواز السفر",
  other: "مستند آخر",
};

/** الوثائق المطلوبة إلزامياً من كل موظف */
export const REQUIRED_DOC_TYPES: EmployeeDocType[] = ["id_card_front", "id_card_appendix"];

export const ALL_DOC_TYPES: EmployeeDocType[] = [
  "id_card_front",
  "id_card_appendix",
  "photo",
  "contract",
  "cv",
  "qualification",
  "passport",
  "other",
];

export async function fetchEmployeeDocuments(employeeId: string): Promise<EmployeeDocument[]> {
  const { data, error } = await supabase
    .from("employee_documents")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as EmployeeDocument[];
}

function extOf(file: File) {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : null;
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  if (file.type.includes("pdf")) return "pdf";
  if (file.type.includes("png")) return "png";
  return "jpg";
}

export interface UploadArgs {
  employeeId: string;
  ownerId: string;
  companyId?: string | null;
  docType: EmployeeDocType;
  file: File;
  uploadedByRole: "employee" | "hr";
  title?: string | null;
  notes?: string | null;
  /** استبدال الوثيقة السابقة من نفس النوع */
  replaceExisting?: boolean;
}

export async function uploadEmployeeDocument(args: UploadArgs): Promise<EmployeeDocument> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("يجب تسجيل الدخول");

  const path = `${args.employeeId}/${args.docType}-${Date.now()}.${extOf(args.file)}`;

  const { error: upErr } = await supabase.storage
    .from(EMPLOYEE_DOCS_BUCKET)
    .upload(path, args.file, { upsert: false, contentType: args.file.type || undefined });
  if (upErr) throw upErr;

  if (args.replaceExisting && args.docType !== "other") {
    const existing = await supabase
      .from("employee_documents")
      .select("id, file_path")
      .eq("employee_id", args.employeeId)
      .eq("doc_type", args.docType);
    const rows = existing.data || [];
    if (rows.length) {
      await supabase.storage.from(EMPLOYEE_DOCS_BUCKET).remove(rows.map((r: any) => r.file_path));
      await supabase.from("employee_documents").delete().in("id", rows.map((r: any) => r.id));
    }
  }

  const { data, error } = await supabase
    .from("employee_documents")
    .insert({
      employee_id: args.employeeId,
      owner_id: args.ownerId,
      company_id: args.companyId ?? null,
      doc_type: args.docType,
      title: args.title ?? DOC_TYPE_LABELS[args.docType],
      file_path: path,
      mime_type: args.file.type || null,
      file_size: args.file.size,
      uploaded_by: uid,
      uploaded_by_role: args.uploadedByRole,
      notes: args.notes ?? null,
    })
    .select("*")
    .single();

  if (error) {
    // تنظيف الملف إذا فشل حفظ السجل
    await supabase.storage.from(EMPLOYEE_DOCS_BUCKET).remove([path]);
    throw error;
  }
  return data as EmployeeDocument;
}

export async function deleteEmployeeDocument(doc: EmployeeDocument) {
  const { error } = await supabase.from("employee_documents").delete().eq("id", doc.id);
  if (error) throw error;
  await supabase.storage.from(EMPLOYEE_DOCS_BUCKET).remove([doc.file_path]);
}

export async function getEmployeeDocumentUrl(filePath: string, expiresIn = 600) {
  const { data, error } = await supabase.storage
    .from(EMPLOYEE_DOCS_BUCKET)
    .createSignedUrl(filePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function openEmployeeDocument(filePath: string) {
  const win = window.open("about:blank", "_blank");
  try {
    const url = await getEmployeeDocumentUrl(filePath);
    if (win) {
      win.opener = null;
      win.location.href = url;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } catch (e) {
    win?.close();
    throw e;
  }
}
