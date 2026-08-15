import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import useDataOwnerId from "@/hooks/useDataOwnerId";
import { FinanceShell, type ActionTab } from "@/components/finance/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Plus, Search, Loader2, Pencil, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface ComplaintRow {
  id: string;
  customer_name: string;
  phone: string | null;
  complaint_date: string;
  branch_id: string | null;
  invoice_number: string | null;
  details: string;
  follow_up_method: string | null;
  responder: string | null;
  compensated: boolean;
  notes: string | null;
  status: string;
  created_at: string;
}

interface BranchOption { id: string; name: string }

const AR_DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
function dayName(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return AR_DAYS[d.getDay()];
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CustomerComplaintsPage() {
  const navigate = useNavigate();
  const { dataOwnerId } = useDataOwnerId();
  const [rows, setRows] = useState<ComplaintRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "جاري المتابعة" | "جاهز">("all");

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    try {
      const [{ data: complaints, error }, { data: br }] = await Promise.all([
        supabase
          .from("customer_complaints")
          .select("id, customer_name, phone, complaint_date, branch_id, invoice_number, details, follow_up_method, responder, compensated, notes, status, created_at")
          .eq("user_id", dataOwnerId)
          .order("complaint_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("branches").select("id, name").eq("user_id", dataOwnerId).eq("is_active", true).order("name"),
      ]);
      if (error) throw error;
      setRows((complaints || []) as ComplaintRow[]);
      setBranches((br || []) as BranchOption[]);
    } catch (e: any) {
      toast.error(e?.message || "تعذّر تحميل الشكاوى");
    } finally {
      setLoading(false);
    }
  }, [dataOwnerId]);

  useEffect(() => { void load(); }, [load]);

  const branchName = (id: string | null) => branches.find(b => b.id === id)?.name || "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== "all" && (r.status || "جاري المتابعة") !== statusFilter) return false;
      if (!q) return true;
      return [r.customer_name, r.phone, r.invoice_number, r.details, r.responder, branchName(r.branch_id)]
        .some(v => (v || "").toString().toLowerCase().includes(q));
    });
  }, [rows, search, branches, statusFilter]);

  const StatusBadge = ({ s }: { s: string }) =>
    (s || "جاري المتابعة") === "جاهز"
      ? <Badge className="bg-emerald-600 hover:bg-emerald-600">جاهز</Badge>
      : <Badge className="bg-amber-500 hover:bg-amber-500">جاري المتابعة</Badge>;

  const [savingId, setSavingId] = useState<string | null>(null);
  const toggleStatus = async (r: ComplaintRow) => {
    const next = (r.status || "جاري المتابعة") === "جاهز" ? "جاري المتابعة" : "جاهز";
    setSavingId(r.id);
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: next } : x));
    const { error } = await supabase.from("customer_complaints").update({ status: next }).eq("id", r.id);
    setSavingId(null);
    if (error) {
      setRows(prev => prev.map(x => x.id === r.id ? { ...x, status: r.status } : x));
      toast.error(error.message || "تعذّر تغيير الحالة");
    } else {
      toast.success(`تم تغيير الحالة إلى: ${next}`);
    }
  };

  const StatusToggle = ({ r }: { r: ComplaintRow }) => (
    <button
      type="button"
      disabled={savingId === r.id}
      onClick={(e) => { e.stopPropagation(); void toggleStatus(r); }}
      title="اضغط لتغيير الحالة"
      className="disabled:opacity-50"
    >
      <StatusBadge s={r.status} />
    </button>
  );

  const openNew = () => navigate("/customer-complaints/new");
  const openEdit = (r: ComplaintRow) => navigate(`/customer-complaints/${r.id}`);

  const actionTabs: ActionTab[] = useMemo(() => [
    {
      key: "general",
      label: "عام",
      groups: [
        {
          key: "new",
          label: "جديد",
          items: [
            { key: "new", label: "شكوى جديدة", icon: Plus, variant: "primary", onClick: openNew },
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
        title="شكاوى الزبائن"
        breadcrumb={[{ label: "مساحة العمل", href: "/choose-workspace" }, { label: "شكاوى الزبائن" }]}
        actionTabs={actionTabs}
        rightSlot={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {([["all", "الكل"], ["جاري المتابعة", "جاري المتابعة"], ["جاهز", "جاهز"]] as const).map(([v, l]) => (
                <Button
                  key={v}
                  size="sm"
                  variant={statusFilter === v ? "default" : "outline"}
                  className="h-8 text-[12px]"
                  onClick={() => setStatusFilter(v as any)}
                >{l}</Button>
              ))}
            </div>
            <div className="relative w-[200px]">
              <Search className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم، الرقم، الفاتورة..."
                className="pr-7 h-8 text-[12.5px]"
              />
            </div>
            <Badge variant="secondary" className="h-7">{filtered.length} شكوى</Badge>
          </div>
        }
      >
      <main className="flex-1 p-3 space-y-3">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">لا يوجد شكاوى مسجلة</div>
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
                    <span className="font-semibold text-sm">{r.customer_name}</span>
                    <div className="flex items-center gap-1">
                      <StatusToggle r={r} />
                      {r.compensated
                        ? <Badge className="bg-emerald-600 hover:bg-emerald-600 gap-1"><CheckCircle2 className="w-3 h-3" /> تم التعويض</Badge>
                        : <Badge variant="outline" className="gap-1 text-muted-foreground"><XCircle className="w-3 h-3" /> بدون تعويض</Badge>}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.phone || "—"} • {dayName(r.complaint_date)} {r.complaint_date} • {branchName(r.branch_id)}
                  </div>
                  <div className="text-xs line-clamp-2">{r.details}</div>
                  {r.invoice_number && <div className="text-[11px] text-muted-foreground">فاتورة: {r.invoice_number}</div>}
                </div>
              ))}
            </div>

            {/* Desktop grid */}
            <div className="hidden md:block bg-background border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-xs">
                  <tr className="[&>th]:p-2 [&>th]:text-right [&>th]:font-medium">
                    <th>الاسم</th><th>الرقم</th><th>اليوم</th><th>التاريخ</th><th>الفرع</th>
                    <th>رقم الفاتورة</th><th>تفاصيل الشكوى</th><th>آلية المتابعة</th><th>المستجيب</th>
                    <th>الحالة</th><th>التعويض</th><th>ملاحظات</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30 [&>td]:p-2 [&>td]:align-top">
                      <td className="font-medium whitespace-nowrap">{r.customer_name}</td>
                      <td className="whitespace-nowrap">{r.phone || "—"}</td>
                      <td className="whitespace-nowrap">{dayName(r.complaint_date)}</td>
                      <td className="whitespace-nowrap">{r.complaint_date}</td>
                      <td className="whitespace-nowrap">{branchName(r.branch_id)}</td>
                      <td className="whitespace-nowrap">{r.invoice_number || "—"}</td>
                      <td className="max-w-[260px]">{r.details}</td>
                      <td className="max-w-[160px]">{r.follow_up_method || "—"}</td>
                      <td className="whitespace-nowrap">{r.responder || "—"}</td>
                      <td className="whitespace-nowrap"><StatusToggle r={r} /></td>
                      <td>
                        {r.compensated
                          ? <span className="text-emerald-600 font-medium">✅ نعم</span>
                          : <span className="text-muted-foreground">❌ لا</span>}
                      </td>
                      <td className="max-w-[160px]">{r.notes || "—"}</td>
                      <td>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
      </FinanceShell>
    </div>
  );
}
