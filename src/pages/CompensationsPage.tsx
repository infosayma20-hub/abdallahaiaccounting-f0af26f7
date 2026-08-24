import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import useDataOwnerId from "@/hooks/useDataOwnerId";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Plus, Search, Loader2, Pencil, RefreshCw, HandCoins } from "lucide-react";
import { toast } from "sonner";

export const PARTY_KINDS = ["موظف", "شركة توصيل", "شركة أخرى", "مورد", "زبون", "أخرى"] as const;
export const COMP_STATUSES = ["قيد المتابعة", "تم التحصيل/الخصم", "ملغي"] as const;
export const COMP_CURRENCIES = ["ILS", "JOD", "USD"] as const;
export const COMP_TYPES = ["مبلغ مالي", "وجبة/منتج مجاني", "خصم على الطلب القادم", "استبدال منتج", "قسيمة شرائية", "أخرى"] as const;

export const CURRENCY_SYMBOLS: Record<string, string> = { ILS: "₪", JOD: "د.أ", USD: "$" };

interface CompensationRow {
  id: string;
  party_kind: string;
  party_name: string;
  employee_id: string | null;
  contact_id: string | null;
  branch_id: string | null;
  complaint_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  compensation_type: string | null;
  responder_name: string | null;
  responder_employee_id: string | null;
  compensated_at: string | null;
  compensated_by: string | null;
  compensation_date: string;
  amount: number;
  currency: string;
  details: string;
  status: string;
  notes: string | null;
  created_at: string;
}

interface BranchOption { id: string; name: string }

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
function dayName(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return AR_DAYS[d.getDay()];
}

export function formatMoney(amount: number, currency: string): string {
  const num = Number(amount || 0);
  const formatted = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(num);
  return `${formatted} ${CURRENCY_SYMBOLS[currency] || currency}`;
}

