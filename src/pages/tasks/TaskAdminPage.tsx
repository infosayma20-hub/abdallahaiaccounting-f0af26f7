import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTaskAuth } from "@/hooks/useTaskAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Plus, Edit, KeyRound, UserX, Users, BarChart3, Archive } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fmtDateTimeDisplay } from "@/lib/utils";

const AVATAR_COLORS = ["#1B3A5C", "#E24B4A", "#378ADD", "#EF9F27", "#2D8B55", "#9B59B6"];

export default function TaskAdminPage() {
  const { user, session } = useAuth();
  const { taskUser, isAdmin } = useTaskAuth();
  const navigate = useNavigate();
  const [taskUsers, setTaskUsers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [changePwUser, setChangePwUser] = useState<any>(null);
  const [form, setForm] = useState({ full_name: "", username: "", password: "", role: "staff", avatar_color: "#1B3A5C" });
  const [newPw, setNewPw] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!taskUser || !isAdmin) { navigate("/tasks/board"); return; }
    fetchAll();
  }, [taskUser, isAdmin]);

  const fetchAll = async () => {
    const [u, t] = await Promise.all([
      supabase.from("task_users").select("id, user_id, full_name, username, role, avatar_color, is_active, last_login_at, created_at").order("created_at"),
      supabase.from("tasks").select("*, assignee:task_users!tasks_assigned_to_fkey(full_name)").order("created_at", { ascending: false }),
    ]);
    if (u.data) setTaskUsers(u.data);
    if (t.data) setTasks(t.data);
  };

  const handleCreateUser = async () => {
    if (!form.full_name || !form.username || !form.password) return;
    setSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/task-auth/create-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success === false) throw new Error(data.error);
      toast({ title: "تم إنشاء المستخدم" });
      setShowAdd(false);
      setForm({ full_name: "", username: "", password: "", role: "staff", avatar_color: "#1B3A5C" });
      fetchAll();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleToggleActive = async (u: any) => {
    await supabase.from("task_users").update({ is_active: !u.is_active }).eq("id", u.id);
    toast({ title: u.is_active ? "تم تعطيل المستخدم" : "تم تفعيل المستخدم" });
    fetchAll();
  };

  const handleChangePw = async () => {
    if (!newPw || !changePwUser) return;
    setSaving(true);
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/task-auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ task_user_id: changePwUser.id, new_password: newPw }),
      });
      toast({ title: "تم تغيير كلمة المرور" });
      setChangePwUser(null);
      setNewPw("");
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleUpdateUser = async () => {
    if (!editUser) return;
    setSaving(true);
    await supabase.from("task_users").update({
      full_name: form.full_name,
      role: form.role,
      avatar_color: form.avatar_color,
    }).eq("id", editUser.id);
    toast({ title: "تم تحديث البيانات" });
    setEditUser(null);
    fetchAll();
    setSaving(false);
  };

  // Stats
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const inProgressTasks = tasks.filter(t => t.status === "in_progress").length;
  const overdueTasks = tasks.filter(t => t.due_date && t.due_date < new Date().toISOString().split("T")[0] && t.status !== "done" && t.status !== "cancelled").length;

  const userStats = taskUsers.map(u => ({
    ...u,
    completed: tasks.filter(t => t.completed_by === u.id).length,
    assigned: tasks.filter(t => t.assigned_to === u.id && t.status === "in_progress").length,
  }));

  return (
    <div dir="rtl" className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/tasks/board")}><ArrowRight className="w-5 h-5" /></Button>
        <h1 className="text-xl font-bold" style={{ color: "#1B3A5C" }}>لوحة الإدارة</h1>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users"><Users className="w-4 h-4 ml-1" />المستخدمون</TabsTrigger>
          <TabsTrigger value="stats"><BarChart3 className="w-4 h-4 ml-1" />الإحصائيات</TabsTrigger>
          <TabsTrigger value="archive"><Archive className="w-4 h-4 ml-1" />الأرشيف</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setForm({ full_name: "", username: "", password: "", role: "staff", avatar_color: "#1B3A5C" }); setShowAdd(true); }} style={{ background: "#1B3A5C" }} className="text-white">
              <Plus className="w-4 h-4 ml-1" /> إضافة مستخدم
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الاسم</TableHead>
                    <TableHead className="text-right">اسم المستخدم</TableHead>
                    <TableHead className="text-right">الدور</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">آخر دخول</TableHead>
                    <TableHead className="text-right">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taskUsers.map(u => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: u.avatar_color }}>{u.full_name.charAt(0)}</div>
                          {u.full_name}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{u.username}</TableCell>
                      <TableCell><Badge variant="outline">{u.role === "admin" ? "مدير" : u.role === "viewer" ? "مشاهد" : "موظف"}</Badge></TableCell>
                      <TableCell><Badge variant={u.is_active ? "default" : "secondary"}>{u.is_active ? "فعال" : "معطل"}</Badge></TableCell>
                      <TableCell className="text-xs">{u.last_login_at ? fmtDateTimeDisplay(u.last_login_at) : "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditUser(u); setForm({ full_name: u.full_name, username: u.username, password: "", role: u.role, avatar_color: u.avatar_color }); }}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setChangePwUser(u)}><KeyRound className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggleActive(u)}><UserX className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "إجمالي المهام", val: totalTasks, color: "#1B3A5C" },
              { label: "مكتملة", val: doneTasks, color: "#2D8B55" },
              { label: "قيد الإنجاز", val: inProgressTasks, color: "#378ADD" },
              { label: "متأخرة", val: overdueTasks, color: "#E24B4A" },
            ].map(s => (
              <Card key={s.label}><CardContent className="p-4 text-center"><p className="text-xs text-muted-foreground">{s.label}</p><p className="text-2xl font-bold" style={{ color: s.color }}>{s.val}</p></CardContent></Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">أداء الموظفين</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead className="text-right">الموظف</TableHead><TableHead className="text-right">مهام منجزة</TableHead><TableHead className="text-right">قيد الإنجاز</TableHead></TableRow></TableHeader>
                <TableBody>
                  {userStats.map(u => (
                    <TableRow key={u.id}>
                      <TableCell>{u.full_name}</TableCell>
                      <TableCell><Badge variant="secondary">{u.completed}</Badge></TableCell>
                      <TableCell><Badge variant="outline">{u.assigned}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="archive">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead className="text-right">المهمة</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-right">أنجزها</TableHead><TableHead className="text-right">تاريخ الإنجاز</TableHead></TableRow></TableHeader>
                <TableBody>
                  {tasks.filter(t => t.status === "done" || t.status === "cancelled").map(t => (
                    <TableRow key={t.id}>
                      <TableCell>{t.title}</TableCell>
                      <TableCell><Badge variant={t.status === "done" ? "default" : "secondary"}>{t.status === "done" ? "مكتملة" : "ملغاة"}</Badge></TableCell>
                      <TableCell>{t.assignee?.full_name || "-"}</TableCell>
                      <TableCell className="text-xs">{t.completed_at ? fmtDateTimeDisplay(t.completed_at) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add User Modal */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة مستخدم جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>الاسم الكامل</Label><Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} /></div>
            <div><Label>اسم المستخدم</Label><Input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} /></div>
            <div><Label>كلمة المرور</Label><Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} /></div>
            <div><Label>الدور</Label>
              <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="admin">مدير</SelectItem><SelectItem value="staff">موظف</SelectItem><SelectItem value="viewer">مشاهد فقط</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>لون الأفاتار</Label>
              <div className="flex gap-2 mt-1">{AVATAR_COLORS.map(c => (
                <button key={c} className="w-8 h-8 rounded-full border-2 transition-all" style={{ background: c, borderColor: form.avatar_color === c ? "#1B3A5C" : "transparent", transform: form.avatar_color === c ? "scale(1.15)" : "scale(1)" }} onClick={() => setForm(p => ({ ...p, avatar_color: c }))} />
              ))}</div>
            </div>
            <Button onClick={handleCreateUser} disabled={saving} className="w-full text-white" style={{ background: "#1B3A5C" }}>{saving ? "جاري الحفظ..." : "حفظ"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تعديل مستخدم</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>الاسم الكامل</Label><Input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} /></div>
            <div><Label>الدور</Label>
              <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="admin">مدير</SelectItem><SelectItem value="staff">موظف</SelectItem><SelectItem value="viewer">مشاهد فقط</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>لون الأفاتار</Label>
              <div className="flex gap-2 mt-1">{AVATAR_COLORS.map(c => (
                <button key={c} className="w-8 h-8 rounded-full border-2 transition-all" style={{ background: c, borderColor: form.avatar_color === c ? "#1B3A5C" : "transparent", transform: form.avatar_color === c ? "scale(1.15)" : "scale(1)" }} onClick={() => setForm(p => ({ ...p, avatar_color: c }))} />
              ))}</div>
            </div>
            <Button onClick={handleUpdateUser} disabled={saving} className="w-full text-white" style={{ background: "#1B3A5C" }}>{saving ? "جاري الحفظ..." : "حفظ التعديلات"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Change Password Modal */}
      <Dialog open={!!changePwUser} onOpenChange={() => setChangePwUser(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تغيير كلمة المرور - {changePwUser?.full_name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>كلمة المرور الجديدة</Label><Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} /></div>
            <Button onClick={handleChangePw} disabled={saving} className="w-full text-white" style={{ background: "#1B3A5C" }}>{saving ? "جاري الحفظ..." : "تغيير كلمة المرور"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
