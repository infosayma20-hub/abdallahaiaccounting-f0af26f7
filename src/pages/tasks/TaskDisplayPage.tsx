import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LogIn, Clock } from "lucide-react";

const PRIORITY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  urgent_important: { label: "مهم ومستعجل", color: "#E24B4A", icon: "🔴" },
  important: { label: "مهم", color: "#378ADD", icon: "🔵" },
  urgent: { label: "مستعجل", color: "#EF9F27", icon: "🟡" },
  normal: { label: "عادي", color: "#888780", icon: "⚪" },
};

const PRIORITY_ORDER = ["urgent_important", "important", "urgent", "normal"];

export default function TaskDisplayPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<any[]>([]);

  const fetchTasks = async () => {
    const { data } = await supabase
      .from("tasks")
      .select("*, assignee:task_users!tasks_assigned_to_fkey(full_name, avatar_color)")
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false });
    if (data) setTasks(data);
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 30000);
    return () => clearInterval(interval);
  }, []);

  const sorted = [...tasks].sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));

  const now = new Date();
  const today = now.toISOString().split("T")[0];

  return (
    <div className="fixed inset-0 bg-background z-50 overflow-auto p-6" dir="rtl">
      {/* Mini header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#1B3A5C" }}>📋 لوحة المهام</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> تحديث تلقائي كل 30 ث</span>
          <Button variant="outline" size="sm" onClick={() => navigate("/tasks/board")}>
            <LogIn className="w-4 h-4 ml-1" /> دخول للإدارة
          </Button>
        </div>
      </div>

      {/* Tasks grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sorted.map(task => {
          const p = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.normal;
          const isOverdue = task.due_date && task.due_date < today;
          const isToday = task.due_date === today;

          return (
            <div key={task.id} className="rounded-xl border bg-card p-5 shadow-sm" style={{ borderRight: `5px solid ${p.color}` }}>
              <div className="flex items-center gap-2 mb-3">
                <Badge style={{ background: p.color + "20", color: p.color, border: "none" }} className="text-xs">{p.icon} {p.label}</Badge>
                {task.category && (
                  task.category === "كرستا ونواقص"
                    ? <Badge className="text-xs" style={{ background: '#7C3AED20', color: '#7C3AED', border: 'none' }}>🔧 {task.category}</Badge>
                    : task.category === "ورشة"
                    ? <Badge className="text-xs" style={{ background: '#0891B220', color: '#0891B2', border: 'none' }}>🏭 {task.category}</Badge>
                    : <Badge variant="outline" className="text-xs">{task.category}</Badge>
                )}
              </div>
              <h2 className="text-lg font-bold mb-2">{task.title}</h2>
              {task.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{task.description}</p>}
              {task.due_date && (
                <div className="text-sm mb-3" style={{ color: isOverdue ? "#E24B4A" : isToday ? "#EF9F27" : "inherit" }}>
                  📅 {task.due_date} {task.due_time ? `⏰ ${task.due_time.slice(0, 5)}` : ""}
                  {isOverdue && " — متأخرة!"}
                </div>
              )}
              <div className="border-t pt-3 mt-2">
                {task.assignee ? (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: task.assignee.avatar_color }}>{task.assignee.full_name.charAt(0)}</div>
                    <span className="text-sm font-medium">{task.assignee.full_name}</span>
                    <Badge className="mr-auto text-xs" style={{ background: "#378ADD" }}>قيد الإنجاز</Badge>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">⏳ بانتظار التكليف</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-20">
          <p className="text-2xl text-muted-foreground">🎉 لا توجد مهام حالياً</p>
        </div>
      )}
    </div>
  );
}
