import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, X, Download, Copy, MessageCircle, Cake, Heart, Baby, Award, CalendarHeart, Sparkles } from "lucide-react";
import * as XLSX from "xlsx";
import { setNextExportBranding } from "@/lib/excel-export";
import { fmtDateDisplay } from "@/lib/utils";
import { toast } from "sonner";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { SortableHeader, applySort, cycleSort, noSort, type SortState } from "./SortableHeader";

type EmployeeLite = {
  id: string;
  full_name: string;
  department: string | null;
  branch_id: string | null;
  date_of_birth?: string | null;
  start_date?: string | null;
  phone?: string | null;
};

type OccasionType = "birthday" | "work_anniversary";
type OccasionRow = {
  emp: EmployeeLite;
  branch: string;
  type: OccasionType;
  typeLabel: string;
  date: string; // ISO yyyy-MM-dd of the upcoming event
  daysLeft: number;
  yearsCount?: number;
};

const TEMPLATES: { key: string; label: string; Icon: any; text: string }[] = [
  { key: "birthday", label: "عيد ميلاد", Icon: Cake, text: "كل عام وأنت بخير يا {employee_name}، نتمنى لك سنة سعيدة مليئة بالصحة والنجاح، مع تحيات {company_name}." },
  { key: "marriage", label: "زواج", Icon: Heart, text: "نبارك لك يا {employee_name} بمناسبة الزواج، ونتمنى لك حياة سعيدة ومباركة، مع تحيات {company_name}." },
  { key: "newborn", label: "مولود", Icon: Baby, text: "نبارك لك يا {employee_name} بالمولود الجديد، ونسأل الله أن يجعله من مواليد السعادة، مع تحيات {company_name}." },
  { key: "promotion", label: "ترقية", Icon: Award, text: "نبارك لك يا {employee_name} على الترقية الجديدة، ونتمنى لك دوام التوفيق والنجاح، مع تحيات {company_name}." },
  { key: "work_anniversary", label: "ذكرى عمل", Icon: CalendarHeart, text: "نشكرك يا {employee_name} على عطائك وجهودك خلال فترة عملك معنا، ونتمنى لك دوام التوفيق، مع تحيات {company_name}." },
  { key: "general", label: "تهنئة عامة", Icon: Sparkles, text: "تهانينا لك يا {employee_name}، مع أطيب التمنيات من {company_name}." },
];

function nextOccurrence(monthDay: string, today: Date): { date: Date; daysLeft: number } {
  const [m, d] = monthDay.split("-").map(Number);
  const y = today.getFullYear();
  let next = new Date(y, m - 1, d);
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (next < todayMid) next = new Date(y + 1, m - 1, d);
  const daysLeft = Math.round((next.getTime() - todayMid.getTime()) / 86400000);
  return { date: next, daysLeft };
}

function normalizePhonePalestine(p?: string | null): string | null {
  if (!p) return null;
  let s = p.replace(/\D/g, "");
  if (s.startsWith("00")) s = s.slice(2);
  if (s.startsWith("0")) s = "972" + s.slice(1);
  if (s.length < 9) return null;
  return s;
}

