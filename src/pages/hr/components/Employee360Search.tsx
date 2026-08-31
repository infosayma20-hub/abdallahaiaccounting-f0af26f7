import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search, UserRound, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { cn } from "@/lib/utils";

interface EmpHit {
  id: string;
  full_name: string | null;
  job_title?: string | null;
  position?: string | null;
  department?: string | null;
  id_number?: string | null;
  employee_number?: string | null;
}

/**
 * Compact employee search for the Employee 360 top strip.
 * Mirrors the EmployeesPage search UX (name / id / job) but jumps directly
 * to the matched employee's 360 profile — lets managers switch employees
 * without leaving the screen. Rendered inside the FinanceShell header row,
 * so it flows right-to-left right after the page title.
 */
export function Employee360Search({ currentId }: { currentId?: string }) {
  const navigate = useNavigate();
  const { dataOwnerId } = useDataOwnerId();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 250);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<EmpHit[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (!open || !dataOwnerId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const safe = debounced.trim().replace(/[(),.%]/g, " ");
        let q = supabase
          .from("employees")
          .select(
            "id, full_name, job_title, position, department, id_number, employee_number"
          )
          .eq("user_id", dataOwnerId)
          .limit(8);
        if (safe) {
          const like = `%${safe}%`;
          q = q.or(
            `full_name.ilike.${like},job_title.ilike.${like},position.ilike.${like},id_number.ilike.${like},employee_number.ilike.${like}`
          );
        } else {
          q = q.order("full_name");
        }
        const { data, error } = await q;
        if (cancelled) return;
        if (error) throw error;
        setResults((data as EmpHit[]) || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debounced, open, dataOwnerId]);

  const go = (emp: EmpHit) => {
    setOpen(false);
    setQuery("");
    if (emp.id !== currentId) navigate(`/hr/employee/${emp.id}`);
  };

  return (
    <div ref={boxRef} className="relative w-44 sm:w-56" dir="rtl">
      <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 pointer-events-none" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="بحث عن موظف…"
        className="w-full h-8 rounded-xl bg-muted/30 border-0 pr-8 pl-7 text-[12px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-primary/30"
      />
      {query && (
        <button
          type="button"
          aria-label="مسح البحث"
          onClick={() => {
            setQuery("");
            setResults([]);
          }}
          className="absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {open && (
        <div className="absolute top-full mt-1 w-full z-50 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-3">لا نتائج</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {results.map((e) => {
                const isCurrent = e.id === currentId;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => go(e)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2.5 py-1.5 text-right hover:bg-muted transition-colors",
                        isCurrent && "bg-primary/5"
                      )}
                    >
                      <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] font-semibold truncate">{e.full_name}</span>
                        {(e.job_title || e.position || e.department) && (
                          <span className="block text-[10.5px] text-muted-foreground truncate">
                            {[e.job_title || e.position, e.department].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                      {isCurrent && (
                        <span className="text-[10px] text-primary shrink-0">الحالي</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}