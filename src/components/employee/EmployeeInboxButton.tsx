import { useCallback, useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import EmployeeFormReferralsList from "./EmployeeFormReferralsList";

/**
 * بريد الموارد البشرية — أيقونة في أعلى شاشة الموظف.
 *
 * تعرض عدد الرسائل/الطلبات التي حوّلتها الموارد البشرية أو الإدارة إلى هذا
 * الموظف (صوت الموظف، شكوى، أي نموذج) ولم يطّلع عليها بعد. فتح البريد
 * يسجّل وقت الاطّلاع (read_at) ليظهر لدى الموارد البشرية أن الموظف قرأها.
 *
 * لا يغيّر أي مسار قائم: نفس السجلات تبقى ظاهرة داخل «طلباتي».
 */
export default function EmployeeInboxButton({ employeeId }: { employeeId: string }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);

  const loadCounts = useCallback(async () => {
    if (!employeeId) return;
    const [unreadRes, totalRes] = await Promise.all([
      supabase
        .from("employee_form_referrals" as any)
        .select("id", { count: "exact", head: true })
        .eq("assignee_employee_id", employeeId)
        .is("read_at", null),
      supabase
        .from("employee_form_referrals" as any)
        .select("id", { count: "exact", head: true })
        .eq("assignee_employee_id", employeeId),
    ]);
    setUnread(unreadRes.count || 0);
    setTotal(totalRes.count || 0);
  }, [employeeId]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const openInbox = async () => {
    setOpen(true);
    if (unread > 0) {
      const { error } = await supabase
        .from("employee_form_referrals" as any)
        .update({ read_at: new Date().toISOString() })
        .eq("assignee_employee_id", employeeId)
        .is("read_at", null);
      if (!error) setUnread(0);
    }
  };

  if (!employeeId) return null;

  return (
    <>
      <button
        type="button"
        onClick={openInbox}
        aria-label="بريد الموارد البشرية"
        title="بريد الموارد البشرية — الرسائل المحوَّلة إليك"
        className="relative h-10 w-10 rounded-xl bg-white/15 border border-white/20 backdrop-blur flex items-center justify-center text-primary-foreground shrink-0 transition-colors hover:bg-white/25"
      >
        <Mail className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) loadCounts();
        }}
      >
        <SheetContent side="bottom" dir="rtl" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="text-right">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-primary" />
              بريد الموارد البشرية {total > 0 ? `(${total})` : ""}
            </SheetTitle>
            <SheetDescription className="text-xs">
              رسائل وطلبات شاركتها معك الموارد البشرية أو الإدارة للاطّلاع أو المتابعة.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-3">
            <EmployeeFormReferralsList employeeId={employeeId} hideHeader showEmpty defaultExpandFirst />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
