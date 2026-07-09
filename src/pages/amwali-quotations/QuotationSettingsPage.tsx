import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAmwaliCatalog, useAmwaliSettings, AMWALI_KEYS } from "@/hooks/useAmwaliQuotations";
import { AmwaliPricingType, PRICING_TYPE_LABEL } from "@/lib/amwali-quotations/calc";

const QuotationSettingsPage = () => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: settings } = useAmwaliSettings();
  const { data: catalog = [] } = useAmwaliCatalog();

  const [s, setS] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => { if (settings) setS(settings); }, [settings]);
  useEffect(() => { setItems(catalog as any[]); }, [catalog]);

  if (!s) return <div className="p-8 text-center text-muted-foreground" dir="rtl">جاري التحميل...</div>;

  const updateS = (k: string, v: any) => setS((prev: any) => ({ ...prev, [k]: v }));
  const updateItem = (id: string, patch: any) => setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id: string) => setItems((arr) => arr.filter((it) => it.id !== id));
  const addItem = () =>
    setItems((arr) => [...arr, { id: crypto.randomUUID(), _new: true, code: `CUSTOM_${Date.now()}`, name: "بند جديد", description: "", pricing_type: "fixed", onetime_price: 0, annual_price: 0, default_qty: 1, sort_order: (arr.at(-1)?.sort_order ?? 0) + 10, active: true }]);

  const saveSettings = async () => {
    const { id: _sid, created_at: _c, updated_at: _u, ...payload } = s;
    const { error } = await supabase.from("amwali_quotation_settings").update(payload).eq("singleton", true);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: AMWALI_KEYS.settings });
    toast.success("تم حفظ إعدادات القالب");
  };

  const saveCatalog = async () => {
    // Delete removed
    const currentIds = new Set(items.filter((i) => !i._new).map((i) => i.id));
    const deletedIds = (catalog as any[]).filter((c) => !currentIds.has(c.id)).map((c) => c.id);
    if (deletedIds.length) await supabase.from("amwali_quotation_catalog_items").delete().in("id", deletedIds);
    // Upsert
    for (const it of items) {
      const payload = {
        code: it.code, name: it.name, description: it.description || "",
        pricing_type: it.pricing_type, onetime_price: Number(it.onetime_price) || 0,
        annual_price: Number(it.annual_price) || 0, default_qty: Number(it.default_qty) || 0,
        sort_order: Number(it.sort_order) || 0, active: !!it.active,
      };
      if (it._new) {
        const { error } = await supabase.from("amwali_quotation_catalog_items").insert(payload);
        if (error) { toast.error(error.message); return; }
      } else {
        const { error } = await supabase.from("amwali_quotation_catalog_items").update(payload).eq("id", it.id);
        if (error) { toast.error(error.message); return; }
      }
    }
    qc.invalidateQueries({ queryKey: AMWALI_KEYS.catalog });
    toast.success("تم حفظ بنود الكاتالوج");
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100">
      <div className="sticky top-0 z-40 border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => nav("/amwali-quotations")}><ArrowRight className="ml-1 h-4 w-4" /> رجوع</Button>
          <div className="flex-1 font-bold text-[#0D1B2E]">إعدادات قالب عروض أسعار أموالي</div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 p-4">
        {/* Template basics */}
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-3 flex items-center">
            <div className="font-bold text-[#0D1B2E]">القالب الافتراضي</div>
            <Button size="sm" className="mr-auto" onClick={saveSettings}><Save className="ml-1 h-4 w-4" /> حفظ الإعدادات</Button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div>
              <Label>العملة الافتراضية</Label>
              <Select value={s.currency} onValueChange={(v) => updateS("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">دولار أمريكي (USD)</SelectItem>
                  <SelectItem value="ILS">شيكل إسرائيلي (ILS)</SelectItem>
                  <SelectItem value="JOD">دينار أردني (JOD)</SelectItem>
                  <SelectItem value="EUR">يورو (EUR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>مدة الصلاحية (بالأيام)</Label><Input type="number" min={1} value={s.validity_days} onChange={(e) => updateS("validity_days", Number(e.target.value))} /></div>
            <div><Label>نسبة الضريبة %</Label><Input type="number" min={0} step="0.001" value={s.default_tax_rate} onChange={(e) => updateS("default_tax_rate", Number(e.target.value))} /></div>
            <div><Label>خصم افتراضي</Label><Input type="number" min={0} value={s.default_discount} onChange={(e) => updateS("default_discount", Number(e.target.value))} /></div>
            <div><Label>ساعات تعديلات صغيرة مشمولة</Label><Input type="number" min={0} step="0.25" value={s.small_customizations_included_hours} onChange={(e) => updateS("small_customizations_included_hours", Number(e.target.value))} /></div>
            <div><Label>سعر الساعة الإضافية</Label><Input type="number" min={0} value={s.small_customizations_extra_hour_price} onChange={(e) => updateS("small_customizations_extra_hour_price", Number(e.target.value))} /></div>
            <div><Label>لون رئيسي</Label><Input value={s.colors?.primary || "#0D1B2E"} onChange={(e) => updateS("colors", { ...(s.colors || {}), primary: e.target.value })} /></div>
            <div><Label>لون فرعي</Label><Input value={s.colors?.accent || "#1B3A5C"} onChange={(e) => updateS("colors", { ...(s.colors || {}), accent: e.target.value })} /></div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3">
            <div><Label>نص المقدمة</Label><Textarea rows={3} value={s.intro_text} onChange={(e) => updateS("intro_text", e.target.value)} /></div>
            <div><Label>الشروط والملاحظات</Label><Textarea rows={8} value={s.terms_text} onChange={(e) => updateS("terms_text", e.target.value)} /></div>
            <div><Label>سياسة الدعم الفني (SLA)</Label><Textarea rows={10} value={s.support_policy_text} onChange={(e) => updateS("support_policy_text", e.target.value)} /></div>
            <div><Label>نص التوقيع</Label><Textarea rows={2} value={s.signature_text} onChange={(e) => updateS("signature_text", e.target.value)} /></div>
            <div><Label>Footer</Label><Input value={s.footer_text} onChange={(e) => updateS("footer_text", e.target.value)} /></div>
            <div><Label>رابط الشعار (اختياري)</Label><Input value={s.logo_url || ""} onChange={(e) => updateS("logo_url", e.target.value)} placeholder="https://..." /></div>
          </div>
        </div>

        {/* Catalog items */}
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-3 flex items-center">
            <div className="font-bold text-[#0D1B2E]">بنود الكاتالوج الافتراضية</div>
            <div className="mr-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="ml-1 h-4 w-4" /> إضافة بند</Button>
              <Button size="sm" onClick={saveCatalog}><Save className="ml-1 h-4 w-4" /> حفظ الكاتالوج</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-2 text-right">الرمز</th>
                  <th className="px-2 py-2 text-right">الاسم / الوصف</th>
                  <th className="px-2 py-2 text-right">النوع</th>
                  <th className="px-2 py-2 text-center w-20">كمية افتراضية</th>
                  <th className="px-2 py-2 text-center w-28">سعر لمرة واحدة</th>
                  <th className="px-2 py-2 text-center w-28">سعر سنوي</th>
                  <th className="px-2 py-2 text-center w-16">الترتيب</th>
                  <th className="px-2 py-2 text-center w-16">مفعل</th>
                  <th className="px-2 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b align-top">
                    <td className="px-2 py-2"><Input value={it.code} onChange={(e) => updateItem(it.id, { code: e.target.value })} className="w-32 font-mono" /></td>
                    <td className="px-2 py-2">
                      <Input value={it.name} onChange={(e) => updateItem(it.id, { name: e.target.value })} className="mb-1" />
                      <Textarea rows={2} value={it.description || ""} onChange={(e) => updateItem(it.id, { description: e.target.value })} className="text-xs" />
                    </td>
                    <td className="px-2 py-2">
                      <Select value={it.pricing_type} onValueChange={(v) => updateItem(it.id, { pricing_type: v as AmwaliPricingType })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(PRICING_TYPE_LABEL).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2 text-center"><Input type="number" value={it.default_qty} onChange={(e) => updateItem(it.id, { default_qty: Number(e.target.value) })} className="text-center" /></td>
                    <td className="px-2 py-2 text-center"><Input type="number" value={it.onetime_price} onChange={(e) => updateItem(it.id, { onetime_price: Number(e.target.value) })} className="text-center" /></td>
                    <td className="px-2 py-2 text-center"><Input type="number" value={it.annual_price} onChange={(e) => updateItem(it.id, { annual_price: Number(e.target.value) })} className="text-center" /></td>
                    <td className="px-2 py-2 text-center"><Input type="number" value={it.sort_order} onChange={(e) => updateItem(it.id, { sort_order: Number(e.target.value) })} className="text-center" /></td>
                    <td className="px-2 py-2 text-center"><Switch checked={!!it.active} onCheckedChange={(v) => updateItem(it.id, { active: v })} /></td>
                    <td className="px-2 py-2 text-center"><Button size="icon" variant="ghost" onClick={() => removeItem(it.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuotationSettingsPage;