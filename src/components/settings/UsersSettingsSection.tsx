import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { UserPlus, Shield, ScrollText, Users, Eye, Pencil, Trash2, Check, Copy, ExternalLink, KeyRound, Loader2, AppWindow } from "lucide-react";
import { useNavigate } from "react-router-dom";
import UserAppAccessDialog from "@/components/settings/UserAppAccessDialog";
import { assertPermission } from "@/lib/permissions/assertPermission";

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير عام",
  accountant_senior: "محاسب",
  cashier: "كاشير",
  supervisor: "مشرف مخزون",
  accountant_sales: "مندوب مبيعات",
  accountant_purchases: "محاسب مشتريات",
  hr_manager: "مدير موارد بشرية",
  employee: "موظف",
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "صلاحيات كاملة على جميع الوحدات",
  accountant_senior: "كل الوحدات المالية بدون حذف",
  cashier: "نقطة البيع فقط",
  supervisor: "المخزون + التقارير",
  accountant_sales: "الزبائن + الفواتير + قراءة فقط",
  accountant_purchases: "المشتريات + الموردين",
  hr_manager: "إدارة الموظفين والحضور",
  employee: "بوابة الموظف فقط",
};

const MODULES = [
  { key: "finance", label: "المالية" },
  { key: "sales", label: "المبيعات" },
  { key: "purchases", label: "المشتريات" },
  { key: "inventory", label: "المخزون" },
  { key: "hr", label: "الموارد البشرية" },
  { key: "reports", label: "التقارير" },
  { key: "settings", label: "الإعدادات" },
];

const PERM_LABELS = [
  { key: "can_read", label: "قراءة", icon: Eye },
  { key: "can_write", label: "كتابة", icon: Pencil },
  { key: "can_delete", label: "حذف", icon: Trash2 },
  { key: "can_approve", label: "اعتماد", icon: Check },
];

