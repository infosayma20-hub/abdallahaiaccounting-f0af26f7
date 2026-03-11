import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Users, ShieldCheck, Pencil, Trash2,
  Smartphone, LockKeyhole, UnlockKeyhole, Search, Loader2,
  Monitor, CheckCircle2, Mail, KeyRound, UserPlus,
  DoorOpen, DoorClosed, Percent, Eye, PencilLine,
  Ban, RotateCcw, ClipboardList, UserCheck, FileText,
  Package, FilePen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import BackButton from "@/components/BackButton";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";

interface POSUserRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  company_id: string;
  employee_id: string | null;
  has_account: boolean;
  auth_user_id: string | null;
  account_status: string | null;
}

interface POSDevice {
  id: string;
  device_name: string;
  device_fingerprint: string;
  is_active: boolean;
  last_seen_at: string | null;
  branch_id: string | null;
}

interface Permission {
  can_open_register: boolean;
  can_close_register: boolean;
  can_apply_discount: boolean;
  max_discount_percent: number;
  can_view_profits: boolean;
  can_edit_prices: boolean;
  can_void_sales: boolean;
  can_refund: boolean;
  can_view_shift_details: boolean;
  can_view_invoice_history: boolean;
  can_edit_invoices: boolean;
  require_manager_for_invoices: boolean;
  require_manager_approval: boolean;
  manage_products_categories: boolean;
  view_invoice_log: boolean;
  edit_cancel_invoices: boolean;
}

const DEFAULT_PERMS: Permission = {
  can_open_register: true,
  can_close_register: true,
  can_apply_discount: false,
  max_discount_percent: 0,
  can_view_profits: false,
  can_edit_prices: false,
  can_void_sales: false,
  can_refund: false,
  can_view_shift_details: false,
  can_view_invoice_history: true,
  can_edit_invoices: false,
  require_manager_for_invoices: true,
  require_manager_approval: true,
  manage_products_categories: false,
  view_invoice_log: false,
  edit_cancel_invoices: false,
};

const ROLE_LABELS: Record<string, string> = {
  pos_admin: "مدير POS",
  pos_manager: "مشرف",
  cashier: "كاشير",
  viewer: "مشاهد",
};

const ROLE_COLORS: Record<string, string> = {
  pos_admin: "bg-red-500/20 text-red-400",
  pos_manager: "bg-amber-500/20 text-amber-400",
  cashier: "bg-emerald-500/20 text-emerald-400",
  viewer: "bg-slate-500/20 text-slate-400",
};

