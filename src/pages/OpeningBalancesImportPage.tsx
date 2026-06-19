import { useState, useMemo, useCallback } from "react";
import PageHeader from "@/components/layout/PageHeader";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, ArrowLeft, ArrowRight,
  Trash2, Plus, Users, Building2, Landmark, FileCheck, Package, Wallet, Scale
} from "lucide-react";
import * as XLSX from "xlsx";

const CURRENCIES = ["ILS", "JOD", "USD"];
const CURRENCY_SYMBOLS: Record<string, string> = { ILS: "₪", JOD: "د.أ", USD: "$" };

const ENTITY_TYPES = [
  { value: "customer", label: "زبون", icon: Users },
  { value: "supplier", label: "مورد", icon: Building2 },
  { value: "bank", label: "بنك", icon: Landmark },
  { value: "check_receivable", label: "شيك وارد", icon: FileCheck },
  { value: "check_payable", label: "شيك صادر", icon: FileCheck },
  { value: "inventory", label: "مخزون", icon: Package },
  { value: "fixed_asset", label: "أصل ثابت", icon: Building2 },
  { value: "cash", label: "صندوق", icon: Wallet },
  { value: "loan", label: "قرض", icon: Landmark },
  { value: "equity", label: "حقوق ملكية", icon: Scale },
  { value: "other", label: "أخرى", icon: FileSpreadsheet },
];

type BalanceEntry = {
  id: string;
  entity_type: string;
  entity_name: string;
  account_code: string;
  account_name: string;
  debit_amount: number;
  credit_amount: number;
  currency: string;
  notes: string;
  metadata: Record<string, any>;
  source: "excel" | "manual";
  errors: string[];
};

type ValidationError = { row: number; field: string; message: string };

const generateId = () => crypto.randomUUID();

const TEMPLATES = [
  { id: "customers", label: "قالب الزبائن", type: "customer", headers: ["اسم الزبون", "رقم الحساب", "مدين", "دائن", "الهاتف", "العنوان", "ملاحظات"] },
  { id: "suppliers", label: "قالب الموردين", type: "supplier", headers: ["اسم المورد", "رقم الحساب", "مدين", "دائن", "الهاتف", "العنوان", "ملاحظات"] },
  { id: "banks", label: "قالب البنوك والشيكات", type: "bank", headers: ["اسم البنك/الجهة", "النوع", "رقم الحساب", "مدين", "دائن", "رقم الشيك", "تاريخ الاستحقاق", "ملاحظات"] },
  { id: "inventory", label: "قالب المخزون والأصول", type: "inventory", headers: ["اسم الصنف/الأصل", "النوع", "رقم الحساب", "الكمية", "سعر الوحدة", "القيمة الإجمالية", "ملاحظات"] },
];

const downloadTemplate = (template: typeof TEMPLATES[0]) => {
  const wb = XLSX.utils.book_new();
  const exampleRows = template.id === "customers"
    ? [["أحمد محمد", "1201", 5000, 0, "0599123456", "نابلس", "مثال - احذف هذا السطر"], ["سمير علي", "1202", 0, 2000, "0568987654", "رام الله", "مثال"]]
    : template.id === "suppliers"
    ? [["شركة النور", "2101", 0, 8000, "022345678", "الخليل", "مثال"], ["مصنع الأمل", "2102", 1000, 0, "", "جنين", "مثال"]]
    : template.id === "banks"
    ? [["البنك العربي", "بنك", "1101", 15000, 0, "", "", "مثال"], ["أحمد خالد", "شيك وارد", "", 3000, 0, "12345", "2026-06-01", "مثال"]]
    : [["قماش قطني", "مخزون", "1301", 100, 25, 2500, "مثال"], ["سيارة نقل", "أصل ثابت", "1401", 1, 50000, 50000, "مثال"]];
  const data = [template.headers, ...exampleRows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = template.headers.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, template.label);
  XLSX.writeFile(wb, `${template.label}.xlsx`);
};

const parseExcelFile = (file: File): Promise<any[][]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        resolve(data);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

