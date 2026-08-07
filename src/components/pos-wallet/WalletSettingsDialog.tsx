/** WalletSettingsDialog — ضوابط المحافظ (حدود الشحن، سقف الرصيد، نسبة المكافأة). */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DynamicsDialog, DynamicsSection } from "@/components/ui/dynamics-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dataOwnerId: string | null;
  onSaved?: () => void;
}

export default function WalletSettingsDialog({ open, onOpenChange, dataOwnerId, onSaved }: Props) {
  const [minTopup, setMinTopup] = useState("0");
  const [maxTopup, setMaxTopup] = useState("");
  const [maxBalance, setMaxBalance] = useState("");
  const [bonus, setBonus] = useState("0");
  const [posTopup, setPosTopup] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !dataOwnerId) return;
    (supabase as any).from("wallet_settings").select("*").eq("user_id", dataOwnerId).maybeSingle()
      .then(({ data }: any) => {
        setMinTopup(String(data?.min_topup ?? 0));
        setMaxTopup(data?.max_topup != null ? String(data.max_topup) : "");
        setMaxBalance(data?.default_max_balance != null ? String(data.default_max_balance) : "");
        setBonus(String(data?.topup_bonus_percent ?? 0));
        setPosTopup(data?.allow_pos_topup ?? true);
      });
  }, [open, dataOwnerId]);

  const save = async () => {
    if (!dataOwnerId) return;
    setSaving(true);
    const { error } = await (supabase as any).from("wallet_settings").upsert({
      user_id: dataOwnerId,
      min_topup: Number(minTopup) || 0,
      max_topup: maxTopup === "" ? null : Number(maxTopup),
      default_max_balance: maxBalance === "" ? null : Number(maxBalance),
      topup_bonus_percent: Number(bonus) || 0,
      allow_pos_topup: posTopup,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم حفظ إعدادات المحافظ");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <DynamicsDialog
      open={open}
      onOpenChange={onOpenChange}
      title="إعدادات المحافظ"
      description="تُطبَّق هذه الضوابط تلقائيًا على كل حركات الشحن في النظام ونقطة البيع."
      className="max-w-2xl"
      maxBodyHeight="55vh"
    >
      <DynamicsSection title="ضوابط الشحن">
        <div className="grid gap-3 p-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-[11px]">أقل مبلغ شحن (₪)</Label>
            <Input type="number" step="0.01" value={minTopup} onChange={(e) => setMinTopup(e.target.value)} className="h-9 text-xs tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">أعلى مبلغ شحن (₪) — فارغ = بدون حد</Label>
            <Input type="number" step="0.01" value={maxTopup} onChange={(e) => setMaxTopup(e.target.value)} className="h-9 text-xs tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">سقف رصيد المحفظة (₪) — فارغ = بدون سقف</Label>
            <Input type="number" step="0.01" value={maxBalance} onChange={(e) => setMaxBalance(e.target.value)} className="h-9 text-xs tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px]">نسبة مكافأة الشحن (%)</Label>
            <Input type="number" step="0.01" value={bonus} onChange={(e) => setBonus(e.target.value)} className="h-9 text-xs tabular-nums" />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 sm:col-span-2">
            <div>
              <div className="text-[12px] font-medium">السماح بالشحن من نقطة البيع</div>
              <div className="text-[10.5px] text-muted-foreground">تفعيل زر شحن المحفظة داخل شاشة الكاشير</div>
            </div>
            <Switch checked={posTopup} onCheckedChange={setPosTopup} />
          </div>
        </div>
      </DynamicsSection>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>إلغاء</Button>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ"}</Button>
      </div>
    </DynamicsDialog>
  );
}
