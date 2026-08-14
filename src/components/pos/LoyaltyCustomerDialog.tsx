/**
 * LoyaltyCustomerDialog — استحضار زبون برنامج الولاء يدوياً على الكاش.
 * يُستخدم لطلبات التوصيل/السفري حيث الزبون غير موجود لمسح بطاقته:
 * البحث بالاسم أو رقم الجوال أو رقم البطاقة ثم ربطه بالطلب لاحتساب النقاط.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Star, Wallet } from "lucide-react";

export type LoyaltyCustomerMatch = {
  contact_id: string | null;
  member_id: string;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  loyalty_card_code: string | null;
  loyalty_points: number;
  wallet_balance: number;
  wallet_frozen: boolean;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (m: LoyaltyCustomerMatch) => void;
}

export default function LoyaltyCustomerDialog({ open, onOpenChange, onSelect }: Props) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<LoyaltyCustomerMatch[]>([]);

  useEffect(() => {
    if (!open) { setQ(""); setRows([]); return; }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) { setRows([]); return; }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await (supabase as any).rpc("pos_search_loyalty_customers", { _q: term });
      if (!cancelled) {
        setRows(Array.isArray(data) ? (data as LoyaltyCustomerMatch[]) : []);
        setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); setLoading(false); };
  }, [q, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">اختيار زبون الولاء</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="اسم الزبون أو رقم الجوال أو رقم البطاقة..."
            className="pr-9 h-10 text-sm"
          />
        </div>

        <div className="max-h-[52vh] overflow-y-auto -mx-1 px-1">
          {loading && (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          )}
          {!loading && q.trim().length >= 2 && rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">لا يوجد زبون مطابق</p>
          )}
          {!loading && q.trim().length < 2 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              اكتب حرفين على الأقل — مناسب لطلبات التوصيل عندما لا يكون الزبون موجوداً لمسح بطاقته.
            </p>
          )}
          <div className="space-y-1.5">
            {rows.map((r) => (
              <button
                key={r.member_id}
                onClick={() => { onSelect(r); onOpenChange(false); }}
                className="w-full rounded-lg border bg-card px-3 py-2 text-right transition hover:bg-accent"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{r.contact_name || "زبون"}</span>
                  {r.loyalty_card_code && (
                    <span className="font-mono text-[10px] text-muted-foreground">{r.loyalty_card_code}</span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                  {r.phone && <span dir="ltr">{r.phone}</span>}
                  <span className="flex items-center gap-1"><Star className="h-3 w-3" /> {Math.round(Number(r.loyalty_points || 0))}</span>
                  <span className="flex items-center gap-1"><Wallet className="h-3 w-3" /> ₪{Number(r.wallet_balance || 0).toFixed(2)}</span>
                  {r.wallet_frozen && <span className="text-destructive">مجمّدة</span>}
                </div>
                {r.address && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{r.address}</p>}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