const detectTemplateType = (headers: string[]): string | null => {
  const h = headers.map(s => String(s || "").trim());
  if (h.some(x => x.includes("زبون") || x.includes("عميل"))) return "customer";
  if (h.some(x => x.includes("مورد"))) return "supplier";
  if (h.some(x => x.includes("بنك") || x.includes("شيك"))) return "bank";
  if (h.some(x => x.includes("صنف") || x.includes("أصل") || x.includes("مخزون") || x.includes("كمية"))) return "inventory";
  return null;
};

const OpeningBalancesImportPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [batchDate, setBatchDate] = useState(new Date().toISOString().split("T")[0]);
  const [currency, setCurrency] = useState("ILS");
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState<BalanceEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [posted, setPosted] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);

  const cs = CURRENCY_SYMBOLS[currency] || "₪";

  // File upload handler
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return;
    setUploading(true);
    const newEntries: BalanceEntry[] = [];

    for (const file of Array.from(files)) {
      try {
        const data = await parseExcelFile(file);
        if (data.length < 2) { toast.error(`ملف ${file.name} فارغ`); continue; }
        const headers = data[0].map(String);
        const type = detectTemplateType(headers);
        if (!type) { toast.error(`لم يتم التعرف على نوع القالب في ${file.name}`); continue; }

        for (let i = 1; i < data.length; i++) {
          const row = data[i];
          if (!row || row.every(c => c === undefined || c === null || c === "")) continue;
          const errors: string[] = [];
          let entityType = type;
          let entityName = String(row[0] || "");
          let accountCode = "";
          let debit = 0, credit = 0;
          const metadata: Record<string, any> = {};

          if (type === "customer" || type === "supplier") {
            accountCode = String(row[1] || "");
            debit = Number(row[2]) || 0;
            credit = Number(row[3]) || 0;
            metadata.phone = String(row[4] || "");
            metadata.address = String(row[5] || "");
            if (!entityName) errors.push("اسم الجهة مطلوب");
            if (debit > 0 && credit > 0) errors.push("لا يمكن أن يكون المبلغ مدين ودائن في نفس السطر");
          } else if (type === "bank") {
            const subType = String(row[1] || "").trim();
            if (subType.includes("شيك وارد")) entityType = "check_receivable";
            else if (subType.includes("شيك صادر")) entityType = "check_payable";
            else entityType = "bank";
            accountCode = String(row[2] || "");
            debit = Number(row[3]) || 0;
            credit = Number(row[4]) || 0;
            metadata.check_number = String(row[5] || "");
            metadata.due_date = String(row[6] || "");
            if (!entityName) errors.push("اسم البنك/الجهة مطلوب");
          } else if (type === "inventory") {
            const subType = String(row[1] || "").trim();
            entityType = subType.includes("أصل") ? "fixed_asset" : "inventory";
            accountCode = String(row[2] || "");
            metadata.quantity = Number(row[3]) || 0;
            metadata.unit_price = Number(row[4]) || 0;
            const totalVal = Number(row[5]) || (metadata.quantity * metadata.unit_price);
            debit = totalVal;
            credit = 0;
            if (!entityName) errors.push("اسم الصنف/الأصل مطلوب");
          }

          newEntries.push({
            id: generateId(), entity_type: entityType, entity_name: entityName,
            account_code: accountCode, account_name: entityName, debit_amount: debit,
            credit_amount: credit, currency, notes: String(row[row.length - 1] || ""),
            metadata, source: "excel", errors,
          });
        }
        toast.success(`تم استيراد ${file.name} بنجاح`);
      } catch { toast.error(`خطأ في قراءة ${file.name}`); }
    }
    setEntries(prev => [...prev, ...newEntries]);
    setUploading(false);
  }, [currency]);

  // Add manual entry
  const addManualEntry = (type: string) => {
    setEntries(prev => [...prev, {
      id: generateId(), entity_type: type, entity_name: "", account_code: "",
      account_name: "", debit_amount: 0, credit_amount: 0, currency,
      notes: "", metadata: {}, source: "manual", errors: [],
    }]);
  };

  const removeEntry = (id: string) => setEntries(prev => prev.filter(e => e.id !== id));

  const updateEntry = (id: string, field: keyof BalanceEntry, value: any) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  // Summary calculations
  const summary = useMemo(() => {
    const byType: Record<string, { count: number; debit: number; credit: number }> = {};
    let totalDebit = 0, totalCredit = 0;
    entries.forEach(e => {
      if (!byType[e.entity_type]) byType[e.entity_type] = { count: 0, debit: 0, credit: 0 };
      byType[e.entity_type].count++;
      byType[e.entity_type].debit += e.debit_amount;
      byType[e.entity_type].credit += e.credit_amount;
      totalDebit += e.debit_amount;
      totalCredit += e.credit_amount;
    });
    return { byType, totalDebit, totalCredit, diff: totalDebit - totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 };
  }, [entries]);

  const hasErrors = entries.some(e => e.errors.length > 0);
  const hasEntries = entries.length > 0;

  // Post to database
  const handlePost = async () => {
    if (!user) return;
    setPosting(true);
    try {
      // Create batch
      const { data: batch, error: batchErr } = await supabase.from("opening_balance_batches").insert({
        user_id: user.id, batch_date: batchDate, status: "posted",
        total_debit: summary.totalDebit, total_credit: summary.totalCredit, currency, notes,
      }).select().single();
      if (batchErr) throw batchErr;

      // Create entries
      const rows = entries.map(e => ({
        batch_id: batch.id, user_id: user.id, account_code: e.account_code,
        account_name: e.account_name, entity_type: e.entity_type, entity_name: e.entity_name,
        debit_amount: e.debit_amount, credit_amount: e.credit_amount, currency: e.currency,
        metadata: e.metadata, notes: e.notes,
      }));
      const { error: entriesErr } = await supabase.from("opening_balance_entries").insert(rows);
      if (entriesErr) throw entriesErr;

      setBatchId(batch.id);
      setPosted(true);
      setShowConfirm(false);
      toast.success("تم ترحيل الأرصدة الافتتاحية بنجاح! ✅");
    } catch (err: any) {
      console.error(err);
      toast.error("خطأ في الترحيل: " + (err.message || "حاول مرة أخرى"));
    } finally { setPosting(false); }
  };

  const fmt = (n: number) => Number(n).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ═══════ STEP 1: Setup ═══════
  const renderStep1 = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-lg">إعداد الاستيراد</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">تاريخ الأرصدة الافتتاحية</label>
              <Input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">العملة</label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c} ({CURRENCY_SYMBOLS[c]})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">ملاحظات</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات اختيارية..." className="mt-1" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">تحميل القوالب</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">قم بتحميل القوالب الجاهزة، املأها ببياناتك، ثم ارفعها في الخطوة التالية.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TEMPLATES.map(t => (
              <Button key={t.id} variant="outline" className="justify-start gap-2 h-auto py-3" onClick={() => downloadTemplate(t)}>
                <Download className="h-4 w-4 text-primary" />
                <div className="text-right">
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.headers.length} أعمدة</p>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ═══════ STEP 2: Upload ═══════
  const renderStep2 = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-lg">رفع الملفات</CardTitle></CardHeader>
        <CardContent>
          <label
            className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-10 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
          >
            <Upload className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">اسحب الملفات هنا أو انقر للرفع</p>
            <p className="text-xs text-muted-foreground mt-1">xlsx, xls, csv</p>
            <input type="file" className="hidden" multiple accept=".xlsx,.xls,.csv" onChange={e => handleFileUpload(e.target.files)} />
          </label>
          {uploading && <p className="text-sm text-primary mt-3 text-center">جاري القراءة...</p>}
        </CardContent>
      </Card>

      {hasEntries && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">البيانات المستوردة ({entries.length} سطر)</CardTitle>
              {hasErrors && <Badge variant="destructive">يوجد أخطاء</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>النوع</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>رقم الحساب</TableHead>
                    <TableHead>مدين</TableHead>
                    <TableHead>دائن</TableHead>
                    <TableHead>ملاحظات</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map(e => (
                    <TableRow key={e.id} className={e.errors.length > 0 ? "bg-destructive/5" : ""}>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {ENTITY_TYPES.find(t => t.value === e.entity_type)?.label || e.entity_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{e.entity_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{e.account_code || "—"}</TableCell>
                      <TableCell className="text-primary font-medium">{e.debit_amount > 0 ? `${cs}${fmt(e.debit_amount)}` : ""}</TableCell>
                      <TableCell className="text-destructive font-medium">{e.credit_amount > 0 ? `${cs}${fmt(e.credit_amount)}` : ""}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{e.notes}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {e.errors.length > 0 && (
                            <span title={e.errors.join("\n")}><AlertCircle className="h-4 w-4 text-destructive" /></span>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeEntry(e.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {hasErrors && (
              <div className="mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 inline ml-1" />
                يرجى تصحيح الأخطاء قبل المتابعة
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );

  // ═══════ STEP 3: Review ═══════
  const renderStep3 = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-lg">ملخص الاستيراد</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {ENTITY_TYPES.filter(t => summary.byType[t.value]).map(t => {
              const s = summary.byType[t.value];
              const Icon = t.icon;
              return (
                <div key={t.value} className="p-3 rounded-xl border border-border/60 bg-card">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium">{t.label}</span>
                    <Badge variant="outline" className="text-[10px] mr-auto">{s.count}</Badge>
                  </div>
                  {s.debit > 0 && <p className="text-xs text-muted-foreground">مدين: <span className="text-primary font-medium">{cs}{fmt(s.debit)}</span></p>}
                  {s.credit > 0 && <p className="text-xs text-muted-foreground">دائن: <span className="text-destructive font-medium">{cs}{fmt(s.credit)}</span></p>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">ميزان المراجعة</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 text-center">
            <div className="flex-1 p-4 rounded-xl bg-primary/5 border border-primary/20">
              <p className="text-xs text-muted-foreground mb-1">إجمالي المدين</p>
              <p className="text-xl font-bold text-primary">{cs}{fmt(summary.totalDebit)}</p>
            </div>
            <div className="flex-1 p-4 rounded-xl bg-destructive/5 border border-destructive/20">
              <p className="text-xs text-muted-foreground mb-1">إجمالي الدائن</p>
              <p className="text-xl font-bold text-destructive">{cs}{fmt(summary.totalCredit)}</p>
            </div>
            <div className={`flex-1 p-4 rounded-xl border ${summary.balanced ? "bg-primary/5 border-primary/20" : "bg-warning/5 border-warning/20"}`}>
              <p className="text-xs text-muted-foreground mb-1">الحالة</p>
              {summary.balanced ? (
                <p className="text-lg font-bold text-primary flex items-center justify-center gap-1"><CheckCircle className="h-5 w-5" /> متوازن</p>
              ) : (
                <div>
                  <p className="text-lg font-bold text-warning flex items-center justify-center gap-1"><AlertCircle className="h-5 w-5" /> غير متوازن</p>
                  <p className="text-xs text-muted-foreground mt-1">الفرق: {cs}{fmt(Math.abs(summary.diff))}</p>
                </div>
              )}
            </div>
          </div>
          {!summary.balanced && (
            <p className="text-xs text-muted-foreground mt-3 p-2 rounded bg-muted/50">
              سيتم ترحيل الفرق تلقائياً إلى حساب "الأرصدة الافتتاحية" (حقوق ملكية)
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">إضافة قيود يدوية</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {[{ type: "cash", label: "صندوق" }, { type: "loan", label: "قرض" }, { type: "equity", label: "حقوق ملكية" }, { type: "other", label: "أخرى" }].map(b => (
              <Button key={b.type} variant="outline" size="sm" className="gap-1" onClick={() => addManualEntry(b.type)}>
                <Plus className="h-3.5 w-3.5" /> {b.label}
              </Button>
            ))}
          </div>
          {entries.filter(e => e.source === "manual").length > 0 && (
            <div className="mt-4 space-y-2">
              {entries.filter(e => e.source === "manual").map(e => (
                <div key={e.id} className="grid grid-cols-5 gap-2 items-end">
                  <div>
                    <label className="text-[10px] text-muted-foreground">النوع</label>
                    <Select value={e.entity_type} onValueChange={v => updateEntry(e.id, "entity_type", v)}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{ENTITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">الاسم</label>
                    <Input className="h-9 text-xs" value={e.entity_name} onChange={ev => updateEntry(e.id, "entity_name", ev.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">مدين</label>
                    <Input className="h-9 text-xs" type="number" value={e.debit_amount || ""} onChange={ev => updateEntry(e.id, "debit_amount", Number(ev.target.value) || 0)} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">دائن</label>
                    <Input className="h-9 text-xs" type="number" value={e.credit_amount || ""} onChange={ev => updateEntry(e.id, "credit_amount", Number(ev.target.value) || 0)} />
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeEntry(e.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ═══════ STEP 4: Post ═══════
  const renderStep4 = () => (
    <div className="space-y-6">
      {posted ? (
        <Card>
          <CardContent className="py-16 text-center space-y-4">
            <CheckCircle className="h-16 w-16 text-primary mx-auto" />
            <h3 className="text-2xl font-bold">تم الترحيل بنجاح! 🎉</h3>
            <p className="text-muted-foreground">تم ترحيل {entries.length} قيد بتاريخ {batchDate}</p>
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">إجمالي المدين</p>
                <p className="text-lg font-bold text-primary">{cs}{fmt(summary.totalDebit)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">إجمالي الدائن</p>
                <p className="text-lg font-bold text-destructive">{cs}{fmt(summary.totalCredit)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <Scale className="h-12 w-12 text-primary mx-auto" />
            <h3 className="text-xl font-bold">جاهز للترحيل</h3>
            <p className="text-sm text-muted-foreground">سيتم إنشاء {entries.length} قيد بتاريخ {batchDate}</p>
            <Button size="lg" className="gap-2" onClick={() => setShowConfirm(true)} disabled={!hasEntries || hasErrors}>
              <CheckCircle className="h-5 w-5" /> ترحيل الأرصدة الافتتاحية
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const steps = [
    { n: 1, label: "إعداد" },
    { n: 2, label: "رفع الملفات" },
    { n: 3, label: "مراجعة" },
    { n: 4, label: "ترحيل" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <PageHeader title="استيراد الأرصدة الافتتاحية" breadcrumb={["المحاسبة", "استيراد الأرصدة الافتتاحية"]} />

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <button
              onClick={() => { if (s.n < step) setStep(s.n); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                step === s.n ? "bg-primary text-primary-foreground" : step > s.n ? "bg-primary/10 text-primary cursor-pointer" : "bg-muted text-muted-foreground"
              }`}
            >
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-background/20">
                {step > s.n ? <CheckCircle className="h-3.5 w-3.5" /> : s.n}
              </span>
              {s.label}
            </button>
            {i < steps.length - 1 && <div className="w-6 h-px bg-border" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}

      {/* Navigation */}
      {!posted && (
        <div className="flex items-center justify-between">
          <Button variant="outline" disabled={step === 1} onClick={() => setStep(s => s - 1)} className="gap-1">
            <ArrowRight className="h-4 w-4" /> السابق
          </Button>
          {step < 4 && (
            <Button onClick={() => setStep(s => s + 1)} disabled={step === 2 && (!hasEntries || hasErrors)} className="gap-1">
              التالي <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {/* Confirm Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تأكيد الترحيل</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            هل أنت متأكد من ترحيل الأرصدة الافتتاحية؟ سيتم إنشاء {entries.length} قيد بتاريخ {batchDate}.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowConfirm(false)}>إلغاء</Button>
            <Button onClick={handlePost} disabled={posting} className="gap-1">
              {posting ? "جاري الترحيل..." : <><CheckCircle className="h-4 w-4" /> تأكيد الترحيل</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OpeningBalancesImportPage;
