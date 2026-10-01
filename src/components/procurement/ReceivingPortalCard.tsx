import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScanLine, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * بطاقة ببوابة الموظف — تظهر:
 *  - دائماً للموظف المُعلّم كـ «موظف مستودع» (employees.is_receiver)
 *  - أو لأي موظف عنده طلبيات شراء مسندة إله للاستلام
 */
export default function ReceivingPortalCard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [isReceiver, setIsReceiver] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: sessions }, empRes] = await Promise.all([
        supabase.rpc("get_my_receiving_sessions"),
        user?.id
          ? supabase.from("employees").select("is_receiver, can_direct_receive").eq("auth_user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      if (!alive) return;
      const rows = (sessions as any[]) || [];
      setCount(rows.filter(r => r.status === "assigned" || r.status === "in_progress" || r.status === "available").length);
      setIsReceiver(!!(empRes as any)?.data?.is_receiver || !!(empRes as any)?.data?.can_direct_receive);
    })();
    return () => { alive = false; };
  }, [user?.id]);

  if (count === 0 && !isReceiver) return null;

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
          <div className="text-sm text-muted-foreground">
            {count > 0 ? `${count} طلبية بانتظار استلامك بالباركود` : "استلام بالباركود وإنشاء استلام مباشر"}
          </div>
        </div>
        <ChevronLeft className="h-5 w-5 text-muted-foreground" />
      </button>
    </div>
  );
}
