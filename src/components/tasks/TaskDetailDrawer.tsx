import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Hand, CheckCircle2, Edit, XCircle, Clock } from "lucide-react";
import { fmtDateTimeDisplay } from "@/lib/utils";
import AddTaskModal from "./AddTaskModal";

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  urgent_important: { label: "مهم ومستعجل", color: "#E24B4A" },
  important: { label: "مهم", color: "#378ADD" },
  urgent: { label: "مستعجل", color: "#EF9F27" },
  normal: { label: "عادي", color: "#888780" },
};

const ACTION_LABELS: Record<string, string> = {
  created: "أنشأ المهمة",
  assigned: "تكفّل بالمهمة",
  status_changed: "غيّر الحالة",
  edited: "عدّل المهمة",
  completed: "أنهى المهمة",
};

interface Props {
  task: any;
  open: boolean;
  onClose: () => void;
  currentUserId: string;
  isAdmin: boolean;
  onAssign: (id: string) => void;
  onComplete: (task: any) => void;
  onCancel: (id: string) => void;
  onRefresh: () => void;
}

export default function TaskDetailDrawer({ task, open, onClose, currentUserId, isAdmin, onAssign, onComplete, onCancel, onRefresh }: Props) {
  const [history, setHistory] = useState<any[]>([]);
  const [showEdit, setShowEdit] = useState(false);
  const [taskUsers, setTaskUsers] = useState<any[]>([]);
  const p = PRIORITY_MAP[task.priority] || PRIORITY_MAP.normal;
  const isMine = task.assigned_to === currentUserId;
  const canAssign = !task.assigned_to && task.status === "open";

  useEffect(() => {
    if (!open) return;
    Promise.all([
      supabase.from("task_history").select("*, task_user:task_users!task_history_task_user_id_fkey(full_name)").eq("task_id", task.id).order("created_at", { ascending: false }),
      supabase.from("task_users").select("id, full_name, username, role, avatar_color, is_active").eq("is_active", true),
    ]).then(([h, u]) => {
      if (h.data) setHistory(h.data);
      if (u.data) setTaskUsers(u.data);
    });
  }, [open, task.id]);

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto" dir="rtl">
          <SheetHeader className="pb-4">
            <div className="flex items-center gap-2">
              <Badge style={{ background: p.color + "20", color: p.color, border: "none" }}>{p.label}</Badge>
              {task.category && <Badge variant="outline">{task.category}</Badge>}
              {task.status === "done" && <Badge className="bg-green-500">مكتملة</Badge>}
              {task.status === "cancelled" && <Badge variant="secondary">ملغاة</Badge>}
            </div>
            <SheetTitle className="text-right text-lg mt-2">{task.title}</SheetTitle>
          </SheetHeader>

          {task.description && <p className="text-sm text-muted-foreground mb-4 whitespace-pre-wrap">{task.description}</p>}

          {task.due_date && (
            <div className="flex items-center gap-2 mb-4 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span>الموعد: {task.due_date}{task.due_time ? ` — ${task.due_time.slice(0, 5)}` : ""}</span>
            </div>
          )}

          <Separator className="my-4" />

          {/* Info */}
          <div className="space-y-2 text-sm mb-4">
            <p>أنشأها: <strong>{task.creator?.full_name || "-"}</strong> — {fmtDateTimeDisplay(task.created_at)}</p>
            {task.assignee && <p>المتكفل: <strong>{task.assignee.full_name}</strong> — {fmtDateTimeDisplay(task.assigned_at)}</p>}
            {task.completer && <p>أنهاها: <strong>{task.completer.full_name}</strong> — {fmtDateTimeDisplay(task.completed_at)}</p>}
            {task.completion_note && <p className="bg-muted p-2 rounded text-xs">ملاحظة الإنجاز: {task.completion_note}</p>}
          </div>

          {/* Actions */}
          {task.status !== "done" && task.status !== "cancelled" && (
            <div className="flex flex-wrap gap-2 mb-6">
              {canAssign && (
                <Button onClick={() => { onAssign(task.id); onClose(); }} style={{ background: "#1B3A5C" }} className="text-white">
                  <Hand className="w-4 h-4 ml-1" /> تكفّل بها
                </Button>
              )}
              {isMine && (task.status === "in_progress" || task.status === "open") && (
                <Button onClick={() => { onComplete(task); onClose(); }} className="bg-green-600 text-white hover:bg-green-700">
                  <CheckCircle2 className="w-4 h-4 ml-1" /> إنهاء المهمة
                </Button>
              )}
              {isAdmin && (
                <>
                  <Button variant="outline" onClick={() => setShowEdit(true)}><Edit className="w-4 h-4 ml-1" /> تعديل</Button>
                  <Button variant="destructive" onClick={() => onCancel(task.id)}><XCircle className="w-4 h-4 ml-1" /> إلغاء</Button>
                </>
              )}
            </div>
          )}

          <Separator className="my-4" />

          {/* History Timeline */}
          <h3 className="font-semibold text-sm mb-3">سجل التغييرات</h3>
          <div className="space-y-3">
            {history.map(h => (
              <div key={h.id} className="flex gap-2 text-xs">
                <div className="w-2 h-2 rounded-full bg-border mt-1.5 shrink-0" />
                <div>
                  <span className="font-medium">{h.task_user?.full_name || "نظام"}</span>
                  <span className="text-muted-foreground mr-1">{ACTION_LABELS[h.action] || h.action}</span>
                  {h.note && <span className="text-muted-foreground"> — {h.note}</span>}
                  <p className="text-muted-foreground">{fmtDateTimeDisplay(h.created_at)}</p>
                </div>
              </div>
            ))}
            {history.length === 0 && <p className="text-xs text-muted-foreground">لا يوجد سجل بعد</p>}
          </div>
        </SheetContent>
      </Sheet>

      {showEdit && <AddTaskModal open={showEdit} onClose={() => setShowEdit(false)} taskUsers={taskUsers} onSaved={() => { onRefresh(); onClose(); }} editTask={task} />}
    </>
  );
}