export default function CompensationsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const [rows, setRows] = useState<CompensationRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "قيد المتابعة" | "تم التحصيل/الخصم" | "ملغي">("all");
  const [kindFilter, setKindFilter] = useState<string>("all");

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    try {
      const [{ data, error }, { data: br }] = await Promise.all([
        supabase
          .from("compensations")
          .select("id, party_kind, party_name, employee_id, contact_id, branch_id, complaint_id, customer_name, customer_phone, compensation_type, responder_name, responder_employee_id, compensated_at, compensated_by, compensation_date, amount, currency, details, status, notes, created_at")
          .eq("user_id", dataOwnerId)
          .order("compensation_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("branches").select("id, name").eq("user_id", dataOwnerId).eq("is_active", true).order("name"),
      ]);
      if (error) throw error;
      setRows((data || []) as CompensationRow[]);
      setBranches((br || []) as BranchOption[]);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحميل التعويضات");
    } finally {
      setLoading(false);
    }
  }, [dataOwnerId]);

  useEffect(() => { void load(); }, [load]);

  const branchName = (id: string | null) => branches.find(b => b.id === id)?.name || "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== "all" && (r.status || "قيد المتابعة") !== statusFilter) return false;
      if (kindFilter !== "all" && r.party_kind !== kindFilter) return false;
      if (!q) return true;
      return [r.party_name, r.party_kind, r.details, r.notes, branchName(r.branch_id), r.customer_name, r.customer_phone, r.responder_name, r.compensation_type]
        .some(v => (v || "").toString().toLowerCase().includes(q));
    });
  }, [rows, search, branches, statusFilter, kindFilter]);

  // Per-currency totals over the filtered set (multi-currency standard: never mix)
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filtered) {
      if ((r.status || "قيد المتابعة") === "ملغي") continue;
      map.set(r.currency, (map.get(r.currency) || 0) + Number(r.amount || 0));
    }
    return Array.from(map.entries());
  }, [filtered]);

  const StatusBadge = ({ s }: { s: string }) => {
    const v = s || "قيد المتابعة";
    if (v === "تم التحصيل/الخصم") return <Badge className="bg-emerald-600 hover:bg-emerald-600">تم التحصيل/الخصم</Badge>;
    if (v === "ملغي") return <Badge variant="outline" className="text-muted-foreground">ملغي</Badge>;
    return <Badge className="bg-amber-500 hover:bg-amber-500">قيد المتابعة</Badge>;
  };

  const [savingId, setSavingId] = useState<string | null>(null);
  const toggleStatus = async (r: CompensationRow) => {
    const cur = r.status || "قيد المتابعة";
    const next = cur === "تم التحصيل/الخصم" ? "قيد المتابعة" : "تم التحصيل/الخصم";
    setSavingId(r.id);
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: next } : x));
    const { error } = await supabase.from("compensations").update({ status: next }).eq("id", r.id);
    setSavingId(null);
    if (error) {
      setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: cur } : x));
      toast.error(error.message || "تعذّر تغيير الحالة");
    } else {
      toast.success(`تم تغيير الحالة إلى: ${next}`);
    }
  };

  const StatusToggle = ({ r }: { r: CompensationRow }) => (
    <button
      type="button"
      disabled={savingId === r.id || (r.status === "ملغي")}
      onClick={(e) => { e.stopPropagation(); void toggleStatus(r); }}
      title={r.status === "ملغي" ? "سجل ملغي" : "اضغط لتغيير الحالة"}
      className="disabled:opacity-60"
    >
      <StatusBadge s={r.status} />
    </button>
  );

  // "هل تم التعويض" — يُسجَّل عندما يستلم الزبون التعويض فعلياً
  // (مثلاً عندما يطلبه في طلبه القادم). قابل للتراجع.
  const toggleCompensated = async (r: CompensationRow) => {
    const wasDone = !!r.compensated_at;
    const nextAt = wasDone ? null : new Date().toISOString();
    setSavingId(r.id);
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, compensated_at: nextAt } : x));
    const { error } = await supabase
      .from("compensations")
      .update({ compensated_at: nextAt, compensated_by: wasDone ? null : (user?.id ?? null) })
      .eq("id", r.id);
    setSavingId(null);
    if (error) {
      setRows(prev => prev.map(x => x.id === r.id ? { ...x, compensated_at: r.compensated_at } : x));
      toast.error(error.message || "تعذّر تسجيل حالة التعويض");
    } else {
      toast.success(wasDone ? "تم التراجع عن تسجيل التعويض" : "تم تسجيل أن الزبون استلم التعويض");
    }
  };

  const CompensatedToggle = ({ r }: { r: CompensationRow }) => {
    const done = !!r.compensated_at;
    const dateStr = done ? new Date(r.compensated_at!).toLocaleDateString("en-GB") : "";
    return (
      <button
        type="button"
        disabled={savingId === r.id || r.status === "ملغي"}
        onClick={(e) => { e.stopPropagation(); void toggleCompensated(r); }}
        title={done ? `تم التعويض بتاريخ ${dateStr} — اضغط للتراجع` : "اضغط لتسجيل أن الزبون استلم التعويض"}
        className="disabled:opacity-60"
      >
        {done
          ? <Badge className="bg-emerald-600 hover:bg-emerald-600 whitespace-nowrap">تم التعويض ✓ {dateStr}</Badge>
          : <Badge variant="outline" className="text-amber-700 border-amber-400 whitespace-nowrap">لم يُعوَّض بعد</Badge>}
      </button>
    );
  };

  const openNew = () => navigate("/compensations/new");
  const openEdit = (r: CompensationRow) => navigate(`/compensations/${r.id}`);

  const actionTabs: ActionTab[] = useMemo(() => [
    {
      key: "general",
      label: "عام",
      groups: [
        {
          key: "new",
          label: "جديد",
          items: [
            { key: "new", label: "تعويض جديد", icon: Plus, variant: "primary", onClick: openNew },
          ],
        },
        {
          key: "actions",
          label: "إجراءات",
          items: [
            { key: "refresh", label: "تحديث", icon: RefreshCw, onClick: () => void load() },
            { key: "back", label: "رجوع", icon: ArrowRight, onClick: () => navigate("/choose-workspace") },
          ],
        },
      ],
    },
  ], [load, navigate]);

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background">
      <FinanceShell
        title="التعويضات"
        breadcrumb={[{ label: "مساحة العمل", href: "/choose-workspace" }, { label: "التعويضات" }]}
        actionTabs={actionTabs}
        rightSlot={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              {([["all", "الكل"], ["قيد المتابعة", "قيد المتابعة"], ["تم التحصيل/الخصم", "تم التحصيل/الخصم"], ["ملغي", "ملغي"]] as const).map(([v, l]) => (
                <Button
                  key={v}
                  size="sm"
                  variant={statusFilter === v ? "default" : "outline"}
                  className="h-8 text-[12px]"
                  onClick={() => setStatusFilter(v as any)}
                >{l}</Button>
              ))}
            </div>
            <Select value={kindFilter} onValueChange={setKindFilter}>
              <SelectTrigger className="h-8 w-[130px] text-[12px]"><SelectValue placeholder="نوع الجهة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                {PARTY_KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative w-[200px]">
              <Search className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم، التفاصيل..."
                className="pr-7 h-8 text-[12.5px]"
              />
            </div>
            <Badge variant="secondary" className="h-7 gap-1"><HandCoins className="w-3.5 h-3.5" /> {filtered.length} تعويض</Badge>
          </div>
        }
      >
      <main className="flex-1 p-3 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">لا يوجد تعويضات مسجلة</div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="grid gap-2 md:hidden">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openEdit(r)}
                  className="text-right bg-background border rounded-lg p-3 space-y-1 hover:border-primary transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm">{r.party_name}</span>
                    <StatusToggle r={r} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.party_kind} • {dayName(r.compensation_date)} {r.compensation_date} • {branchName(r.branch_id)}
                  </div>
                  <div className="text-sm font-bold tabular-nums">{formatMoney(r.amount, r.currency)}</div>
                  <div className="text-xs line-clamp-2">{r.details}</div>
                </div>
              ))}
            </div>

            {/* Desktop grid */}
            <div className="hidden md:block bg-background border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-xs">
                  <tr className="[&>th]:p-2 [&>th]:text-right [&>th]:font-medium">
                    <th>الجهة المتحمِّلة</th><th>النوع</th><th>اليوم</th><th>التاريخ</th><th>الفرع</th>
                    <th>المبلغ</th><th>تفاصيل التعويض</th><th>الحالة</th><th>ملاحظات</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30 [&>td]:p-2 [&>td]:align-top">
                      <td className="font-medium whitespace-nowrap">{r.party_name}</td>
                      <td className="whitespace-nowrap"><Badge variant="outline">{r.party_kind}</Badge></td>
                      <td className="whitespace-nowrap">{dayName(r.compensation_date)}</td>
                      <td className="whitespace-nowrap">{r.compensation_date}</td>
                      <td className="whitespace-nowrap">{branchName(r.branch_id)}</td>
                      <td className="whitespace-nowrap font-bold tabular-nums">{formatMoney(r.amount, r.currency)}</td>
                      <td className="max-w-[280px]">{r.details}</td>
                      <td className="whitespace-nowrap"><StatusToggle r={r} /></td>
                      <td className="max-w-[160px]">{r.notes || "—"}</td>
                      <td>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totals.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 bg-muted/40 [&>td]:p-2 font-bold">
                      <td colSpan={5} className="text-xs text-muted-foreground">الإجمالي (بدون الملغي) — لكل عملة على حدة</td>
                      <td className="whitespace-nowrap tabular-nums">
                        <div className="flex flex-col gap-0.5">
                          {totals.map(([cur, sum]) => (
                            <span key={cur}>{formatMoney(sum, cur)}</span>
                          ))}
                        </div>
                      </td>
                      <td colSpan={4}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </main>
      </FinanceShell>
    </div>
  );
}