export default function POSUserManagementPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("users");
  const [users, setUsers] = useState<POSUserRow[]>([]);
  const [devices, setDevices] = useState<POSDevice[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Add/Edit user dialog
  const [showUserDialog, setShowUserDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<POSUserRow | null>(null);
  const [userForm, setUserForm] = useState({
    name: "", phone: "", email: "", role: "cashier",
  });
  const [createAccount, setCreateAccount] = useState(false);
  const [accountPassword, setAccountPassword] = useState("");
  const [accountConfirmPassword, setAccountConfirmPassword] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [userPerms, setUserPerms] = useState<Permission>(DEFAULT_PERMS);
  const [assignedDevices, setAssignedDevices] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingUser, setDeletingUser] = useState<POSUserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Device dialog
  const [showDeviceDialog, setShowDeviceDialog] = useState(false);
  const [deviceForm, setDeviceForm] = useState({ device_name: "" });
  const [currentFingerprint, setCurrentFingerprint] = useState("");

  useEffect(() => {
    loadCompanies();
    getDeviceFingerprint().then(setCurrentFingerprint);
  }, []);

  useEffect(() => {
    if (selectedCompany) {
      loadData();
    }
  }, [selectedCompany]);

  const loadCompanies = async () => {
    const { data } = await supabase.from("pos_companies").select("id, name").eq("user_id", user?.id);
    setCompanies(data || []);
    if (data && data.length > 0) {
      setSelectedCompany(data[0].id);
    }
    setLoading(false);
  };

  const loadData = async () => {
    setLoading(true);
    const [usersRes, devicesRes] = await Promise.all([
      supabase.from("pos_users").select("*").eq("company_id", selectedCompany),
      supabase.from("pos_devices").select("*").eq("company_id", selectedCompany),
    ]);
    setUsers(usersRes.data || []);
    setDevices(devicesRes.data || []);
    setLoading(false);
  };

  const openAddUser = () => {
    setEditingUser(null);
    setUserForm({ name: "", phone: "", email: "", role: "cashier" });
    setUserPerms(DEFAULT_PERMS);
    setAssignedDevices([]);
    setCreateAccount(true); // Always create account by default
    setAccountPassword("");
    setAccountConfirmPassword("");
    setShowUserDialog(true);
  };

  const openEditUser = async (u: POSUserRow) => {
    setEditingUser(u);
    setUserForm({ name: u.name, phone: u.phone || "", email: u.email || "", role: u.role });

    // Load permissions
    const { data: perms } = await supabase.from("pos_user_permissions").select("*").eq("pos_user_id", u.id).single();
    setUserPerms(perms ? {
      can_open_register: perms.can_open_register,
      can_close_register: perms.can_close_register,
      can_apply_discount: perms.can_apply_discount,
      max_discount_percent: perms.max_discount_percent,
      can_view_profits: perms.can_view_profits,
      can_edit_prices: perms.can_edit_prices,
      can_void_sales: perms.can_void_sales,
      can_refund: perms.can_refund,
      can_view_shift_details: perms.can_view_shift_details,
      can_view_invoice_history: perms.can_view_invoice_history ?? true,
      can_edit_invoices: perms.can_edit_invoices ?? false,
      require_manager_for_invoices: perms.require_manager_for_invoices ?? true,
      require_manager_approval: perms.require_manager_approval,
      manage_products_categories: (perms as any).manage_products_categories ?? false,
      view_invoice_log: (perms as any).view_invoice_log ?? false,
      edit_cancel_invoices: (perms as any).edit_cancel_invoices ?? false,
    } : DEFAULT_PERMS);

    // Load device access
    const { data: access } = await supabase.from("pos_user_device_access").select("device_id").eq("pos_user_id", u.id).eq("can_login", true);
    setAssignedDevices((access || []).map(a => a.device_id));

    setShowUserDialog(true);
  };

  const handleSaveUser = async () => {
    if (!userForm.name.trim()) { toast.error("أدخل اسم الموظف"); return; }
    if (!userForm.email) { toast.error("البريد الإلكتروني مطلوب"); return; }

    // Validate account creation fields for new users
    if (!editingUser) {
      if (!accountPassword || accountPassword.length < 6) { toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
      if (accountPassword !== accountConfirmPassword) { toast.error("كلمة المرور غير متطابقة"); return; }
    }

    setSaving(true);
    try {
      if (editingUser) {
        const updates: Record<string, unknown> = {
          name: userForm.name, phone: userForm.phone || null, email: userForm.email || null, role: userForm.role,
        };

        await supabase.from("pos_users").update(updates).eq("id", editingUser.id);

        await supabase.from("pos_user_permissions").upsert({
          user_id: user!.id,
          pos_user_id: editingUser.id,
          company_id: selectedCompany,
          ...userPerms,
        }, { onConflict: "pos_user_id" });

        await supabase.from("pos_user_device_access").delete().eq("pos_user_id", editingUser.id);
        if (assignedDevices.length > 0) {
          await supabase.from("pos_user_device_access").insert(
            assignedDevices.map(did => ({
              user_id: user!.id, pos_user_id: editingUser.id, device_id: did, can_login: true,
            }))
          );
        }

        toast.success("تم تحديث المستخدم");
      } else {
        const tempId = crypto.randomUUID();

        const { data: newUser, error: insertErr } = await supabase.from("pos_users").insert({
          id: tempId,
          user_id: user!.id,
          company_id: selectedCompany,
          name: userForm.name,
          phone: userForm.phone || null,
          email: userForm.email || null,
          role: userForm.role,
          pin_hash: "no-pin", // Placeholder - PIN system removed
          created_by: user!.id,
        }).select("id").single();

        if (insertErr) throw insertErr;

        await supabase.from("pos_user_permissions").insert({
          user_id: user!.id,
          pos_user_id: newUser.id,
          company_id: selectedCompany,
          ...userPerms,
        });

        if (assignedDevices.length > 0) {
          await supabase.from("pos_user_device_access").insert(
            assignedDevices.map(did => ({
              user_id: user!.id, pos_user_id: newUser.id, device_id: did, can_login: true,
            }))
          );
        }

        // Always create auth account for the employee
        try {
          const { data: acctData, error: acctErr } = await supabase.functions.invoke("create-pos-employee-account", {
            body: { pos_user_id: newUser.id, email: userForm.email, password: accountPassword },
          });
          if (acctErr) throw acctErr;
          if (acctData?.error) toast.error("تم إنشاء الموظف لكن فشل الحساب: " + acctData.error);
          else toast.success("تم إنشاء الموظف والحساب بنجاح ✅");
        } catch {
          toast.success("تم إنشاء الموظف لكن فشل إنشاء الحساب");
        }
      }

      setShowUserDialog(false);
      loadData();
    } catch (e: any) {
      toast.error(e.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  const toggleUserActive = async (u: POSUserRow) => {
    await supabase.from("pos_users").update({ is_active: !u.is_active }).eq("id", u.id);
    toast.success(u.is_active ? "تم تعطيل المستخدم" : "تم تفعيل المستخدم");
    loadData();
  };


  const handleCreateAccountForUser = async (u: POSUserRow) => {
    if (!u.email) { toast.error("يجب إدخال بريد إلكتروني أولاً"); return; }
    const password = prompt("أدخل كلمة مرور للموظف (6 أحرف على الأقل):");
    if (!password || password.length < 6) { toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
    
    setCreatingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-pos-employee-account", {
        body: { pos_user_id: u.id, email: u.email, password },
      });
      if (error) throw error;
      if (data.error) { toast.error(data.error); return; }
      toast.success(data.message || "تم إنشاء الحساب بنجاح");
      loadData();
    } catch (e: any) {
      toast.error(e.message || "فشل إنشاء الحساب");
    } finally {
      setCreatingAccount(false);
    }
  };

  const confirmDeleteUser = (u: POSUserRow) => {
    setDeletingUser(u);
    setShowDeleteDialog(true);
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setDeleting(true);
    try {
      // Delete related data first
      await supabase.from("pos_user_device_access").delete().eq("pos_user_id", deletingUser.id);
      await supabase.from("pos_user_permissions").delete().eq("pos_user_id", deletingUser.id);
      // Delete audit logs using rpc or ignore if table doesn't exist
      await (supabase as any).from("pos_audit_logs").delete().eq("pos_user_id", deletingUser.id);

      const { error } = await supabase.from("pos_users").delete().eq("id", deletingUser.id);
      if (error) throw error;

      toast.success(`تم حذف ${deletingUser.name} بنجاح`);
      setShowDeleteDialog(false);
      setDeletingUser(null);
      loadData();
    } catch (e: any) {
      toast.error(e.message || "فشل حذف الموظف");
    } finally {
      setDeleting(false);
    }
  };

  const registerCurrentDevice = async () => {
    if (!deviceForm.device_name.trim()) { toast.error("أدخل اسم الجهاز"); return; }
    setSaving(true);
    try {
      // Check if device already exists
      const { data: existing } = await supabase
        .from("pos_devices")
        .select("id")
        .eq("device_fingerprint", currentFingerprint)
        .eq("company_id", selectedCompany)
        .single();

      if (existing) {
        toast.success("الجهاز مسجل مسبقاً");
      } else {
        const { error: devErr } = await supabase.from("pos_devices").insert({
          user_id: user!.id,
          company_id: selectedCompany,
          device_name: deviceForm.device_name,
          device_fingerprint: currentFingerprint,
          last_seen_at: new Date().toISOString(),
        });
        if (devErr) throw devErr;
        toast.success("تم تسجيل الجهاز بنجاح");
      }
      setShowDeviceDialog(false);
      setDeviceForm({ device_name: "" });
      loadData();
    } catch (e: any) {
      toast.error("فشل تسجيل الجهاز");
    } finally {
      setSaving(false);
    }
  };

  const toggleDeviceActive = async (d: POSDevice) => {
    await supabase.from("pos_devices").update({ is_active: !d.is_active }).eq("id", d.id);
    toast.success(d.is_active ? "تم تعطيل الجهاز" : "تم تفعيل الجهاز");
    loadData();
  };

  const filteredUsers = users.filter(u => u.name.includes(search) || u.phone?.includes(search) || u.email?.includes(search));

  const permConfig: Record<string, { label: string; icon: React.ReactNode }> = {
    can_open_register: { label: "فتح الوردية", icon: <DoorOpen className="w-4 h-4" /> },
    can_close_register: { label: "إغلاق الوردية", icon: <DoorClosed className="w-4 h-4" /> },
    can_apply_discount: { label: "تطبيق خصم", icon: <Percent className="w-4 h-4" /> },
    can_view_profits: { label: "مشاهدة الأرباح", icon: <Eye className="w-4 h-4" /> },
    can_edit_prices: { label: "تعديل الأسعار", icon: <PencilLine className="w-4 h-4" /> },
    can_void_sales: { label: "إلغاء عمليات بيع", icon: <Ban className="w-4 h-4" /> },
    can_refund: { label: "استرجاع", icon: <RotateCcw className="w-4 h-4" /> },
    can_view_shift_details: { label: "مشاهدة تفاصيل الوردية", icon: <ClipboardList className="w-4 h-4" /> },
    can_view_invoice_history: { label: "رؤية سجل الفواتير", icon: <FileText className="w-4 h-4" /> },
    can_edit_invoices: { label: "تعديل وإلغاء الفواتير", icon: <PencilLine className="w-4 h-4" /> },
    require_manager_for_invoices: { label: "تعديل الفواتير بموافقة مدير", icon: <UserCheck className="w-4 h-4" /> },
    require_manager_approval: { label: "يتطلب موافقة مدير", icon: <UserCheck className="w-4 h-4" /> },
    manage_products_categories: { label: "تعريف منتجات وتصنيفات", icon: <Package className="w-4 h-4" /> },
    view_invoice_log: { label: "الاطلاع على سجل الفواتير", icon: <FileText className="w-4 h-4" /> },
    edit_cancel_invoices: { label: "تعديل الفواتير وإلغائها من سجل الفواتير", icon: <FilePen className="w-4 h-4" /> },
  };

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold text-foreground">إدارة مستخدمي نقاط البيع</h1>
            <p className="text-muted-foreground text-sm">إدارة الكاشيرات والصلاحيات والأجهزة</p>
          </div>
        </div>
        {companies.length > 1 && (
          <Select value={selectedCompany} onValueChange={setSelectedCompany}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="users" className="flex items-center gap-2"><Users className="w-4 h-4" /> المستخدمون</TabsTrigger>
          <TabsTrigger value="devices" className="flex items-center gap-2"><Monitor className="w-4 h-4" /> الأجهزة</TabsTrigger>
        </TabsList>

        {/* ═══ USERS TAB ═══ */}
        <TabsContent value="users" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Button onClick={openAddUser} className="gap-2"><Plus className="w-4 h-4" /> إضافة موظف</Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : filteredUsers.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">لا يوجد مستخدمون. أضف أول موظف POS.</CardContent></Card>
          ) : (
            <div className="grid gap-3">
              {filteredUsers.map(u => {
                return (
                  <Card key={u.id} className={`${!u.is_active ? "opacity-60" : ""}`}>
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                        {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full rounded-full object-cover" /> : u.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold truncate">{u.name}</h3>
                          <Badge className={`text-xs ${ROLE_COLORS[u.role] || "bg-muted"}`}>{ROLE_LABELS[u.role] || u.role}</Badge>
                          {!u.is_active && <Badge variant="secondary" className="text-xs">معطل</Badge>}
                          {u.has_account && u.account_status === "active" && (
                            <Badge className="text-xs bg-emerald-500/20 text-emerald-600 gap-1"><CheckCircle2 className="w-3 h-3" />حساب مفعّل</Badge>
                          )}
                          {u.account_status === "invited" && (
                            <Badge className="text-xs bg-amber-500/20 text-amber-600 gap-1"><Mail className="w-3 h-3" />دعوة مُرسلة</Badge>
                          )}
                          {(!u.has_account || u.account_status === "none") && (
                            <Badge variant="outline" className="text-xs gap-1"><KeyRound className="w-3 h-3" />بدون حساب</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {u.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{u.email}</span>}
                          {u.phone && <span className="mr-2">{u.phone}</span>}
                          {u.last_login_at && ` • آخر دخول: ${new Date(u.last_login_at).toLocaleDateString("ar")}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!u.has_account && u.email && (
                          <Button variant="ghost" size="icon" onClick={() => handleCreateAccountForUser(u)} title="إنشاء حساب كامل" disabled={creatingAccount}>
                            <UserPlus className="w-4 h-4 text-primary" />
                          </Button>
                        )}
                         <Button variant="ghost" size="icon" onClick={() => openEditUser(u)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => toggleUserActive(u)}>
                          {u.is_active ? <LockKeyhole className="w-4 h-4 text-muted-foreground" /> : <UnlockKeyhole className="w-4 h-4 text-emerald-500" />}
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => confirmDeleteUser(u)} title="حذف الموظف">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══ DEVICES TAB ═══ */}
        <TabsContent value="devices" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <Button onClick={() => setShowDeviceDialog(true)} className="gap-2"><Plus className="w-4 h-4" /> تسجيل هذا الجهاز</Button>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">بصمة الجهاز الحالي</CardTitle></CardHeader>
            <CardContent>
              <code className="text-xs break-all bg-muted p-2 rounded block">{currentFingerprint}</code>
            </CardContent>
          </Card>

          {devices.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">لا توجد أجهزة مسجلة</CardContent></Card>
          ) : (
            <div className="grid gap-3">
              {devices.map(d => (
                <Card key={d.id} className={!d.is_active ? "opacity-60" : ""}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Monitor className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold">{d.device_name}</h3>
                      <p className="text-xs text-muted-foreground font-mono truncate">{d.device_fingerprint.substring(0, 20)}...</p>
                      {d.last_seen_at && (
                        <p className="text-xs text-muted-foreground">آخر اتصال: {new Date(d.last_seen_at).toLocaleString("en-US")}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {d.device_fingerprint === currentFingerprint && (
                        <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">هذا الجهاز</Badge>
                      )}
                       <Button variant="ghost" size="icon" onClick={() => toggleDeviceActive(d)}>
                         {d.is_active ? <LockKeyhole className="w-4 h-4 text-muted-foreground" /> : <UnlockKeyhole className="w-4 h-4 text-emerald-500" />}
                       </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══ ADD/EDIT USER DIALOG ═══ */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingUser ? "تعديل موظف POS" : "إضافة موظف POS جديد"}</DialogTitle>
            <DialogDescription>أدخل بيانات الموظف وحدد صلاحياته والأجهزة المسموح له الدخول منها</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>الاسم *</Label>
                <Input value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الموظف" />
              </div>
              <div>
                <Label>الهاتف</Label>
                <Input value={userForm.phone} onChange={e => setUserForm(f => ({ ...f, phone: e.target.value }))} placeholder="0599..." />
              </div>
              <div>
                <Label>البريد الإلكتروني *</Label>
                <Input value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} type="email" placeholder="user@example.com" />
              </div>
              <div>
                <Label>الدور</Label>
                <Select value={userForm.role} onValueChange={v => setUserForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pos_admin">مدير POS</SelectItem>
                    <SelectItem value="pos_manager">مشرف</SelectItem>
                    <SelectItem value="cashier">كاشير</SelectItem>
                    <SelectItem value="viewer">مشاهد</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Password Section - only for new users */}
            {!editingUser && (
              <div className="border border-primary/30 rounded-lg p-4 space-y-3 bg-primary/5">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">بيانات الدخول</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  سيتم إنشاء حساب للموظف يتيح له الدخول ببريده وكلمة مروره إلى نقطة البيع
                </p>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <Label>كلمة المرور *</Label>
                    <Input
                      type="password"
                      value={accountPassword}
                      onChange={e => setAccountPassword(e.target.value)}
                      placeholder="6 أحرف على الأقل"
                    />
                  </div>
                  <div>
                    <Label>تأكيد كلمة المرور *</Label>
                    <Input
                      type="password"
                      value={accountConfirmPassword}
                      onChange={e => setAccountConfirmPassword(e.target.value)}
                      placeholder="أعد إدخال كلمة المرور"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Show account status for existing users */}
            {editingUser && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <h3 className="font-semibold mb-2 flex items-center gap-2"><KeyRound className="w-4 h-4" /> حالة الحساب</h3>
                {editingUser.has_account ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm">حساب كامل مفعّل</span>
                    {editingUser.email && <span className="text-xs text-muted-foreground">({editingUser.email})</span>}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">بدون حساب</span>
                    </div>
                    {editingUser.email && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCreateAccountForUser(editingUser)}
                        disabled={creatingAccount}
                        className="gap-1"
                      >
                        <UserPlus className="w-3 h-3" />
                        إنشاء حساب
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Permissions */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> الصلاحيات</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.keys(userPerms) as (keyof Permission)[]).filter(k => k !== "max_discount_percent").map(key => (
                  <div key={key} className="flex items-center justify-between p-3 rounded-xl border border-border bg-card">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{permConfig[key]?.icon}</span>
                      <Label className="text-sm cursor-pointer">{permConfig[key]?.label || key}</Label>
                    </div>
                    <Switch
                      checked={userPerms[key] as boolean}
                      onCheckedChange={v => setUserPerms(p => ({ ...p, [key]: v }))}
                    />
                  </div>
                ))}
                {userPerms.can_apply_discount && (
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50 col-span-2">
                    <Label className="text-sm whitespace-nowrap">الحد الأقصى للخصم %</Label>
                    <Input
                      type="number" min={0} max={100} className="w-24"
                      value={userPerms.max_discount_percent}
                      onChange={e => setUserPerms(p => ({ ...p, max_discount_percent: Number(e.target.value) }))}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Device Assignment */}
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Smartphone className="w-4 h-4" /> الأجهزة المسموح بها</h3>
              {devices.filter(d => d.is_active).length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد أجهزة مسجلة. سجل جهازاً أولاً من تبويب الأجهزة.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {devices.filter(d => d.is_active).map(d => (
                    <div
                      key={d.id}
                      onClick={() => setAssignedDevices(prev =>
                        prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id]
                      )}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                        ${assignedDevices.includes(d.id) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
                        ${assignedDevices.includes(d.id) ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                        {assignedDevices.includes(d.id) && <CheckCircle2 className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{d.device_name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{d.device_fingerprint.substring(0, 12)}...</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserDialog(false)}>إلغاء</Button>
            <Button onClick={handleSaveUser} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              {editingUser ? "حفظ التعديلات" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ REGISTER DEVICE DIALOG ═══ */}
      <Dialog open={showDeviceDialog} onOpenChange={setShowDeviceDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تسجيل هذا الجهاز</DialogTitle>
            <DialogDescription>سيتم تسجيل بصمة هذا الجهاز لربطه بنظام نقاط البيع</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم الجهاز</Label>
              <Input value={deviceForm.device_name} onChange={e => setDeviceForm({ device_name: e.target.value })} placeholder="مثال: كاشير 1 - الطابق الأرضي" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">بصمة الجهاز</Label>
              <code className="text-xs break-all bg-muted p-2 rounded block mt-1">{currentFingerprint.substring(0, 32)}...</code>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeviceDialog(false)}>إلغاء</Button>
            <Button onClick={registerCurrentDevice} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              تسجيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ DELETE CONFIRMATION DIALOG ═══ */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="w-5 h-5" /> حذف موظف POS
            </DialogTitle>
            <DialogDescription>
              هل أنت متأكد من حذف <strong>{deletingUser?.name}</strong> وجميع بياناته؟
              <br />
              سيتم حذف: الصلاحيات، سجلات الأجهزة، وسجلات التدقيق.
              {deletingUser?.has_account && (
                <span className="block mt-2 text-amber-600 font-medium">
                  ⚠️ ملاحظة: حساب الدخول (Auth) لن يُحذف، فقط سجل الموظف من POS.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end mt-4">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : <Trash2 className="w-4 h-4 ml-2" />}
              حذف نهائي
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
