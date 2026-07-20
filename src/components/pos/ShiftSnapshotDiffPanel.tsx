import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Printer,
  RefreshCw,
  ArrowRightLeft,
} from "lucide-react";

/**
 * لوحة مقارنة "لحظة الإغلاق" مقابل "الحالة الحيّة" لوردية POS.
 *
 * - لحظة الإغلاق  ← `pos_shift_close_snapshots` (سجل دائم، لا يتغيّر).
 * - الحالة الحيّة ← `get_pos_shift_reconciliation(session_id)` (يُعاد حسابه من DB).
 *
 * الغرض: يوضّح للمحاسب أي فرق ظهر بعد الإغلاق بسبب تعديلات لاحقة على
 * الطلبيات/الدفعات (تغيير طريقة دفع، إلغاء، إضافة، تعديل سعر صرف).
 * لا تُنشئ اللوحة أي قيود محاسبية — للعرض فقط.
 */

type LiveData = any;
type Snapshot = any;

type Row = {
  label: string;
  snapshot: number;
  live: number;
  format?: "money" | "int";
};

const fmt = (n: number, kind: "money" | "int" = "money") =>
  kind === "int" ? String(Math.round(n)) : n.toFixed(2);

function DiffCell({ diff }: { diff: number }) {
  if (Math.abs(diff) < 0.01) return <span className="text-muted-foreground">—</span>;
  const positive = diff > 0;
  return (
    <span
      className={`font-mono font-semibold ${
        positive ? "text-emerald-700" : "text-rose-700"
      }`}
    >
      {positive ? "+" : ""}
      {diff.toFixed(2)}
    </span>
  );
}

function extractLivePaymentTotal(
  live: LiveData,
  methodKeys: string[],
): number {
  const payments = live?.payments || {};
  let sum = 0;
  for (const k of methodKeys) {
    const block = payments[k];
    if (block && typeof block === "object") {
      sum += Number(block.net_amount || 0);
    }
  }
  return sum;
}

