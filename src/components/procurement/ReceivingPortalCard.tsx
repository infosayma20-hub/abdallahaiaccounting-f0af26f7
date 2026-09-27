import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScanLine, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** بطاقة ببوابة الموظف — تظهر فقط إذا في طلبيات شراء مسندة إله للاستلام */
export default function ReceivingPortalCard() {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    supabase.rpc("get_my_receiving_sessions").then(({ data }) => {
      if (!alive) return;
      const rows = (data as any[]) || [];
      setCount(rows.filter(r => r.status === "assigned" || r.status === "in_progress").length);
    });
    return () => { alive = false; };
  }, []);

  if (count === 0) return null;

  return (
    <div className="px-4 pt-4">
      <button
        onClick={() => navigate("/worker/receiving")}
        className="flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-right shadow-sm transition hover:bg-primary/15"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <ScanLine className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="font-bold text-foreground">استلام البضاعة</div>
          <div className="text-sm text-muted-foreground">{count} طلبية بانتظار استلامك بالباركود</div>
        </div>
        <ChevronLeft className="h-5 w-5 text-muted-foreground" />
      </button>
    </div>
  );
}
