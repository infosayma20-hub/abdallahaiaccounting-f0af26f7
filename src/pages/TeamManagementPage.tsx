import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users, UserPlus, Shield, Lock, Unlock, Circle, ArrowRight,
  RefreshCw, Activity,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import BackButton from "@/components/BackButton";

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  admin: { label: "مدير", color: "bg-primary text-primary-foreground" },
  super_admin: { label: "مدير النظام", color: "bg-destructive text-destructive-foreground" },
  accountant_senior: { label: "محاسب أول", color: "bg-blue-600 text-white" },
  accountant_sales: { label: "محاسب مبيعات", color: "bg-green-600 text-white" },
  accountant_purchases: { label: "محاسب مشتريات", color: "bg-orange-600 text-white" },
  cashier: { label: "كاشير", color: "bg-violet-600 text-white" },
  hr_manager: { label: "مدير HR", color: "bg-pink-600 text-white" },
  employee: { label: "موظف", color: "bg-muted text-muted-foreground" },
};

interface TeamMember {
  user_id: string;
  display_name: string;
  full_name: string;
  email: string;
  roles: string[];
  is_suspended: boolean;
  is_online: boolean;
  last_seen_at: string | null;
  created_at: string;
}

export default function TeamManagementPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ email: "", password: "", full_name: "", role: "accountant_senior" });
  const [adding, setAdding] = useState(false);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [activityUserId, setActivityUserId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("team-management", {
        body: { action: "list_team_members" },
      });
      if (error) throw error;
      setMembers(data.members || []);
    } catch (err: any) {
      toast.error("فشل تحميل أعضاء الفريق");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // Update last_seen periodically
  useEffect(() => {
    if (!user) return;
    const update = () => (supabase.rpc as any)("update_last_seen");
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [user]);

  const handleAdd = async () => {
    if (!addForm.email || !addForm.password || !addForm.full_name) {
      toast.error("يرجى تعبئة جميع الحقول"); return;
    }
    setAdding(true);
    try {
      const { data, error } = await supabase.functions.invoke("team-management", {
        body: { action: "create_team_member", ...addForm },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      toast.success("تم إضافة عضو الفريق بنجاح");
      setShowAdd(false);
      setAddForm({ email: "", password: "", full_name: "", role: "accountant_senior" });
      fetchMembers();
    } catch (err: any) {
      toast.error(err.message || "فشل إنشاء المستخدم");
    } finally {
      setAdding(false);
    }
  };

  const handleSuspend = async (targetUserId: string, suspend: boolean) => {
    try {
      const { data, error } = await supabase.functions.invoke("team-management", {
        body: { action: "suspend_team_member", target_user_id: targetUserId, suspend },
      });
      if (error) throw error;
      toast.success(suspend ? "تم تعليق المستخدم" : "تم تفعيل المستخدم");
      fetchMembers();
    } catch {
      toast.error("فشل تحديث حالة المستخدم");
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("team-management", {
        body: { action: "update_team_role", target_user_id: targetUserId, new_role: newRole },
      });
      if (error) throw error;
      toast.success("تم تحديث الصلاحية");
      fetchMembers();
    } catch {
      toast.error("فشل تحديث الصلاحية");
    }
  };

  const viewActivity = async (userId: string) => {
    setActivityUserId(userId);
    const { data } = await (supabase as any)
      .from("activity_log")
      .select("*")
      .eq("actor_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    setActivityLog(data || []);
    setShowActivity(true);
  };

  const onlineCount = members.filter(m => m.is_online).length;

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold">إدارة فريق العمل</h1>
            <p className="text-sm text-muted-foreground">
              {members.length} أعضاء · {onlineCount} متصل الآن
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchMembers} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ml-1 ${loading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
          <Button onClick={() => setShowAdd(true)}>
            <UserPlus className="h-4 w-4 ml-1" />
            إضافة عضو
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{members.length}</p>
              <p className="text-xs text-muted-foreground">إجمالي الأعضاء</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Circle className="h-8 w-8 text-green-500 fill-green-500" />
            <div>
              <p className="text-2xl font-bold">{onlineCount}</p>
              <p className="text-xs text-muted-foreground">متصل الآن</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Shield className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{members.filter(m => !m.is_suspended).length}</p>
              <p className="text-xs text-muted-foreground">نشط</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Lock className="h-8 w-8 text-destructive" />
            <div>
              <p className="text-2xl font-bold">{members.filter(m => m.is_suspended).length}</p>
              <p className="text-xs text-muted-foreground">معلّق</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">أعضاء الفريق</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا يوجد أعضاء بعد</p>
              <Button variant="outline" className="mt-3" onClick={() => setShowAdd(true)}>
                <UserPlus className="h-4 w-4 ml-1" />
                إضافة أول عضو
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {members.map((m) => (
                <div
                  key={m.user_id}
                  className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                    m.is_suspended ? "bg-destructive/5 border-destructive/20" : "bg-card border-border"
                  }`}
                >
                  {/* Online indicator */}
                  <div className="relative">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold">
                      {(m.full_name || m.display_name || "?").charAt(0)}
                    </div>
                    <div className={`absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-background ${
                      m.is_online ? "bg-green-500" : "bg-muted-foreground/30"
                    }`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{m.full_name || m.display_name}</span>
                      {m.is_suspended && (
                        <Badge variant="destructive" className="text-[10px]">معلّق</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                    <div className="flex gap-1 mt-1">
                      {m.roles.map((r) => (
                        <span
                          key={r}
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            ROLE_LABELS[r]?.color || "bg-muted text-muted-foreground"
                          }`}
                        >
                          {ROLE_LABELS[r]?.label || r}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground text-left">
                    {m.last_seen_at ? (
                      <span>{m.is_online ? "🟢 متصل" : formatDistanceToNow(new Date(m.last_seen_at), { addSuffix: true, locale: ar })}</span>
                    ) : (
                      <span>لم يسجل دخول بعد</span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1">
                    <Select
                      value={m.roles[0] || ""}
                      onValueChange={(val) => handleRoleChange(m.user_id, val)}
                    >
                      <SelectTrigger className="w-[130px] h-8 text-xs">
                        <SelectValue placeholder="تغيير الدور" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="accountant_senior">محاسب أول</SelectItem>
                        <SelectItem value="accountant_sales">محاسب مبيعات</SelectItem>
                        <SelectItem value="accountant_purchases">محاسب مشتريات</SelectItem>
                        <SelectItem value="cashier">كاشير</SelectItem>
                        <SelectItem value="hr_manager">مدير HR</SelectItem>
                        <SelectItem value="employee">موظف</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant={m.is_suspended ? "outline" : "destructive"}
                      size="sm"
                      className="h-8"
                      onClick={() => handleSuspend(m.user_id, !m.is_suspended)}
                    >
                      {m.is_suspended ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    </Button>

                    <Button variant="ghost" size="sm" className="h-8" onClick={() => viewActivity(m.user_id)}>
                      <Activity className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Member Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>إضافة عضو جديد للفريق</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>الاسم الكامل</Label>
              <Input
                value={addForm.full_name}
                onChange={(e) => setAddForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="أحمد محمد"
              />
            </div>
            <div>
              <Label>البريد الإلكتروني</Label>
              <Input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm(f => ({ ...f, email: e.target.value }))}
                placeholder="ahmed@company.com"
                dir="ltr"
              />
            </div>
            <div>
              <Label>كلمة المرور</Label>
              <Input
                type="password"
                value={addForm.password}
                onChange={(e) => setAddForm(f => ({ ...f, password: e.target.value }))}
                placeholder="********"
                dir="ltr"
              />
            </div>
            <div>
              <Label>الصلاحية</Label>
              <Select
                value={addForm.role}
                onValueChange={(val) => setAddForm(f => ({ ...f, role: val }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accountant_senior">محاسب أول — كل الصلاحيات</SelectItem>
                  <SelectItem value="accountant_sales">محاسب مبيعات — فواتير وعملاء</SelectItem>
                  <SelectItem value="accountant_purchases">محاسب مشتريات — مشتريات وموردين</SelectItem>
                  <SelectItem value="cashier">كاشير — POS فقط</SelectItem>
                  <SelectItem value="hr_manager">مدير HR — موارد بشرية</SelectItem>
                  <SelectItem value="employee">موظف — تطبيق الموظف فقط</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>إلغاء</Button>
            <Button onClick={handleAdd} disabled={adding}>
              {adding ? "جاري الإنشاء..." : "إنشاء المستخدم"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activity Log Dialog */}
      <Dialog open={showActivity} onOpenChange={setShowActivity}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>سجل النشاط</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {activityLog.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا يوجد نشاط مسجل</p>
            ) : (
              <div className="space-y-2">
                {activityLog.map((a: any) => (
                  <div key={a.id} className="flex items-start gap-3 p-3 border-b border-border">
                    <Activity className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm">{a.action} — {a.entity_label || a.entity_type}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(a.created_at), "yyyy/MM/dd hh:mm a", { locale: ar })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
