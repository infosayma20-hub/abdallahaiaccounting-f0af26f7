import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTaskAuth } from "@/hooks/useTaskAuth";
import LoadingScreen from "@/components/LoadingScreen";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, LogOut, Settings, Monitor, Clock, AlertTriangle, CheckCircle2, User } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import TaskCard from "@/components/tasks/TaskCard";
import AddTaskModal from "@/components/tasks/AddTaskModal";
import TaskDetailDrawer from "@/components/tasks/TaskDetailDrawer";
import CompleteTaskModal from "@/components/tasks/CompleteTaskModal";

const PRIORITY_COLS = [
  { key: "urgent_important", label: "مهم ومستعجل", color: "#E24B4A" },
  { key: "important", label: "مهم", color: "#378ADD" },
  { key: "urgent", label: "مستعجل", color: "#EF9F27" },
  { key: "normal", label: "عادي", color: "#888780" },
];

export default function TaskBoardPage() {
  const { user, loading: authLoading } = useAuth();
  const { taskUser, logout, isAdmin, loading: taskAuthLoading, loginAsOwner } = useTaskAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskUsers, setTaskUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("active");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [completeTask, setCompleteTask] = useState<any>(null);
  const [autoLoginAttempted, setAutoLoginAttempted] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [tasksRes, usersRes] = await Promise.all([
      supabase.from("tasks").select("*, creator:task_users!tasks_created_by_fkey(id, full_name, avatar_color), assignee:task_users!tasks_assigned_to_fkey(id, full_name, avatar_color), completer:task_users!tasks_completed_by_fkey(id, full_name, avatar_color)").order("created_at", { ascending: false }),
      supabase.from("task_users").select("*").eq("is_active", true),
    ]);
    if (tasksRes.data) setTasks(tasksRes.data);
    if (usersRes.data) setTaskUsers(usersRes.data);
    setLoading(false);
  }, [user]);

  // Auto-login owner if not already logged into tasks
  useEffect(() => {
    if (authLoading || taskAuthLoading || autoLoginAttempted) return;
    if (taskUser) { fetchData(); return; }
    if (!user) return;
    setAutoLoginAttempted(true);
    const displayName = user.user_metadata?.full_name || user.email || "المالك";
    loginAsOwner(user.id, displayName).then(() => fetchData());
  }, [user, authLoading, taskUser, taskAuthLoading, autoLoginAttempted, loginAsOwner, fetchData]);

  useEffect(() => {
    if (taskUser && !taskAuthLoading) fetchData();
  }, [taskUser, taskAuthLoading, fetchData]);

  // Realtime subscription for instant updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('tasks-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchData]);

  const handleAssign = async (taskId: string) => {
    if (!taskUser) return;
    await supabase.from("tasks").update({ assigned_to: taskUser.id, assigned_at: new Date().toISOString(), status: "in_progress" }).eq("id", taskId);
    await supabase.from("task_history").insert({ task_id: taskId, task_user_id: taskUser.id, action: "assigned", new_value: taskUser.full_name });
    toast({ title: "تم التكفل بالمهمة" });
    fetchData();
  };

  const handleComplete = async (taskId: string, note: string) => {
    if (!taskUser) return;
    await supabase.from("tasks").update({ status: "done", completed_by: taskUser.id, completed_at: new Date().toISOString(), completion_note: note || null }).eq("id", taskId);
    await supabase.from("task_history").insert({ task_id: taskId, task_user_id: taskUser.id, action: "completed", note });
    toast({ title: "تم إنهاء المهمة بنجاح ✅" });
    setCompleteTask(null);
    fetchData();
  };

  const handleCancel = async (taskId: string) => {
    await supabase.from("tasks").update({ status: "cancelled" }).eq("id", taskId);
    await supabase.from("task_history").insert({ task_id: taskId, task_user_id: taskUser?.id, action: "status_changed", new_value: "cancelled" });
    toast({ title: "تم إلغاء المهمة" });
    setSelectedTask(null);
    fetchData();
  };

  const filtered = tasks.filter(t => {
    if (statusFilter === "active") return t.status === "open" || t.status === "in_progress";
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (assigneeFilter !== "all" && t.assigned_to !== assigneeFilter) return false;
    return true;
  });

  const today = new Date().toISOString().split("T")[0];
  const stats = {
    urgentImportant: tasks.filter(t => t.priority === "urgent_important" && t.status !== "done" && t.status !== "cancelled").length,
    inProgress: tasks.filter(t => t.status === "in_progress").length,
    dueToday: tasks.filter(t => t.due_date === today && t.status !== "done" && t.status !== "cancelled").length,
  };

  if (authLoading || taskAuthLoading || !taskUser) return <LoadingScreen />;

  return (
    <div className="min-h-[80vh]" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: taskUser.avatar_color }}>
            {taskUser.full_name.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-sm">{taskUser.full_name}</p>
            <p className="text-xs text-muted-foreground">{taskUser.role === "admin" ? "مدير" : taskUser.role === "viewer" ? "مشاهد" : "موظف"}</p>
          </div>
        </div>
        <h1 className="text-xl font-bold hidden md:block" style={{ color: "#1B3A5C" }}>إدارة المهام</h1>
        <div className="flex items-center gap-2">
          {taskUser.role !== "viewer" && (
            <Button onClick={() => setShowAddModal(true)} style={{ background: "#1B3A5C" }} className="text-white">
              <Plus className="w-4 h-4 ml-1" /> مهمة جديدة
            </Button>
          )}
          {isAdmin && (
            <>
              <Button variant="outline" size="icon" onClick={() => navigate("/tasks/admin")} title="إدارة"><Settings className="w-4 h-4" /></Button>
              <Button variant="outline" size="icon" onClick={() => navigate("/tasks/display")} title="شاشة العرض"><Monitor className="w-4 h-4" /></Button>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={() => { logout(); navigate("/tasks"); }}><LogOut className="w-4 h-4" /></Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg p-3 border flex items-center gap-2" style={{ borderColor: "#E24B4A20", background: "#E24B4A08" }}>
          <AlertTriangle className="w-5 h-5" style={{ color: "#E24B4A" }} />
          <div><p className="text-xs text-muted-foreground">مهم ومستعجل</p><p className="text-lg font-bold" style={{ color: "#E24B4A" }}>{stats.urgentImportant}</p></div>
        </div>
        <div className="rounded-lg p-3 border flex items-center gap-2" style={{ borderColor: "#378ADD20", background: "#378ADD08" }}>
          <Clock className="w-5 h-5" style={{ color: "#378ADD" }} />
          <div><p className="text-xs text-muted-foreground">قيد الإنجاز</p><p className="text-lg font-bold" style={{ color: "#378ADD" }}>{stats.inProgress}</p></div>
        </div>
        <div className="rounded-lg p-3 border flex items-center gap-2" style={{ borderColor: "#EF9F2720", background: "#EF9F2708" }}>
          <CheckCircle2 className="w-5 h-5" style={{ color: "#EF9F27" }} />
          <div><p className="text-xs text-muted-foreground">تنتهي اليوم</p><p className="text-lg font-bold" style={{ color: "#EF9F27" }}>{stats.dueToday}</p></div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-5">
        {[{ v: "active", l: "المفتوحة والجارية" }, { v: "all", l: "الكل" }, { v: "open", l: "مفتوحة" }, { v: "in_progress", l: "قيد الإنجاز" }, { v: "done", l: "مكتملة" }].map(f => (
          <Badge key={f.v} variant={statusFilter === f.v ? "default" : "outline"} className="cursor-pointer" onClick={() => setStatusFilter(f.v)}>{f.l}</Badge>
        ))}
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-32 h-7 text-xs"><SelectValue placeholder="الفئة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفئات</SelectItem>
            {["ضريبية", "محاسبية", "تدقيق", "إدارية", "أخرى"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-36 h-7 text-xs"><SelectValue placeholder="المتكفل" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الموظفين</SelectItem>
            {taskUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Tasks Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-12 col-span-full">لا توجد مهام</p>
        )}
        {filtered.map(task => {
          const p = PRIORITY_COLS.find(c => c.key === task.priority) || PRIORITY_COLS[3];
          return (
            <TaskCard
              key={task.id}
              task={task}
              priorityColor={p.color}
              currentUserId={taskUser.id}
              onAssign={() => handleAssign(task.id)}
              onClick={() => setSelectedTask(task)}
              onComplete={() => setCompleteTask(task)}
            />
          );
        })}
      </div>

      {showAddModal && <AddTaskModal open={showAddModal} onClose={() => setShowAddModal(false)} taskUsers={taskUsers} onSaved={fetchData} />}
      {selectedTask && <TaskDetailDrawer task={selectedTask} open={!!selectedTask} onClose={() => setSelectedTask(null)} currentUserId={taskUser.id} isAdmin={isAdmin} onAssign={handleAssign} onComplete={(t) => setCompleteTask(t)} onCancel={handleCancel} onRefresh={fetchData} />}
      {completeTask && <CompleteTaskModal open={!!completeTask} onClose={() => setCompleteTask(null)} onConfirm={(note) => handleComplete(completeTask.id, note)} />}
    </div>
  );
}
