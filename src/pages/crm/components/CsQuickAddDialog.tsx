import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { csInsert } from "../hooks/useCsData";
import ContactPicker from "./ContactPicker";

export type CsQuickKind = "note" | "call" | "ticket" | "meeting";

export default function CsQuickAddDialog({
  kind, contactId: fixedContactId, userId, onClose, onSaved,
}: {
  kind: CsQuickKind;
  /** If provided, locks the dialog to this contact. Otherwise the user picks one. */
  contactId?: string;
  userId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [contactId, setContactId] = useState<string | null>(fixedContactId ?? null);
  const [saving, setSaving] = useState(false);

  const titles: Record<CsQuickKind, string> = {
    note: "ملاحظة جديدة",
    call: "تسجيل مكالمة",
    ticket: "تذكرة دعم جديدة",
    meeting: "اجتماع جديد",
  };

  const save = async () => {
    if (!userId || saving) return;
    // note/meeting require contact_id (NOT NULL); ticket/call allow null
    if ((kind === "note" || kind === "meeting") && !contactId) return;
    setSaving(true);
    let table = "";
    let payload: any = { contact_id: contactId };
    if (kind === "note") {
      if (!title.trim()) { setSaving(false); return; }
      table = "cs_notes";
      payload = { ...payload, title, body, note_type: "general", tags: [] };
    } else if (kind === "call") {
      table = "cs_calls";
      payload = {
        ...payload, direction: "outbound", duration_sec: 0,
        purpose: title, summary: body, outcome: "follow_up",
        called_at: new Date().toISOString(),
      };
    } else if (kind === "ticket") {
      if (!title.trim()) { setSaving(false); return; }
      table = "cs_support_tickets";
      payload = { ...payload, title, description: body, category: "other", priority, status: "new" };
    } else {
      table = "cs_meetings";
      payload = {
        ...payload, meeting_date: new Date().toISOString(),
        purpose: title, summary: body, status: "scheduled", attendees: [],
      };
    }
    const ok = await csInsert(table, payload, userId);
    setSaving(false);
    if (ok) onSaved();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader><DialogTitle>{titles[kind]}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {!fixedContactId && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                العميل {(kind === "note" || kind === "meeting") && <span className="text-red-600">*</span>}
              </label>
              <ContactPicker
                value={contactId}
                onChange={setContactId}
                allowEmpty={kind === "call" || kind === "ticket"}
              />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {kind === "call" ? "الغرض" : "العنوان"}
            </label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-[12px]" />
          </div>
          {kind === "ticket" && (
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">الأولوية</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as any)}
                className="w-full h-9 px-2 rounded-md border border-slate-200 text-[12px] bg-white">
                <option value="low">منخفضة</option>
                <option value="medium">عادية</option>
                <option value="high">عالية</option>
                <option value="critical">حرجة</option>
              </select>
            </div>
          )}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              {kind === "note" ? "النص" : kind === "ticket" ? "الوصف" : "ملخص"}
            </label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} className="text-[12px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? "جارٍ..." : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}