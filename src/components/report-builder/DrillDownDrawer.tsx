import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Copy,
  FileSpreadsheet,
  Loader2,
  ArrowLeftRight,
  Receipt,
  ShoppingBag,
  Package,
  User,
  X,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

const fmtAmt = (n: number) =>
  `₪${Number(n || 0).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// ---------- Drill level definitions ----------
export type DrillLevelType =
  | "group-rows" // raw rows already in memory (the initial drill from grouped table)
  | "invoice-items"
  | "purchase-items"
  | "item-movements"
  | "contact-invoices"
  | "contact-payments";

export interface DrillLevel {
  type: DrillLevelType;
  title: string;
  parentRef?: { id?: string; label: string };
  // either inline rows (for the first level) or fetched async
  rows?: any[];
}

// ---------- Helpers ----------
const ICONS: Record<DrillLevelType, any> = {
  "group-rows": Receipt,
  "invoice-items": ShoppingBag,
  "purchase-items": ShoppingBag,
  "item-movements": ArrowLeftRight,
  "contact-invoices": Receipt,
  "contact-payments": Package,
};

interface Props {
  open: boolean;
  onClose: () => void;
  initialLevel: DrillLevel;
  /** "sales" | "purchases" | "inventory" — used for routing original docs */
  sourceKey: string;
}

export default function DrillDownDrawer({ open, onClose, initialLevel, sourceKey }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [stack, setStack] = useState<DrillLevel[]>([initialLevel]);
  const [loading, setLoading] = useState(false);
  const [fetchedRows, setFetchedRows] = useState<Record<number, any[]>>({ 0: initialLevel.rows || [] });

  // Reset when reopening with a new initialLevel
  useEffect(() => {
    if (open) {
      setStack([initialLevel]);
      setFetchedRows({ 0: initialLevel.rows || [] });
    }
  }, [open, initialLevel]);

  const current = stack[stack.length - 1];
  const currentRows = fetchedRows[stack.length - 1] || [];

  // ---------- Async fetch for non-inline levels ----------
  const fetchLevel = useCallback(async (level: DrillLevel, depth: number) => {
    setLoading(true);
    try {
      let rows: any[] = [];
      if (level.type === "invoice-items" && level.parentRef?.id) {
        const { data } = await supabase
          .from("invoice_items")
          .select("id, product_name, description, quantity, unit_price, discount, tax_rate, total_amount")
          .eq("invoice_id", level.parentRef.id)
          .order("created_at", { ascending: true });
        rows = (data as any) || [];
      } else if (level.type === "purchase-items" && level.parentRef?.id) {
        // purchases share invoice_items (joined via invoice_id of purchase invoice)
        const { data } = await supabase
          .from("invoice_items")
          .select("id, product_name, description, quantity, unit_price, discount, tax_rate, total_amount")
          .eq("invoice_id", level.parentRef.id);
        rows = (data as any) || [];
      } else if (level.type === "item-movements" && level.parentRef?.id) {
        const { data } = await supabase
          .from("stock_movements")
          .select("id, movement_type, quantity, unit_cost, total_cost, reference_number, movement_date, notes")
          .eq("product_id", level.parentRef.id)
          .order("movement_date", { ascending: false })
          .limit(200);
        rows = (data as any) || [];
      } else if (level.type === "contact-invoices" && level.parentRef?.id) {
        const { data } = await supabase
          .from("invoices")
          .select("id, invoice_number, invoice_date, total_amount, paid_amount, status, invoice_type")
          .eq("contact_id", level.parentRef.id)
          .order("invoice_date", { ascending: false })
          .limit(200);
        rows = (data as any) || [];
      }
      setFetchedRows(prev => ({ ...prev, [depth]: rows }));
    } catch (e: any) {
      toast({ title: "تعذّر جلب البيانات", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // ---------- Navigation ----------
  const pushLevel = (level: DrillLevel) => {
    const depth = stack.length;
    setStack(prev => [...prev, level]);
    if (!level.rows) fetchLevel(level, depth);
    else setFetchedRows(prev => ({ ...prev, [depth]: level.rows! }));
  };

  const popTo = (depth: number) => {
    setStack(prev => prev.slice(0, depth + 1));
    setFetchedRows(prev => {
      const next: Record<number, any[]> = {};
      Object.keys(prev).forEach(k => {
        const i = Number(k);
        if (i <= depth) next[i] = prev[i];
      });
      return next;
    });
  };

  // ---------- Row click → drill deeper ----------
  const handleRowDrill = (row: any) => {
    if (current.type === "group-rows") {
      // Decide based on sourceKey
      if (sourceKey === "sales" && row.id) {
        pushLevel({
          type: "invoice-items",
          title: `بنود الفاتورة ${row.invoice_number || ""}`,
          parentRef: { id: row.id, label: row.invoice_number || "فاتورة" },
        });
      } else if (sourceKey === "purchases" && row.id) {
        pushLevel({
          type: "purchase-items",
          title: `بنود المشتريات ${row.invoice_number || ""}`,
          parentRef: { id: row.id, label: row.invoice_number || "مشتريات" },
        });
      } else if (sourceKey === "inventory" && row.id) {
        pushLevel({
          type: "item-movements",
          title: `حركات الصنف: ${row.name || ""}`,
          parentRef: { id: row.id, label: row.name || "صنف" },
        });
      }
    } else if (current.type === "contact-invoices" && row.id) {
      pushLevel({
        type: "invoice-items",
        title: `بنود ${row.invoice_number || ""}`,
        parentRef: { id: row.id, label: row.invoice_number || "فاتورة" },
      });
    }
  };

  // ---------- Quick actions ----------
  const openOriginal = (row: any) => {
    if (sourceKey === "sales" && row.id) navigate(`/invoices/${row.id}`);
    else if (sourceKey === "purchases" && row.id) navigate(`/purchases/${row.id}`);
    else if (sourceKey === "inventory" && row.id) navigate(`/inventory`);
    onClose();
  };

  const openContactSOA = (row: any) => {
    const cid = row.contact_id;
    if (cid) {
      navigate(`/account-statement?contact=${cid}`);
      onClose();
    }
  };

  const copyRef = (row: any) => {
    const ref = row.invoice_number || row.reference_number || row.id || "";
    navigator.clipboard.writeText(String(ref));
    toast({ title: "تم النسخ", description: ref });
  };

  const exportSubset = () => {
    if (!currentRows.length) return;
    const ws = XLSX.utils.json_to_sheet(currentRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تفاصيل");
    XLSX.writeFile(wb, `drill-${current.title}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "تم التصدير ✅" });
  };

  // ---------- Totals ----------
  const total = currentRows.reduce(
    (s, r) =>
      s +
      Number(
        r.total_amount ?? r.total_cost ?? (r.quantity || 0) * (r.unit_price || r.unit_cost || 0),
      ),
    0,
  );

  const Icon = ICONS[current.type];

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent
        side="left"
        className="sm:max-w-2xl w-full p-0 flex flex-col"
        dir="rtl"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/60">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-base font-semibold leading-tight">
                {current.title}
              </SheetTitle>
              <SheetDescription className="text-[11px] mt-0.5">
                {currentRows.length} سجل
                {total > 0 && <> • الإجمالي {fmtAmt(total)}</>}
              </SheetDescription>
            </div>
          </div>

          {/* Breadcrumb */}
          {stack.length > 1 && (
            <div className="flex items-center gap-1 mt-3 flex-wrap text-[11px]">
              {stack.map((lvl, i) => (
                <div key={i} className="flex items-center gap-1">
                  {i > 0 && <ChevronLeft className="h-3 w-3 text-muted-foreground" />}
                  <button
                    onClick={() => popTo(i)}
                    className={cn(
                      "px-2 py-0.5 rounded-md transition-colors",
                      i === stack.length - 1
                        ? "bg-primary/15 text-primary font-semibold cursor-default"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    {lvl.parentRef?.label || lvl.title.split(":")[0]}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={exportSubset}
              disabled={!currentRows.length}
            >
              <FileSpreadsheet className="h-3 w-3" /> تصدير Excel
            </Button>
            {stack.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1"
                onClick={() => popTo(stack.length - 2)}
              >
                <ChevronRight className="h-3 w-3" /> رجوع
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : currentRows.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              لا توجد بيانات
            </div>
          ) : (
            <DrillTable
              rows={currentRows}
              levelType={current.type}
              sourceKey={sourceKey}
              canDrill={canDrillFromLevel(current.type, sourceKey)}
              onDrill={handleRowDrill}
              onOpenOriginal={openOriginal}
              onCopyRef={copyRef}
              onOpenSOA={openContactSOA}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function canDrillFromLevel(t: DrillLevelType, sourceKey: string): boolean {
  if (t === "group-rows") return ["sales", "purchases", "inventory"].includes(sourceKey);
  if (t === "contact-invoices") return true;
  return false;
}

// ---------- Inner table (level-aware columns) ----------
function DrillTable({
  rows,
  levelType,
  sourceKey,
  canDrill,
  onDrill,
  onOpenOriginal,
  onCopyRef,
  onOpenSOA,
}: {
  rows: any[];
  levelType: DrillLevelType;
  sourceKey: string;
  canDrill: boolean;
  onDrill: (row: any) => void;
  onOpenOriginal: (row: any) => void;
  onCopyRef: (row: any) => void;
  onOpenSOA: (row: any) => void;
}) {
  // Column sets per level
  if (levelType === "invoice-items" || levelType === "purchase-items") {
    return (
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-background border-b border-border z-10">
          <tr className="text-right">
            <th className="py-2 px-2 font-medium text-muted-foreground">الصنف</th>
            <th className="py-2 px-2 font-medium text-muted-foreground">الكمية</th>
            <th className="py-2 px-2 font-medium text-muted-foreground">السعر</th>
            <th className="py-2 px-2 font-medium text-muted-foreground">الخصم</th>
            <th className="py-2 px-2 font-medium text-muted-foreground text-left">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} className="border-b border-border/40">
              <td className="py-2 px-2">
                <div className="font-medium">{r.product_name || "—"}</div>
                {r.description && (
                  <div className="text-[10px] text-muted-foreground truncate max-w-[260px]">
                    {r.description}
                  </div>
                )}
              </td>
              <td className="py-2 px-2 font-mono">{r.quantity}</td>
              <td className="py-2 px-2 font-mono">{fmtAmt(r.unit_price || 0)}</td>
              <td className="py-2 px-2 font-mono text-muted-foreground">
                {r.discount ? fmtAmt(r.discount) : "—"}
              </td>
              <td className="py-2 px-2 text-left font-mono font-semibold">
                {fmtAmt(r.total_amount || 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (levelType === "item-movements") {
    return (
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-background border-b border-border z-10">
          <tr className="text-right">
            <th className="py-2 px-2 font-medium text-muted-foreground">التاريخ</th>
            <th className="py-2 px-2 font-medium text-muted-foreground">النوع</th>
            <th className="py-2 px-2 font-medium text-muted-foreground">المرجع</th>
            <th className="py-2 px-2 font-medium text-muted-foreground">الكمية</th>
            <th className="py-2 px-2 font-medium text-muted-foreground text-left">التكلفة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i} className="border-b border-border/40">
              <td className="py-2 px-2 text-muted-foreground">
                {r.movement_date ? format(new Date(r.movement_date), "yyyy-MM-dd") : "—"}
              </td>
              <td className="py-2 px-2">
                <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium">
                  {r.movement_type || "—"}
                </span>
              </td>
              <td className="py-2 px-2 font-mono text-[11px]">{r.reference_number || "—"}</td>
              <td className="py-2 px-2 font-mono">{r.quantity}</td>
              <td className="py-2 px-2 text-left font-mono font-semibold">
                {fmtAmt(r.total_cost || 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // Default: invoice-like rows (group-rows / contact-invoices)
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-background border-b border-border z-10">
        <tr className="text-right">
          {sourceKey !== "inventory" && (
            <>
              <th className="py-2 px-2 font-medium text-muted-foreground">رقم</th>
              <th className="py-2 px-2 font-medium text-muted-foreground">التاريخ</th>
              <th className="py-2 px-2 font-medium text-muted-foreground">
                {sourceKey === "sales" ? "العميل" : "المورد"}
              </th>
            </>
          )}
          {sourceKey === "inventory" && (
            <>
              <th className="py-2 px-2 font-medium text-muted-foreground">الصنف</th>
              <th className="py-2 px-2 font-medium text-muted-foreground">الفئة</th>
              <th className="py-2 px-2 font-medium text-muted-foreground">الكمية</th>
            </>
          )}
          <th className="py-2 px-2 font-medium text-muted-foreground text-left">الإجمالي</th>
          <th className="py-2 px-2 w-10"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr
            key={r.id || i}
            className={cn(
              "border-b border-border/40 transition-colors",
              canDrill && "hover:bg-primary/5 cursor-pointer",
            )}
            onClick={canDrill ? () => onDrill(r) : undefined}
          >
            {sourceKey !== "inventory" && (
              <>
                <td className="py-2 px-2 font-mono text-[11px]">{r.invoice_number || "—"}</td>
                <td className="py-2 px-2 text-muted-foreground">
                  {r.invoice_date
                    ? format(new Date(r.invoice_date), "yyyy-MM-dd")
                    : "—"}
                </td>
                <td className="py-2 px-2">
                  {r.contact_name || r.customer_name || r.supplier_name || "—"}
                </td>
              </>
            )}
            {sourceKey === "inventory" && (
              <>
                <td className="py-2 px-2 font-medium">{r.name}</td>
                <td className="py-2 px-2 text-muted-foreground">{r.category || "—"}</td>
                <td className="py-2 px-2 font-mono">{r.quantity}</td>
              </>
            )}
            <td className="py-2 px-2 text-left font-mono font-semibold">
              {fmtAmt(
                r.total_amount ||
                  (r.quantity || 0) * (r.buy_price || r.unit_cost || 0) ||
                  0,
              )}
            </td>
            <td className="py-2 px-2" onClick={e => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-[10px]">إجراءات سريعة</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => onOpenOriginal(r)}>
                    <ExternalLink className="h-3.5 w-3.5 me-2" /> فتح المستند
                  </DropdownMenuItem>
                  {r.contact_id && (
                    <DropdownMenuItem onClick={() => onOpenSOA(r)}>
                      <User className="h-3.5 w-3.5 me-2" /> كشف حساب الجهة
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onCopyRef(r)}>
                    <Copy className="h-3.5 w-3.5 me-2" /> نسخ المرجع
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
