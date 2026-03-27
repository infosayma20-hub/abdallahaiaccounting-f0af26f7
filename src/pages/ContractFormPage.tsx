import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import ContractPrintView, { ContractData } from "@/components/contracts/ContractPrintView";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Save, Eye, Printer, ArrowRight, Upload, Plus, X, ImageIcon } from "lucide-react";

const taskOptions = ["تشطيب", "بناء هيكل", "سباكة", "تصميم", "إشراف", "كهرباء", "دهانات", "هدم وإزالة", "تدفئة", "عزل", "ألمنيوم", "بلاط"];

export default function ContractFormPage() {
  const { user } = useAuth();
  const { settings } = useCompanySettings();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const printRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    project_name: "", client_name: "", client_phone: "", client_address: "", project_location: "",
    contract_value: "", start_date: "", end_date: "", duration_text: "", payment_terms: "",
    scope_items: [] as string[], custom_scope: "",
    advance_payment: "", advance_payment_note: "",
    terms_obligations: "يلتزم الطرف الأول (المقاول) بتنفيذ كافة الأعمال الموصوفة في نطاق العمل وفقاً للمواصفات الفنية المعتمدة وضمن الجدول الزمني المحدد.",
    terms_payment: "يلتزم الطرف الثاني (العميل) بدفع المبالغ المستحقة وفقاً لآلية الدفع المتفق عليها، وأي تأخير في الدفع يخول الطرف الأول إيقاف العمل.",
    terms_disputes: "في حال نشوء أي خلاف بين الطرفين يتم حله بالتراضي، وإن تعذر ذلك يُحال النزاع إلى المحكمة المختصة.",
    notes: "", logo_url: "",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isEdit) loadContract();
  }, [id]);

  const loadContract = async () => {
    const { data } = await supabase.from("project_contracts" as any).select("*").eq("id", id).maybeSingle();
    if (data) {
      const d = data as any;
      setForm({
        project_name: d.project_name || "", client_name: d.client_name || "",
        client_phone: d.client_phone || "", client_address: d.client_address || "",
        project_location: d.project_location || "", contract_value: String(d.contract_value || ""),
        start_date: d.start_date || "", end_date: d.end_date || "",
        duration_text: d.duration_text || "", payment_terms: d.payment_terms || "",
        scope_items: d.scope_items || [], custom_scope: "",
        advance_payment: String(d.advance_payment || ""), advance_payment_note: d.advance_payment_note || "",
        terms_obligations: d.terms_obligations || "", terms_payment: d.terms_payment || "",
        terms_disputes: d.terms_disputes || "", notes: d.notes || "", logo_url: d.logo_url || "",
      });
    }
  };

  const uploadLogo = async (file: File) => {
    if (!user) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/logo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("company-logos").upload(path, file, { upsert: true });
    if (error) { toast.error("فشل رفع الشعار"); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("company-logos").getPublicUrl(path);
    setForm(f => ({ ...f, logo_url: urlData.publicUrl }));
    setUploading(false);
    toast.success("تم رفع الشعار");
  };

  const toggleScope = (item: string) => {
    setForm(f => ({
      ...f,
      scope_items: f.scope_items.includes(item) ? f.scope_items.filter(s => s !== item) : [...f.scope_items, item],
    }));
  };

  const addCustomScope = () => {
    if (!form.custom_scope.trim()) return;
    setForm(f => ({ ...f, scope_items: [...f.scope_items, f.custom_scope.trim()], custom_scope: "" }));
  };

  const removeScope = (idx: number) => {
    setForm(f => ({ ...f, scope_items: f.scope_items.filter((_, i) => i !== idx) }));
  };

  const saveContract = async (statusOverride?: string) => {
    if (!form.project_name.trim() || !form.client_name.trim()) { toast.error("اسم المشروع والعميل مطلوبان"); return; }
    setSaving(true);
    const payload = {
      user_id: user!.id,
      project_name: form.project_name, client_name: form.client_name,
      client_phone: form.client_phone || null, client_address: form.client_address || null,
      project_location: form.project_location || null,
      contract_value: parseFloat(form.contract_value) || 0,
      start_date: form.start_date || null, end_date: form.end_date || null,
      duration_text: form.duration_text || null, payment_terms: form.payment_terms || null,
      scope_items: form.scope_items,
      advance_payment: parseFloat(form.advance_payment) || 0,
      advance_payment_note: form.advance_payment_note || null,
      terms_obligations: form.terms_obligations || null,
      terms_payment: form.terms_payment || null,
      terms_disputes: form.terms_disputes || null,
      notes: form.notes || null, logo_url: form.logo_url || settings.logo_url || null,
      ...(statusOverride ? { status: statusOverride } : {}),
    };

    let contractId = id;
    if (isEdit) {
      const { error } = await supabase.from("project_contracts" as any).update(payload as any).eq("id", id);
      if (error) { toast.error("فشل التحديث: " + error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from("project_contracts" as any).insert(payload as any).select("id").single();
      if (error) { toast.error("فشل الحفظ: " + error.message); setSaving(false); return; }
      contractId = (data as any).id;
    }

    toast.success("تم حفظ العقد بنجاح");
    setSaving(false);
    navigate(`/contracts/${contractId}/preview`);
  };

  const printContract = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow || !printRef.current) return;
    printWindow.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>عقد اتفاق - ${form.project_name}</title>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      <style>* { margin:0; padding:0; box-sizing:border-box; } body { font-family:'IBM Plex Sans Arabic','Cairo',sans-serif; direction:rtl; } @media print { @page { size:A4; margin:15mm; } }</style>
    </head><body>`);
    printWindow.document.write(printRef.current.innerHTML);
    printWindow.document.write("</body></html>");
    printWindow.document.close();
    /* view only — no browser print */
  };

  const previewData: ContractData = {
    project_name: form.project_name || "اسم المشروع",
    client_name: form.client_name || "اسم العميل",
    client_phone: form.client_phone, client_address: form.client_address,
    project_location: form.project_location,
    contract_value: parseFloat(form.contract_value) || 0,
    start_date: form.start_date, end_date: form.end_date,
    duration_text: form.duration_text, payment_terms: form.payment_terms,
    scope_items: form.scope_items,
    advance_payment: parseFloat(form.advance_payment) || 0,
    advance_payment_note: form.advance_payment_note,
    logo_url: form.logo_url || settings.logo_url,
    terms_obligations: form.terms_obligations, terms_payment: form.terms_payment, terms_disputes: form.terms_disputes,
    notes: form.notes,
    company_name: settings.company_name, company_phone: settings.phone,
    company_address: settings.address, company_email: settings.email,
  };

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/contracts")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">{isEdit ? "تعديل العقد" : "إنشاء عقد جديد"}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={printContract} disabled={!form.project_name}>
            <Printer className="h-4 w-4 ml-1" /> طباعة
          </Button>
          <Button onClick={() => saveContract()} disabled={saving}>
            <Save className="h-4 w-4 ml-1" /> {saving ? "جاري الحفظ..." : "حفظ مسودة"}
          </Button>
        </div>
      </div>

      {/* Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form - Left 40% */}
        <div className="lg:col-span-2 space-y-4">
          {/* Logo Upload */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">شعار الشركة</CardTitle></CardHeader>
            <CardContent>
              {form.logo_url ? (
                <div className="flex items-center gap-3">
                  <img src={form.logo_url} alt="logo" className="h-16 w-16 object-contain rounded border" />
                  <Button variant="outline" size="sm" onClick={() => setForm(f => ({ ...f, logo_url: "" }))}>
                    <X className="h-3 w-3 ml-1" /> إزالة
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-muted rounded-lg p-6 cursor-pointer hover:border-primary/50 transition-colors">
                  <ImageIcon className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">{uploading ? "جاري الرفع..." : "اضغط أو اسحب لرفع الشعار"}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} disabled={uploading} />
                </label>
              )}
            </CardContent>
          </Card>

          {/* Project Info */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">بيانات المشروع</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="اسم المشروع *" value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} />
              <Input placeholder="اسم العميل *" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="رقم الجوال" value={form.client_phone} onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))} />
                <Input placeholder="العنوان / الموقع" value={form.client_address} onChange={e => setForm(f => ({ ...f, client_address: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-muted-foreground">تاريخ البداية</label><Input type="date" max="9999-12-31" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
                <div><label className="text-xs text-muted-foreground">تاريخ النهاية</label><Input type="date" max="9999-12-31" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} /></div>
              </div>
              <Input placeholder='مدة التنفيذ (مثال: "شهرين")' value={form.duration_text} onChange={e => setForm(f => ({ ...f, duration_text: e.target.value }))} />
              <Select value={form.payment_terms} onValueChange={v => setForm(f => ({ ...f, payment_terms: v }))}>
                <SelectTrigger><SelectValue placeholder="آلية الدفع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="نقدي عند الاستلام">نقدي عند الاستلام</SelectItem>
                  <SelectItem value="دفعات شهرية">دفعات شهرية</SelectItem>
                  <SelectItem value="50% مقدم - 50% عند الانتهاء">50% مقدم - 50% عند الانتهاء</SelectItem>
                  <SelectItem value="30% مقدم - 40% أثناء - 30% عند الانتهاء">30%-40%-30%</SelectItem>
                  <SelectItem value="حسب الاتفاق">حسب الاتفاق</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Budget */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">الميزانية</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input type="number" placeholder="قيمة العقد الإجمالية (₪) *" value={form.contract_value} onChange={e => setForm(f => ({ ...f, contract_value: e.target.value }))} />
              <Input type="number" placeholder="دفعة أولى (₪)" value={form.advance_payment} onChange={e => setForm(f => ({ ...f, advance_payment: e.target.value }))} />
              <Input placeholder="ملاحظة الدفع" value={form.advance_payment_note} onChange={e => setForm(f => ({ ...f, advance_payment_note: e.target.value }))} />
            </CardContent>
          </Card>

          {/* Scope of Work */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">نطاق العمل</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {taskOptions.map(task => (
                  <label key={task} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={form.scope_items.includes(task)} onCheckedChange={() => toggleScope(task)} />
                    {task}
                  </label>
                ))}
              </div>
              {/* Custom items */}
              {form.scope_items.filter(s => !taskOptions.includes(s)).map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1">
                  <span className="text-primary font-bold">✓</span> {s}
                  <Button size="icon" variant="ghost" className="h-5 w-5 mr-auto" onClick={() => removeScope(form.scope_items.indexOf(s))}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input placeholder="مهمة أخرى..." value={form.custom_scope} onChange={e => setForm(f => ({ ...f, custom_scope: e.target.value }))} onKeyDown={e => e.key === "Enter" && addCustomScope()} />
                <Button size="icon" variant="outline" onClick={addCustomScope}><Plus className="h-4 w-4" /></Button>
              </div>
            </CardContent>
          </Card>

          {/* Terms */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">الشروط والأحكام</CardTitle></CardHeader>
            <CardContent>
              <Accordion type="multiple" className="w-full">
                <AccordionItem value="obligations">
                  <AccordionTrigger className="text-sm">المادة الأولى — الالتزامات</AccordionTrigger>
                  <AccordionContent>
                    <Textarea value={form.terms_obligations} onChange={e => setForm(f => ({ ...f, terms_obligations: e.target.value }))} rows={3} />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="payment">
                  <AccordionTrigger className="text-sm">المادة الثانية — شروط الدفع</AccordionTrigger>
                  <AccordionContent>
                    <Textarea value={form.terms_payment} onChange={e => setForm(f => ({ ...f, terms_payment: e.target.value }))} rows={3} />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="disputes">
                  <AccordionTrigger className="text-sm">المادة الثالثة — فض النزاعات</AccordionTrigger>
                  <AccordionContent>
                    <Textarea value={form.terms_disputes} onChange={e => setForm(f => ({ ...f, terms_disputes: e.target.value }))} rows={3} />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">ملاحظات</CardTitle></CardHeader>
            <CardContent>
              <Textarea placeholder="ملاحظات إضافية..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </CardContent>
          </Card>

          {/* Save Buttons */}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => saveContract()} disabled={saving}>
              <Save className="h-4 w-4 ml-1" /> {saving ? "جاري الحفظ..." : "💾 حفظ مسودة"}
            </Button>
            <Button variant="outline" className="flex-1" onClick={printContract}>
              <Printer className="h-4 w-4 ml-1" /> 🖨️ طباعة
            </Button>
          </div>
        </div>

        {/* Live Preview - Right 60% */}
        <div className="lg:col-span-3">
          <Card className="sticky top-4">
            <CardHeader className="pb-2 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Eye className="h-4 w-4" /> معاينة حية</CardTitle>
                <Button size="sm" variant="ghost" onClick={printContract}><Printer className="h-3.5 w-3.5 ml-1" /> طباعة</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-auto max-h-[calc(100vh-200px)]" style={{ background: "#f5f5f5" }}>
              <div style={{ transform: "scale(0.75)", transformOrigin: "top center", minHeight: "1200px" }}>
                <ContractPrintView data={previewData} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Hidden print ref */}
      <div style={{ display: "none" }}>
        <ContractPrintView ref={printRef} data={previewData} />
      </div>
    </div>
  );
}