function generatePassword() {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
  let pw = "";
  for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

interface TeamUser {
  user_id: string;
  display_name: string;
  email: string;
  role: string;
  last_seen_at: string | null;
  created_at: string;
}

interface Permission {
  role: string;
  module: string;
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
  can_approve: boolean;
}

interface AuditEntry {
  id: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_label: string | null;
  details: any;
  created_at: string;
}

const UsersSettingsSection = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("users");
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetTargetUserId, setResetTargetUserId] = useState("");
  const [resetPassword, setResetPassword] = useState(generatePassword());

  // Per-user App Access dialog
  const [appAccessTarget, setAppAccessTarget] = useState<{ user_id: string; name: string } | null>(null);
  const [overrideCounts, setOverrideCounts] = useState<Record<string, { allow: number; deny: number }>>({});

  // Add user form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState(generatePassword());
  const [newRole, setNewRole] = useState("accountant_senior");

  useEffect(() => {
    if (user) loadData();
    // Reset password form on user/company context change to avoid stale state
    setResetTargetUserId("");
    setResetPassword(generatePassword());
  }, [user?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load team users (profiles with same company or invited_by)
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, company_name, role, last_seen_at, created_at, invited_by, company_id")
        .or(`user_id.eq.${user!.id},invited_by.eq.${user!.id}`);

      if (profiles) {
        const users: TeamUser[] = profiles.map(p => ({
          user_id: p.user_id,
          display_name: p.display_name || "",
          email: "",
          role: p.role || "employee",
          last_seen_at: p.last_seen_at,
          created_at: p.created_at || "",
        }));
        setTeamUsers(users);

        // Load app-access override counts for these users (RLS will filter per-tenant)
        const ids = users.map(u => u.user_id);
        if (ids.length > 0) {
          const { data: ov } = await supabase
            .from("user_app_access_overrides" as any)
            .select("target_user_id,access_state")
            .in("target_user_id", ids);
          const counts: Record<string, { allow: number; deny: number }> = {};
          (ov || []).forEach((r: any) => {
            const c = counts[r.target_user_id] || { allow: 0, deny: 0 };
            if (r.access_state === "allow") c.allow++;
            else if (r.access_state === "deny") c.deny++;
            counts[r.target_user_id] = c;
          });
          setOverrideCounts(counts);
        }
      }

      // Load permissions
      const { data: perms } = await supabase
        .from("role_permissions")
        .select("role, module, can_read, can_write, can_delete, can_approve");
      if (perms) setPermissions(perms as Permission[]);

      // Load audit logs
      const { data: logs } = await supabase
        .from("activity_log")
        .select("id, actor_name, action, entity_type, entity_label, details, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (logs) setAuditLogs(logs as AuditEntry[]);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleAddUser = async () => {
    if (!newName || !newEmail || !newPassword) {
      toast.error("جميع الحقول مطلوبة");
      return;
    }
    try { await assertPermission("settings", "users", "manage"); } catch { return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-team-user", {
        body: {
          action: "create",
          full_name: newName,
          email: newEmail,
          password: newPassword,
          role: newRole,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`تم إنشاء حساب ${newName} بنجاح`);
      setShowAddUser(false);
      setNewName("");
      setNewEmail("");
      setNewPassword(generatePassword());
      setNewRole("accountant_senior");
      loadData();
    } catch (e: any) {
      toast.error(e.message || "فشل إنشاء الحساب");
    }
    setSaving(false);
  };

  const handleToggleActive = async (targetUserId: string, activate: boolean) => {
    try { await assertPermission("settings", "users", "manage"); } catch { return; }
    try {
      const { data, error } = await supabase.functions.invoke("manage-team-user", {
        body: { action: "toggle_active", target_user_id: targetUserId, is_active: activate },
      });
      if (error) throw error;
      toast.success(activate ? "تم تفعيل الحساب" : "تم تعليق الحساب");
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleChangeRole = async (targetUserId: string, newRoleValue: string) => {
    try { await assertPermission("settings", "users", "manage"); } catch { return; }
    try {
      const { data, error } = await supabase.functions.invoke("manage-team-user", {
        body: { action: "change_role", target_user_id: targetUserId, new_role: newRoleValue },
      });
      if (error) throw error;
      toast.success("تم تغيير الدور");
      loadData();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleResetPasswordByUserId = async () => {
    if (!resetTargetUserId || !resetPassword || resetPassword.length < 6) {
      toast.error("اختر مستخدماً وكلمة مرور من 6 أحرف على الأقل");
      return;
    }
    try { await assertPermission("settings", "users", "manage"); } catch { return; }
    // Defense-in-depth: ensure target is in the visible same-company list
    if (!teamUsers.some(u => u.user_id === resetTargetUserId)) {
      toast.error("المستخدم غير تابع لشركتك");
      return;
    }
    setResettingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-team-user", {
        body: { action: "reset_password_by_id", target_user_id: resetTargetUserId, new_password: resetPassword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await navigator.clipboard.writeText(resetPassword).catch(() => undefined);
      toast.success("تم تغيير كلمة المرور ونسخها للحافظة");
      setResetTargetUserId("");
      setResetPassword(generatePassword());
    } catch (e: any) {
      toast.error(e.message || "فشل تغيير كلمة المرور");
    } finally {
      setResettingPassword(false);
    }
  };

  const handlePermissionChange = async (role: string, module: string, field: string, value: boolean) => {
    try { await assertPermission("settings", "roles", "manage"); } catch { return; }
    // Optimistic update
    setPermissions(prev =>
      prev.map(p => (p.role === role && p.module === module ? { ...p, [field]: value } : p))
    );
    const { error } = await supabase
      .from("role_permissions")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("role", role as any)
      .eq("module", module);
    if (error) {
      toast.error("فشل تحديث الصلاحية");
      loadData();
    } else {
      toast.success("تم حفظ الصلاحية ✓");
    }
  };

  const getPermission = (role: string, module: string) =>
    permissions.find(p => p.role === role && p.module === module);

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("ar-PS", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const actionLabels: Record<string, string> = {
    create_user: "إنشاء مستخدم",
    activate_user: "تفعيل مستخدم",
    deactivate_user: "تعليق مستخدم",
    change_role: "تغيير دور",
    create: "إنشاء",
    update: "تعديل",
    delete: "حذف",
    login: "تسجيل دخول",
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="p-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="w-full grid grid-cols-4 mb-6">
          <TabsTrigger value="users" className="gap-2 text-xs sm:text-sm">
            <Users className="h-4 w-4" /> المستخدمون
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-2 text-xs sm:text-sm">
            <Shield className="h-4 w-4" /> الأدوار
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2 text-xs sm:text-sm">
            <Shield className="h-4 w-4" /> الصلاحيات
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2 text-xs sm:text-sm">
            <ScrollText className="h-4 w-4" /> سجل النشاط
          </TabsTrigger>
        </TabsList>

        {/* Users Tab */}
        <TabsContent value="users">
          <div className="mb-5 rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <KeyRound className="h-4 w-4 text-primary" />
              تغيير كلمة مرور مستخدم
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto] gap-2">
              <Select value={resetTargetUserId} onValueChange={setResetTargetUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر مستخدماً من شركتك" />
                </SelectTrigger>
                <SelectContent>
                  {teamUsers.map(u => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.display_name || u.user_id} — {ROLE_LABELS[u.role] || u.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="كلمة المرور الجديدة" dir="ltr" className="font-mono text-left" />
              <Button type="button" variant="outline" onClick={() => setResetPassword(generatePassword())} disabled={resettingPassword}>توليد</Button>
              <Button type="button" onClick={handleResetPasswordByUserId} disabled={resettingPassword || !resetTargetUserId} className="gap-2">
                {resettingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                تغيير
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <span className="w-1 h-5 bg-primary rounded-full" />
              قائمة المستخدمين
            </h3>
            <Button size="sm" onClick={() => setShowAddUser(true)} className="gap-2">
              <UserPlus className="h-4 w-4" />
              إضافة مستخدم
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الاسم</TableHead>
                <TableHead>الدور</TableHead>
                <TableHead>التطبيقات المخصصة</TableHead>
                <TableHead>آخر دخول</TableHead>
                <TableHead>تاريخ الإنشاء</TableHead>
                <TableHead>إجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamUsers.map(u => (
                <TableRow key={u.user_id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{u.display_name}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {u.user_id === user?.id ? (
                      <Badge>{ROLE_LABELS[u.role] || u.role}</Badge>
                    ) : (
                      <Select
                        value={u.role}
                        onValueChange={v => handleChangeRole(u.user_id, v)}
                      >
                        <SelectTrigger className="w-36 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ROLE_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const c = overrideCounts[u.user_id] || { allow: 0, deny: 0 };
                      if (!c.allow && !c.deny) {
                        return <span className="text-xs text-muted-foreground">حسب الدور</span>;
                      }
                      return (
                        <div className="flex gap-1">
                          {c.allow > 0 && (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 text-xs">✓ {c.allow}</Badge>
                          )}
                          {c.deny > 0 && (
                            <Badge className="bg-red-100 text-red-700 border-red-300 text-xs">✗ {c.deny}</Badge>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(u.last_seen_at)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(u.created_at)}
                  </TableCell>
                  <TableCell>
                    {u.user_id !== user?.id && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setAppAccessTarget({ user_id: u.user_id, name: u.display_name })}
                          className="text-xs"
                        >
                          <AppWindow className="h-3.5 w-3.5 ms-1" />
                          إدارة التطبيقات
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleActive(u.user_id, false)}
                          className="text-xs"
                        >
                          تعليق
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {teamUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    لا يوجد مستخدمون بعد
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>

        {/* Roles Tab */}
        <TabsContent value="roles">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-primary rounded-full" />
            الأدوار المتاحة
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(ROLE_LABELS).map(([key, label]) => (
              <div
                key={key}
                className="flex items-start gap-3 p-4 border border-border rounded-xl bg-muted/20"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {ROLE_DESCRIPTIONS[key] || ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Permissions Matrix Tab */}
        <TabsContent value="permissions">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-primary rounded-full" />
            مصفوفة الصلاحيات
          </h3>
          <div className="overflow-x-auto rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="p-3 text-right font-semibold">الدور / الوحدة</th>
                  {MODULES.map(m => (
                    <th key={m.key} className="p-3 text-center font-semibold">{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(ROLE_LABELS).map(([roleKey, roleLabel], ri) => {
                  // Cashier permissions are managed in POS User Management — show redirect
                  if (roleKey === "cashier") {
                    return (
                      <tr key={roleKey} className={ri % 2 === 0 ? "bg-muted/10" : ""}>
                        <td className="p-3 font-medium border-b border-border/50 whitespace-nowrap">{roleLabel}</td>
                        <td colSpan={MODULES.length} className="p-3 border-b border-border/50">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-xs text-muted-foreground">تُدار صلاحيات الكاشير من إدارة مستخدمي نقطة البيع</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs h-7"
                              onClick={() => navigate("/pos-users")}
                            >
                              <ExternalLink className="h-3 w-3" />
                              إدارة مستخدمي POS
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  }
                  return (
                  <tr key={roleKey} className={ri % 2 === 0 ? "bg-muted/10" : ""}>
                    <td className="p-3 font-medium border-b border-border/50 whitespace-nowrap">{roleLabel}</td>
                    {MODULES.map(mod => {
                      const perm = getPermission(roleKey, mod.key);
                      if (!perm) return <td key={mod.key} className="p-3 text-center border-b border-border/50 text-muted-foreground text-xs">—</td>;
                      return (
                        <td key={mod.key} className="p-2 border-b border-border/50">
                          <div className="flex flex-wrap justify-center gap-1">
                            {PERM_LABELS.map(pl => {
                              const val = perm[pl.key as keyof Permission] as boolean;
                              return (
                                <button
                                  key={pl.key}
                                  onClick={() => handlePermissionChange(roleKey, mod.key, pl.key, !val)}
                                  title={pl.label}
                                  className={`w-7 h-7 rounded flex items-center justify-center text-xs transition-colors ${
                                    val
                                      ? "bg-primary/15 text-primary"
                                      : "bg-muted/40 text-muted-foreground/40"
                                  }`}
                                >
                                  <pl.icon className="h-3.5 w-3.5" />
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              {PERM_LABELS.map(pl => (
                <span key={pl.key} className="flex items-center gap-1">
                  <pl.icon className="h-3 w-3" /> {pl.label}
                </span>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Audit Log Tab */}
        <TabsContent value="audit">
          <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
            <span className="w-1 h-5 bg-primary rounded-full" />
            سجل النشاط
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المستخدم</TableHead>
                <TableHead>الإجراء</TableHead>
                <TableHead>الوحدة</TableHead>
                <TableHead>التفاصيل</TableHead>
                <TableHead>التاريخ والوقت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLogs.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium">{log.actor_name || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {actionLabels[log.action] || log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{log.entity_type}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {log.entity_label || (log.details ? JSON.stringify(log.details).slice(0, 60) : "—")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(log.created_at)}
                  </TableCell>
                </TableRow>
              ))}
              {auditLogs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    لا توجد سجلات بعد
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>

      {/* Add User Dialog */}
      <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              إضافة مستخدم جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الاسم الكامل *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="محمد أحمد" />
            </div>
            <div className="space-y-2">
              <Label>البريد الإلكتروني *</Label>
              <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@company.com" dir="ltr" type="email" />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور المؤقتة</Label>
              <div className="flex gap-2">
                <Input value={newPassword} onChange={e => setNewPassword(e.target.value)} dir="ltr" className="font-mono text-sm" />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(newPassword);
                    toast.success("تم النسخ");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => setNewPassword(generatePassword())}
                >
                  🔄
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>الدور *</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).filter(([k]) => k !== "admin").map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[newRole]}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddUser(false)}>إلغاء</Button>
            <Button onClick={handleAddUser} disabled={saving} className="gap-2">
              {saving ? "جارِ الإنشاء..." : "إنشاء الحساب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {appAccessTarget && (
        <UserAppAccessDialog
          open={!!appAccessTarget}
          onOpenChange={(v) => { if (!v) { setAppAccessTarget(null); loadData(); } }}
          targetUserId={appAccessTarget.user_id}
          targetName={appAccessTarget.name}
        />
      )}
    </div>
  );
};

export default UsersSettingsSection;
