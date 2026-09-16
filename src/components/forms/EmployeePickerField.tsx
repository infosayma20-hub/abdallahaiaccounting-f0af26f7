import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, Loader2, Search, User, X } from "lucide-react";

export type PickedEmployee = {
  id: string;
  full_name: string;
  job_title: string | null;
  department?: string | null;
  employee_number?: string | null;
};

interface Props {
  /** الاسم المعروض حالياً (قد يكون اسماً قديماً مكتوباً يدوياً). */
  value: string;
  /** معرّف الموظف المرتبط (إن وُجد). */
  employeeId?: string | null;
  disabled?: boolean;
  placeholder?: string;
  onChange: (name: string, employeeId: string | null, jobTitle?: string | null) => void;
}

/** توحيد الحروف العربية للمقارنة فقط (همزات/تاء مربوطة/تشكيل). */
const normalize = (s: string) =>
  (s || "")
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/**
 * اختيار الموظف من سجل الموظفين الفعلي (محصور بصلاحيات المستخدم عبر RLS).
 *
 * تُفتح لوحة اختيار بملء الشاشة عبر Portal بطبقة z-[2000]؛ القائمة المنسدلة
 * السابقة (Radix Popover بطبقة z-50) كانت تُرسم خلف شاشة تعبئة النموذج على
 * الجوال (z-[100]) فتبدو وكأنها لا تفتح.
 *
 * يحفظ الاسم كنص (للتوافق مع السجلات القديمة والطباعة) + معرّف الموظف للربط بملفه.
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
        .select("id, full_name, job_title, department, employee_number")
        .eq("is_active", true)
        .order("full_name", { ascending: true })
        .limit(1000);
      if (!cancelled) {
        setList(((data || []) as any[]).map((e) => ({
          id: e.id,
          full_name: e.full_name,
          job_title: e.job_title,
          department: e.department,
          employee_number: e.employee_number,
        })));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, list.length, loading]);

  // قفل تمرير الخلفية أثناء فتح اللوحة
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const filtered = useMemo(() => {
    const s = normalize(q);
    if (!s) return list.slice(0, 200);
    const parts = s.split(" ");
    return list
      .filter((e) => {
        const hay = normalize(`${e.full_name || ""} ${e.job_title || ""} ${e.department || ""} ${e.employee_number || ""}`);
        return parts.every((p) => hay.includes(p));
      })
      .slice(0, 200);
  }, [list, q]);

  const pick = (e: PickedEmployee) => {
    onChange(e.full_name, e.id, e.job_title);
    setOpen(false);
    setQ("");
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="h-11 w-full justify-between text-sm font-normal"
      >
        <span className={value ? "truncate" : "text-muted-foreground truncate"}>
          {value || placeholder || "اختر الموظف..."}
        </span>
        <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
      </Button>

      {open && createPortal(
        <div
          dir="rtl"
          className="fixed inset-0 z-[2000] bg-background flex flex-col"
          style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <header className="flex items-center justify-between gap-2 px-3 h-14 border-b bg-card shrink-0">
            <button
              type="button"
              onClick={() => { setOpen(false); setQ(""); }}
              aria-label="إغلاق"
              className="h-11 w-11 -m-1 rounded-full flex items-center justify-center hover:bg-muted/60 active:scale-95 transition"
            >
              <X className="h-6 w-6" />
            </button>
            <h2 className="text-base font-bold truncate">اختر الموظف</h2>
            <div className="w-11 shrink-0" />
          </header>

          <div className="p-3 border-b bg-card shrink-0">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث بالاسم أو المسمى أو الرقم..."
                autoFocus
                className="w-full h-11 rounded-xl bg-muted/40 border border-border pr-10 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              />
              {q && (
                <button
                  type="button"
                  aria-label="مسح البحث"
                  onClick={() => setQ("")}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> جاري التحميل...
              </div>
            ) : list.length === 0 ? (
              <p className="py-10 px-6 text-center text-sm text-muted-foreground leading-7">
                لا يوجد موظفون متاحون لحسابك.
                <br />
                تواصل مع الموارد البشرية لمنحك صلاحية عرض الموظفين.
              </p>
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">لا يوجد موظف مطابق</p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => pick(e)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-muted/60 active:bg-muted transition"
                    >
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold truncate">{e.full_name}</span>
                        {(e.job_title || e.department) && (
                          <span className="block text-[11px] text-muted-foreground truncate">
                            {[e.job_title, e.department].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                      {employeeId === e.id && <Check className="h-5 w-5 text-primary shrink-0" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