export default function HROccasionsTab({
  employees,
  branchName,
  loading,
}: {
  employees: EmployeeLite[];
  branchName: (id: string | null) => string;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [windowDays, setWindowDays] = useState(60);
  const [typeFilter, setTypeFilter] = useState<"all" | OccasionType>("all");
  const [tplOpen, setTplOpen] = useState(false);
  const [tplFor, setTplFor] = useState<{ name: string } | null>(null);
  const [sort, setSort] = useState<SortState>(noSort);
  const [colBranch, setColBranch] = useState<string>("all");
  const [colDept, setColDept] = useState<string>("all");
  const [colHasPhone, setColHasPhone] = useState<string>("all"); // all | yes | no
  const { settings } = useCompanySettings();
  const companyName = (settings?.company_name || "").trim() || "إدارة الشركة";
  const renderTemplate = (text: string, name: string) =>
    text.replace(/\{employee_name\}/g, name).replace(/\{company_name\}/g, companyName);

  const today = new Date();

  const occasions = useMemo<OccasionRow[]>(() => {
    const out: OccasionRow[] = [];
    employees.forEach((e) => {
      const branch = branchName(e.branch_id);
      if (e.date_of_birth) {
        const md = e.date_of_birth.slice(5);
        const nx = nextOccurrence(md, today);
        if (nx.daysLeft <= windowDays) {
          out.push({
            emp: e, branch, type: "birthday", typeLabel: "عيد ميلاد",
            date: nx.date.toISOString().slice(0, 10),
            daysLeft: nx.daysLeft,
          });
        }
      }
      if (e.start_date) {
        const md = e.start_date.slice(5);
        const nx = nextOccurrence(md, today);
        if (nx.daysLeft <= windowDays && nx.daysLeft >= 0) {
          const startYear = Number(e.start_date.slice(0, 4));
          const yrs = nx.date.getFullYear() - startYear;
          if (yrs >= 1) {
            out.push({
              emp: e, branch, type: "work_anniversary", typeLabel: `ذكرى عمل ${yrs} سنة`,
              date: nx.date.toISOString().slice(0, 10),
              daysLeft: nx.daysLeft, yearsCount: yrs,
            });
          }
        }
      }
    });
    return out.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [employees, branchName, windowDays]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const base = occasions.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      if (colBranch !== "all" && r.branch !== colBranch) return false;
      if (colDept !== "all" && (r.emp.department || "") !== colDept) return false;
      if (colHasPhone !== "all") {
        const hasPhone = !!normalizePhonePalestine(r.emp.phone);
        if (colHasPhone === "yes" && !hasPhone) return false;
        if (colHasPhone === "no" && hasPhone) return false;
      }
      if (q && !(
        r.emp.full_name.toLowerCase().includes(q) ||
        (r.branch || "").toLowerCase().includes(q) ||
        (r.emp.department || "").toLowerCase().includes(q) ||
        r.typeLabel.toLowerCase().includes(q)
      )) return false;
      return true;
    });
    return applySort(base, sort, {
      employee: (r) => r.emp.full_name,
      branch: (r) => r.branch,
      department: (r) => r.emp.department || "",
      typeLabel: (r) => r.typeLabel,
      date: (r) => r.date,
      daysLeft: (r) => r.daysLeft,
      phone: (r) => r.emp.phone || "",
    });
  }, [occasions, typeFilter, colBranch, colDept, colHasPhone, q, sort]);

  const branchOptions = useMemo(() => {
    const s = new Set<string>();
    occasions.forEach((r) => { if (r.branch && r.branch !== "-") s.add(r.branch); });
    return Array.from(s).sort().map((v) => ({ value: v, label: v }));
  }, [occasions]);
  const deptOptions = useMemo(() => {
    const s = new Set<string>();
    occasions.forEach((r) => { if (r.emp.department) s.add(r.emp.department); });
    return Array.from(s).sort().map((v) => ({ value: v, label: v }));
  }, [occasions]);

  const exportExcel = () => {
    const data = filtered.map((r) => ({
      "الموظف": r.emp.full_name,
      "الفرع": r.branch,
      "القسم": r.emp.department || "-",
      "نوع المناسبة": r.typeLabel,
      "التاريخ": fmtDateDisplay(r.date),
      "بعد كم يوم": r.daysLeft === 0 ? "اليوم" : r.daysLeft,
      "الهاتف": r.emp.phone || "-",
    }));
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0]).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المناسبات_القادمة");
    setNextExportBranding({ title: "المناسبات_القادمة" });
    XLSX.writeFile(wb, `المناسبات_القادمة.xlsx`);
  };

  const copyText = async (text: string, name: string) => {
    const final = renderTemplate(text, name);
    try {
      await navigator.clipboard.writeText(final);
      toast.success("تم نسخ نص التهنئة");
    } catch {
      toast.error("تعذر النسخ");
    }
  };

  const openWhatsApp = (phone: string | null | undefined, text: string, name: string) => {
    const p = normalizePhonePalestine(phone);
    if (!p) { toast.error("لا يوجد رقم هاتف صالح"); return; }
    const final = renderTemplate(text, name);
    window.open(`https://wa.me/${p}?text=${encodeURIComponent(final)}`, "_blank");
  };

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center justify-between print:hidden">
        <h2 className="text-sm font-semibold">المناسبات القادمة</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setTplFor(null); setTplOpen(true); }}>
            <Sparkles className="h-4 w-4 ml-1" /> قوالب التهنئة
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 ml-1" /> Excel
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden" dir="rtl">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث: اسم الموظف، الفرع، أو نوع المناسبة..." className="pr-8 h-9 text-sm" />
          {query && (
            <button onClick={() => setQuery("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={typeFilter === "all" ? "default" : "outline"} onClick={() => setTypeFilter("all")} className="h-9 text-xs">الكل</Button>
          <Button size="sm" variant={typeFilter === "birthday" ? "default" : "outline"} onClick={() => setTypeFilter("birthday")} className="h-9 text-xs">أعياد الميلاد</Button>
          <Button size="sm" variant={typeFilter === "work_anniversary" ? "default" : "outline"} onClick={() => setTypeFilter("work_anniversary")} className="h-9 text-xs">ذكرى العمل</Button>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">نافذة:</span>
          {[30, 60, 90].map((n) => (
            <Button key={n} size="sm" variant={windowDays === n ? "default" : "outline"} onClick={() => setWindowDays(n)} className="h-9 text-xs">{n} يوم</Button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">جاري التحميل...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            لا توجد مناسبات خلال {windowDays} يوماً القادمة
          </div>
        ) : (
          <div className="overflow-x-auto" dir="rtl">
            <table className="w-full text-sm" dir="rtl">
              <thead className="bg-muted/50">
                <tr>
                  <SortableHeader label="الموظف" columnKey="employee" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))} className="sticky right-0 bg-muted/50 min-w-[150px]" />
                  <SortableHeader label="الفرع" columnKey="branch" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))}
                    filterValue={colBranch} filterOptions={[{ value: "all", label: "كل الفروع" }, ...branchOptions]} onFilterChange={setColBranch} />
                  <SortableHeader label="القسم" columnKey="department" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))}
                    filterValue={colDept} filterOptions={[{ value: "all", label: "كل الأقسام" }, ...deptOptions]} onFilterChange={setColDept} />
                  <SortableHeader label="نوع المناسبة" columnKey="typeLabel" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))}
                    filterValue={typeFilter} filterOptions={[
                      { value: "all", label: "الكل" },
                      { value: "birthday", label: "أعياد الميلاد" },
                      { value: "work_anniversary", label: "ذكرى العمل" },
                    ]} onFilterChange={(v) => setTypeFilter(v as any)} />
                  <SortableHeader label="التاريخ" columnKey="date" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))} align="center" />
                  <SortableHeader label="بعد كم يوم" columnKey="daysLeft" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))} align="center" />
                  <SortableHeader label="الهاتف" columnKey="phone" sort={sort} onSort={(k) => setSort(cycleSort(sort, k))}
                    filterValue={colHasPhone} filterOptions={[
                      { value: "all", label: "الكل" },
                      { value: "yes", label: "لديه رقم" },
                      { value: "no", label: "بدون رقم" },
                    ]} onFilterChange={setColHasPhone} />
                  <th className="text-center px-3 py-2 font-semibold print:hidden">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const tpl = r.type === "birthday" ? TEMPLATES[0] : TEMPLATES[4];
                  return (
                    <tr key={`${r.emp.id}-${r.type}-${i}`} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-2 sticky right-0 bg-card font-medium">{r.emp.full_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.branch}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.emp.department || "-"}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={r.type === "birthday" ? "border-pink-300 text-pink-700" : "border-emerald-300 text-emerald-700"}>
                          {r.typeLabel}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{fmtDateDisplay(r.date)}</td>
                      <td className="px-3 py-2 text-center">
                        {r.daysLeft === 0 ? <Badge className="bg-amber-100 text-amber-700">اليوم</Badge> : <span className="tabular-nums">{r.daysLeft}</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums" dir="ltr">{r.emp.phone || "—"}</td>
                      <td className="px-3 py-2 text-center print:hidden">
                        <div className="flex justify-center gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => copyText(tpl.text, r.emp.full_name)} title="نسخ التهنئة">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-emerald-600" onClick={() => openWhatsApp(r.emp.phone, tpl.text, r.emp.full_name)} title="فتح واتساب" disabled={!normalizePhonePalestine(r.emp.phone)}>
                            <MessageCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t font-semibold text-xs">
                  <td colSpan={8} className="px-3 py-2 text-right text-muted-foreground">
                    عرض {filtered.length} مناسبة خلال {windowDays} يوماً القادمة
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      <p className="text-[11px] text-muted-foreground print:hidden">
        ملاحظة: أعياد الميلاد تعتمد على ‎date_of_birth‎، وذكرى العمل على ‎start_date‎. مناسبات الزواج/المولود تتطلب حقول مخصصة غير موجودة حالياً، استخدم قوالب التهنئة يدوياً.
      </p>

      <Dialog open={tplOpen} onOpenChange={setTplOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>قوالب التهنئة الجاهزة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {TEMPLATES.map((t) => (
              <Card key={t.key} className="p-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <t.Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm mb-1">{t.label}</div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{renderTemplate(t.text, tplFor?.name || "{employee_name}")}</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => copyText(t.text, tplFor?.name || "{employee_name}")}>
                    <Copy className="h-3.5 w-3.5 ml-1" /> نسخ
                  </Button>
                </div>
              </Card>
            ))}
            <p className="text-[11px] text-muted-foreground">يتم استبدال ‎{`{employee_name}`}‎ و‎{`{company_name}`}‎ تلقائياً عند النسخ.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}