import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileUp, Loader2, Plus, Edit2, Trash2, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useIsoDocuments, IsoDocument } from "@/hooks/hr/useIsoDocuments";
import { ISO_DOC_TYPES, ISO_DOC_TYPE_LABEL } from "@/lib/hr/isoManuals";

type Draft = Partial<IsoDocument> & { id?: string };

export default function IsoDocumentsPanel({ manualCode }: { manualCode: string }) {
  const { documents, ackCounts, loading, uploadFile, openFile, saveDocument, deleteDocument } =
    useIsoDocuments(manualCode);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const nextCode = useMemo(() => {
    const nums = documents
      .map((d) => Number((d.code.split("-")[1] || "").replace(/\D/g, "")))
      .filter((n) => Number.isFinite(n) && n > 0);
    const next = (nums.length ? Math.max(...nums) : 0) + 1;
    return `${manualCode}-${String(next).padStart(2, "0")}`;
  }, [documents, manualCode]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const { path, mime } = await uploadFile(file);
      setDraft((d) => ({ ...(d || {}), file_path: path, file_mime: mime, name: d?.name || file.name.replace(/\.[^.]+$/, "") }));
      toast({ title: "تم رفع الملف" });
    } catch (err: any) {
      toast({ title: "تعذر رفع الملف", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!draft?.code?.trim() || !draft?.name?.trim()) {
      toast({ title: "الرمز والاسم مطلوبان", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveDocument({ ...draft, manual_code: manualCode });
      toast({ title: "تم الحفظ" });
      setDraft(null);
    } catch (err: any) {
      toast({ title: "تعذر الحفظ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-3 py-2 border-b bg-muted/20 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <p className="text-sm font-semibold">الإجراءات وتعليمات العمل — {manualCode}</p>
            <p className="text-[11px] text-muted-foreground">
              وثائق للقراءة فقط (PDF/Word) مع تتبّع إقرار الاطّلاع من الموظفين.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() =>
              setDraft({ code: nextCode, name: "", doc_type: "procedure", version: "1", requires_ack: true, is_active: true })
            }
          >
            <Plus className="h-4 w-4 ml-1" /> وثيقة جديدة
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : documents.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            لا توجد وثائق في هذا المجلد بعد.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="text-right p-3 font-medium">الرمز</th>
                  <th className="text-right p-3 font-medium">الاسم</th>
                  <th className="text-center p-3 font-medium">النوع</th>
                  <th className="text-center p-3 font-medium">الإصدار</th>
                  <th className="text-center p-3 font-medium">إقرارات</th>
                  <th className="text-center p-3 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {documents.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/20">
                    <td className="p-3 font-mono text-xs">{d.code}</td>
                    <td className="p-3">
                      <span className="font-medium">{d.name}</span>
                      {d.responsible_label && (
                        <span className="block text-[11px] text-muted-foreground">المسؤول: {d.responsible_label}</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="secondary" className="text-[10px] h-5">{ISO_DOC_TYPE_LABEL(d.doc_type)}</Badge>
                    </td>
                    <td className="p-3 text-center tabular-nums text-xs">{d.version}</td>
                    <td className="p-3 text-center text-xs tabular-nums">
                      {d.requires_ack ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          {ackCounts[d.id] || 0}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      {d.file_path && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="فتح الملف"
                          onClick={() => openFile(d.file_path!).catch((e) => toast({ title: "تعذر الفتح", description: e.message, variant: "destructive" }))}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="تعديل" onClick={() => setDraft({ ...d })}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="حذف"
                        onClick={() => deleteDocument(d.id).then(() => toast({ title: "تم الحذف" }))
                          .catch((e) => toast({ title: "تعذر الحذف", description: e.message, variant: "destructive" }))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!draft} onOpenChange={(o) => { if (!o) setDraft(null); }}>
        <DialogContent className="max-w-xl w-[95vw]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{draft?.id ? "تعديل وثيقة" : "وثيقة جديدة"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">الرمز *</Label>
                <Input value={draft.code || ""} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">النوع</Label>
                <Select value={draft.doc_type || "procedure"} onValueChange={(v) => setDraft({ ...draft, doc_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ISO_DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">الاسم *</Label>
                <Input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">الوصف</Label>
                <Textarea rows={2} value={draft.description || ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">الإصدار</Label>
                <Input value={draft.version || "1"} onChange={(e) => setDraft({ ...draft, version: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">تاريخ السريان</Label>
                <Input type="date" value={draft.effective_date || ""} onChange={(e) => setDraft({ ...draft, effective_date: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">مدة الحفظ</Label>
                <Input value={draft.retention || ""} onChange={(e) => setDraft({ ...draft, retention: e.target.value })} placeholder="3 سنوات" />
              </div>
              <div>
                <Label className="text-xs">المسؤول</Label>
                <Input value={draft.responsible_label || ""} onChange={(e) => setDraft({ ...draft, responsible_label: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">المناصب المستهدفة (افصل بفاصلة)</Label>
                <Input
                  value={(draft.target_job_title_names || []).join(", ")}
                  onChange={(e) => setDraft({ ...draft, target_job_title_names: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                  placeholder="مدير الفرع, شيف"
                />
              </div>
              <div className="md:col-span-2 flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <Switch checked={draft.requires_ack ?? true} onCheckedChange={(c) => setDraft({ ...draft, requires_ack: c })} />
                  <Label className="text-xs">يتطلب إقرار اطّلاع</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={draft.is_active ?? true} onCheckedChange={(c) => setDraft({ ...draft, is_active: c })} />
                  <Label className="text-xs">نشط</Label>
                </div>
              </div>
              <div className="md:col-span-2 rounded-lg border p-3 space-y-2">
                <Label className="text-xs flex items-center gap-2"><FileUp className="h-3.5 w-3.5" /> ملف الوثيقة (PDF / Word)</Label>
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                />
                {uploading && <p className="text-[11px] text-muted-foreground">جاري الرفع…</p>}
                {draft.file_path && <p className="text-[11px] text-emerald-600">تم إرفاق ملف ✓</p>}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDraft(null)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 ml-1 animate-spin" />} حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}