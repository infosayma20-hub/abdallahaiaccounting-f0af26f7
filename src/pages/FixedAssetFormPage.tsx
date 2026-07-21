import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Save, X, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";

interface AssetCategory {
  id: string;
  code: string;
  name_ar: string;
  default_useful_life_years: number | null;
  default_depreciation_method: string;
  default_salvage_rate: number;
}

const METHOD_LABELS: Record<string, string> = {
  straight_line: "القسط الثابت",
  declining_balance: "القسط المتناقص",
  units_of_production: "وحدات الإنتاج",
  none: "بدون استهلاك",
};

const F = "'Segoe UI', 'Segoe UI Web (Arabic)', 'Cairo', -apple-system, system-ui, sans-serif";
const NAVY = "#0D1B2E";

const fmt = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

const emptyForm = () => ({
  name_ar: "", description: "", category_id: "", department: "", location: "",
  custodian_name: "", acquisition_date: new Date().toISOString().split("T")[0],
  in_service_date: "", acquisition_cost: "", additional_costs: "0",
  salvage_value: "", useful_life_years: "", depreciation_method: "straight_line",
  serial_number: "", model: "", manufacturer: "", notes: "",
});

export default function FixedAssetFormPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const editMode = Boolean(id);

  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("asset_categories").select("*").eq("user_id", user.id).order("code")
      .then(({ data }) => setCategories((data || []) as AssetCategory[]));
  }, [user]);

  useEffect(() => {
    if (!editMode || !id || !user) return;
    setLoading(true);
    supabase.from("assets").select("*").eq("id", id).eq("user_id", user.id).maybeSingle()
      .then(({ data, error }) => {
        setLoading(false);
        if (error || !data) { toast.error("تعذر تحميل بيانات الأصل"); navigate("/fixed-assets"); return; }
        setForm({
          name_ar: data.name_ar || "",
          description: data.description || "",
          category_id: data.category_id || "",
          department: data.department || "",
          location: data.location || "",
          custodian_name: data.custodian_name || "",
          acquisition_date: data.acquisition_date,
          in_service_date: data.in_service_date || "",
          acquisition_cost: String(data.acquisition_cost ?? ""),
          additional_costs: String(data.additional_costs ?? "0"),
          salvage_value: String(data.salvage_value ?? "0"),
          useful_life_years: data.useful_life_years ? String(data.useful_life_years) : "",
          depreciation_method: data.depreciation_method || "straight_line",
          serial_number: data.serial_number || "",
          model: data.model || "",
          manufacturer: data.manufacturer || "",
          notes: data.notes || "",
        });
      });
  }, [editMode, id, user, navigate]);

  const handleCategoryChange = (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    setForm((f) => ({
      ...f,
      category_id: catId,
      useful_life_years: cat?.default_useful_life_years?.toString() || f.useful_life_years,
      depreciation_method: cat?.default_depreciation_method || f.depreciation_method,
    }));
  };

  const getNextAssetNumber = async () => {
    const { data } = await supabase.from("assets").select("asset_number").eq("user_id", user!.id);
    const nums = (data || []).map((a: any) => parseInt(String(a.asset_number).replace("AST-", "")) || 0);
    const next = nums.length ? Math.max(...nums) + 1 : 1;
    return `AST-${String(next).padStart(4, "0")}`;
  };

  const handleSave = async () => {
    if (!form.name_ar || !form.acquisition_cost) { toast.error("يرجى ملء الحقول المطلوبة"); return; }
    setSaving(true);
    const acqCost = parseFloat(form.acquisition_cost) || 0;
    const addCosts = parseFloat(form.additional_costs) || 0;
    const salvage = parseFloat(form.salvage_value) || 0;
    const lifeYears = parseInt(form.useful_life_years) || 0;
    const totalCostCalc = acqCost + addCosts;

    const base: any = {
      name_ar: form.name_ar,
      description: form.description || null,
      category_id: form.category_id || null,
      department: form.department || null,
      location: form.location || null,
      custodian_name: form.custodian_name || null,
      acquisition_date: form.acquisition_date,
      in_service_date: form.in_service_date || form.acquisition_date,
      acquisition_cost: acqCost,
      additional_costs: addCosts,
      salvage_value: salvage,
      useful_life_years: lifeYears || null,
      useful_life_months: lifeYears ? lifeYears * 12 : null,
      depreciation_method: form.depreciation_method,
      depreciation_start_date: form.in_service_date || form.acquisition_date,
      cost_ils: totalCostCalc,
      serial_number: form.serial_number || null,
      model: form.model || null,
      manufacturer: form.manufacturer || null,
      notes: form.notes || null,
    };

    if (editMode && id) {
      const { error } = await supabase.from("assets").update(base).eq("id", id);
      setSaving(false);
      if (error) { toast.error("خطأ في التحديث: " + error.message); return; }
      toast.success("تم تحديث الأصل بنجاح");
      navigate("/fixed-assets");
    } else {
      const asset_number = await getNextAssetNumber();
      const { error } = await supabase.from("assets").insert({
        ...base,
        user_id: user!.id,
        asset_number,
        net_book_value: totalCostCalc,
        accumulated_depreciation: 0,
        status: "active",
      });
      setSaving(false);
      if (error) { toast.error("خطأ في الإضافة: " + error.message); return; }
      toast.success("تم إضافة الأصل بنجاح");
      navigate("/fixed-assets");
    }
  };

  const preview = useMemo(() => {
    const cost = (parseFloat(form.acquisition_cost) || 0) + (parseFloat(form.additional_costs) || 0);
    const salvage = parseFloat(form.salvage_value) || 0;
    const years = parseInt(form.useful_life_years) || 0;
    if (!cost || !years || form.depreciation_method === "none") return null;
    const annual = (cost - salvage) / years;
    return { cost, annual, monthly: annual / 12, salvage };
  }, [form]);

  const actionTabs: ActionTab[] = [
    {
      key: "home",
      label: "الرئيسية",
      groups: [
        {
          key: "save",
          label: "الحفظ",
          items: [
            { key: "save", label: editMode ? "حفظ التعديلات" : "إضافة الأصل", icon: Save, onClick: handleSave, variant: "primary", disabled: saving },
            { key: "cancel", label: "إلغاء", icon: X, onClick: () => navigate("/fixed-assets") },
          ],
        },
        {
          key: "nav",
          label: "تنقل",
          items: [
            { key: "back", label: "قائمة الأصول", icon: ArrowRight, onClick: () => navigate("/fixed-assets") },
          ],
        },
      ],
    },
  ];

  return (
    <FinanceShell
      title={editMode ? "تعديل أصل ثابت" : "إضافة أصل ثابت جديد"}
      subtitle={editMode ? "تعديل بيانات الأصل" : "تسجيل أصل جديد في السجل"}
      breadcrumb={[
        { label: "الرئيسية", href: "/" },
        { label: "المحاسبة" },
        { label: "الأصول الثابتة", href: "/fixed-assets" },
        { label: editMode ? "تعديل" : "جديد" },
      ]}
      actionTabs={actionTabs}
    >
      <div style={{ direction: "rtl", textAlign: "right", fontFamily: F }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "#8A8886" }}>جاري التحميل...</div>
        ) : (
          <div style={{ background: "white", border: "1px solid #EDEBE9", borderRadius: 2, padding: 20, maxWidth: 1400, margin: "0 auto" }}>
            <Tabs defaultValue="basic">
              <TabsList className="w-full grid grid-cols-3" dir="rtl">
                <TabsTrigger value="basic">البيانات الأساسية</TabsTrigger>
                <TabsTrigger value="acquisition">بيانات الاقتناء</TabsTrigger>
                <TabsTrigger value="depreciation">الاستهلاك</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="mt-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label>اسم الأصل *</Label>
                    <Input value={form.name_ar} onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))} placeholder="مثال: لابتوب Dell Latitude" />
                  </div>
                  <div>
                    <Label>التصنيف</Label>
                    <Select value={form.category_id} onValueChange={handleCategoryChange}>
                      <SelectTrigger><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                      <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_ar}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>القسم</Label>
                    <Input value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} placeholder="المحاسبة، الإدارة..." />
                  </div>
                  <div>
                    <Label>الموقع</Label>
                    <Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="الطابق الثاني، المخزن..." />
                  </div>
                  <div>
                    <Label>أمين العهدة</Label>
                    <Input value={form.custodian_name} onChange={(e) => setForm((f) => ({ ...f, custodian_name: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>الوصف</Label>
                    <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="acquisition" className="mt-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>تاريخ الاقتناء *</Label>
                    <Input type="date" value={form.acquisition_date} onChange={(e) => setForm((f) => ({ ...f, acquisition_date: e.target.value }))} />
                  </div>
                  <div>
                    <Label>تاريخ بدء الاستخدام</Label>
                    <Input type="date" value={form.in_service_date} onChange={(e) => setForm((f) => ({ ...f, in_service_date: e.target.value }))} />
                  </div>
                  <div>
                    <Label>تكلفة الاقتناء (₪) *</Label>
                    <Input type="number" step="0.01" value={form.acquisition_cost} onChange={(e) => setForm((f) => ({ ...f, acquisition_cost: e.target.value }))} placeholder="0.00" />
                  </div>
                  <div>
                    <Label>تكاليف إضافية (₪)</Label>
                    <Input type="number" step="0.01" value={form.additional_costs} onChange={(e) => setForm((f) => ({ ...f, additional_costs: e.target.value }))} placeholder="0.00" />
                  </div>
                  {(parseFloat(form.acquisition_cost) || 0) > 0 && (
                    <div className="md:col-span-2" style={{ padding: 12, background: "#FAFBFC", border: `1px solid #EDEBE9`, borderRight: `3px solid ${NAVY}`, borderRadius: 2 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "#201F1E" }}>
                        التكلفة الإجمالية: {fmt((parseFloat(form.acquisition_cost) || 0) + (parseFloat(form.additional_costs) || 0))}
                      </p>
                    </div>
                  )}
                  <div>
                    <Label>الرقم التسلسلي</Label>
                    <Input value={form.serial_number} onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))} />
                  </div>
                  <div>
                    <Label>الموديل</Label>
                    <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>الشركة المصنعة</Label>
                    <Input value={form.manufacturer} onChange={(e) => setForm((f) => ({ ...f, manufacturer: e.target.value }))} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="depreciation" className="mt-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>طريقة الاستهلاك</Label>
                    <Select value={form.depreciation_method} onValueChange={(v) => setForm((f) => ({ ...f, depreciation_method: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(METHOD_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>العمر الإنتاجي (سنوات)</Label>
                    <Input type="number" value={form.useful_life_years} onChange={(e) => setForm((f) => ({ ...f, useful_life_years: e.target.value }))} disabled={form.depreciation_method === "none"} />
                  </div>
                  <div>
                    <Label>القيمة التخريدية (₪)</Label>
                    <Input type="number" step="0.01" value={form.salvage_value} onChange={(e) => setForm((f) => ({ ...f, salvage_value: e.target.value }))} disabled={form.depreciation_method === "none"} />
                  </div>
                  {preview && (
                    <div className="md:col-span-2" style={{ padding: 16, background: "#FAFBFC", border: "1px solid #EDEBE9", borderRadius: 2 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#201F1E", marginBottom: 8 }}>معاينة الاستهلاك</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, fontSize: 12 }}>
                        <div><span style={{ color: "#605E5C" }}>الاستهلاك السنوي: </span><b style={{ color: NAVY }}>{fmt(preview.annual)}</b></div>
                        <div><span style={{ color: "#605E5C" }}>الاستهلاك الشهري: </span><b style={{ color: NAVY }}>{fmt(preview.monthly)}</b></div>
                        <div><span style={{ color: "#605E5C" }}>القيمة التخريدية: </span><b>{fmt(preview.salvage)}</b></div>
                      </div>
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <Label>ملاحظات</Label>
                    <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex gap-3 mt-6 pt-4 border-t border-border">
              <Button onClick={handleSave} disabled={saving} className="min-w-[160px]">
                {saving ? "جاري الحفظ..." : (editMode ? "حفظ التعديلات" : "إضافة الأصل")}
              </Button>
              <Button variant="outline" onClick={() => navigate("/fixed-assets")}>إلغاء</Button>
            </div>
          </div>
        )}
      </div>
    </FinanceShell>
  );
}