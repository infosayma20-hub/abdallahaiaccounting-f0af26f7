import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SPARTA_HOLDING_ID } from "@/lib/sparta-constants";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Lock, Unlock, Calendar, ShieldCheck } from "lucide-react";

type FY = { id: string; year_number: number; start_date: string; end_date: string; status: string; net_income: number; closed_at?: string };
type FP = { id: string; period_number: number; start_date: string; end_date: string; status: string };

const MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

export default function SpartaFiscalYearsPage() {
  const [years, setYears] = useState<FY[]>([]);
  const [periods, setPeriods] = useState<FP[]>([]);
  const [selectedFy, setSelectedFy] = useState<string | null>(null);
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("sparta_fiscal_years" as any)
      .select("*").eq("holding_id", SPARTA_HOLDING_ID).order("year_number", { ascending: false });
    setYears((data as any) || []);
    if (data && data.length > 0 && !selectedFy) setSelectedFy((data as any)[0].id);
  };
  const loadPeriods = async (fyId: string) => {
    const { data } = await supabase.from("sparta_fiscal_periods" as any)
      .select("*").eq("fiscal_year_id", fyId).order("period_number");
    setPeriods((data as any) || []);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selectedFy) loadPeriods(selectedFy); }, [selectedFy]);

  const createYear = async () => {
    setLoading(true);
    const { error } = await supabase.rpc("sparta_create_fiscal_year" as any, { p_year: newYear });
    setLoading(false);
    if (error) toast.error(error.message); else { toast.success("تم إنشاء السنة المالية"); load(); }
  };

  const togglePeriod = async (periodId: string, lock: boolean) => {
    const { error } = await supabase.rpc("sparta_lock_fiscal_period" as any, { p_period_id: periodId, p_lock: lock });
    if (error) toast.error(error.message); else { toast.success(lock ? "تم القفل" : "تم الفتح"); selectedFy && loadPeriods(selectedFy); }
  };

  const closeYear = async () => {
    if (!selectedFy) return;
    if (!confirm("هل أنت متأكد من إقفال السنة المالية؟ هذه العملية تولّد قيد إقفال وترحيل صافي الربح للأرباح المحتجزة، ولا يمكن التراجع عنها.")) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("sparta_close_fiscal_year" as any, { p_fy_id: selectedFy });
    setLoading(false);
    if (error) toast.error(error.message);
    else { toast.success(`تم الإقفال — صافي الربح: ${(data as any)?.net_income}`); load(); selectedFy && loadPeriods(selectedFy); }
  };

  const current = years.find(y => y.id === selectedFy);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Calendar className="h-6 w-6" /> الفترات والسنوات المالية</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة السنوات المالية، قفل الفترات، والإقفال السنوي.</p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="number" value={newYear} onChange={e => setNewYear(Number(e.target.value))}
            className="w-24 border rounded px-2 py-1 text-center" />
          <Button onClick={createYear} disabled={loading}>إنشاء سنة</Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-4 space-y-2">
          {years.map(y => (
            <div key={y.id}
              onClick={() => setSelectedFy(y.id)}
              className={`p-3 rounded-lg border cursor-pointer ${selectedFy === y.id ? "bg-primary/10 border-primary" : "bg-card"}`}>
              <div className="flex justify-between items-center">
                <span className="font-bold text-lg">{y.year_number}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${y.status === "closed" ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {y.status === "closed" ? "مقفلة" : "مفتوحة"}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">{y.start_date} → {y.end_date}</div>
              {y.net_income !== 0 && <div className="text-xs mt-1">صافي: {Number(y.net_income).toLocaleString()} ₪</div>}
            </div>
          ))}
          {years.length === 0 && <div className="text-sm text-muted-foreground p-4 border rounded">لا توجد سنوات مالية. أنشئ واحدة.</div>}
        </div>

        <div className="col-span-12 md:col-span-8 space-y-3">
          {current && (
            <>
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold">فترات سنة {current.year_number}</h2>
                {current.status !== "closed" && (
                  <Button variant="destructive" onClick={closeYear} disabled={loading}>
                    <ShieldCheck className="h-4 w-4 ml-1" /> إقفال السنة المالية
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {periods.map(p => (
                  <div key={p.id} className={`p-3 rounded border ${p.status === "closed" ? "bg-rose-50" : p.status === "locked" ? "bg-amber-50" : "bg-card"}`}>
                    <div className="font-medium">{MONTHS[p.period_number - 1]}</div>
                    <div className="text-xs text-muted-foreground">{p.start_date.slice(5)} → {p.end_date.slice(5)}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs">{p.status === "open" ? "مفتوحة" : p.status === "locked" ? "مقفلة" : "مقفلة سنوياً"}</span>
                      {p.status !== "closed" && (
                        <Button size="sm" variant="ghost" onClick={() => togglePeriod(p.id, p.status === "open")}>
                          {p.status === "open" ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}