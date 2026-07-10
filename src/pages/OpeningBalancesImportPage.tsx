import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle, ArrowLeft, ArrowRight,
  Trash2, Plus, Users, Building2, Landmark, FileCheck, Package, Wallet, Scale,
  ChevronDown, Save, X, Home, Settings2, FileUp, ListChecks, Send, RotateCcw
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
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id;
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
        user_id: ownerId, batch_date: batchDate, status: "posted",
        total_debit: summary.totalDebit, total_credit: summary.totalCredit, currency, notes,
      }).select().single();
      if (batchErr) throw batchErr;

      // Create entries
      const rows = entries.map(e => ({
        batch_id: batch.id, user_id: ownerId, account_code: e.account_code,
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
    <div className="space-y-3">
      <FastTab
        title="إعداد الاستيراد"
        summary={`${batchDate} · ${currency}`}
        defaultOpen
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 p-4">
          <FSField label="تاريخ الأرصدة الافتتاحية" required>
            <Input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} className="h-8" />
          </FSField>
          <FSField label="العملة" required>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c} ({CURRENCY_SYMBOLS[c]})</SelectItem>)}
              </SelectContent>
            </Select>
          </FSField>
          <FSField label="ملاحظات" className="md:col-span-3">
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات اختيارية…" className="min-h-[60px]" />
          </FSField>
        </div>
      </FastTab>

      <FastTab
        title="القوالب"
        summary={`${TEMPLATES.length} قوالب متاحة`}
        defaultOpen
      >
        <div className="p-4">
          <p className="text-xs text-muted-foreground mb-3">حمّل القالب، عبّي البيانات، ثم ارفعه في خطوة «رفع الملفات».</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => downloadTemplate(t)}
                className="group flex items-center gap-2 border border-border/60 bg-card hover:bg-accent/40 hover:border-primary/40 rounded px-3 py-2 text-right transition"
              >
                <Download className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground">{t.headers.length} أعمدة</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </FastTab>
    </div>
  );

  // ═══════ STEP 2: Upload ═══════
  const renderStep2 = () => (
    <div className="space-y-3">
      <FastTab title="رفع الملفات" summary="xlsx · xls · csv" defaultOpen>
        <div className="p-4">
          <label
            className="flex flex-col items-center justify-center border border-dashed border-border/70 rounded p-8 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors bg-muted/20"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
          >
            <FileUp className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">اسحب الملفات هنا أو انقر للرفع</p>
            <p className="text-[11px] text-muted-foreground mt-1">xlsx · xls · csv</p>
            <input type="file" className="hidden" multiple accept=".xlsx,.xls,.csv" onChange={e => handleFileUpload(e.target.files)} />
          </label>
          {uploading && <p className="text-xs text-primary mt-2 text-center">جاري القراءة…</p>}
        </div>
      </FastTab>

      {hasEntries && (
        <FastTab
          title="البيانات المستوردة"
          summary={`${entries.length} سطر${hasErrors ? " · يوجد أخطاء" : ""}`}
          defaultOpen
          badge={hasErrors ? <Badge variant="destructive" className="text-[10px] h-5">أخطاء</Badge> : undefined}
        >
          <div className="p-2">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
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
              <div className="mt-2 mx-2 mb-2 p-2 rounded border-r-2 border-destructive bg-destructive/10 text-destructive text-xs flex items-center gap-2">
                <AlertCircle className="h-4 w-4 inline ml-1" />
                يرجى تصحيح الأخطاء قبل المتابعة
              </div>
            )}
          </div>
        </FastTab>
      )}
    </div>
  );

  // ═══════ STEP 3: Review ═══════
  const renderStep3 = () => (
    <div className="space-y-3">
      <FastTab title="ملخص الاستيراد" summary={`${entries.length} قيد`} defaultOpen>
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {ENTITY_TYPES.filter(t => summary.byType[t.value]).map(t => {
              const s = summary.byType[t.value];
              const Icon = t.icon;
              return (
                <div key={t.value} className="p-2.5 rounded border border-border/60 bg-card">
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
        </div>
      </FastTab>

      <FastTab
        title="ميزان المراجعة"
        summary={summary.balanced ? "متوازن" : `فرق ${cs}${fmt(Math.abs(summary.diff))}`}
        defaultOpen
        badge={
          summary.balanced
            ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 text-[10px] h-5">متوازن</Badge>
            : <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 text-[10px] h-5">غير متوازن</Badge>
        }
      >
        <div className="p-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded border border-border/60 bg-card">
              <p className="text-[11px] text-muted-foreground mb-1">إجمالي المدين</p>
              <p className="text-lg font-bold text-primary">{cs}{fmt(summary.totalDebit)}</p>
            </div>
            <div className="p-3 rounded border border-border/60 bg-card">
              <p className="text-[11px] text-muted-foreground mb-1">إجمالي الدائن</p>
              <p className="text-lg font-bold text-destructive">{cs}{fmt(summary.totalCredit)}</p>
            </div>
            <div className={`p-3 rounded border ${summary.balanced ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
              <p className="text-[11px] text-muted-foreground mb-1">الحالة</p>
              {summary.balanced ? (
                <p className="text-base font-bold text-emerald-600 flex items-center justify-center gap-1"><CheckCircle className="h-4 w-4" /> متوازن</p>
              ) : (
                <div>
                  <p className="text-base font-bold text-amber-600 flex items-center justify-center gap-1"><AlertCircle className="h-4 w-4" /> غير متوازن</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">الفرق: {cs}{fmt(Math.abs(summary.diff))}</p>
                </div>
              )}
            </div>
          </div>
          {!summary.balanced && (
            <p className="text-[11px] text-muted-foreground mt-3 p-2 rounded border-r-2 border-amber-500 bg-amber-500/5">
              سيتم ترحيل الفرق تلقائياً إلى حساب "الأرصدة الافتتاحية" (حقوق ملكية)
            </p>
          )}
        </div>
      </FastTab>

      <FastTab title="إضافة قيود يدوية" summary="صندوق · قرض · حقوق ملكية · أخرى">
        <div className="p-4">
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
        </div>
      </FastTab>
    </div>
  );

  // ═══════ STEP 4: Post ═══════
  const renderStep4 = () => (
    <div className="space-y-3">
      {posted ? (
        <FastTab title="اكتمل الترحيل" summary={`المرجع: ${batchId?.slice(0, 8) || ""}`} defaultOpen>
          <div className="py-10 text-center space-y-3 px-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold">تم الترحيل بنجاح</h3>
            <p className="text-sm text-muted-foreground">تم ترحيل {entries.length} قيد بتاريخ {batchDate}</p>
            <div className="flex items-center justify-center gap-6 mt-3">
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground">إجمالي المدين</p>
                <p className="text-base font-bold text-primary">{cs}{fmt(summary.totalDebit)}</p>
              </div>
              <div className="text-center">
                <p className="text-[11px] text-muted-foreground">إجمالي الدائن</p>
                <p className="text-base font-bold text-destructive">{cs}{fmt(summary.totalCredit)}</p>
              </div>
            </div>
          </div>
        </FastTab>
      ) : (
        <FastTab title="جاهز للترحيل" summary={`${entries.length} قيد · ${batchDate}`} defaultOpen>
          <div className="py-8 text-center space-y-3 px-4">
            <Scale className="h-10 w-10 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">راجع الملخص، ثم اضغط «ترحيل» في شريط الأوامر بالأعلى.</p>
            <Button size="sm" className="gap-1" onClick={() => setShowConfirm(true)} disabled={!hasEntries || hasErrors}>
              <Send className="h-4 w-4" /> ترحيل الأرصدة الافتتاحية
            </Button>
          </div>
        </FastTab>
      )}
    </div>
  );

  const steps = [
    { n: 1, label: "إعداد", icon: Settings2 },
    { n: 2, label: "رفع الملفات", icon: FileUp },
    { n: 3, label: "مراجعة", icon: ListChecks },
    { n: 4, label: "ترحيل", icon: Send },
  ];

  const resetAll = () => {
    setEntries([]);
    setStep(1);
    setPosted(false);
    setBatchId(null);
    setNotes("");
  };

  return (
    <div className="min-h-screen bg-muted/30" dir="rtl">
      {/* ═══ Dynamics-style workspace shell ═══ */}
      <div className="bg-background border-b border-border/60">
        {/* Breadcrumb + title */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
            <Home className="h-3 w-3" />
            <button onClick={() => navigate("/finance")} className="hover:text-primary transition">المالية</button>
            <span>›</span>
            <button onClick={() => navigate("/finance/quick-import")} className="hover:text-primary transition">الإدخال السريع</button>
            <span>›</span>
            <span className="text-foreground">استيراد الأرصدة الافتتاحية</span>
          </div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">دفتر الأستاذ العام</p>
              <h1 className="text-xl font-bold text-foreground leading-tight">استيراد الأرصدة الافتتاحية</h1>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {posted ? "مرحّل" : "مسودة"}
            </div>
          </div>
        </div>

        {/* Action pane (ribbon) */}
        <div className="px-4 pb-2 flex items-center gap-1 border-t border-border/40 bg-muted/20">
          <RibbonBtn icon={Send} label="ترحيل" primary
            disabled={!hasEntries || hasErrors || posted}
            onClick={() => setShowConfirm(true)} />
          <RibbonSep />
          <RibbonBtn icon={Save} label="حفظ مسودة" disabled={!hasEntries || posted} onClick={() => toast.success("تم حفظ المسودة محلياً")} />
          <RibbonBtn icon={RotateCcw} label="إعادة تعيين" onClick={resetAll} />
          <RibbonSep />
          <RibbonBtn icon={Download} label="القوالب" onClick={() => setStep(1)} />
          <RibbonBtn icon={Upload} label="رفع ملف" onClick={() => setStep(2)} />
          <RibbonSep />
          <RibbonBtn icon={X} label="إغلاق" onClick={() => navigate("/finance/quick-import")} />

          <div className="mr-auto flex items-center gap-3 text-[11px] text-muted-foreground pl-2">
            <span>الإجمالي: <span className="font-mono font-semibold text-foreground">{cs}{fmt(summary.totalDebit)}</span></span>
            <span className="text-border">|</span>
            <span>عدد القيود: <span className="font-semibold text-foreground">{entries.length}</span></span>
          </div>
        </div>

        {/* Wizard tabs (FastTab-strip look) */}
        <div className="px-4 flex items-stretch border-t border-border/40 bg-background overflow-x-auto">
          {steps.map((s) => {
            const Icon = s.icon;
            const active = step === s.n;
            const done = step > s.n;
            return (
              <button
                key={s.n}
                onClick={() => { if (s.n < step || done) setStep(s.n); }}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? "border-primary text-primary bg-primary/5"
                    : done
                    ? "border-transparent text-foreground hover:bg-muted/40 cursor-pointer"
                    : "border-transparent text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                  active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {done ? <CheckCircle className="h-3 w-3" /> : s.n}
                </span>
                <Icon className="h-3.5 w-3.5" />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content workspace */}
      <div className="px-4 py-4 max-w-[1400px] mx-auto">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}

        {/* Wizard navigation */}
        {!posted && (
          <div className="mt-4 flex items-center justify-between bg-background border border-border/60 rounded px-3 py-2">
            <Button variant="outline" size="sm" disabled={step === 1} onClick={() => setStep(s => s - 1)} className="gap-1 h-8">
              <ArrowRight className="h-3.5 w-3.5" /> السابق
            </Button>
            <div className="text-[11px] text-muted-foreground">الخطوة {step} من {steps.length}</div>
            {step < 4 ? (
              <Button size="sm" onClick={() => setStep(s => s + 1)} disabled={step === 2 && (!hasEntries || hasErrors)} className="gap-1 h-8">
                التالي <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={() => setShowConfirm(true)} disabled={!hasEntries || hasErrors} className="gap-1 h-8">
                <Send className="h-3.5 w-3.5" /> ترحيل
              </Button>
            )}
          </div>
        )}
      </div>

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

/* ─────────── Dynamics-style helpers ─────────── */

function RibbonBtn({
  icon: Icon, label, onClick, disabled, primary,
}: { icon: any; label: string; onClick?: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 h-8 px-2.5 rounded text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        primary
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "text-foreground hover:bg-accent"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function RibbonSep() {
  return <div className="h-5 w-px bg-border mx-1" />;
}

function FSField({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

function FastTab({
  title, summary, badge, defaultOpen, children,
}: { title: string; summary?: string; badge?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="bg-background border border-border/60 rounded overflow-hidden">
      <CollapsibleTrigger className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors border-b border-border/40 text-right">
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <div className="mr-auto flex items-center gap-2">
          {badge}
          {summary && <span className="text-[11px] text-muted-foreground">{summary}</span>}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}
