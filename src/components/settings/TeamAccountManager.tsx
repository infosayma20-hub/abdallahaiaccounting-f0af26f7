import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Eye, EyeOff, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type AccountType = "accountant" | "hr_manager";

interface TeamAccountManagerProps {
  type: AccountType;
}

const ACCOUNTANT_PERMS = [
  { group: "السندات", items: [
    { key: "can_create_receipt", label: "إنشاء سندات قبض" },
    { key: "can_create_payment", label: "إنشاء سندات صرف" },
    { key: "can_create_journal", label: "إنشاء قيود يومية" },
    { key: "can_edit_vouchers", label: "تعديل السندات" },
    { key: "can_delete_vouchers", label: "حذف/إلغاء السندات" },
  ]},
  { group: "الفواتير", items: [
    { key: "can_create_sale_invoice", label: "إنشاء فواتير مبيعات" },
    { key: "can_create_purchase_invoice", label: "إنشاء فواتير مشتريات" },
    { key: "can_edit_invoices", label: "تعديل الفواتير" },
    { key: "can_delete_invoices", label: "حذف/إلغاء الفواتير" },
  ]},
  { group: "جهات الاتصال", items: [
    { key: "can_manage_customers", label: "إدارة الزبائن" },
    { key: "can_manage_suppliers", label: "إدارة الموردين" },
    { key: "can_view_balances", label: "عرض الأرصدة" },
  ]},
  { group: "الحسابات والدفاتر", items: [
    { key: "can_manage_accounts", label: "تعريف/تعديل شجرة الحسابات" },
    { key: "can_view_ledger", label: "عرض دفتر الأستاذ" },
    { key: "can_view_trial_balance", label: "عرض ميزان المراجعة" },
    { key: "can_view_account_statement", label: "عرض كشف حساب" },
  ]},
  { group: "المنتجات والمخزون", items: [
    { key: "can_manage_products", label: "إدارة المنتجات" },
    { key: "can_manage_inventory", label: "إدارة المخزون" },
  ]},
  { group: "الشيكات والبنوك", items: [
    { key: "can_manage_cheques", label: "إدارة الشيكات" },
    { key: "can_manage_banks", label: "إدارة الحسابات البنكية" },
    { key: "can_manage_cash_boxes", label: "إدارة الصناديق" },
  ]},
  { group: "التقارير", items: [
    { key: "can_view_profit_loss", label: "قائمة الدخل" },
    { key: "can_view_balance_sheet", label: "الميزانية العمومية" },
    { key: "can_view_reports", label: "التقارير العامة" },
    { key: "can_export_data", label: "تصدير البيانات" },
  ]},
  { group: "الطلبيات", items: [
    { key: "can_manage_orders", label: "إدارة طلبيات الشراء" },
  ]},
];

const HR_PERMS = [
  { group: "الموظفين", items: [
    { key: "can_add_employees", label: "إضافة موظفين" },
    { key: "can_edit_employees", label: "تعديل بيانات الموظفين" },
    { key: "can_delete_employees", label: "حذف/أرشفة الموظفين" },
    { key: "can_view_salary_info", label: "عرض معلومات الرواتب" },
  ]},
  { group: "الحضور", items: [
    { key: "can_manage_attendance", label: "إدارة الحضور والانصراف" },
    { key: "can_edit_attendance", label: "تعديل سجلات الحضور" },
    { key: "can_manage_branches", label: "إدارة الأفرع" },
  ]},
  { group: "الإجازات", items: [
    { key: "can_approve_leaves", label: "الموافقة على الإجازات" },
    { key: "can_manage_leave_policy", label: "إدارة سياسات الإجازات" },
    { key: "can_manage_holidays", label: "إدارة العطل الرسمية" },
  ]},
  { group: "الرواتب", items: [
    { key: "can_process_payroll", label: "معالجة كشوف الرواتب" },
    { key: "can_approve_payroll", label: "اعتماد الرواتب" },
    { key: "can_manage_deductions", label: "إدارة الخصومات والبدلات" },
    { key: "can_manage_advances", label: "إدارة السلف" },
    { key: "can_manage_loans", label: "إدارة القروض" },
  ]},
  { group: "الطلبات", items: [
    { key: "can_approve_requests", label: "الموافقة/رفض طلبات الموظفين" },
    { key: "can_manage_forms", label: "إدارة نماذج الطلبات" },
  ]},
  { group: "التقارير والإعدادات", items: [
    { key: "can_view_hr_reports", label: "عرض تقارير HR" },
    { key: "can_export_hr_data", label: "تصدير بيانات HR" },
    { key: "can_manage_hr_settings", label: "تعديل إعدادات الرواتب" },
  ]},
];

const ROLE_OPTIONS = {
  accountant: [
    { value: "accountant_senior", label: "محاسب أول (كامل الصلاحيات)" },
    { value: "accountant_sales", label: "محاسب مبيعات" },
    { value: "accountant_purchases", label: "محاسب مشتريات" },
  ],
  hr_manager: [
    { value: "hr_manager", label: "مدير موارد بشرية" },
  ],
};

