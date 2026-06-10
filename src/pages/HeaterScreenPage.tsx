/**
 * Heater Screen — /pos/heater-screen?token=...
 * Tablet-style numeric keypad. Cashier/heater operator types the order
 * number, taps "جاهز"، فيتم تحديث كل تذاكر الطلب إلى ready ويفعّل
 * تلقائياً نداء الزبون والصوت على شاشة الزبائن (عبر trigger الموجود).
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Delete, CheckCircle2, Flame } from "lucide-react";
import { toast } from "sonner";

const MAX_LEN = 5;

export default function HeaterScreenPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastOk, setLastOk] = useState<string | null>(null);

  const append = (d: string) =>
    setValue((v) => (v.length >= MAX_LEN ? v : (v + d).replace(/^0+/, "") || "0"));
  const backspace = () => setValue((v) => v.slice(0, -1));
  const clear = () => setValue("");

  const submit = useCallback(async () => {
    if (!token) { toast.error("التوكن مفقود"); return; }
    const n = parseInt(value, 10);
    if (!n || n <= 0) { toast.error("أدخل رقم طلب صحيح"); return; }
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("kds_mark_order_ready_by_number", {
        _token: token,
        _display_number: n,
      });
      if (error) throw error;
      const updated = (data as any)?.tickets_updated ?? 0;
      const recalled = (data as any)?.recalled === true;
      if (updated > 0) {
        toast.success(`✅ تم تحويل الطلب ${n} إلى جاهز`);
      } else if (recalled) {
        toast.success(`🔔 تم إعادة نداء الطلب ${n}`);
      } else {
        toast.info(`الطلب رقم ${n} جاهز مسبقاً`);
      }
      setLastOk(`#${n}`);
      setValue("");
    } catch (e: any) {
      toast.error(e?.message || "تعذّر التحديث");
    } finally {
      setSubmitting(false);
    }
  }, [token, value]);

  // Keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") append(e.key);
      else if (e.key === "Backspace") backspace();
      else if (e.key === "Enter") submit();
      else if (e.key === "Escape") clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [submit]);

  if (!token) {
    return (
      <div className="min-h-[100dvh] bg-[#0D1B2E] text-white grid place-items-center p-6" dir="rtl">
        <Card className="p-6 bg-[#1e293b] border-white/10 text-white text-center max-w-md">
          <h1 className="text-xl font-bold mb-2">شاشة السخان</h1>
          <p className="text-sm text-white/70">الرابط غير صالح — التوكن مفقود.</p>
        </Card>
      </div>
    );
  }

  const keys = ["1","2","3","4","5","6","7","8","9","clear","0","del"];

  return (
    <div className="min-h-[100dvh] bg-[#0D1B2E] text-white flex flex-col" dir="rtl">
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Flame className="h-6 w-6 text-amber-400" />
          <h1 className="text-xl font-bold">شاشة السخان</h1>
        </div>
        {lastOk && (
          <div className="text-sm text-emerald-300">آخر طلب جاهز: <span className="font-bold">{lastOk}</span></div>
        )}
      </header>

      <main className="flex-1 grid place-items-center p-4">
        <div className="w-full max-w-md">
          {/* Display */}
          <div className="bg-black/40 border border-white/10 rounded-2xl mb-5 h-32 flex items-center justify-center">
            <span className="text-7xl font-black tabular-nums tracking-wider text-amber-200">
              {value || "—"}
            </span>
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3">
            {keys.map((k) => {
              if (k === "del") {
                return (
                  <Button
                    key={k}
                    onClick={backspace}
                    variant="outline"
                    className="h-20 text-2xl bg-white/5 border-white/20 text-white hover:bg-white/10"
                  >
                    <Delete className="h-7 w-7" />
                  </Button>
                );
              }
              if (k === "clear") {
                return (
                  <Button
                    key={k}
                    onClick={clear}
                    variant="outline"
                    className="h-20 text-xl bg-white/5 border-white/20 text-white hover:bg-white/10"
                  >
                    مسح
                  </Button>
                );
              }
              return (
                <Button
                  key={k}
                  onClick={() => append(k)}
                  className="h-20 text-3xl font-bold bg-white/10 hover:bg-white/20 text-white border border-white/10"
                >
                  {k}
                </Button>
              );
            })}
          </div>

          {/* Submit */}
          <Button
            onClick={submit}
            disabled={submitting || !value}
            className="w-full h-20 mt-4 text-2xl font-black bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-7 w-7 ml-2" />
            {submitting ? "جارٍ التحديث…" : "جاهز ✓"}
          </Button>

          <p className="text-xs text-white/50 text-center mt-4">
            اكتب رقم الطلب ثم اضغط «جاهز» — يتم النداء تلقائياً على شاشة الزبائن.
          </p>
        </div>
      </main>
    </div>
  );
}