import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Cake, Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useManagedBranchEmployees } from "@/hooks/useBranchRoster";

type Row = { id: string; full_name: string; phone: string | null; date_of_birth: string | null };

type Item = {
  id: string;
  name: string;
  phone: string | null;
  daysLeft: number;
  dateLabel: string;
  age: number | null;
};

const WINDOW_DAYS = 7;

function compute(rows: Row[]): Item[] {
  const now = new Date();
  const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: Item[] = [];
  rows.forEach((r) => {
    const dob = r.date_of_birth || "";
    if (dob.length < 10) return;
    const y = Number(dob.slice(0, 4));
    const m = Number(dob.slice(5, 7));
    const d = Number(dob.slice(8, 10));
    if (!m || !d) return;
    let next = new Date(mid.getFullYear(), m - 1, d);
    if (next < mid) next = new Date(mid.getFullYear() + 1, m - 1, d);
    const daysLeft = Math.round((next.getTime() - mid.getTime()) / 86400000);
    if (daysLeft > WINDOW_DAYS) return;
    out.push({
      id: r.id,
      name: r.full_name,
      phone: r.phone,
      daysLeft,
      dateLabel: next.toLocaleDateString("ar-EG", { day: "2-digit", month: "2-digit" }),
      age: y > 1900 ? next.getFullYear() - y : null,
    });
  });
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

function whenLabel(daysLeft: number) {
  if (daysLeft === 0) return "اليوم 🎉";
  if (daysLeft === 1) return "بكرا";
  return `بعد ${daysLeft} أيام`;
}

/** تذكير المدير بأعياد ميلاد أفراد فريقه خلال الأسبوع القادم. */
export default function TeamBirthdaysCard({ branchId }: { branchId?: string | null }) {
  const { data: team = [] } = useManagedBranchEmployees(branchId ?? null);
  const [items, setItems] = useState<Item[]>([]);

  const ids = useMemo(() => (team as any[]).map((e) => e.id).filter(Boolean) as string[], [team]);

  useEffect(() => {
    let cancelled = false;
    if (!ids.length) { setItems([]); return; }
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, full_name, phone, date_of_birth")
        .in("id", ids)
        .eq("is_active", true);
      if (cancelled) return;
      setItems(compute(((data || []) as Row[]).filter((r) => r.date_of_birth)));
    })();
    return () => { cancelled = true; };
  }, [ids.join(",")]);

  if (!items.length) return null;

  return (
    <Card className="border-pink-500/30 bg-card" dir="rtl">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-9 w-9 rounded-xl bg-pink-500/10 flex items-center justify-center">
            <Cake className="h-4 w-4 text-pink-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">أعياد ميلاد الفريق</h3>
            <p className="text-[10px] text-muted-foreground">خلال الأيام السبعة القادمة</p>
          </div>
        </div>
        <div className="space-y-2">
          {items.map((b) => (
            <div key={b.id} className="flex items-center gap-2 rounded-xl bg-secondary/40 px-3 py-2">
              <Gift className={`h-4 w-4 shrink-0 ${b.daysLeft === 0 ? "text-pink-500" : "text-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{b.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {b.dateLabel}
                  {b.age ? ` • يكمل ${b.age} سنة` : ""}
                </p>
              </div>
              <span
                className={`text-[10px] px-2 py-1 rounded-lg shrink-0 ${
                  b.daysLeft === 0 ? "bg-pink-500/15 text-pink-500 font-bold" : "bg-muted text-muted-foreground"
                }`}
              >
                {whenLabel(b.daysLeft)}
              </span>
              {b.phone && (
                <a
                  href={`https://wa.me/${b.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                    `كل عام وأنت بخير ${b.name} 🎂🎉`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0"
                >
                  تهنئة
                </a>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
