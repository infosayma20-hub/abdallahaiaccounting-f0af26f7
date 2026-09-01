/**
 * سندات إدخال / إخراج البضاعة — قائمة السندات.
 * تصميم Dynamics FinanceShell (نفس شريط الفواتير).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Plus, Loader2, RefreshCw, ArrowDownToLine, ArrowUpFromLine, FileSpreadsheet, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";
import { FinanceShell } from "@/components/finance/shell";
import type { ActionTab } from "@/components/finance/shell";
import EmptyState from "@/components/EmptyState";
import * as XLSX from "xlsx";
import { toast } from "sonner";

type DocType = "in" | "out";
type DocStatus = "draft" | "confirmed" | "cancelled";

interface DocRow {
  id: string;
  doc_number: string;
  doc_type: DocType;
  doc_date: string;
  status: DocStatus;
  reason: string | null;
  total_items: number;
  total_quantity: number;
  total_value: number;
  warehouse_id: string | null;
}

const STATUS_META: Record<DocStatus, { label: string; cls: string }> = {
  draft: { label: "مسودة", cls: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  confirmed: { label: "مؤكد", cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelled: { label: "ملغى", cls: "bg-destructive/10 text-destructive border-destructive/20" },
};

export default function StockDocumentsPage() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const ownerId = dataOwnerId || user?.id || "";

  const typeFilter = (sp.get("type") as DocType | "all") || "all";
  const [statusFilter, setStatusFilter] = useState<DocStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<DocRow[]>([]);
  const [warehouses, setWarehouses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const [{ data: docs }, { data: whs }] = await Promise.all([
      supabase.from("stock_documents")
        .select("id,doc_number,doc_type,doc_date,status,reason,total_items,total_quantity,total_value,warehouse_id")
        .eq("user_id", ownerId)
        .order("doc_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("warehouses").select("id,name").eq("user_id", ownerId),
    ]);
    setRows((docs ?? []) as any);
    setWarehouses(Object.fromEntries((whs ?? []).map((w: any) => [w.id, w.name])));
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const filtered = useMemo(() => {
    const q = search.trim();
    return rows.filter(r =>
      (typeFilter === "all" || r.doc_type === typeFilter) &&
      (statusFilter === "all" || r.status === statusFilter) &&
      (!q || r.doc_number.includes(q) || (r.reason ?? "").includes(q))
    );
  }, [rows, typeFilter, statusFilter, search]);

  const exportExcel = () => {
    if (!filtered.length) { toast.error("لا توجد سندات للتصدير"); return; }
    const aoa = [
      ["رقم السند", "النوع", "التاريخ", "المستودع", "الحالة", "عدد الأصناف", "إجمالي الكمية", "القيمة", "السبب"],
      ...filtered.map(r => [
        r.doc_number,
        r.doc_type === "in" ? "إدخال" : "إخراج",
        r.doc_date,
        r.warehouse_id ? warehouses[r.warehouse_id] ?? "" : "",
        STATUS_META[r.status].label,
        r.total_items, r.total_quantity, r.total_value, r.reason ?? "",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    (ws as any)["!views"] = [{ RTL: true }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "سندات المخزون");
    XLSX.writeFile(wb, "سندات-المخزون.xlsx");
  };

  const actionTabs: ActionTab[] = [
    {
      key: "home", label: "عام",
      groups: [
        {
          key: "new", label: "جديد", items: [
            { key: "new-in", label: "سند إدخال", icon: ArrowDownToLine, variant: "primary", onClick: () => nav("/stock-documents/new?type=in") },
            { key: "new-out", label: "سند إخراج", icon: ArrowUpFromLine, onClick: () => nav("/stock-documents/new?type=out") },
          ],
        },
        {
          key: "actions", label: "إجراءات", items: [
            { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: () => setRefreshKey(k => k + 1), disabled: loading },
            { key: "export", label: "تصدير إكسل", icon: FileSpreadsheet, onClick: exportExcel },
          ],
        },
      ],
    },
  ];

  return (
    <FinanceShell
      title="سندات إدخال وإخراج البضاعة"
      breadcrumb={[{ label: "المخزون", href: "/inventory" }, { label: "سندات المخزون" }]}
      actionTabs={actionTabs}
      rightSlot={
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="رقم السند / السبب"
              className="h-8 w-44 pr-7 text-[12.5px]"
            />
          </div>
          <Select value={typeFilter} onValueChange={v => setSp(v === "all" ? {} : { type: v })}>
            <SelectTrigger className="h-8 w-28 text-[12.5px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              <SelectItem value="in">إدخال</SelectItem>
              <SelectItem value="out">إخراج</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
            <SelectTrigger className="h-8 w-28 text-[12.5px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="draft">مسودة</SelectItem>
              <SelectItem value="confirmed">مؤكد</SelectItem>
              <SelectItem value="cancelled">ملغى</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Plus className="h-8 w-8 text-muted-foreground" />}
          title="لا توجد سندات"
          description="أنشئ سند إدخال أو إخراج بضاعة لتعديل الكميات بشكل موثّق."
          primaryAction={{ label: "سند إدخال جديد", onClick: () => nav("/stock-documents/new?type=in") }}
        />

      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">رقم السند</TableHead>
                <TableHead className="text-right">النوع</TableHead>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">المستودع</TableHead>
                <TableHead className="text-right">الأصناف</TableHead>
                <TableHead className="text-right">الكمية</TableHead>
                <TableHead className="text-right">القيمة</TableHead>
                <TableHead className="text-right">الحالة</TableHead>
                <TableHead className="text-right">السبب</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => nav(`/stock-documents/${r.id}`)}>
                  <TableCell className="font-mono text-xs">{r.doc_number}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1 text-[12.5px]">
                      {r.doc_type === "in"
                        ? <><ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" /> إدخال</>
                        : <><ArrowUpFromLine className="h-3.5 w-3.5 text-destructive" /> إخراج</>}
                    </span>
                  </TableCell>
                  <TableCell className="text-[12.5px]">{r.doc_date}</TableCell>
                  <TableCell className="text-[12.5px]">{r.warehouse_id ? warehouses[r.warehouse_id] ?? "—" : "—"}</TableCell>
                  <TableCell className="text-[12.5px]">{r.total_items}</TableCell>
                  <TableCell className="text-[12.5px]">{r.total_quantity}</TableCell>
                  <TableCell className="text-[12.5px]">{Number(r.total_value || 0).toFixed(2)}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_META[r.status].cls}>{STATUS_META[r.status].label}</Badge></TableCell>
                  <TableCell className="text-[12.5px] text-muted-foreground">{r.reason ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </FinanceShell>
  );
}
