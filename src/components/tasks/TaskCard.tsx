import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Hand, Crown } from "lucide-react";

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  urgent_important: { label: "مهم ومستعجل", color: "#E24B4A" },
  important: { label: "مهم", color: "#378ADD" },
  urgent: { label: "مستعجل", color: "#EF9F27" },
  normal: { label: "عادي", color: "#888780" },
};

interface TaskCardProps {
  task: any;
  priorityColor: string;
  currentUserId: string;
  onAssign: () => void;
  onClick: () => void;
  onComplete: () => void;
}

export default function TaskCard({ task, priorityColor, currentUserId, onAssign, onClick, onComplete }: TaskCardProps) {
  const prio = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal;
  const today = new Date().toISOString().split("T")[0];
  const isOverdue = task.due_date && task.due_date < today && task.status !== "done";
  const isToday = task.due_date === today;
  const isMine = task.assigned_to === currentUserId;
  const isPortalTask = task.created_by_portal;

  return (
    <div
      className="rounded-lg border bg-card p-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
      style={{
        borderRight: `4px solid ${priorityColor}`,
        borderLeft: isPortalTask ? '4px solid #1B3A5C' : undefined,
      }}
      onClick={onClick}
    >
      {/* Portal badge */}
      {isPortalTask && (
        <div className="flex items-center gap-1 mb-2">
          <Badge className="text-[10px] h-5 gap-1" style={{ background: '#1B3A5C', color: '#fff' }}>
            <Crown className="w-2.5 h-2.5" /> من المدير
          </Badge>
        </div>
      )}
      {/* Badges */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <Badge className="text-[10px] h-5 gap-1" style={{ background: `${prio.color}20`, color: prio.color, border: 'none' }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: prio.color }} />
          {prio.label}
        </Badge>
        {task.category && <Badge variant="outline" className="text-[10px] h-5">{task.category}</Badge>}
        {task.status === "in_progress" && <Badge className="text-[10px] h-5" style={{ background: "#378ADD" }}>قيد الإنجاز</Badge>}
      </div>

      {/* Title */}
      <h3 className="font-bold text-base mb-1">{task.title}</h3>
      {task.description && <p className="text-sm text-muted-foreground mb-2 whitespace-pre-wrap">{task.description}</p>}

      {/* Due date */}
      {task.due_date && (
        <p className="text-[11px] mb-2" style={{ color: isOverdue ? "#E24B4A" : isToday ? "#EF9F27" : "hsl(var(--muted-foreground))" }}>
          📅 {task.due_date}{task.due_time ? ` ⏰ ${task.due_time.slice(0, 5)}` : ""}{isOverdue ? " — متأخرة!" : isToday ? " — اليوم" : ""}
        </p>
      )}

      <div className="border-t pt-2 mt-1">
        {task.assigned_to ? (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: task.assignee?.avatar_color || "#1B3A5C" }}>
              {task.assignee?.full_name?.charAt(0) || "?"}
            </div>
            <span className="text-xs">{task.assignee?.full_name}</span>
            {isMine && (task.status === "in_progress" || task.status === "open") && (
              <Button size="sm" variant="ghost" className="mr-auto h-6 text-[10px] px-2 text-green-600" onClick={e => { e.stopPropagation(); onComplete(); }}>
                <CheckCircle2 className="w-3 h-3 ml-1" /> إنهاء
              </Button>
            )}
          </div>
        ) : (
          <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={e => { e.stopPropagation(); onAssign(); }} style={{ borderColor: priorityColor, color: priorityColor }}>
            <Hand className="w-3 h-3 ml-1" /> تكفّل بهذه المهمة
          </Button>
        )}
      </div>
    </div>
  );
}
