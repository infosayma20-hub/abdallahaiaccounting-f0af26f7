import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, Loader2, Search, User } from "lucide-react";

export type PickedEmployee = { id: string; full_name: string; job_title: string | null };

interface Props {
  /** الاسم المعروض حالياً (قد يكون اسماً قديماً مكتوباً يدوياً). */
  value: string;
  /** معرّف الموظف المرتبط (إن وُجد). */
  employeeId?: string | null;
  disabled?: boolean;
  placeholder?: string;
  onChange: (name: string, employeeId: string | null) => void;
}

/**
 * قائمة منسدلة تختار الموظف من سجل الموظفين الفعلي (محصورة بصلاحيات المستخدم عبر RLS).
 * تحفظ الاسم كنص (للتوافق مع السجلات القديمة والطباعة) + معرّف الموظف للربط بملفه.
 */
export default function EmployeePickerField({ value, employeeId, disabled, placeholder, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<PickedEmployee[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open || list.length || loading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("employees")
        .select("id, full_name, job_title")
        .eq("is_active", true)
        .order("full_name", { ascending: true })
        .limit(1000);
      if (!cancelled) {
        setList(((data || []) as any[]).map((e) => ({ id: e.id, full_name: e.full_name, job_title: e.job_title })));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, list.length, loading]);

  const filtered = useMemo(() => {
    const s = q.trim();
    if (!s) return list.slice(0, 80);
    const parts = s.split(/\s+/);
    return list.filter((e) => parts.every((p) => (e.full_name || "").includes(p))).slice(0, 80);
  }, [list, q]);

  return (
    <Popover open={open} onOpenChange={(o) => { if (!disabled) setOpen(o); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-10 w-full justify-between text-sm font-normal"
        >
          <span className={value ? "truncate" : "text-muted-foreground truncate"}>
            {value || placeholder || "اختر الموظف..."}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[min(92vw,22rem)]" align="start" dir="rtl">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث بالاسم..."
              className="h-9 pr-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل...
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">لا يوجد موظف مطابق</p>
          ) : (
            filtered.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => { onChange(e.full_name, e.id); setOpen(false); setQ(""); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-right text-sm hover:bg-muted transition"
              >
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate">{e.full_name}</span>
                {e.job_title && <span className="text-[10px] text-muted-foreground truncate">{e.job_title}</span>}
                {employeeId === e.id && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
