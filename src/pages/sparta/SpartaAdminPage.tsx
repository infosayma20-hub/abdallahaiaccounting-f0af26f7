import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSpartaContext } from "@/hooks/sparta/useSpartaContext";
import {
  SpartaPageHeader,
  SpartaSurface,
  SpartaKpiCard,
  SpartaKpiGrid,
  SpartaPill,
} from "@/components/sparta/SpartaUI";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Plus, Save, RefreshCw } from "lucide-react";

type Member = {
  id: string;
  holding_id: string;
  auth_user_id: string;
  role: string;
  created_at: string;
};

type Holding = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  presentation_currency: string;
};

type Subsidiary = {
  id: string;
  holding_id: string;
  owner_id: string;
  display_name_ar: string;
  sector: string | null;
  sort_order: number;
  is_active: boolean;
};

type AuditRow = {
  id: string;
  actor: string | null;
  action: string;
  entity: string | null;
  details: any;
  created_at: string;
};

const ROLES = [
  { value: "holding_admin", label: "مسؤول قابضة" },
  { value: "holding_viewer", label: "مشاهد" },
];

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleString("ar", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return s;
  }
}

async function logAction(holdingId: string, action: string, entity: string, details: any) {
  try {
    const { data: userRes } = await supabase.auth.getUser();
    await supabase.from("sparta_audit_log").insert({
      holding_id: holdingId,
      actor: userRes?.user?.id ?? null,
      action,
      entity,
      details,
    });
  } catch {
    // non-blocking
  }
}

export default function SpartaAdminPage() {
  const { companyId, ownerUserId, isAdmin, loading } = useSpartaContext();

  if (loading) {
    return (
      <div className="sparta-app" dir="rtl" style={{ padding: 24, fontFamily: "'Cairo', sans-serif" }}>
        جارٍ التحميل...
      </div>
    );
  }

  if (!isAdmin || !companyId) {
    return (
      <div className="sparta-app" dir="rtl" style={{ padding: 24, fontFamily: "'Cairo', sans-serif" }}>
        <SpartaPageHeader
          eyebrow="§ 12 · إدارة النظام"
          title="لا تملك صلاحية الوصول لإدارة النظام"
        />
        <p style={{ color: "#6B7280", marginTop: 12 }}>
          هذه الصفحة متاحة لمسؤولي القابضة فقط.
        </p>
      </div>
    );
  }

  return <AdminPageBody companyId={companyId} ownerUserId={ownerUserId} />;
}