export default function ShiftSnapshotDiffPanel({
  sessionId,
}: {
  sessionId: string;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [live, setLive] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [snapRes, liveRes] = await Promise.all([
        (supabase as any)
          .from("pos_shift_close_snapshots")
          .select("*")
          .eq("session_id", sessionId)
          .maybeSingle(),
        (supabase as any).rpc("get_pos_shift_reconciliation", {
          p_session_id: sessionId,
        }),
      ]);
      if (snapRes.error) throw snapRes.error;
      if (liveRes.error) throw liveRes.error;
      setSnapshot(snapRes.data);
      setLive(liveRes.data);
    } catch (e: any) {
      setError(e?.message || "تعذّر تحميل بيانات المقارنة");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const rows: Row[] = useMemo(() => {
    if (!snapshot || !live) return [];
    const liveOrders = live.orders || {};
    return [
      {
        label: "إجمالي المبيعات (₪)",
        snapshot: Number(snapshot.total_sales || 0),
        live: Number(liveOrders.active_sales_total || 0),
      },
      {
        label: "عدد الطلبات الفعّالة",
        snapshot: Number(snapshot.total_orders || 0),
        live: Number(liveOrders.active_count || 0),
        format: "int",
      },
      {
        label: "نقدي (₪)",
        snapshot: Number(snapshot.cash_ils || 0),
        live: extractLivePaymentTotal(live, ["cash"]),
      },
      {
        label: "بطاقة/فيزا (₪)",
        snapshot: Number(snapshot.visa_ils || 0),
        live: extractLivePaymentTotal(live, [
          "card",
          "visa",
          "credit_card",
          "mastercard",
        ]),
      },
      {
        label: "آجل (₪)",
        snapshot: Number(snapshot.credit_ils || 0),
        live: extractLivePaymentTotal(live, ["credit"]),
      },
      {
        label: "حساب موظف / أخرى (₪)",
        snapshot: Number(snapshot.other_ils || 0),
        live: extractLivePaymentTotal(live, ["employee_account", "other"]),
      },
      {
        label: "النقد المتوقع (₪)",
        snapshot: Number(snapshot.expected_cash || 0),
        live: Number(live?.expected_cash?.ILS?.expected || 0),
      },
    ];
  }, [snapshot, live]);

  const totalDiff = useMemo(
    () => rows.reduce((s, r) => s + Math.abs(r.snapshot - r.live), 0),
    [rows],
  );

  const status: "match" | "edited" | "variance" | "no_snapshot" = useMemo(() => {
    if (!snapshot) return "no_snapshot";
    if (totalDiff < 0.01) return "match";
    // اذا الفرق فقط بالأعداد (لا مالي) نعتبرها "edited"
    const moneyDiff = rows
      .filter((r) => r.format !== "int")
      .reduce((s, r) => s + Math.abs(r.snapshot - r.live), 0);
    return moneyDiff > 0.5 ? "variance" : "edited";
  }, [snapshot, totalDiff, rows]);

  const printReconciliation = () => {
    if (!snapshot || !live) return;
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return;
    const rowsHtml = rows
      .map((r) => {
        const d = r.live - r.snapshot;
        const cls = Math.abs(d) < 0.01 ? "" : d > 0 ? "pos" : "neg";
        return `<tr>
          <td>${r.label}</td>
          <td class="mono">${fmt(r.snapshot, r.format)}</td>
          <td class="mono">${fmt(r.live, r.format)}</td>
          <td class="mono ${cls}">${Math.abs(d) < 0.01 ? "—" : (d > 0 ? "+" : "") + d.toFixed(2)}</td>
        </tr>`;
      })
      .join("");
    const closedAt = snapshot.closed_at
      ? new Date(snapshot.closed_at).toLocaleString("ar-PS")
      : "—";
    win.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>ورقة تسوية وردية</title>
      <style>
        body{font-family:Arial,sans-serif;padding:24px;color:#111}
        h1{font-size:18px;margin:0 0 4px}
        .meta{font-size:12px;color:#555;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{padding:8px 6px;border-bottom:1px solid #ddd;text-align:right}
        th{background:#f5f5f5}
        .mono{font-family:monospace;font-variant-numeric:tabular-nums}
        .pos{color:#065f46;font-weight:700}
        .neg{color:#991b1b;font-weight:700}
        .footnote{margin-top:16px;font-size:11px;color:#666;line-height:1.6}
        .stamp{margin-top:32px;font-size:12px;display:flex;justify-content:space-between}
      </style></head><body>
      <h1>ورقة تسوية وردية — مقارنة الإغلاق مع الحالة الحالية</h1>
      <div class="meta">
        الوردية: ${snapshot.shift_code || "—"} · الكاشير: ${snapshot.cashier_name || "—"} · تاريخ الإغلاق: ${closedAt}
      </div>
      <table>
        <thead><tr>
          <th>البند</th><th>لحظة الإغلاق</th><th>الحالي</th><th>الفرق</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="footnote">
        هذه الورقة لا تُنشئ قيوداً محاسبية. إن ظهر فرق فهو نتيجة تعديل بعد الإغلاق
        (تغيير طريقة دفع / إلغاء طلب / إضافة أو تعديل سعر صرف). يعالجه المحاسب
        بسند قيد يدوي بالبرنامج الرئيسي.
      </div>
      <div class="stamp">
        <span>توقيع المحاسب: ______________________</span>
        <span>التاريخ: ______________________</span>
      </div>
      <script>window.print();</script>
    </body></html>`);
    win.document.close();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground p-3 border rounded-lg bg-muted/20">
        <Loader2 className="h-3 w-3 animate-spin" /> جارٍ تحميل مقارنة الإغلاق مع الحالة الحيّة…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-rose-700 p-3 border border-rose-200 rounded-lg bg-rose-50">
        {error}
      </div>
    );
  }

  if (status === "no_snapshot") {
    return (
      <div className="text-[11px] text-amber-800 p-3 border border-amber-200 rounded-lg bg-amber-50">
        لا يوجد سجل إغلاق دائم لهذه الوردية بعد. الورديات الجديدة ستُخزَّن لحظة الإغلاق تلقائياً.
      </div>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/60 border-b">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />
          مقارنة الإغلاق ↔ الحالة الحالية
          {status === "match" && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 gap-1">
              <CheckCircle2 className="h-3 w-3" /> مطابق للإغلاق
            </Badge>
          )}
          {status === "edited" && (
            <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1">
              <AlertTriangle className="h-3 w-3" /> تعديل بعد الإغلاق
            </Badge>
          )}
          {status === "variance" && (
            <Badge className="bg-rose-100 text-rose-800 border-rose-300 gap-1">
              <AlertTriangle className="h-3 w-3" /> فرق مالي
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] gap-1"
            onClick={load}
          >
            <RefreshCw className="h-3 w-3" /> تحديث
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1"
            onClick={printReconciliation}
            disabled={status === "match"}
          >
            <Printer className="h-3 w-3" /> طباعة ورقة التسوية
          </Button>
        </div>
      </div>

      <table className="w-full text-[11px]">
        <thead className="bg-muted/30">
          <tr>
            <th className="text-right p-2">البند</th>
            <th className="text-right p-2">لحظة الإغلاق</th>
            <th className="text-right p-2">الآن</th>
            <th className="text-right p-2">الفرق</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = r.live - r.snapshot;
            return (
              <tr key={r.label} className="border-t">
                <td className="p-2">{r.label}</td>
                <td className="p-2 font-mono">{fmt(r.snapshot, r.format)}</td>
                <td className="p-2 font-mono">{fmt(r.live, r.format)}</td>
                <td className="p-2">
                  <DiffCell diff={d} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="px-3 py-2 border-t bg-muted/20 text-[10px] text-muted-foreground leading-relaxed">
        ⓘ "لحظة الإغلاق" هي الأرقام التي وقّعها الكاشير على ورقة تسليم الوردية.
        "الآن" هو المجموع بعد أي تعديل لاحق (تغيير طريقة دفع، إلغاء، إعادة تسعير عملة).
        الفرق يعالجه المحاسب بسند قيد يدوي في البرنامج الرئيسي — هذه اللوحة لا تُنشئ أي قيد.
      </div>
    </div>
  );
}