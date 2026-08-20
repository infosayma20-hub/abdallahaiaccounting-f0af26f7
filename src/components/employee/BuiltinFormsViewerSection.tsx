import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BUILTIN_FORMS } from "@/lib/hr/builtinForms";
import { INVENTORY_BALANCE_ITEMS, INVENTORY_BALANCE_LABELS } from "@/lib/hr/inventoryBalanceItems";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Eye, Loader2, CheckCheck } from "lucide-react";

const GENERIC_LABELS: Record<string, string> = {
  employee_name: "اسم الموظف",
  branch: "الفرع",
  shift: "الشفت",
  department: "القسم",
  notes: "ملاحظات",
  reason: "السبب",
  date: "التاريخ",
  attachment_url: "مرفق",
  ...INVENTORY_BALANCE_LABELS,
};

const fieldLabel = (k: string) => GENERIC_LABELS[k] || k;

/**
 * الترتيب المعتمد لعرض حقول النموذج: حقول التعريف أولاً، ثم الأصناف بنفس ترتيب
 * شاشة التعبئة (مصدر واحد: INVENTORY_BALANCE_ITEMS)، ثم الملاحظات والمرفقات آخراً.
 * أي حقل غير معروف يُعرض قبل الملاحظات بترتيب وروده.
 */
const HEAD_KEYS = ["employee_name", "branch", "shift", "department", "date"];
const TAIL_KEYS = ["notes", "reason", "attachment_url"];
const ITEM_KEYS = INVENTORY_BALANCE_ITEMS.map((i) => i.key);

const fieldRank = (k: string) => {
  const h = HEAD_KEYS.indexOf(k);
  if (h !== -1) return 100 + h;
  const i = ITEM_KEYS.indexOf(k);
  if (i !== -1) return 200 + i;
  const t = TAIL_KEYS.indexOf(k);
  if (t !== -1) return 400 + t;
  return 300;
};

const orderedEntries = (data: Record<string, unknown> | null | undefined) =>
  Object.entries(data || {})
    .map((e, idx) => ({ e, idx }))
    .sort((a, b) => fieldRank(a.e[0]) - fieldRank(b.e[0]) || a.idx - b.idx)
    .map((x) => x.e);

type PeriodKey = "today" | "week" | "month" | "all";

const PERIODS: [PeriodKey, string][] = [
  ["today", "اليوم"],
  ["week", "آخر 7 أيام"],
  ["month", "آخر 30 يوم"],
  ["all", "الكل"],
];