function AdminPageBody({ companyId, ownerUserId }: { companyId: string; ownerUserId: string | null }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [holding, setHolding] = useState<Holding | null>(null);
  const [subs, setSubs] = useState<Subsidiary[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [m, h, s, a] = await Promise.all([
        supabase
          .from("holding_members")
          .select("id,holding_id,auth_user_id,role,created_at")
          .eq("holding_id", companyId)
          .order("created_at", { ascending: false }),
        supabase
          .from("holdings")
          .select("id,slug,name_ar,name_en,logo_url,primary_color,secondary_color,presentation_currency")
          .eq("id", companyId)
          .maybeSingle(),
        supabase
          .from("holding_companies")
          .select("id,holding_id,owner_id,display_name_ar,sector,sort_order,is_active")
          .eq("holding_id", companyId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("sparta_audit_log")
          .select("id,actor,action,entity,details,created_at")
          .eq("holding_id", companyId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (cancelled) return;
      setMembers((m.data as Member[]) || []);
      setHolding((h.data as Holding) || null);
      setSubs((s.data as Subsidiary[]) || []);
      setAudit((a.data as AuditRow[]) || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, refreshKey]);

  return (
    <div
      className="sparta-app"
      dir="rtl"
      style={{ padding: 24, fontFamily: "'Cairo', sans-serif", minHeight: "100dvh", background: "#FFFFFF" }}
    >
      <SpartaPageHeader
        eyebrow="§ 12 · إدارة النظام"
        title="إدارة النظام"
        actions={
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCw className="ms-2 h-4 w-4" /> تحديث
          </Button>
        }
      />

      <SpartaKpiGrid>
        <SpartaKpiCard label="المستخدمون" value={members.length} sub="أعضاء القابضة" />
        <SpartaKpiCard
          label="الشركات التابعة"
          value={subs.filter((x) => x.is_active).length}
          sub={`من أصل ${subs.length}`}
        />
        <SpartaKpiCard
          label="عملة العرض"
          value={holding?.presentation_currency || "—"}
          sub="موحّدة للقابضة"
        />
      </SpartaKpiGrid>

      <Tabs defaultValue="members" className="w-full" dir="rtl">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="members">المستخدمون والصلاحيات</TabsTrigger>
          <TabsTrigger value="holding">إعدادات القابضة</TabsTrigger>
          <TabsTrigger value="subs">الشركات التابعة</TabsTrigger>
          <TabsTrigger value="audit">سجل النشاط</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <MembersTab
            companyId={companyId}
            members={members}
            reload={reload}
          />
        </TabsContent>

        <TabsContent value="holding" className="mt-4">
          <HoldingTab holding={holding} companyId={companyId} reload={reload} />
        </TabsContent>

        <TabsContent value="subs" className="mt-4">
          <SubsTab
            companyId={companyId}
            ownerUserId={ownerUserId}
            subs={subs}
            reload={reload}
          />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditTab rows={audit} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ───── Tab 1: Members ───── */
function MembersTab({
  companyId,
  members,
  reload,
}: {
  companyId: string;
  members: Member[];
  reload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState("holding_admin");
  const [saving, setSaving] = useState(false);

  const changeRole = async (m: Member, role: string) => {
    if (role === m.role) return;
    const { error } = await supabase
      .from("holding_members")
      .update({ role })
      .eq("id", m.id);
    if (error) {
      toast.error("فشل تحديث الدور: " + error.message);
      return;
    }
    toast.success("تم تحديث الدور");
    logAction(companyId, "update_member_role", "holding_members", {
      member_id: m.id,
      auth_user_id: m.auth_user_id,
      from: m.role,
      to: role,
    });
    reload();
  };

  const removeMember = async (m: Member) => {
    if (!confirm("هل أنت متأكد من إزالة هذا العضو؟")) return;
    const { error } = await supabase.from("holding_members").delete().eq("id", m.id);
    if (error) {
      toast.error("فشل الإزالة: " + error.message);
      return;
    }
    toast.success("تمت الإزالة");
    logAction(companyId, "delete_member", "holding_members", {
      member_id: m.id,
      auth_user_id: m.auth_user_id,
    });
    reload();
  };

  const addMember = async () => {
    if (!newUserId.trim()) {
      toast.error("أدخل معرّف المستخدم");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("holding_members").insert({
      holding_id: companyId,
      auth_user_id: newUserId.trim(),
      role: newRole,
    });
    setSaving(false);
    if (error) {
      toast.error("فشل الإضافة: " + error.message);
      return;
    }
    toast.success("تمت الإضافة");
    logAction(companyId, "add_member", "holding_members", {
      auth_user_id: newUserId.trim(),
      role: newRole,
    });
    setNewUserId("");
    setNewRole("holding_admin");
    setOpen(false);
    reload();
  };

  return (
    <SpartaSurface>
      <div style={{ display: "flex", justifyContent: "space-between", padding: 12, alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>الأعضاء ({members.length})</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="ms-2 h-4 w-4" /> إضافة عضو
            </Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>إضافة عضو جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>معرّف المستخدم (auth_user_id UUID)</Label>
                <Input
                  dir="ltr"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                />
              </div>
              <div>
                <Label>الدور</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={addMember} disabled={saving}>{saving ? "جارٍ..." : "إضافة"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>معرّف المستخدم</th>
            <th style={th}>الدور</th>
            <th style={th}>أُضيف بتاريخ</th>
            <th style={th}>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {members.length === 0 && (
            <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: "#6B7280" }}>لا يوجد أعضاء</td></tr>
          )}
          {members.map((m) => (
            <tr key={m.id}>
              <td style={{ ...td, direction: "ltr", fontFamily: "monospace", fontSize: 12 }}>{m.auth_user_id}</td>
              <td style={td}>
                <Select value={m.role} onValueChange={(v) => changeRole(m, v)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
              <td style={td}>{fmtDate(m.created_at)}</td>
              <td style={td}>
                <Button variant="outline" size="sm" onClick={() => removeMember(m)}>
                  <Trash2 className="ms-1 h-4 w-4" /> إزالة
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SpartaSurface>
  );
}

/* ───── Tab 2: Holding settings ───── */
function HoldingTab({
  holding,
  companyId,
  reload,
}: {
  holding: Holding | null;
  companyId: string;
  reload: () => void;
}) {
  const [form, setForm] = useState<Holding | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(holding); }, [holding]);

  if (!form) return <div style={{ padding: 24, color: "#6B7280" }}>لا توجد بيانات قابضة.</div>;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("holdings")
      .update({
        name_ar: form.name_ar,
        name_en: form.name_en,
        logo_url: form.logo_url,
        primary_color: form.primary_color,
        secondary_color: form.secondary_color,
        presentation_currency: form.presentation_currency,
      })
      .eq("id", companyId);
    setSaving(false);
    if (error) {
      toast.error("فشل الحفظ: " + error.message);
      return;
    }
    toast.success("تم الحفظ");
    logAction(companyId, "update_holding", "holdings", { id: companyId });
    reload();
  };

  return (
    <SpartaSurface>
      <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        <div>
          <Label>الاسم بالعربي</Label>
          <Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
        </div>
        <div>
          <Label>Name (EN)</Label>
          <Input dir="ltr" value={form.name_en ?? ""} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
        </div>
        <div>
          <Label>عملة العرض</Label>
          <Input dir="ltr" value={form.presentation_currency} onChange={(e) => setForm({ ...form, presentation_currency: e.target.value.toUpperCase() })} />
        </div>
        <div>
          <Label>اللون الأساسي</Label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Input dir="ltr" value={form.primary_color} onChange={(e) => setForm({ ...form, primary_color: e.target.value })} />
            <span style={{ width: 32, height: 32, borderRadius: 6, background: form.primary_color, border: "1px solid #E5E7EB" }} />
          </div>
        </div>
        <div>
          <Label>اللون الثانوي</Label>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Input dir="ltr" value={form.secondary_color} onChange={(e) => setForm({ ...form, secondary_color: e.target.value })} />
            <span style={{ width: 32, height: 32, borderRadius: 6, background: form.secondary_color, border: "1px solid #E5E7EB" }} />
          </div>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <Label>رابط الشعار</Label>
          <Input dir="ltr" value={form.logo_url ?? ""} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} />
        </div>
      </div>
      <div style={{ padding: 16, borderTop: "1px solid #EEF0F3", textAlign: "left" }}>
        <Button onClick={save} disabled={saving}>
          <Save className="ms-2 h-4 w-4" /> {saving ? "جارٍ الحفظ..." : "حفظ"}
        </Button>
      </div>
    </SpartaSurface>
  );
}

/* ───── Tab 3: Subsidiaries ───── */
function SubsTab({
  companyId,
  ownerUserId,
  subs,
  reload,
}: {
  companyId: string;
  ownerUserId: string | null;
  subs: Subsidiary[];
  reload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [nName, setNName] = useState("");
  const [nSector, setNSector] = useState("");
  const [nOrder, setNOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  const updateField = async (s: Subsidiary, patch: Partial<Subsidiary>) => {
    const { error } = await supabase.from("holding_companies").update(patch).eq("id", s.id);
    if (error) {
      toast.error("فشل التحديث: " + error.message);
      return;
    }
    logAction(companyId, "update_subsidiary", "holding_companies", { id: s.id, patch });
    reload();
  };

  const addSub = async () => {
    if (!nName.trim()) {
      toast.error("أدخل اسم الشركة");
      return;
    }
    if (!ownerUserId) {
      toast.error("معرّف المالك غير متوفّر");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("holding_companies").insert({
      holding_id: companyId,
      owner_id: ownerUserId,
      display_name_ar: nName.trim(),
      sector: nSector.trim() || null,
      sort_order: nOrder,
      is_active: true,
    });
    setSaving(false);
    if (error) {
      toast.error("فشل الإضافة: " + error.message);
      return;
    }
    toast.success("تمت الإضافة");
    logAction(companyId, "add_subsidiary", "holding_companies", {
      display_name_ar: nName.trim(),
      sector: nSector.trim() || null,
    });
    setNName(""); setNSector(""); setNOrder(0); setOpen(false);
    reload();
  };

  return (
    <SpartaSurface>
      <div style={{ display: "flex", justifyContent: "space-between", padding: 12, alignItems: "center" }}>
        <div style={{ fontWeight: 700 }}>الشركات التابعة ({subs.length})</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="ms-2 h-4 w-4" /> شركة جديدة</Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>إضافة شركة تابعة</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>الاسم</Label><Input value={nName} onChange={(e) => setNName(e.target.value)} /></div>
              <div><Label>القطاع</Label><Input value={nSector} onChange={(e) => setNSector(e.target.value)} /></div>
              <div><Label>ترتيب العرض</Label><Input type="number" value={nOrder} onChange={(e) => setNOrder(Number(e.target.value) || 0)} /></div>
            </div>
            <DialogFooter>
              <Button onClick={addSub} disabled={saving}>{saving ? "جارٍ..." : "إضافة"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>الاسم</th>
            <th style={th}>القطاع</th>
            <th style={th}>الترتيب</th>
            <th style={th}>نشطة</th>
          </tr>
        </thead>
        <tbody>
          {subs.length === 0 && (
            <tr><td colSpan={4} style={{ padding: 24, textAlign: "center", color: "#6B7280" }}>لا توجد شركات</td></tr>
          )}
          {subs.map((s) => (
            <tr key={s.id}>
              <td style={td}>
                <Input
                  defaultValue={s.display_name_ar}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== s.display_name_ar) updateField(s, { display_name_ar: v });
                  }}
                />
              </td>
              <td style={td}>
                <Input
                  defaultValue={s.sector ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    if (v !== s.sector) updateField(s, { sector: v });
                  }}
                />
              </td>
              <td style={td}>
                <Input
                  type="number"
                  defaultValue={s.sort_order}
                  onBlur={(e) => {
                    const v = Number(e.target.value) || 0;
                    if (v !== s.sort_order) updateField(s, { sort_order: v });
                  }}
                />
              </td>
              <td style={td}>
                <Switch checked={s.is_active} onCheckedChange={(v) => updateField(s, { is_active: v })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SpartaSurface>
  );
}

/* ───── Tab 4: Audit ───── */
function AuditTab({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return (
      <SpartaSurface>
        <div style={{ padding: 32, textAlign: "center", color: "#6B7280" }}>لا يوجد نشاط مسجل بعد</div>
      </SpartaSurface>
    );
  }
  return (
    <SpartaSurface>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>الإجراء</th>
            <th style={th}>الكيان</th>
            <th style={th}>الفاعل</th>
            <th style={th}>التفاصيل</th>
            <th style={th}>الوقت</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td style={td}><SpartaPill>{r.action}</SpartaPill></td>
              <td style={td}>{r.entity ?? "—"}</td>
              <td style={{ ...td, direction: "ltr", fontFamily: "monospace", fontSize: 11 }}>{r.actor ?? "—"}</td>
              <td style={{ ...td, fontSize: 12, color: "#6B7280", direction: "ltr" }}>
                <code>{r.details ? JSON.stringify(r.details) : "—"}</code>
              </td>
              <td style={td}>{fmtDate(r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SpartaSurface>
  );
}

const th: React.CSSProperties = {
  background: "#F5F1F3",
  color: "#867C88",
  borderBottom: "1px solid #EEE3E8",
  padding: "10px 12px",
  textAlign: "right",
  fontWeight: 700,
  fontSize: 13,
};

const td: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #EEF0F3",
  fontSize: 14,
  verticalAlign: "middle",
};