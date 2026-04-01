import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTaskAuth } from "@/hooks/useTaskAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";

const PRIORITIES = [
  { value: "urgent_important", label: "مهم ومستعجل", color: "#E24B4A" },
  { value: "important", label: "مهم وغير مستعجل", color: "#378ADD" },
  { value: "urgent", label: "مستعجل وغير مهم", color: "#EF9F27" },
  { value: "normal", label: "عادي", color: "#888780" },
];

const CATEGORIES = ["كرستا ونواقص", "ضريبية", "محاسبية", "تدقيق", "إدارية", "ورشة", "أخرى"];

interface Props {
  open: boolean;
  onClose: () => void;
  taskUsers: any[];
  onSaved: () => void;
  editTask?: any;
}

export default function AddTaskModal({ open, onClose, taskUsers, onSaved, editTask }: Props) {
  const { user } = useAuth();
  const { taskUser } = useTaskAuth();
  const [title, setTitle] = useState(editTask?.title || "");
  const [description, setDescription] = useState(editTask?.description || "");
  const [priority, setPriority] = useState(editTask?.priority || "normal");
  const [category, setCategory] = useState(editTask?.category || "");
  const [dueDate, setDueDate] = useState(editTask?.due_date || "");
  const [dueTime, setDueTime] = useState(editTask?.due_time?.slice(0, 5) || "");
  const [assignTo, setAssignTo] = useState(editTask?.assigned_to || "none");
  const [visibleToAll, setVisibleToAll] = useState(editTask?.is_visible_to_all ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !user || !taskUser) return;
    setSaving(true);

    const payload: any = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      category: category || null,
      due_date: dueDate || null,
      due_time: dueTime ? dueTime + ":00" : null,
      is_visible_to_all: visibleToAll,
    };

    if (editTask) {
      await supabase.from("tasks").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editTask.id);
      await supabase.from("task_history").insert({ task_id: editTask.id, task_user_id: taskUser.id, action: "edited" });
      toast({ title: "تم تحديث المهمة" });
    } else {
      payload.user_id = user.id;
      payload.created_by = taskUser.id;
      if (assignTo && assignTo !== "none") {
        payload.assigned_to = assignTo;
        payload.assigned_at = new Date().toISOString();
        payload.status = "in_progress";
      }
      const { data } = await supabase.from("tasks").insert(payload).select("id").single();
      if (data) {
        await supabase.from("task_history").insert({ task_id: data.id, task_user_id: taskUser.id, action: "created" });
      }
      toast({ title: "تم إضافة المهمة بنجاح ✅" });
    }

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editTask ? "تعديل المهمة" : "مهمة جديدة"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>العنوان *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="عنوان المهمة" /></div>
          <div><Label>الوصف</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="تفاصيل المهمة..." rows={3} /></div>

          <div>
            <Label className="mb-2 block">الأولوية *</Label>
            <RadioGroup value={priority} onValueChange={setPriority} className="grid grid-cols-2 gap-2">
              {PRIORITIES.map(p => (
                <Label key={p.value} className="flex items-center gap-2 border rounded-lg p-2.5 cursor-pointer hover:bg-muted/50 transition-colors" style={{ borderColor: priority === p.value ? p.color : undefined }}>
                  <RadioGroupItem value={p.value} />
                  <span className="w-3 h-3 rounded-full" style={{ background: p.color }} />
                  <span className="text-sm">{p.label}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div>
            <Label>الفئة</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="اختر الفئة" /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>تاريخ الإنجاز</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
            <div><Label>الوقت</Label><Input type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} /></div>
          </div>

          {!editTask && (
            <div>
              <Label>تكليف مباشر (اختياري)</Label>
              <Select value={assignTo} onValueChange={setAssignTo}>
                <SelectTrigger><SelectValue placeholder="بدون تكليف" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون تكليف</SelectItem>
                  {taskUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox id="visible" checked={visibleToAll} onCheckedChange={v => setVisibleToAll(v as boolean)} />
            <Label htmlFor="visible" className="text-sm">ظاهرة للجميع</Label>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">إلغاء</Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()} className="flex-1 text-white" style={{ background: "#1B3A5C" }}>
              {saving ? "جاري الحفظ..." : editTask ? "حفظ التعديلات" : "حفظ المهمة"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
