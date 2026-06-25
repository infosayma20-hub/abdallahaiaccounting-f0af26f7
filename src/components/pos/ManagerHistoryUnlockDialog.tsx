import { useEffect, useState } from "react";
import { Lock, ShieldCheck, AlertCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { verifyManagerCredentials } from "@/lib/pos/manager-verify";
import { supabase } from "@/integrations/supabase/client";

/**
 * Dialog that prompts a branch-manager / admin to unlock full visibility on
 * the cashier's invoice history for a short window. Does NOT swap the
 * cashier's session — uses a throwaway client for credential verification.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  onUnlocked: (managerUserId: string, managerName: string) => void;
  /** Branch the current terminal belongs to. If provided, non-admin managers
   *  must be assigned to this branch to unlock. */
  branchId?: string | null;
  /** Audit context */
  companyId?: string | null;
  sessionId?: string | null;
  cashierName?: string;
  ttlMinutes?: number;
}

export default function ManagerHistoryUnlockDialog({
  open,
  onClose,
  onUnlocked,
  branchId,
  companyId,
  sessionId,
  cashierName,
  ttlMinutes = 15,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setEmail("");
      setPassword("");
      setError("");
    }
  }, [open]);

  const handleVerify = async () => {
    setLoading(true);
    setError("");
    const res = await verifyManagerCredentials(email, password);
    if (!res.ok) {
      setError(res.reason);
      setLoading(false);
      return;
    }
    // If the manager is not a global admin, ensure they manage this branch.
    if (!res.isAdmin && branchId) {
      if (!res.branchIds.includes(branchId)) {
        setError("هذا المدير غير مخوّل على فرع هذا الجهاز");
        setLoading(false);
        return;
      }
    }

    // Audit
    try {
      await (supabase.from("pos_sensitive_actions_log" as any) as any).insert({
        company_id: companyId,
        action: "manager_mode_unlock",
        manager_user_id: res.managerUserId,
        session_id: sessionId || null,
        notes: `وضع المدير — كاشير: ${cashierName || "—"} (${ttlMinutes}د)`,
        metadata: {
          manager_name: res.managerName,
          is_admin: res.isAdmin,
          branch_id: branchId || null,
          ttl_minutes: ttlMinutes,
        },
      });
    } catch {
      /* non-fatal */
    }

    setLoading(false);
    onUnlocked(res.managerUserId, res.managerName);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm z-[1200]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-amber-500" />
            وضع المدير — عرض كامل للفواتير
          </DialogTitle>
        </DialogHeader>
        <div className="py-3 space-y-4">
          <p className="text-xs text-muted-foreground">
            سجّل دخولك كمدير لإلغاء قيود الإخفاء على سجل فواتير الكاشير لمدة {ttlMinutes} دقيقة.
            لن يتم تسجيل خروج الكاشير من جلسته.
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                البريد الإلكتروني للمدير
              </label>
              <Input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(""); }}
                placeholder="manager@company.com"
                className="h-11 text-sm"
                dir="ltr"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                كلمة المرور
              </label>
              <Input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                placeholder="••••••••"
                className="h-11 text-sm"
                dir="ltr"
                onKeyDown={e => e.key === "Enter" && handleVerify()}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button
            size="sm"
            onClick={handleVerify}
            disabled={loading || !email.trim() || !password.trim()}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                جاري التحقق...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                فتح وضع المدير
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}