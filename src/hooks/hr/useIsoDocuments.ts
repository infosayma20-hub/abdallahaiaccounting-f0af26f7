import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

export type IsoDocument = {
  id: string;
  user_id: string;
  manual_code: string;
  code: string;
  name: string;
  doc_type: string;
  description: string | null;
  file_path: string | null;
  file_mime: string | null;
  version: string;
  effective_date: string | null;
  retention: string | null;
  responsible_label: string | null;
  requires_ack: boolean;
  target_job_title_names: string[];
  sort_order: number;
  is_active: boolean;
};

export function useIsoDocuments(manualCode?: string | null) {
  const { dataOwnerId } = useDataOwnerId();
  const [documents, setDocuments] = useState<IsoDocument[]>([]);
  const [ackCounts, setAckCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    try {
      let q = supabase
        .from("iso_documents")
        .select("*")
        .eq("user_id", dataOwnerId)
        .eq("is_deleted", false)
        .order("code");
      if (manualCode) q = q.eq("manual_code", manualCode);
      const { data } = await q;
      const rows = (data || []) as IsoDocument[];
      setDocuments(rows);

      if (rows.length) {
        const { data: acks } = await supabase
          .from("iso_document_acknowledgements")
          .select("document_id")
          .in("document_id", rows.map((r) => r.id));
        const counts: Record<string, number> = {};
        (acks || []).forEach((a: any) => {
          counts[a.document_id] = (counts[a.document_id] || 0) + 1;
        });
        setAckCounts(counts);
      } else {
        setAckCounts({});
      }
    } finally {
      setLoading(false);
    }
  }, [dataOwnerId, manualCode]);

  useEffect(() => { load(); }, [load]);

  const uploadFile = async (file: File) => {
    if (!dataOwnerId) throw new Error("لا يوجد سياق شركة");
    const ext = file.name.split(".").pop() || "bin";
    const path = `${dataOwnerId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("iso-documents").upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) throw error;
    return { path, mime: file.type || null };
  };

  const openFile = async (path: string) => {
    const { data, error } = await supabase.storage
      .from("iso-documents")
      .createSignedUrl(path, 60 * 10);
    if (error) throw error;
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const saveDocument = async (doc: Partial<IsoDocument> & { id?: string }) => {
    if (!dataOwnerId) throw new Error("لا يوجد سياق شركة");
    const payload = {
      user_id: dataOwnerId,
      manual_code: doc.manual_code!,
      code: (doc.code || "").trim(),
      name: (doc.name || "").trim(),
      doc_type: doc.doc_type || "procedure",
      description: doc.description ?? null,
      file_path: doc.file_path ?? null,
      file_mime: doc.file_mime ?? null,
      version: doc.version || "1",
      effective_date: doc.effective_date || null,
      retention: doc.retention ?? null,
      responsible_label: doc.responsible_label ?? null,
      requires_ack: doc.requires_ack ?? true,
      target_job_title_names: doc.target_job_title_names || [],
      is_active: doc.is_active ?? true,
    };
    if (doc.id) {
      const { error } = await supabase.from("iso_documents").update(payload).eq("id", doc.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("iso_documents").insert(payload);
      if (error) throw error;
    }
    await load();
  };

  const deleteDocument = async (id: string) => {
    const { error } = await supabase.from("iso_documents").update({ is_deleted: true }).eq("id", id);
    if (error) throw error;
    await load();
  };

  return { documents, ackCounts, loading, reload: load, uploadFile, openFile, saveDocument, deleteDocument };
}