export default function TeamAccountManager({ type }: TeamAccountManagerProps) {
  const { user } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    role: type === "accountant" ? "accountant_senior" : "hr_manager",
  });
  const [perms, setPerms] = useState<Record<string, boolean>>({});

  const permGroups = type === "accountant" ? ACCOUNTANT_PERMS : HR_PERMS;
  const tableName = type === "accountant" ? "accountant_permissions" : "hr_manager_permissions";
  const title = type === "accountant" ? "إدارة المحاسبين" : "إدارة فريق الموارد البشرية";
  const icon = type === "accountant" ? "🧮" : "👥";

  useEffect(() => {
    if (user) loadMembers();
  }, [user]);

  const loadMembers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from(tableName as any)
      .select("*")
      .order("created_at", { ascending: false });
    setMembers(data || []);
    setLoading(false);
  };

  const initPerms = () => {
    const defaults: Record<string, boolean> = {};
    // Safer defaults: salary/payroll/loans/advances/deductions/exports OFF by default for HR managers.
    const HR_OFF_BY_DEFAULT = new Set([
      "can_delete_employees",
      "can_view_salary_info",
      "can_process_payroll",
      "can_approve_payroll",
      "can_manage_deductions",
      "can_manage_advances",
      "can_manage_loans",
      "can_manage_hr_settings",
      "can_export_hr_data",
      "can_manage_leave_policy",
      "can_manage_holidays",
    ]);
    permGroups.forEach(g => g.items.forEach(i => {
      if (type === "hr_manager") {
        defaults[i.key] = !HR_OFF_BY_DEFAULT.has(i.key);
      } else {
        defaults[i.key] = !i.key.includes("delete") && !i.key.includes("approve_payroll") && !i.key.includes("manage_hr_settings");
      }
    }));
    setPerms(defaults);
  };

  const handleCreate = async () => {
    if (!form.full_name || !form.email || !form.password) {
      toast.error("يرجى تعبئة جميع الحقول");
      return;
    }
    if (form.password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-team-account", {
        body: {
          full_name: form.full_name,
          email: form.email,
          password: form.password,
          role: form.role,
          permissions: perms,
        },
      });

      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "فشل الإنشاء");
        return;
      }

      toast.success(data.message);
      setShowForm(false);
      setForm({ full_name: "", email: "", password: "", role: type === "accountant" ? "accountant_senior" : "hr_manager" });
      loadMembers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (member: any) => {
    const newStatus = !member.is_active;
    await supabase
      .from(tableName as any)
      .update({ is_active: newStatus } as any)
      .eq("id", member.id);
    toast.success(newStatus ? "تم تفعيل الحساب" : "تم تعطيل الحساب");
    loadMembers();
  };

  return (
    <div>
      <Separator className="my-6" />
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <span className="w-1 h-5 bg-primary rounded-full" />
          {icon} {title}
        </h3>
        <Button
          size="sm"
          onClick={() => { setShowForm(!showForm); if (!showForm) initPerms(); }}
          className="gap-2"
        >
          <UserPlus className="h-4 w-4" />
          إضافة {type === "accountant" ? "محاسب" : "مدير HR"}
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="border border-border rounded-xl p-4 mb-4 bg-muted/20 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>الاسم الكامل</Label>
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="مثال: أحمد محمد" />
            </div>
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="example@company.com" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="6 أحرف على الأقل"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {ROLE_OPTIONS[type].length > 1 && (
              <div className="space-y-2">
                <Label>نوع الحساب</Label>
                <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS[type].map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Permissions */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm text-foreground">الصلاحيات</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {permGroups.map(group => (
                <div key={group.group} className="border border-border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">{group.group}</p>
                  {group.items.map(item => (
                    <div key={item.key} className="flex items-center justify-between">
                      <span className="text-sm">{item.label}</span>
                      <Switch
                        checked={perms[item.key] ?? false}
                        onCheckedChange={v => setPerms(p => ({ ...p, [item.key]: v }))}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button size="sm" onClick={handleCreate} disabled={creating}>
              {creating ? "جارِ الإنشاء..." : "✅ إنشاء الحساب"}
            </Button>
          </div>
        </div>
      )}

      {/* Members List */}
      {loading ? (
        <p className="text-sm text-muted-foreground">جارِ التحميل...</p>
      ) : members.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-2xl mb-2">{type === "accountant" ? "🧮" : "👥"}</p>
          <p className="text-sm">لم يتم إضافة {type === "accountant" ? "محاسبين" : "مديري HR"} بعد</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((m: any) => (
            <div key={m.id} className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between p-3 bg-card">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {m.full_name?.[0]}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{m.full_name}</p>
                    <p className="text-xs text-muted-foreground" dir="ltr">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.is_active ? "default" : "secondary"}>
                    {m.is_active ? "نشط" : "معطل"}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => toggleActive(m)}>
                    {m.is_active ? "تعطيل" : "تفعيل"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                  >
                    {expandedId === m.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {expandedId === m.id && (
                <div className="p-3 bg-muted/20 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">الصلاحيات</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                    {permGroups.flatMap(g => g.items).map(item => (
                      <div key={item.key} className="flex items-center gap-1.5 text-xs">
                        <span className={m[item.key] ? "text-green-600" : "text-red-400"}>
                          {m[item.key] ? "✅" : "❌"}
                        </span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
