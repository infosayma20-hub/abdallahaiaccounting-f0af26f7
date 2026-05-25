import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Monitor, Headphones, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface Props {
  employeeId: string;
  employeeName: string;
  authUserId: string | null;
  onChanged?: () => void;
}

interface POSRow {
  id: string;
  is_active: boolean;
  is_call_center: boolean | null;
  role: string | null;
}

export default function CashierToggleSection({ employeeId, employeeName, authUserId, onChanged }: Props) {
  const [pos, setPos] = useState<POSRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"cashier" | "call_center" | null>(null);

  const load = async () => {
    if (!authUserId) { setPos(null); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("pos_users")
        .select("id, is_active, is_call_center, role")
        .eq("auth_user_id", authUserId)
        .maybeSingle();
      setPos((data as POSRow | null) || null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [authUserId]);

  const callProvision = async (mode: "enable" | "disable", isCC: boolean) => {
    const { data, error } = await supabase.functions.invoke("provision-pos-user-from-employee", {
      body: { employee_id: employeeId, mode, is_call_center: isCC },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data;
  };

  const handleToggleCashier = async (checked: boolean) => {
    if (!authUserId) {
      toast.error("يلزم إنشاء حساب دخول للموظف أولاً");
      return;
    }
    setSaving("cashier");
    try {
      await callProvision(checked ? "enable" : "disable", false);
      toast.success(checked ? `تم تفعيل الكاشير لـ ${employeeName}` : "تم إيقاف صلاحية الكاشير");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "فشل التحديث");
    } finally {
      setSaving(null);
    }
  };

  const handleToggleCallCenter = async (checked: boolean) => {
    if (!authUserId) {
      toast.error("يلزم إنشاء حساب دخول للموظف أولاً");
      return;
    }
    setSaving("call_center");
    try {
      await callProvision(checked ? "enable" : "disable", checked);
      toast.success(checked ? `تم تفعيل كول سنتر لـ ${employeeName}` : "تم إيقاف صلاحية كول سنتر");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "فشل التحديث");
    } finally {
      setSaving(null);
    }
  };

  const isActive = !!(pos && pos.is_active);
  const isCashier = isActive && !pos?.is_call_center;
  const isCallCenter = isActive && !!pos?.is_call_center;
  const disabled = loading || saving !== null || !authUserId;

  return (
    <>
      <div className="flex items-center gap-2">
        <Switch
          checked={isCashier}
          disabled={disabled}
          onCheckedChange={handleToggleCashier}
        />
        <label className="text-xs font-medium flex items-center gap-1">
          <Monitor className="h-3.5 w-3.5 text-blue-600" /> كاشير
        </label>
        {saving === "cashier" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {isCashier && (
          <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px] border-blue-200">
            مفعّل
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={isCallCenter}
          disabled={disabled}
          onCheckedChange={handleToggleCallCenter}
        />
        <label className="text-xs font-medium flex items-center gap-1">
          <Headphones className="h-3.5 w-3.5 text-purple-600" /> كول سنتر
        </label>
        {saving === "call_center" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        {isCallCenter && (
          <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-[10px] border-purple-200">
            مفعّل
          </Badge>
        )}
      </div>

      {isActive && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs gap-1"
          onClick={() => window.open("/pos-users", "_blank")}
        >
          <ExternalLink className="h-3 w-3" /> إدارة تفاصيل POS
        </Button>
      )}

      {!authUserId && (
        <span className="text-[10px] text-amber-600">يلزم إنشاء حساب دخول للموظف أولاً</span>
      )}
    </>
  );
}