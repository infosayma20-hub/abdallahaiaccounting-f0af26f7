import { useState, useEffect } from "react";
import PageHeader from "@/components/layout/PageHeader";
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
  Package, FilePen, ShoppingCart, CreditCard, Printer,
  Send, PackageSearch, UserRoundPlus, UsersRound, BarChart3,
  Download, Wallet, Receipt, ShoppingBag, Truck, FolderPlus, PackagePlus, Tags,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import BackButton from "@/components/BackButton";
import { getDeviceFingerprint } from "@/lib/device-fingerprint";
import { multiWordMatchAny } from "@/lib/utils";

interface POSUserRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
  is_call_center: boolean;
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
  // Group 1 - Shift
  can_open_register: boolean;
  can_close_register: boolean;
  can_view_shift_details: boolean;
  can_view_profits: boolean;
  // Group 2 - Sales
  can_apply_discount: boolean;
  max_discount_percent: number;
  can_edit_prices: boolean;
  can_void_sales: boolean;
  can_refund: boolean;
  allow_credit_sale: boolean;
  open_cash_drawer: boolean;
  can_remove_cart_items: boolean;
  // Group 3 - Invoices
  can_view_invoice_history: boolean;
  can_edit_invoices: boolean;
  can_cancel_invoices: boolean;
  require_manager_for_invoices: boolean;
  print_invoices: boolean;
  resend_invoice: boolean;
  // Group 4 - Products
  manage_products_categories: boolean;
  edit_products: boolean;
  delete_products: boolean;
  view_inventory: boolean;
  // Group 5 - Customers
  add_customer: boolean;
  view_customers: boolean;
  edit_customers: boolean;
  // Group 6 - Reports
  view_sales_report: boolean;
  export_reports: boolean;
  // Group 7 - Financial Operations
  can_add_inventory: boolean;
  can_create_product: boolean;
  can_record_purchases: boolean;
  can_pay_purchases_cash: boolean;
  can_create_supplier: boolean;
  can_affect_inventory_on_purchase: boolean;
  can_record_expenses: boolean;
  can_create_expense_category: boolean;
}

const DEFAULT_PERMS: Permission = {
  can_open_register: true,
  can_close_register: true,
  can_view_shift_details: false,
  can_view_profits: false,
  can_apply_discount: true,
  max_discount_percent: 100,
  can_edit_prices: true,
  can_void_sales: true,
  can_refund: true,
  allow_credit_sale: true,
  open_cash_drawer: false,
  can_remove_cart_items: true,
  can_view_invoice_history: true,
  can_edit_invoices: true,
  can_cancel_invoices: false,
  require_manager_for_invoices: false,
  print_invoices: true,
  resend_invoice: false,
  manage_products_categories: false,
  edit_products: false,
  delete_products: false,
  view_inventory: false,
  add_customer: true,
  view_customers: false,
  edit_customers: false,
  view_sales_report: false,
  export_reports: false,
  can_add_inventory: false,
  can_create_product: false,
  can_record_purchases: false,
  can_pay_purchases_cash: false,
  can_create_supplier: false,
  can_affect_inventory_on_purchase: false,
  can_record_expenses: false,
  can_create_expense_category: false,
};

const ROLE_LABELS: Record<string, string> = {
  pos_admin: "مدير POS",
  pos_manager: "مشرف",
  cashier: "كاشير",
  call_center: "كول سنتر",
  viewer: "مشاهد",
};

