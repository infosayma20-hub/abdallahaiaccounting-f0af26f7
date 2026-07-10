import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowRight, Plus, Trash2, Save, Printer, CheckCircle2, XCircle, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAmwaliSettings, useAmwaliCatalog, useAmwaliQuotation, useAmwaliQuotationItems,
  getNextQuoteNumber, AMWALI_KEYS,
} from "@/hooks/useAmwaliQuotations";
import {
  AmwaliCounters, AmwaliItem, AmwaliPricingType, calcQuotationTotals, currencySymbol,
  fmtMoney, isCounterDriven, PRICING_TYPE_LABEL, qtyFromCounters,
} from "@/lib/amwali-quotations/calc";
import PrintView from "./PrintView";

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().split("T")[0];

interface EditorState {
  id?: string;
  quote_number: string;
  status: "draft" | "approved" | "cancelled";
  quote_date: string;
  valid_until: string;
  currency: string;
  customer_name: string;
  company_name: string;
  phone: string;
  email: string;
  address: string;
  internal_notes: string;
  counters: AmwaliCounters;
  discount: number;
  tax_rate: number;
  items: AmwaliItem[];
}

const emptyState: EditorState = {
  quote_number: "",
  status: "draft",
  quote_date: todayISO(),
  valid_until: "",
  currency: "USD",
  customer_name: "", company_name: "", phone: "", email: "", address: "", internal_notes: "",
  counters: { pos_points: 0, kiosk_points: 0, hr_employees: 0, crm_users: 0, system_users: 0 },
  discount: 0, tax_rate: 0,
  items: [],
};