const periodStart = (p: PeriodKey): number => {
  const now = new Date();
  if (p === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (p === "week") return now.getTime() - 7 * 864e5;
  if (p === "month") return now.getTime() - 30 * 864e5;
  return 0;
};

const seenKey = (employeeId: string) => `emp-viewer-forms-seen:${employeeId}`;

const loadSeen = (employeeId: string): Set<string> => {
  try {
    const raw = localStorage.getItem(seenKey(employeeId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
};

/**
 * قسم «نماذج للاطلاع»: يعرض النماذج المدمجة التي عبّأها موظفون آخرون
 * (مثل رصيد الأصناف اليومي من مدراء الفروع) للموظف الذي مُنح صلاحية الاطلاع.
 * الحماية فعلية على مستوى قاعدة البيانات (RLS) وليست إخفاء واجهة فقط.
 */
export default function BuiltinFormsViewerSection({
  viewKeys,
  selfEmployeeId,
}: {
  viewKeys: string[];
  selfEmployeeId: string;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<any | null>(null);
  const [filterKey, setFilterKey] = useState<string>(viewKeys[0] || "");
  const [period, setPeriod] = useState<PeriodKey>("week");
  const [unreadOnly, setUnreadOnly] = useState(true);
  const [seen, setSeen] = useState<Set<string>>(() => loadSeen(selfEmployeeId));

  const persistSeen = useCallback(
    (next: Set<string>) => {
      setSeen(new Set(next));
      try {
        localStorage.setItem(seenKey(selfEmployeeId), JSON.stringify(Array.from(next).slice(-500)));
      } catch { /* ignore */ }
    },
    [selfEmployeeId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (viewKeys.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data } = await supabase
        .from("employee_forms")
        .select("id, form_type, form_data, status, created_at, employee_id")
        .in("form_type", viewKeys)
        .neq("employee_id", selfEmployeeId)
        .order("created_at", { ascending: false })
        .limit(100);
      const list = data || [];
      const ids = Array.from(new Set(list.map((r: any) => r.employee_id).filter(Boolean)));
      let nameMap: Record<string, string> = {};
      if (ids.length) {
        const { data: emps } = await supabase.from("employees").select("id, full_name").in("id", ids);
        nameMap = Object.fromEntries((emps || []).map((e: any) => [e.id, e.full_name]));
      }
      if (!cancelled) {
        setRows(list);
        setNames(nameMap);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewKeys.join(","), selfEmployeeId]);

  const formName = (key: string) => BUILTIN_FORMS.find(f => f.key === key)?.name || key;

  const byType = useMemo(
    () => rows.filter(r => !filterKey || r.form_type === filterKey),
    [rows, filterKey],
  );

  const inPeriod = useMemo(() => {
    const from = periodStart(period);
    return byType.filter(r => new Date(r.created_at).getTime() >= from);
  }, [byType, period]);

  // «الجديد فقط» فلتر تفضيلي وليس حاجزاً: إذا ما في جديد ضمن الفترة
  // نعرض كل نماذج الفترة بدل ما تظهر الشاشة فاضية.
  const unreadInPeriod = useMemo(
    () => inPeriod.filter(r => !seen.has(r.id)),
    [inPeriod, seen],
  );

  const showingAllFallback = unreadOnly && unreadInPeriod.length === 0 && inPeriod.length > 0;
  const visible = unreadOnly && unreadInPeriod.length > 0 ? unreadInPeriod : inPeriod;

  const unreadCount = unreadInPeriod.length;

  const markAllRead = () => {
    const next = new Set(seen);
    byType.forEach(r => next.add(r.id));
    persistSeen(next);
  };

  const openRow = (r: any) => {
    setActive(r);
    if (!seen.has(r.id)) {
      const next = new Set(seen);
      next.add(r.id);
      persistSeen(next);
    }
  };

  if (viewKeys.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
          نماذج للاطلاع
          {unreadCount > 0 && (
            <Badge className="text-[10px] h-5">{unreadCount} جديد</Badge>
          )}
        </h3>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <CheckCheck className="h-3.5 w-3.5" /> تعليم الكل كمقروء
          </button>
        )}
      </div>

      {viewKeys.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {viewKeys.map(k => (
            <button
              key={k}
              onClick={() => setFilterKey(k)}
              className={`px-3 py-1.5 rounded-full text-xs border ${filterKey === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
            >
              {formName(k)}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap mb-2">
        {PERIODS.map(([p, label]) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-2.5 py-1 rounded-full text-[11px] border ${period === p ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setUnreadOnly(v => !v)}
          className={`px-2.5 py-1 rounded-full text-[11px] border ${unreadOnly ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
        >
          {unreadOnly ? "الجديد فقط" : "عرض الكل"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin ml-2" /> جاري التحميل...
        </div>
      ) : visible.length === 0 ? (
        <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-2xl">
          لا توجد نماذج ضمن هذه الفترة.
        </div>
      ) : (
        <div className="space-y-2">
          {showingAllFallback && (
            <div className="text-[11px] text-muted-foreground text-center pb-1">
              لا يوجد جديد — يتم عرض كل نماذج الفترة ({inPeriod.length})
            </div>
          )}
          {visible.map(r => (
            <button
              key={r.id}
              onClick={() => openRow(r)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border hover:bg-muted/50 active:scale-[0.99] transition-all text-right"
            >
              <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0">
                <Eye className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {names[r.employee_id] || "موظف"}
                  {r.form_data?.branch ? ` — ${r.form_data.branch}` : ""}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formName(r.form_type)} · {new Date(r.created_at).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
                </div>
              </div>
              {!seen.has(r.id) && (
                <Badge className="text-[10px] shrink-0">جديد</Badge>
              )}
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!active} onOpenChange={o => !o && setActive(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {active ? formName(active.form_type) : ""}
            </DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px]">
                  {names[active.employee_id] || "موظف"}
                </Badge>
                <span>{new Date(active.created_at).toLocaleString("ar-EG")}</span>
              </div>
              <div className="border rounded-xl divide-y">
                {orderedEntries(active.form_data as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3 p-2.5">
                    <span className="text-xs text-muted-foreground">{fieldLabel(k)}</span>
                    <span className="text-sm font-medium break-all">
                      {typeof v === "string" && v.startsWith("http") ? (
                        <a href={v} target="_blank" rel="noreferrer" className="text-primary underline">
                          فتح المرفق
                        </a>
                      ) : (
                        String(v ?? "")
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