const ROLE_COLORS: Record<string, string> = {
  pos_admin: "bg-red-500/20 text-red-400",
  pos_manager: "bg-amber-500/20 text-amber-400",
  cashier: "bg-emerald-500/20 text-emerald-400",
  call_center: "bg-orange-500/20 text-orange-400",
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
  const [bulkCreating, setBulkCreating] = useState(false);

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
    getDeviceFingerprint()
      .then(setCurrentFingerprint)
      .catch((err) => {
        console.warn("[POSUserManagement] getDeviceFingerprint failed:", err);
        setCurrentFingerprint("");
      });
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
    const effectiveRole = u.is_call_center ? "call_center" : u.role;
    setUserForm({ name: u.name, phone: u.phone || "", email: u.email || "", role: effectiveRole });

    // Load permissions
    const { data: perms } = await supabase.from("pos_user_permissions").select("*").eq("pos_user_id", u.id).single();
    setUserPerms(perms ? {
      can_open_register: perms.can_open_register,
      can_close_register: perms.can_close_register,
      can_view_shift_details: perms.can_view_shift_details,
      can_view_profits: perms.can_view_profits,
      can_apply_discount: perms.can_apply_discount,
      max_discount_percent: perms.max_discount_percent,
      can_edit_prices: perms.can_edit_prices,
      can_void_sales: perms.can_void_sales,
      can_refund: perms.can_refund,
      allow_credit_sale: (perms as any).allow_credit_sale ?? false,
      open_cash_drawer: (perms as any).open_cash_drawer ?? false,
      can_view_invoice_history: perms.can_view_invoice_history ?? true,
      can_edit_invoices: perms.can_edit_invoices ?? false,
      can_cancel_invoices: (perms as any).can_cancel_invoices ?? true,
      require_manager_for_invoices: perms.require_manager_for_invoices ?? true,
      print_invoices: (perms as any).print_invoices ?? false,
      resend_invoice: (perms as any).resend_invoice ?? false,
      manage_products_categories: (perms as any).manage_products_categories ?? false,
      edit_products: (perms as any).edit_products ?? false,
      delete_products: (perms as any).delete_products ?? false,
      view_inventory: (perms as any).view_inventory ?? false,
      add_customer: (perms as any).add_customer ?? false,
      view_customers: (perms as any).view_customers ?? false,
      edit_customers: (perms as any).edit_customers ?? false,
      view_sales_report: (perms as any).view_sales_report ?? false,
      export_reports: (perms as any).export_reports ?? false,
      can_add_inventory: (perms as any).can_add_inventory ?? false,
      can_create_product: (perms as any).can_create_product ?? false,
      can_record_purchases: (perms as any).can_record_purchases ?? false,
      can_pay_purchases_cash: (perms as any).can_pay_purchases_cash ?? false,
      can_create_supplier: (perms as any).can_create_supplier ?? false,
      can_affect_inventory_on_purchase: (perms as any).can_affect_inventory_on_purchase ?? false,
      can_record_expenses: (perms as any).can_record_expenses ?? false,
      can_create_expense_category: (perms as any).can_create_expense_category ?? false,
      can_remove_cart_items: (perms as any).can_remove_cart_items ?? true,
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
      if (!accountPassword || accountPassword.length < 3) { toast.error("كلمة المرور يجب أن تكون 3 أحرف على الأقل"); return; }
      if (accountPassword !== accountConfirmPassword) { toast.error("كلمة المرور غير متطابقة"); return; }
    }

    setSaving(true);
    try {
      if (editingUser) {
        const isCC = userForm.role === "call_center";
        const updates: Record<string, unknown> = {
          name: userForm.name, phone: userForm.phone || null, email: userForm.email || null,
          role: isCC ? "cashier" : userForm.role,
          is_call_center: isCC,
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

        // Ensure the cashier role exists in user_roles (preserves employee role)
        try {
          await supabase.functions.invoke("sync-pos-user-role", {
            body: { pos_user_id: editingUser.id },
          });
        } catch {
          // Non-fatal: pos_users updated successfully even if role sync fails
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
          role: userForm.role === "call_center" ? "cashier" : userForm.role,
          is_call_center: userForm.role === "call_center",
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
            body: {
              pos_user_id: newUser.id,
              email: userForm.email,
              password: accountPassword,
              pos_role: userForm.role === "call_center" ? "cashier" : userForm.role,
            },
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
  const handleBulkCreateCashiers = async () => {
    if (!user) return;
    setBulkCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("غير مسجل الدخول");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bulk-create-cashiers`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prefix: "malakybroast",
            count: 50,
            password: "123456",
          }),
        }
      );
      const result = await res.json();
      if (result.success) {
        toast.success(result.message);
        loadData();
      } else {
        toast.error(result.error || "فشل الإنشاء");
      }
    } catch (err: any) {
      toast.error(err.message || "خطأ غير متوقع");
    }
    setBulkCreating(false);
  };


  const handleCreateAccountForUser = async (u: POSUserRow) => {
    if (!u.email) { toast.error("يجب إدخال بريد إلكتروني أولاً"); return; }
    const password = prompt("أدخل كلمة مرور للموظف (3 أحرف على الأقل):");
    if (!password || password.length < 3) { toast.error("كلمة المرور يجب أن تكون 3 أحرف على الأقل"); return; }
    
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

  // Permission groups configuration
  type PermGroup = {
    title: string;
    icon: React.ReactNode;
    items: { key: keyof Permission; label: string; icon: React.ReactNode; dependsOn?: keyof Permission; dependsLabel?: string }[];
  };

  const permGroups: PermGroup[] = [
    {
      title: "الوردية",
      icon: <DoorOpen className="w-4 h-4" />,
      items: [
        { key: "can_open_register", label: "فتح الوردية", icon: <DoorOpen className="w-4 h-4" /> },
        { key: "can_close_register", label: "إغلاق الوردية", icon: <DoorClosed className="w-4 h-4" /> },
        { key: "can_view_shift_details", label: "مشاهدة تفاصيل الوردية", icon: <ClipboardList className="w-4 h-4" /> },
        { key: "can_view_profits", label: "مشاهدة الأرباح", icon: <Eye className="w-4 h-4" /> },
      ],
    },
    {
      title: "عمليات البيع",
      icon: <ShoppingCart className="w-4 h-4" />,
      items: [
        { key: "can_apply_discount", label: "تطبيق خصم", icon: <Percent className="w-4 h-4" /> },
        { key: "can_edit_prices", label: "تعديل الأسعار", icon: <PencilLine className="w-4 h-4" /> },
        { key: "can_void_sales", label: "إلغاء عمليات بيع", icon: <Ban className="w-4 h-4" /> },
        { key: "can_refund", label: "استرجاع", icon: <RotateCcw className="w-4 h-4" /> },
        { key: "allow_credit_sale", label: "الدفع المؤجل / الدين", icon: <CreditCard className="w-4 h-4" /> },
        { key: "open_cash_drawer", label: "فتح درج الكاش", icon: <Wallet className="w-4 h-4" /> },
        { key: "can_remove_cart_items", label: "حذف أصناف من السلة", icon: <Ban className="w-4 h-4" /> },
      ],
    },
    {
      title: "الفواتير",
      icon: <FileText className="w-4 h-4" />,
      items: [
        { key: "can_view_invoice_history", label: "رؤية سجل الفواتير", icon: <FileText className="w-4 h-4" /> },
        { key: "can_edit_invoices", label: "تعديل الفواتير (استدعاء)", icon: <FilePen className="w-4 h-4" />, dependsOn: "can_view_invoice_history", dependsLabel: "رؤية سجل الفواتير" },
        { key: "can_cancel_invoices", label: "إلغاء الفواتير", icon: <Ban className="w-4 h-4" />, dependsOn: "can_view_invoice_history", dependsLabel: "رؤية سجل الفواتير" },
        { key: "require_manager_for_invoices", label: "تعديل الفواتير بموافقة مدير", icon: <UserCheck className="w-4 h-4" />, dependsOn: "can_edit_invoices", dependsLabel: "تعديل الفواتير" },
        { key: "print_invoices", label: "طباعة الفواتير", icon: <Printer className="w-4 h-4" /> },
        { key: "resend_invoice", label: "إعادة إرسال الفاتورة", icon: <Send className="w-4 h-4" /> },
      ],
    },
    {
      title: "المنتجات والمخزون",
      icon: <Package className="w-4 h-4" />,
      items: [
        { key: "manage_products_categories", label: "تعريف منتجات وتصنيفات", icon: <Package className="w-4 h-4" /> },
        { key: "edit_products", label: "تعديل المنتجات", icon: <PencilLine className="w-4 h-4" /> },
        { key: "delete_products", label: "حذف المنتجات", icon: <Trash2 className="w-4 h-4" />, dependsOn: "manage_products_categories", dependsLabel: "تعريف منتجات وتصنيفات" },
        { key: "view_inventory", label: "مشاهدة المخزون", icon: <PackageSearch className="w-4 h-4" /> },
      ],
    },
    {
      title: "الزبائن",
      icon: <UsersRound className="w-4 h-4" />,
      items: [
        { key: "add_customer", label: "إضافة زبون جديد", icon: <UserRoundPlus className="w-4 h-4" /> },
        { key: "view_customers", label: "مشاهدة بيانات الزبائن", icon: <UsersRound className="w-4 h-4" /> },
        { key: "edit_customers", label: "تعديل بيانات الزبائن", icon: <PencilLine className="w-4 h-4" />, dependsOn: "view_customers", dependsLabel: "مشاهدة بيانات الزبائن" },
      ],
    },
    {
      title: "التقارير",
      icon: <BarChart3 className="w-4 h-4" />,
      items: [
        { key: "view_sales_report", label: "مشاهدة تقرير المبيعات", icon: <BarChart3 className="w-4 h-4" /> },
        { key: "export_reports", label: "تصدير التقارير", icon: <Download className="w-4 h-4" />, dependsOn: "view_sales_report", dependsLabel: "مشاهدة تقرير المبيعات" },
      ],
    },
    {
      title: "العمليات المالية",
      icon: <Receipt className="w-4 h-4" />,
      items: [
        { key: "can_add_inventory", label: "إدخال بضاعة للمخزون", icon: <PackagePlus className="w-4 h-4" /> },
        { key: "can_create_product", label: "تعريف منتج جديد", icon: <FolderPlus className="w-4 h-4" />, dependsOn: "can_add_inventory", dependsLabel: "إدخال بضاعة للمخزون" },
        { key: "can_record_purchases", label: "تسجيل مشتريات", icon: <ShoppingBag className="w-4 h-4" /> },
        { key: "can_pay_purchases_cash", label: "دفع مشتريات نقداً من الصندوق", icon: <Wallet className="w-4 h-4" />, dependsOn: "can_record_purchases", dependsLabel: "تسجيل مشتريات" },
        { key: "can_create_supplier", label: "تعريف مورد جديد", icon: <Truck className="w-4 h-4" />, dependsOn: "can_record_purchases", dependsLabel: "تسجيل مشتريات" },
        { key: "can_affect_inventory_on_purchase", label: "ربط المشتريات بالمخزون", icon: <Package className="w-4 h-4" />, dependsOn: "can_record_purchases", dependsLabel: "تسجيل مشتريات" },
        { key: "can_record_expenses", label: "صرف مصاريف", icon: <Receipt className="w-4 h-4" /> },
        { key: "can_create_expense_category", label: "تعريف نوع مصروف جديد", icon: <Tags className="w-4 h-4" />, dependsOn: "can_record_expenses", dependsLabel: "صرف مصاريف" },
      ],
    },
  ];

  const handlePermToggle = (key: keyof Permission, value: boolean) => {
    setUserPerms(prev => {
      const next = { ...prev, [key]: value };
      // Auto-disable dependents when parent is turned off
      if (!value) {
        permGroups.forEach(g => g.items.forEach(item => {
          if (item.dependsOn === key) {
            (next as any)[item.key] = false;
          }
        }));
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <PageHeader title="إدارة مستخدمي نقاط البيع" breadcrumb={["نقطة البيع", "إدارة المستخدمين"]} />
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
        <TabsList className="grid grid-cols-2 w-full max-w-md mr-auto">
          <TabsTrigger value="users" className="flex items-center gap-2"><Users className="w-4 h-4" /> المستخدمون</TabsTrigger>
          <TabsTrigger value="devices" className="flex items-center gap-2"><Monitor className="w-4 h-4" /> الأجهزة</TabsTrigger>
        </TabsList>

        {/* ═══ USERS TAB ═══ */}
        <TabsContent value="users" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <Button onClick={openAddUser} className="gap-2"><Plus className="w-4 h-4" /> إضافة موظف</Button>
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : filteredUsers.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">لا يوجد مستخدمون. أضف أول موظف POS.</CardContent></Card>
          ) : (
            <div className="rounded-2xl border border-border/50 overflow-hidden shadow-sm">
              <div className="overflow-x-auto" dir="rtl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-primary text-primary-foreground">
                      <th className="px-3 py-3 text-right text-xs font-semibold w-10">#</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold">الاسم</th>
                      
                      
                      <th className="px-3 py-3 text-right text-xs font-semibold">الدور</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold">الحالة</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold">الحساب</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold">آخر دخول</th>
                      <th className="px-3 py-3 text-center text-xs font-semibold w-16">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u, i) => (
                      <tr
                        key={u.id}
                        className={`border-b border-border/50 transition-colors ${
                          !u.is_active ? "opacity-60" : ""
                        } ${i % 2 === 0 ? "bg-background" : "bg-muted/20"} hover:bg-primary/5`}
                      >
                        <td className="px-3 py-3 text-xs text-muted-foreground text-right">{i + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                              {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full rounded-full object-cover" /> : u.name[0]}
                            </div>
                            <span className="font-semibold text-sm truncate max-w-[180px]">{u.name}</span>
                          </div>
                        </td>
                        
                        
                        <td className="px-3 py-3">
                          <Badge className={`text-[10px] ${ROLE_COLORS[u.is_call_center ? "call_center" : u.role] || "bg-muted"}`}>{ROLE_LABELS[u.is_call_center ? "call_center" : u.role] || u.role}</Badge>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {u.is_active ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />نشط
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />معطل
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {u.has_account && u.account_status === "active" && (
                            <Badge className="text-[10px] bg-emerald-500/20 text-emerald-600 gap-1"><CheckCircle2 className="w-3 h-3" />مفعّل</Badge>
                          )}
                          {u.account_status === "invited" && (
                            <Badge className="text-[10px] bg-amber-500/20 text-amber-600 gap-1"><Mail className="w-3 h-3" />دعوة</Badge>
                          )}
                          {(!u.has_account || u.account_status === "none") && (
                            <Badge variant="outline" className="text-[10px] gap-1"><KeyRound className="w-3 h-3" />بدون</Badge>
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString("en-GB") : "—"}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1.5 rounded-lg hover:bg-muted transition-colors mx-auto block">
                                <MoreVertical className="w-4 h-4 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {!u.has_account && u.email && (
                                <DropdownMenuItem onClick={() => handleCreateAccountForUser(u)} disabled={creatingAccount} className="gap-2">
                                  <UserPlus className="w-4 h-4 text-primary" /> إنشاء حساب
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => openEditUser(u)} className="gap-2">
                                <Pencil className="w-4 h-4 text-primary" /> تعديل
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => toggleUserActive(u)} className="gap-2">
                                {u.is_active ? <><LockKeyhole className="w-4 h-4 text-muted-foreground" /> تعطيل</> : <><UnlockKeyhole className="w-4 h-4 text-emerald-500" /> تفعيل</>}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => confirmDeleteUser(u)} className="gap-2 text-destructive focus:text-destructive">
                                <Trash2 className="w-4 h-4" /> حذف
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-primary/5 border-t-2 border-primary/20 font-bold text-sm">
                      <td colSpan={3} className="px-3 py-3 text-right text-foreground">المجموع: {filteredUsers.length} موظف</td>
                      <td className="px-3 py-3 text-xs text-center text-foreground">{filteredUsers.filter(u => u.is_active).length} نشط</td>
                      <td className="px-3 py-3 text-xs text-center text-foreground">{filteredUsers.filter(u => u.has_account).length} حساب</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
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
                    <SelectItem value="call_center">كول سنتر</SelectItem>
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
                      placeholder="3 أحرف على الأقل"
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

            {/* Permissions - Grouped */}
            <div className="space-y-5">
              <h3 className="font-bold text-base flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> الصلاحيات</h3>
              {permGroups.map((group, gi) => (
                <div key={gi} className="space-y-3">
                  <div className="flex items-center gap-2 pb-1 border-b border-border">
                    <span className="text-primary">{group.icon}</span>
                    <span className="font-bold text-sm">{group.title}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {group.items.map(item => {
                      const isDependencyMet = item.dependsOn ? (userPerms[item.dependsOn] as boolean) : true;
                      const isDisabled = !isDependencyMet;
                      return (
                        <div
                          key={item.key}
                          className={`flex items-center justify-between py-3 px-4 rounded-xl border border-border bg-card ${isDisabled ? "opacity-50" : ""}`}
                          title={isDisabled ? `يتطلب تفعيل: ${item.dependsLabel}` : undefined}
                        >
                          <div className="flex items-center gap-3 flex-row-reverse flex-1 min-w-0">
                            <span className="text-muted-foreground shrink-0">{item.icon}</span>
                            <Label className="text-sm cursor-pointer truncate">{item.label}</Label>
                            {isDisabled && (
                              <span className="text-[10px] text-destructive whitespace-nowrap">يتطلب: {item.dependsLabel}</span>
                            )}
                          </div>
                          <Switch
                            checked={userPerms[item.key] as boolean}
                            onCheckedChange={v => handlePermToggle(item.key, v)}
                            disabled={isDisabled}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {/* Max discount input */}
                  {group.title === "عمليات البيع" && userPerms.can_apply_discount && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Label className="text-sm whitespace-nowrap">الحد الأقصى للخصم %</Label>
                      <Input
                        type="number" min={0} max={100} className="w-24"
                        value={userPerms.max_discount_percent}
                        onChange={e => setUserPerms(p => ({ ...p, max_discount_percent: Number(e.target.value) }))}
                      />
                    </div>
                  )}
                </div>
              ))}
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