const QuotationEditorPage = () => {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const { data: settings } = useAmwaliSettings();
  const { data: catalog = [] } = useAmwaliCatalog();
  const { data: existing } = useAmwaliQuotation(id);
  const { data: existingItems = [] } = useAmwaliQuotationItems(id);

  const [state, setState] = useState<EditorState>(emptyState);
  const [ready, setReady] = useState(false);

  // Bootstrap on load
  useEffect(() => {
    if (!settings || !catalog.length) return;
    if (id) {
      if (!existing) return;
      setState({
        id: existing.id,
        quote_number: existing.quote_number,
        status: existing.status,
        quote_date: existing.quote_date,
        valid_until: existing.valid_until || "",
        currency: existing.currency,
        customer_name: existing.customer_name || "",
        company_name: existing.company_name || "",
        phone: existing.phone || "",
        email: existing.email || "",
        address: existing.address || "",
        internal_notes: existing.internal_notes || "",
        counters: {
          pos_points: existing.pos_points || 0,
          kiosk_points: existing.kiosk_points || 0,
          hr_employees: existing.hr_employees || 0,
          crm_users: existing.crm_users || 0,
          system_users: existing.system_users || 0,
        },
        discount: Number(existing.discount) || 0,
        tax_rate: Number(existing.tax_rate) || 0,
        items: (existingItems as any[]).map((it) => ({
          id: it.id, catalog_code: it.catalog_code, name: it.name, description: it.description || "",
          pricing_type: it.pricing_type as AmwaliPricingType,
          qty: Number(it.qty) || 0, onetime_price: Number(it.onetime_price) || 0,
          annual_price: Number(it.annual_price) || 0, sort_order: it.sort_order || 0,
        })),
      });
      setReady(true);
    } else {
      // NEW: seed from catalog defaults (active items only). Do NOT reserve a
      // quote number here — it burns sequence numbers on every page open.
      // Number is generated only at first save (see persist()).
      (async () => {
        const activeCat = (catalog as any[]).filter((c) => c.active);
        const validUntil = new Date(Date.now() + (settings.validity_days || 15) * 86400000)
          .toISOString().split("T")[0];
        setState({
          ...emptyState,
          quote_number: "",
          quote_date: todayISO(),
          valid_until: validUntil,
          currency: settings.currency || "USD",
          discount: Number(settings.default_discount) || 0,
          tax_rate: Number(settings.default_tax_rate) || 0,
          items: activeCat.map((c, idx) => ({
            id: uid(),
            catalog_code: c.code,
            name: c.name,
            description: c.description || "",
            pricing_type: c.pricing_type as AmwaliPricingType,
            qty: Number(c.default_qty) || 0,
            onetime_price: Number(c.onetime_price) || 0,
            annual_price: Number(c.annual_price) || 0,
            sort_order: c.sort_order ?? idx * 10,
          })),
        });
        setReady(true);
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, catalog, existing, existingItems, id]);

  // When counters change, auto-update qty on counter-driven items
  useEffect(() => {
    if (!ready) return;
    setState((s) => ({
      ...s,
      items: s.items.map((it) => (isCounterDriven(it.pricing_type) ? { ...it, qty: qtyFromCounters(it.pricing_type, s.counters, it.qty) } : it)),
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.counters.pos_points, state.counters.kiosk_points, state.counters.hr_employees, state.counters.crm_users, state.counters.system_users, ready]);

  const totals = useMemo(
    () => calcQuotationTotals(state.items, state.discount, state.tax_rate),
    [state.items, state.discount, state.tax_rate]
  );
  const sym = currencySymbol(state.currency);

  const update = <K extends keyof EditorState>(k: K, v: EditorState[K]) => setState((s) => ({ ...s, [k]: v }));
  const updateCounter = (k: keyof AmwaliCounters, v: number) =>
    setState((s) => ({ ...s, counters: { ...s.counters, [k]: Math.max(0, v || 0) } }));
  const updateItem = (iid: string, patch: Partial<AmwaliItem>) =>
    setState((s) => ({ ...s, items: s.items.map((it) => (it.id === iid ? { ...it, ...patch } : it)) }));
  const addItem = () =>
    setState((s) => ({
      ...s,
      items: [...s.items, { id: uid(), catalog_code: null, name: "بند جديد", description: "", pricing_type: "fixed", qty: 1, onetime_price: 0, annual_price: 0, sort_order: (s.items.at(-1)?.sort_order ?? 0) + 10 }],
    }));
  const removeItem = (iid: string) => setState((s) => ({ ...s, items: s.items.filter((it) => it.id !== iid) }));

  const persist = async (patch?: Partial<EditorState>): Promise<string | null> => {
    const s = { ...state, ...(patch || {}) };
    // Reserve a quote number ONLY at first save. This prevents burning
    // sequence numbers on every page open / discarded draft.
    let effectiveQuoteNumber = s.quote_number;
    if (!s.id && !effectiveQuoteNumber) {
      try {
        effectiveQuoteNumber = await getNextQuoteNumber();
      } catch (e: any) {
        toast.error("تعذّر توليد رقم العرض");
        return null;
      }
    }
    const payload: any = {
      quote_number: effectiveQuoteNumber,
      status: s.status,
      quote_date: s.quote_date,
      valid_until: s.valid_until || null,
      currency: s.currency,
      customer_name: s.customer_name || null,
      company_name: s.company_name || null,
      phone: s.phone || null,
      email: s.email || null,
      address: s.address || null,
      internal_notes: s.internal_notes || null,
      pos_points: s.counters.pos_points,
      kiosk_points: s.counters.kiosk_points,
      hr_employees: s.counters.hr_employees,
      crm_users: s.counters.crm_users,
      system_users: s.counters.system_users,
      subtotal_onetime: totals.subtotalOnetime,
      subtotal_annual: totals.subtotalAnnual,
      discount: s.discount,
      tax_rate: s.tax_rate,
      tax_amount: totals.taxAmount,
      grand_total: totals.grandTotal,
      intro_text: settings?.intro_text ?? null,
      terms_text: settings?.terms_text ?? null,
      support_policy_text: settings?.support_policy_text ?? null,
    };
    let quotationId = s.id;
    if (!quotationId) {
      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("amwali_quotations").insert({ ...payload, created_by: user?.id ?? null }).select().maybeSingle();
      if (error) { toast.error(error.message); return null; }
      quotationId = data!.id;
      setState((prev) => ({ ...prev, id: quotationId, quote_number: effectiveQuoteNumber }));
    } else {
      const { error } = await supabase.from("amwali_quotations").update(payload).eq("id", quotationId);
      if (error) { toast.error(error.message); return null; }
    }
    // Replace items
    await supabase.from("amwali_quotation_items").delete().eq("quotation_id", quotationId);
    if (s.items.length) {
      const rows = s.items.map((it, idx) => ({
        quotation_id: quotationId,
        catalog_code: it.catalog_code ?? null,
        name: it.name || "",
        description: it.description || "",
        pricing_type: it.pricing_type,
        qty: Number(it.qty) || 0,
        onetime_price: Number(it.onetime_price) || 0,
        annual_price: Number(it.annual_price) || 0,
        line_onetime: (Number(it.qty) || 0) * (Number(it.onetime_price) || 0),
        line_annual: (Number(it.qty) || 0) * (Number(it.annual_price) || 0),
        line_total: (Number(it.qty) || 0) * ((Number(it.onetime_price) || 0) + (Number(it.annual_price) || 0)),
        sort_order: it.sort_order ?? idx * 10,
      }));
      const { error: itemsErr } = await supabase.from("amwali_quotation_items").insert(rows);
      if (itemsErr) { toast.error(itemsErr.message); return null; }
    }
    qc.invalidateQueries({ queryKey: AMWALI_KEYS.list });
    if (quotationId) {
      qc.invalidateQueries({ queryKey: AMWALI_KEYS.one(quotationId) });
      qc.invalidateQueries({ queryKey: AMWALI_KEYS.items(quotationId) });
    }
    return quotationId || null;
  };

  const handleSaveDraft = async () => {
    const rid = await persist({ status: "draft" });
    if (rid) {
      toast.success("تم حفظ المسودة");
      if (!id && rid) nav(`/amwali-quotations/${rid}/edit`, { replace: true });
    }
  };
  const handleApprove = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const rid = await persist({ status: "approved" });
    if (!rid) return;
    await supabase.from("amwali_quotations").update({ approved_at: new Date().toISOString(), approved_by: user?.id ?? null }).eq("id", rid);
    setState((s) => ({ ...s, status: "approved" }));
    toast.success("تم اعتماد العرض");
    qc.invalidateQueries({ queryKey: AMWALI_KEYS.list });
  };
  const handleCancel = async () => {
    if (!confirm("إلغاء عرض السعر؟")) return;
    const rid = await persist({ status: "cancelled" });
    if (!rid) return;
    await supabase.from("amwali_quotations").update({ cancelled_at: new Date().toISOString() }).eq("id", rid);
    setState((s) => ({ ...s, status: "cancelled" }));
    toast.success("تم إلغاء العرض");
    qc.invalidateQueries({ queryKey: AMWALI_KEYS.list });
  };
  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = state.quote_number || " ";
    const restore = () => { document.title = originalTitle; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  // Auto-print if ?print=1
  useEffect(() => {
    if (ready && params.get("print") === "1") {
      const t = setTimeout(() => handlePrint(), 300);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const hasSupport = state.items.some((it) => it.catalog_code === "SUPPORT");
  const colors = (settings?.colors as any) || { primary: "#0D1B2E", accent: "#1B3A5C" };

  if (!ready) return <div className="p-8 text-center text-muted-foreground" dir="rtl">جاري التحميل...</div>;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 print:bg-white">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body { background: white !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          .print-page, .print-page * { visibility: visible !important; }
          .print-page { position: absolute !important; inset: 0 !important; box-shadow: none !important; margin: 0 !important; max-width: none !important; width: 100% !important; padding: 0 !important; }
          .no-print { display: none !important; }
          .avoid-break { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print sticky top-0 z-40 border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => nav("/amwali-quotations")}><ArrowRight className="ml-1 h-4 w-4" /> رجوع للقائمة</Button>
          <div className="flex-1 flex items-center gap-2">
            <span className="font-mono font-bold text-[#0D1B2E]">{state.quote_number || "— جديد —"}</span>
            <Badge variant={state.status === "approved" ? "default" : state.status === "cancelled" ? "destructive" : "secondary"}>
              {state.status === "approved" ? "معتمد" : state.status === "cancelled" ? "ملغي" : "مسودة"}
            </Badge>
          </div>
          <Button size="sm" variant="outline" onClick={handleSaveDraft}><Save className="ml-1 h-4 w-4" /> حفظ كمسودة</Button>
          {state.status !== "approved" && <Button size="sm" onClick={handleApprove}><CheckCircle2 className="ml-1 h-4 w-4" /> اعتماد</Button>}
          {state.status !== "cancelled" && <Button size="sm" variant="outline" onClick={handleCancel}><XCircle className="ml-1 h-4 w-4" /> إلغاء</Button>}
          <Button size="sm" className="bg-primary" onClick={handlePrint}><Printer className="ml-1 h-4 w-4" /> طباعة / PDF</Button>
        </div>
      </div>

      <div className="no-print mx-auto max-w-6xl space-y-4 p-4">
        {/* Header meta */}
        <div className="rounded-lg border bg-white p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div><Label>التاريخ</Label><Input type="date" value={state.quote_date} onChange={(e) => update("quote_date", e.target.value)} /></div>
            <div><Label>صالح حتى</Label><Input type="date" value={state.valid_until} onChange={(e) => update("valid_until", e.target.value)} /></div>
            <div>
              <Label>العملة</Label>
              <Select value={state.currency} onValueChange={(v) => update("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">دولار أمريكي (USD)</SelectItem>
                  <SelectItem value="ILS">شيكل إسرائيلي (ILS)</SelectItem>
                  <SelectItem value="JOD">دينار أردني (JOD)</SelectItem>
                  <SelectItem value="EUR">يورو (EUR)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>رقم العرض</Label><Input value={state.quote_number} onChange={(e) => update("quote_number", e.target.value)} placeholder="يُنشأ عند الحفظ" /></div>
          </div>
        </div>

        {/* Customer */}
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-2 font-bold text-[#0D1B2E]">بيانات العميل</div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div><Label>الاسم</Label><Input value={state.customer_name} onChange={(e) => update("customer_name", e.target.value)} /></div>
            <div><Label>الشركة / المنشأة</Label><Input value={state.company_name} onChange={(e) => update("company_name", e.target.value)} /></div>
            <div><Label>الهاتف</Label><Input value={state.phone} onChange={(e) => update("phone", e.target.value)} /></div>
            <div><Label>البريد الإلكتروني</Label><Input type="email" value={state.email} onChange={(e) => update("email", e.target.value)} /></div>
            <div className="md:col-span-2"><Label>العنوان</Label><Input value={state.address} onChange={(e) => update("address", e.target.value)} /></div>
            <div className="md:col-span-2">
              <Label>ملاحظات داخلية (لا تظهر في الطباعة)</Label>
              <Textarea rows={2} value={state.internal_notes} onChange={(e) => update("internal_notes", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Counters */}
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-2 font-bold text-[#0D1B2E]">
            العدادات المستقلة
            <span className="mr-2 text-xs font-normal text-muted-foreground">
              (تُحدّث كمية البنود المرتبطة تلقائياً — كل نوع مستقل تماماً)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div><Label>نقاط POS</Label><Input type="number" min={0} value={state.counters.pos_points} onChange={(e) => updateCounter("pos_points", Number(e.target.value))} /></div>
            <div><Label>نقاط Kiosk</Label><Input type="number" min={0} value={state.counters.kiosk_points} onChange={(e) => updateCounter("kiosk_points", Number(e.target.value))} /></div>
            <div><Label>موظفو HR</Label><Input type="number" min={0} value={state.counters.hr_employees} onChange={(e) => updateCounter("hr_employees", Number(e.target.value))} /></div>
            <div><Label>مستخدمو CRM</Label><Input type="number" min={0} value={state.counters.crm_users} onChange={(e) => updateCounter("crm_users", Number(e.target.value))} /></div>
            <div><Label>مستخدمو النظام</Label><Input type="number" min={0} value={state.counters.system_users} onChange={(e) => updateCounter("system_users", Number(e.target.value))} /></div>
          </div>
        </div>

        {/* Items table */}
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-2 flex items-center">
            <div className="font-bold text-[#0D1B2E]">بنود العرض</div>
            <div className="mr-auto">
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="ml-1 h-4 w-4" /> إضافة بند</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[#0D1B2E] text-white">
                <tr>
                  <th className="px-2 py-2 text-right">البند</th>
                  <th className="px-2 py-2 text-right">النوع</th>
                  <th className="px-2 py-2 text-center w-20">الكمية</th>
                  <th className="px-2 py-2 text-center w-28">سعر لمرة واحدة</th>
                  <th className="px-2 py-2 text-center w-28">سعر سنوي</th>
                  <th className="px-2 py-2 text-center w-32">الإجمالي</th>
                  <th className="px-2 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {totals.lines.map((r) => (
                  <tr key={r.id} className="border-b align-top">
                    <td className="px-2 py-2">
                      <Input value={r.name} onChange={(e) => updateItem(r.id, { name: e.target.value })} className="mb-1" />
                      <Input value={r.description} onChange={(e) => updateItem(r.id, { description: e.target.value })} placeholder="وصف / ملاحظة" className="text-xs" />
                    </td>
                    <td className="px-2 py-2">
                      <Select value={r.pricing_type} onValueChange={(v) => updateItem(r.id, { pricing_type: v as AmwaliPricingType, qty: qtyFromCounters(v as AmwaliPricingType, state.counters, r.qty) })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(PRICING_TYPE_LABEL).map(([k, v]) => (<SelectItem key={k} value={k}>{v}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <Input type="number" min={0} value={r.qty} onChange={(e) => updateItem(r.id, { qty: Number(e.target.value) })} disabled={isCounterDriven(r.pricing_type)} className="text-center" />
                    </td>
                    <td className="px-2 py-2 text-center"><Input type="number" min={0} value={r.onetime_price} onChange={(e) => updateItem(r.id, { onetime_price: Number(e.target.value) })} className="text-center" /></td>
                    <td className="px-2 py-2 text-center"><Input type="number" min={0} value={r.annual_price} onChange={(e) => updateItem(r.id, { annual_price: Number(e.target.value) })} className="text-center" /></td>
                    <td className="px-2 py-2 text-center font-semibold text-[#0D1B2E]">{fmtMoney(r.lineTotal)} {sym}</td>
                    <td className="px-2 py-2 text-center"><Button size="icon" variant="ghost" onClick={() => removeItem(r.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr><td colSpan={5} className="px-2 py-2 text-left font-semibold">إجمالي «لمرة واحدة»</td><td className="px-2 py-2 text-center font-semibold">{fmtMoney(totals.subtotalOnetime)} {sym}</td><td /></tr>
                <tr><td colSpan={5} className="px-2 py-2 text-left font-semibold">إجمالي الاشتراك السنوي</td><td className="px-2 py-2 text-center font-semibold">{fmtMoney(totals.subtotalAnnual)} {sym}</td><td /></tr>
                <tr>
                  <td colSpan={4} />
                  <td className="px-2 py-2 text-left">
                    <div className="flex items-center justify-end gap-2"><span>خصم:</span>
                      <Input type="number" min={0} value={state.discount} onChange={(e) => update("discount", Number(e.target.value))} className="w-28 text-center" />
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">- {fmtMoney(totals.discount)} {sym}</td><td />
                </tr>
                <tr>
                  <td colSpan={4} />
                  <td className="px-2 py-2 text-left">
                    <div className="flex items-center justify-end gap-2"><span>ضريبة %:</span>
                      <Input type="number" min={0} step="0.001" value={state.tax_rate} onChange={(e) => update("tax_rate", Number(e.target.value))} className="w-28 text-center" />
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">{fmtMoney(totals.taxAmount)} {sym}</td><td />
                </tr>
                <tr className="bg-[#0D1B2E] text-white">
                  <td colSpan={5} className="px-2 py-3 text-left font-bold">الإجمالي المستحق للسنة الأولى (تفعيل + اشتراك)</td>
                  <td className="px-2 py-3 text-center text-base font-bold">{fmtMoney(totals.grandTotal)} {sym}</td><td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="rounded-lg border bg-amber-50 p-3 text-xs text-amber-900">
          <strong>ملاحظة:</strong> الإجمالي المستحق للسنة الأولى = رسوم التفعيل «لمرة واحدة» + الاشتراك السنوي الأول.
          موظفو HR مستقلون تماماً عن مستخدمي النظام ومستخدمي CRM ونقاط POS/Kiosk.
        </div>
      </div>

      {/* Print preview (rendered but only visible on print) */}
      <div className="fixed inset-0 -z-10 opacity-0 pointer-events-none print:relative print:opacity-100 print:z-auto print:pointer-events-auto">
        <PrintView
          ref={printRef}
          quoteNumber={state.quote_number}
          quoteDate={state.quote_date}
          validUntil={state.valid_until}
          currency={state.currency}
          customer={{ name: state.customer_name, company: state.company_name, phone: state.phone, email: state.email, address: state.address }}
          intro={settings?.intro_text || ""}
          terms={settings?.terms_text || ""}
          supportPolicy={settings?.support_policy_text || ""}
          footer={settings?.footer_text || "أموالي — حلول محاسبية وإدارية ذكية · www.amwali.app"}
          colors={colors}
          totals={totals}
          taxRate={state.tax_rate}
          hasSupport={hasSupport}
        />
      </div>
    </div>
  );
};

export default QuotationEditorPage;