import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Eye, EyeOff, Trash2, ChevronDown, ChevronUp, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type AccountType = "accountant" | "hr_manager";

interface TeamAccountManagerProps {
  type: AccountType;
}

import {
  ACCOUNTANT_PERM_GROUPS,
  HR_PERM_GROUPS,
  HR_PRESETS,
} from "@/lib/permissions/permissionCatalog";

// Permission definitions live in the central catalog so every screen
// (add-user dialog, per-user permissions dialog, this manager) stays in sync.
const ACCOUNTANT_PERMS = ACCOUNTANT_PERM_GROUPS;
const HR_PERMS = HR_PERM_GROUPS;

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
  /* POS-audit: separate state (boolean toggle + array of allowed branches).
     Sent to the edge function inside `permissions` alongside the booleans. */
  const [posAudit, setPosAudit] = useState<{ enabled: boolean; branchIds: string[] }>({
    enabled: false,
    branchIds: [],
  });
  const [branchesList, setBranchesList] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (type !== "accountant") return;
    supabase
      .from("branches")
      .select("id, name")
      .order("name")
      .then(({ data }) => setBranchesList((data as any[]) || []));
  }, [type]);

  const permGroups = type === "accountant" ? ACCOUNTANT_PERMS : HR_PERMS;
  const tableName = type === "accountant" ? "accountant_permissions" : "hr_manager_permissions";
  const title = type === "accountant" ? "إدارة المحاسبين" : "إدارة فريق الموارد البشرية";
  const icon = type === "accountant" ? "محاسب" : "فريق";

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
    // Safer defaults for new HR managers: only the basic operational toggles ON.
    const HR_ON_BY_DEFAULT = new Set([
      "can_view_employees", "can_edit_employees",
      "can_view_attendance", "can_manage_attendance",
      "can_view_roster", "can_manage_schedule",
      "can_view_leaves", "can_view_employee_requests", "can_approve_requests",
    ]);
    permGroups.forEach(g => g.items.forEach(i => {
      if (type === "hr_manager") {
        defaults[i.key] = HR_ON_BY_DEFAULT.has(i.key);
      } else {
        defaults[i.key] = !i.key.includes("delete") && !i.key.includes("approve_payroll") && !i.key.includes("manage_hr_settings");
      }
    }));
    setPerms(defaults);
  };

  const applyPreset = (preset: typeof HR_PRESETS[number]) => {
    const next: Record<string, boolean> = {};
    permGroups.forEach(g => g.items.forEach(i => {
      next[i.key] = preset.keys.includes(i.key);
    }));
    setPerms(next);
    toast.success(`تم تطبيق: ${preset.label}`);
  };

  const applyPresetToMember = async (member: any, preset: typeof HR_PRESETS[number]) => {
    const update: Record<string, boolean> = {};
    permGroups.forEach(g => g.items.forEach(i => {
      update[i.key] = preset.keys.includes(i.key);
    }));
    const { error } = await supabase
      .from(tableName as any)
      .update(update as any)
      .eq("id", member.id);
    if (error) { toast.error("فشل تطبيق القالب"); return; }
    toast.success(`تم تطبيق: ${preset.label}`);
    loadMembers();
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
          permissions: type === "accountant"
            ? {
                ...perms,
                can_audit_pos_shifts: posAudit.enabled,
                pos_allowed_branch_ids: posAudit.enabled ? posAudit.branchIds : [],
              }
            : perms,
        },
      });

      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "فشل الإنشاء");
        return;
      }

      toast.success(data.message);
      setShowForm(false);
      setForm({ full_name: "", email: "", password: "", role: type === "accountant" ? "accountant_senior" : "hr_manager" });
      setPosAudit({ enabled: false, branchIds: [] });
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

  const updatePerm = async (member: any, key: string, value: boolean) => {
    const { error } = await supabase
      .from(tableName as any)
      .update({ [key]: value } as any)
      .eq("id", member.id);
    if (error) {
      toast.error("فشل تحديث الصلاحية");
      return;
    }
    toast.success(value ? "تم تفعيل الصلاحية" : "تم إلغاء الصلاحية");
    loadMembers();
  };

  /** Persist POS-audit changes (toggle + branch list) for an existing member. */
  const updatePosAudit = async (
    member: any,
    patch: Partial<{ enabled: boolean; branchIds: string[] }>,
  ) => {
    const nextEnabled = patch.enabled ?? !!member.can_audit_pos_shifts;
    const nextBranches = patch.branchIds ?? (member.pos_allowed_branch_ids || []);
    const { error } = await supabase
      .from(tableName as any)
      .update({
        can_audit_pos_shifts: nextEnabled,
        // Clearing the toggle wipes the branch restriction so we don't keep stale data.
        pos_allowed_branch_ids: nextEnabled ? nextBranches : [],
      } as any)
      .eq("id", member.id);
    if (error) { toast.error("فشل تحديث صلاحية تدقيق POS"); return; }
    toast.success("تم الحفظ");
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
            {type === "hr_manager" && (
              <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <span className="text-xs text-muted-foreground self-center ml-2">قوالب جاهزة:</span>
                {HR_PRESETS.map(p => (
                  <Button key={p.id} type="button" size="sm" variant="outline" onClick={() => applyPreset(p)}>
                    {p.label}
                  </Button>
                ))}
              </div>
            )}
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
            {type === "accountant" && (
              <POSAuditPanel
                enabled={posAudit.enabled}
                branchIds={posAudit.branchIds}
                allBranches={branchesList}
                onChange={(next) => setPosAudit(next)}
              />
            )}
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button size="sm" onClick={handleCreate} disabled={creating}>
              {creating ? "جارِ الإنشاء..." : "إنشاء الحساب"}
            </Button>
          </div>
        </div>
      )}

      {/* Members List */}
      {loading ? (
        <p className="text-sm text-muted-foreground">جارِ التحميل...</p>
      ) : members.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-2xl mb-2">{type === "accountant" ? "محاسب" : "فريق"}</p>
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
                  <p className="text-xs font-semibold text-muted-foreground mb-3">الصلاحيات (التغييرات تُحفظ تلقائياً)</p>
                  {type === "hr_manager" && (
                    <div className="flex flex-wrap gap-2 mb-3 p-2 rounded-lg bg-primary/5 border border-primary/20">
                      <span className="text-xs text-muted-foreground self-center ml-2">تطبيق قالب:</span>
                      {HR_PRESETS.map(p => (
                        <Button key={p.id} size="sm" variant="outline" onClick={() => applyPresetToMember(m, p)}>
                          {p.label}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {permGroups.map(group => (
                      <div key={group.group} className="border border-border rounded-lg p-3 space-y-2 bg-card">
                        <p className="text-xs font-semibold text-muted-foreground">{group.group}</p>
                        {group.items.map(item => (
                          <div key={item.key} className="flex items-center justify-between">
                            <span className="text-sm">{item.label}</span>
                            <Switch
                              checked={!!m[item.key]}
                              onCheckedChange={(v) => updatePerm(m, item.key, v)}
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  {type === "accountant" && (
                    <div className="mt-3">
                      <POSAuditPanel
                        enabled={!!m.can_audit_pos_shifts}
                        branchIds={(m.pos_allowed_branch_ids as string[]) || []}
                        allBranches={branchesList}
                        onChange={(next) =>
                          updatePosAudit(m, { enabled: next.enabled, branchIds: next.branchIds })
                        }
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── POS audit sub-panel ──
   Boolean master toggle + multi-select of branches whose monetary figures
   the accountant is allowed to see. Empty list = all branches visible. */
function POSAuditPanel({
  enabled,
  branchIds,
  allBranches,
  onChange,
}: {
  enabled: boolean;
  branchIds: string[];
  allBranches: { id: string; name: string }[];
  onChange: (next: { enabled: boolean; branchIds: string[] }) => void;
}) {
  const toggleBranch = (id: string) => {
    const set = new Set(branchIds);
    set.has(id) ? set.delete(id) : set.add(id);
    onChange({ enabled, branchIds: Array.from(set) });
  };

  return (
    <div className="border border-primary/30 rounded-lg p-3 bg-primary/5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Store className="h-3.5 w-3.5" /> تدقيق نقطة البيع (عرض فقط)
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            يتيح للمحاسب فتح بطاقة «تدقيق نقطة البيع» لمراجعة الورديات والمبيعات والمدفوعات بدون تعديل أو تصدير.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => onChange({ enabled: v, branchIds })}
        />
      </div>
      {enabled && (
        <div className="space-y-2 border-t border-primary/20 pt-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium text-muted-foreground">
              الفروع المسموح للمحاسب رؤية أرقامها
              <span className="mr-1 text-[10px]">
                ({branchIds.length === 0 ? "كل الفروع" : `${branchIds.length} فرع`})
              </span>
            </p>
            {branchIds.length > 0 && (
              <button
                type="button"
                onClick={() => onChange({ enabled, branchIds: [] })}
                className="text-[10px] text-muted-foreground hover:text-foreground underline"
              >
                إلغاء التقييد (كل الفروع)
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug">
            الفروع غير المحددة ستظهر بالاسم فقط، مع إخفاء جميع الأرقام لحماية بيانات الفروع الأخرى.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-40 overflow-auto pr-1">
            {allBranches.length === 0 ? (
              <p className="col-span-full text-[11px] text-muted-foreground">لا توجد فروع معرّفة بعد.</p>
            ) : (
              allBranches.map(b => {
                const checked = branchIds.includes(b.id);
                return (
                  <label
                    key={b.id}
                    className={
                      "flex items-center gap-2 px-2 py-1 rounded border text-[12px] cursor-pointer " +
                      (checked
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground")
                    }
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={checked}
                      onChange={() => toggleBranch(b.id)}
                    />
                    <span className="truncate">{b.name}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
