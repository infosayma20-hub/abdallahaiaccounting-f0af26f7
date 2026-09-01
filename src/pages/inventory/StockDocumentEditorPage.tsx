/**
 * محرّر سند إدخال / إخراج بضاعة.
 * كميات فقط بشكل افتراضي (تؤثر على المخزون عبر stock_movements عند التأكيد)،
 * مع خيار توليد قيد محاسبي، ودعم الاستيراد والتصدير من/إلى إكسل.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Save, CheckCircle2, XCircle, Trash2, Loader2, Plus, FileSpreadsheet, Download,
  Upload, ArrowDownToLine, ArrowUpFromLine, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { multiWordMatchAny } from "@/lib/utils";
import { FinanceShell } from "@/components/finance/shell";
import type { ActionTab } from "@/components/finance/shell";
import SmartSearchableDropdown from "@/components/forms/SmartSearchableDropdown";

type DocType = "in" | "out";
type DocStatus = "draft" | "confirmed" | "cancelled";

interface ProductOpt {
  id: string; name: string; sku: string | null; barcode: string | null;
  unit: string | null; buy_price: number | null;
}
interface LineDraft {
  key: string;
  product_id: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  notes?: string;
}

const newKey = () => Math.random().toString(36).slice(2);

export default function StockDocumentEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id || "";
  const isNew = !id || id === "new";
  const fileRef = useRef<HTMLInputElement>(null);

  const [docType, setDocType] = useState<DocType>((sp.get("type") as DocType) || "in");
  const [docNumber, setDocNumber] = useState<string>("");
  const [docDate, setDocDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [status, setStatus] = useState<DocStatus>("draft");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [createJournal, setCreateJournal] = useState(false);
  const [inventoryAcc, setInventoryAcc] = useState("");
  const [counterAcc, setCounterAcc] = useState("");

  const [lines, setLines] = useState<LineDraft[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const { filterWarehouses, restricted } = useAllowedWarehouses();
  const visibleWarehouses = useMemo(() => filterWarehouses(warehouses), [warehouses, filterWarehouses]);
  const [accounts, setAccounts] = useState<{ account_code: string; account_name: string }[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const readOnly = status !== "draft";

  /* ---------------- load ---------------- */
  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      setLoading(true);
      const [prods, { data: whs }, { data: accs }] = await Promise.all([
        fetchAllRows<ProductOpt>((from, to) =>
          supabase.from("products").select("id,name,sku,barcode,unit,buy_price")
            .eq("user_id", ownerId).order("name").range(from, to) as any),
        supabase.from("warehouses").select("id,name").eq("user_id", ownerId).eq("is_active", true).order("name"),
        supabase.from("accounts").select("account_code,account_name").eq("user_id", ownerId).eq("is_active", true).order("account_code"),
      ]);
      setProducts(prods ?? []);
      setWarehouses((whs ?? []) as any);
      setAccounts((accs ?? []) as any);


      if (!isNew && id) {
        const [{ data: doc }, { data: items }] = await Promise.all([
          supabase.from("stock_documents").select("*").eq("id", id).maybeSingle(),
          supabase.from("stock_document_items").select("*").eq("doc_id", id).order("created_at"),
        ]);
        if (doc) {
          setDocType(doc.doc_type as DocType);
          setDocNumber(doc.doc_number);
          setDocDate(doc.doc_date);
          setWarehouseId(doc.warehouse_id ?? "");
          setStatus(doc.status as DocStatus);
          setReason(doc.reason ?? "");
          setNotes(doc.notes ?? "");
          setCreateJournal(!!doc.create_journal);
          setInventoryAcc(doc.inventory_account_code ?? "");
          setCounterAcc(doc.counter_account_code ?? "");
        }
        setLines((items ?? []).map((i: any) => ({
          key: newKey(),
          product_id: i.product_id,
          product_name: i.product_name ?? "",
          unit: i.unit ?? "",
          quantity: Number(i.quantity) || 0,
          unit_cost: Number(i.unit_cost) || 0,
          notes: i.notes ?? "",
        })));
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ownerId]);

  /* ---------------- derived ---------------- */
  const totals = useMemo(() => ({
    items: lines.length,
    qty: lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0),
    value: lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0),
  }), [lines]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim();
    if (!q) return products.slice(0, 50);
    return products.filter(p =>
      multiWordMatchAny(q, p.name, p.sku ?? "", p.barcode ?? "")
    ).slice(0, 50);
  }, [products, productSearch]);

  const addProduct = (p: ProductOpt) => {
    setProductSearch("");
    setLines(ls => {
      const existing = ls.find(l => l.product_id === p.id);
      if (existing) return ls.map(l => l.product_id === p.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...ls, {
        key: newKey(), product_id: p.id, product_name: p.name,
        unit: p.unit ?? "", quantity: 1, unit_cost: Number(p.buy_price) || 0,
      }];
    });
  };

  const patchLine = (key: string, u: Partial<LineDraft>) =>
    setLines(ls => ls.map(l => l.key === key ? { ...l, ...u } : l));

  /* ---------------- excel ---------------- */
  const downloadTemplate = () => {
    const aoa = [["رقم الصنف / الباركود", "اسم الصنف", "الكمية", "تكلفة الوحدة"], ["", "", "", ""]];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    (ws as any)["!views"] = [{ RTL: true }];
    (ws as any)["!cols"] = [{ wch: 22 }, { wch: 34 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "البنود");
    XLSX.writeFile(wb, "قالب-سند-مخزون.xlsx");
  };

  const exportLines = () => {
    if (!lines.length) { toast.error("لا توجد بنود"); return; }
    const aoa = [
      ["رقم الصنف / الباركود", "اسم الصنف", "الكمية", "تكلفة الوحدة", "الإجمالي"],
      ...lines.map(l => {
        const p = products.find(x => x.id === l.product_id);
        return [p?.sku ?? p?.barcode ?? "", l.product_name, l.quantity, l.unit_cost, l.quantity * l.unit_cost];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    (ws as any)["!views"] = [{ RTL: true }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "البنود");
    XLSX.writeFile(wb, `${docNumber || "سند-مخزون"}.xlsx`);
  };

  const importExcel = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false });
      if (rows.length < 2) { toast.error("الملف فارغ"); return; }

      const bySku = new Map<string, ProductOpt>();
      const byName = new Map<string, ProductOpt>();
      products.forEach(p => {
        if (p.sku) bySku.set(String(p.sku).trim().toLowerCase(), p);
        if (p.barcode) bySku.set(String(p.barcode).trim().toLowerCase(), p);
        byName.set(p.name.trim().toLowerCase(), p);
      });

      const added: LineDraft[] = [];
      const missing: string[] = [];
      rows.slice(1).forEach(r => {
        const code = String(r[0] ?? "").trim().toLowerCase();
        const name = String(r[1] ?? "").trim().toLowerCase();
        const qty = Number(r[2]) || 0;
        const cost = Number(r[3]);
        if (!code && !name) return;
        const p = (code && bySku.get(code)) || (name && byName.get(name));
        if (!p) { missing.push(String(r[0] ?? r[1] ?? "")); return; }
        if (qty <= 0) return;
        added.push({
          key: newKey(), product_id: p.id, product_name: p.name,
          unit: p.unit ?? "", quantity: qty,
          unit_cost: Number.isFinite(cost) && cost > 0 ? cost : Number(p.buy_price) || 0,
        });
      });

      // merge duplicates by product
      setLines(prev => {
        const map = new Map<string, LineDraft>();
        [...prev, ...added].forEach(l => {
          const ex = map.get(l.product_id);
          if (ex) ex.quantity += l.quantity;
          else map.set(l.product_id, { ...l });
        });
        return Array.from(map.values());
      });

      toast.success(`تم استيراد ${added.length} بند`);
      if (missing.length) toast.warning(`${missing.length} صنف غير موجود: ${missing.slice(0, 5).join("، ")}`);
    } catch (e: any) {
      toast.error(e?.message ?? "فشل قراءة الملف");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /* ---------------- persistence ---------------- */
  const saveDraft = useCallback(async (): Promise<string | null> => {
    if (!ownerId) return null;
    if (!warehouseId) { toast.error("اختر المستودع"); return null; }
    const valid = lines.filter(l => l.product_id && Number(l.quantity) > 0);
    if (!valid.length) { toast.error("أضف بنداً واحداً على الأقل بكمية أكبر من صفر"); return null; }
    if (createJournal && (!inventoryAcc || !counterAcc)) {
      toast.error("حدّد حساب المخزون والحساب المقابل");
      return null;
    }

    setSaving(true);
    try {
      let docId = isNew ? null : id!;
      let number = docNumber;
      if (!docId) {
        const { data: num, error: numErr } = await supabase.rpc("allocate_stock_document_number", {
          p_user_id: ownerId, p_doc_type: docType,
        });
        if (numErr) throw numErr;
        number = num as unknown as string;
      }

      const header = {
        user_id: ownerId,
        doc_number: number,
        doc_type: docType,
        doc_date: docDate,
        warehouse_id: warehouseId,
        reason: reason || null,
        notes: notes || null,
        create_journal: createJournal,
        inventory_account_code: createJournal ? inventoryAcc : null,
        counter_account_code: createJournal ? counterAcc : null,
        total_items: valid.length,
        total_quantity: valid.reduce((s, l) => s + Number(l.quantity), 0),
        total_value: valid.reduce((s, l) => s + Number(l.quantity) * (Number(l.unit_cost) || 0), 0),
        created_by: user?.id ?? null,
      };

      if (docId) {
        const { error } = await supabase.from("stock_documents").update(header).eq("id", docId);
        if (error) throw error;
        await supabase.from("stock_document_items").delete().eq("doc_id", docId);
      } else {
        const { data, error } = await supabase.from("stock_documents").insert(header).select("id").single();
        if (error) throw error;
        docId = (data as any).id;
        setDocNumber(number);
      }

      const { error: itemsErr } = await supabase.from("stock_document_items").insert(
        valid.map(l => ({
          doc_id: docId!, user_id: ownerId, product_id: l.product_id,
          product_name: l.product_name, unit: l.unit || null,
          quantity: Number(l.quantity), unit_cost: Number(l.unit_cost) || 0,
          line_total: Number(l.quantity) * (Number(l.unit_cost) || 0),
          notes: l.notes || null,
        })),
      );
      if (itemsErr) throw itemsErr;

      toast.success("تم حفظ السند كمسودة");
      if (isNew) nav(`/stock-documents/${docId}`, { replace: true });
      return docId!;
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الحفظ");
      return null;
    } finally { setSaving(false); }
  }, [ownerId, warehouseId, lines, createJournal, inventoryAcc, counterAcc, isNew, id, docNumber, docType, docDate, reason, notes, user?.id, nav]);

  const confirmDoc = async () => {
    const docId = await saveDraft();
    if (!docId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("confirm_stock_document", { p_doc_id: docId });
      if (error) throw error;
      const res = data as any;
      if (!res?.success) throw new Error(res?.error ?? "فشل التأكيد");
      setStatus("confirmed");
      toast.success(`تم تأكيد السند وتسجيل ${res.movements} حركة مخزون`);
    } catch (e: any) {
      toast.error(e?.message ?? "فشل التأكيد");
    } finally { setSaving(false); }
  };

  const cancelDoc = async () => {
    if (isNew) return;
    const why = window.prompt("سبب الإلغاء؟") ?? "";
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("cancel_stock_document", { p_doc_id: id!, p_reason: why || null });
      if (error) throw error;
      const res = data as any;
      if (!res?.success) throw new Error(res?.error ?? "فشل الإلغاء");
      setStatus("cancelled");
      toast.success("تم إلغاء السند وعكس أثره على المخزون");
    } catch (e: any) {
      toast.error(e?.message ?? "فشل الإلغاء");
    } finally { setSaving(false); }
  };

  /* ---------------- ribbon ---------------- */
  const actionTabs: ActionTab[] = [
    {
      key: "home", label: "عام",
      groups: [
        {
          key: "save", label: "حفظ", items: [
            { key: "save", label: "حفظ مسودة", icon: Save, variant: "primary", onClick: () => { void saveDraft(); }, disabled: saving || readOnly },
            { key: "confirm", label: "تأكيد السند", icon: CheckCircle2, onClick: () => { void confirmDoc(); }, disabled: saving || readOnly },
            { key: "cancel", label: "إلغاء السند", icon: XCircle, variant: "danger", onClick: () => { void cancelDoc(); }, disabled: saving || isNew || status === "cancelled" },
          ],
        },
        {
          key: "excel", label: "إكسل", items: [
            { key: "template", label: "تنزيل قالب", icon: Download, onClick: downloadTemplate },
            { key: "import", label: "استيراد إكسل", icon: Upload, onClick: () => fileRef.current?.click(), disabled: readOnly },
            { key: "export", label: "تصدير البنود", icon: FileSpreadsheet, onClick: exportLines },
          ],
        },
      ],
    },
  ];

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const TypeIcon = docType === "in" ? ArrowDownToLine : ArrowUpFromLine;

  return (
    <FinanceShell
      title={`${docType === "in" ? "سند إدخال بضاعة" : "سند إخراج بضاعة"}${docNumber ? ` — ${docNumber}` : ""}`}
      breadcrumb={[{ label: "المخزون", href: "/inventory" }, { label: "سندات المخزون", href: "/stock-documents" }, { label: docNumber || "جديد" }]}
      actionTabs={actionTabs}
      rightSlot={
        <Badge variant="outline" className="gap-1">
          <TypeIcon className="h-3.5 w-3.5" />
          {status === "draft" ? "مسودة" : status === "confirmed" ? "مؤكد" : "ملغى"}
        </Badge>
      }
    >
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) void importExcel(f); }} />

      {/* Header fields */}
      <div className="rounded-lg border bg-card p-3 mb-3 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-[12px]">نوع السند</Label>
          <Select value={docType} onValueChange={v => setDocType(v as DocType)} disabled={!isNew || readOnly}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="in">إدخال بضاعة</SelectItem>
              <SelectItem value="out">إخراج بضاعة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[12px]">التاريخ</Label>
          <Input type="date" className="h-9" value={docDate} onChange={e => setDocDate(e.target.value)} disabled={readOnly} />
        </div>
        <div>
          <Label className="text-[12px]">المستودع</Label>
          <Select value={warehouseId} onValueChange={setWarehouseId} disabled={readOnly}>
            <SelectTrigger className="h-9"><SelectValue placeholder="اختر المستودع" /></SelectTrigger>
            <SelectContent>
              {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[12px]">السبب</Label>
          <Input className="h-9" value={reason} onChange={e => setReason(e.target.value)} placeholder="جرد أسبوعي، تالف، هدية…" disabled={readOnly} />
        </div>
        <div className="md:col-span-2">
          <Label className="text-[12px]">ملاحظات</Label>
          <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} disabled={readOnly} />
        </div>
        <div className="md:col-span-2 rounded-md border p-2">
          <div className="flex items-center justify-between">
            <Label className="text-[12px]">توليد قيد محاسبي (اختياري)</Label>
            <Switch checked={createJournal} onCheckedChange={setCreateJournal} disabled={readOnly} />
          </div>
          {createJournal && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Select value={inventoryAcc} onValueChange={setInventoryAcc} disabled={readOnly}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="حساب المخزون" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.account_code} value={a.account_code}>{a.account_code} — {a.account_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={counterAcc} onValueChange={setCounterAcc} disabled={readOnly}>
                <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="الحساب المقابل" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.account_code} value={a.account_code}>{a.account_code} — {a.account_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* Add product */}
      {!readOnly && (
        <div className="mb-3 max-w-xl">
          <SmartSearchableDropdown
            value={productSearch}
            onChange={setProductSearch}
            items={filteredProducts}
            getKey={(p: ProductOpt) => p.id}
            getLabel={(p: ProductOpt) => p.name}
            onSelect={addProduct}
            placeholder="ابحث عن صنف بالاسم أو رقم الصنف أو الباركود…"
            renderOption={(p: ProductOpt, active: boolean) => (
              <div className={`flex items-center gap-2 px-2 py-1.5 text-[13px] ${active ? "bg-muted" : ""}`}>
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="flex-1 text-right">{p.name}</span>
                {p.sku && <span className="font-mono text-[11px] text-muted-foreground">{p.sku}</span>}
              </div>
            )}
          />
        </div>
      )}

      {/* Lines */}
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">الصنف</TableHead>
              <TableHead className="text-right w-24">الوحدة</TableHead>
              <TableHead className="text-right w-32">الكمية</TableHead>
              <TableHead className="text-right w-32">تكلفة الوحدة</TableHead>
              <TableHead className="text-right w-32">الإجمالي</TableHead>
              {!readOnly && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={readOnly ? 5 : 6} className="text-center text-sm text-muted-foreground py-8">
                  لا توجد بنود — أضف أصنافاً أو استورد ملف إكسل
                </TableCell>
              </TableRow>
            ) : lines.map(l => (
              <TableRow key={l.key}>
                <TableCell className="text-[12.5px]">{l.product_name}</TableCell>
                <TableCell className="text-[12.5px] text-muted-foreground">{l.unit || "—"}</TableCell>
                <TableCell>
                  <Input type="number" step="any" className="h-8 w-28" value={l.quantity} disabled={readOnly}
                    onChange={e => patchLine(l.key, { quantity: parseFloat(e.target.value) || 0 })} />
                </TableCell>
                <TableCell>
                  <Input type="number" step="any" className="h-8 w-28" value={l.unit_cost} disabled={readOnly}
                    onChange={e => patchLine(l.key, { unit_cost: parseFloat(e.target.value) || 0 })} />
                </TableCell>
                <TableCell className="text-[12.5px] font-medium">
                  {((Number(l.quantity) || 0) * (Number(l.unit_cost) || 0)).toFixed(2)}
                </TableCell>
                {!readOnly && (
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Totals */}
      <div className="mt-3 flex flex-wrap gap-4 text-[13px]">
        <span>عدد الأصناف: <b>{totals.items}</b></span>
        <span>إجمالي الكمية: <b>{totals.qty}</b></span>
        <span>القيمة التقديرية: <b>{totals.value.toFixed(2)}</b></span>
      </div>
    </FinanceShell>
  );
}
