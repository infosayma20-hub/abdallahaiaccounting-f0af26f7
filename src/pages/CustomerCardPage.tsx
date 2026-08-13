/**
 * CustomerCardPage — البطاقة الرقمية للزبون (/card/:code).
 * صفحة عامة تُفتح من جوال الزبون: نقاط الولاء + رصيد المحفظة + رمز QR للمسح على الكاش.
 * قابلة للإضافة إلى الشاشة الرئيسية (Apple/Android) كبطاقة دائمة.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RefreshCcw, Share2, PlusSquare, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Card = {
  card_code: string;
  first_name: string;
  last_name: string | null;
  points: number;
  joined_at: string;
  wallet_balance: number;
  currency: string;
  program: {
    name: string;
    tagline: string | null;
    logo_url: string | null;
    cover_url: string | null;
    brand_color: string;
    accent_color: string;
    currency_code: string;
  };
};

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CustomerCardPage() {
  const { code } = useParams<{ code: string }>();
  const [card, setCard] = useState<Card | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  const load = async (silent = false) => {
    if (!code) return;
    silent ? setRefreshing(true) : setLoading(true);
    const { data } = await supabase.rpc("loyalty_card_public", { _code: code });
    setCard((data as unknown as Card) || null);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 60000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (card) document.title = `بطاقة ${card.first_name} — ${card.program.name}`;
  }, [card]);

  if (loading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background px-6 text-center" dir="rtl">
        <div>
          <h1 className="text-xl font-semibold">البطاقة غير موجودة</h1>
          <p className="mt-2 text-sm text-muted-foreground">تأكد من الرابط أو سجّل من جديد عبر رمز المطعم.</p>
        </div>
      </div>
    );
  }

  const brand = card.program.brand_color || "#0D1B2E";
  const accent = card.program.accent_color || "#2563EB";
  const memberSince = new Date(card.joined_at).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  const fullName = [card.first_name, card.last_name].filter(Boolean).join(" ");

  const share = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: card.program.name, url }); return; } catch { /* ignored */ }
    }
    await navigator.clipboard.writeText(url);
  };

  /** إصدار بطاقة Google Wallet وفتح رابط الحفظ */
  const saveToGoogleWallet = async () => {
    setSavingPass(true);
    const { data, error } = await supabase.functions.invoke("google-wallet-pass", { body: { code: card.card_code } });
    setSavingPass(false);
    const saveUrl = (data as { saveUrl?: string } | null)?.saveUrl;
    if (error || !saveUrl) {
      toast.error("خدمة محفظة Google غير مفعّلة بعد");
      return;
    }
    window.location.href = saveUrl;
  };

  return (
    <div
      dir="rtl"
      className="min-h-[100dvh] w-full px-4 py-6"
      style={{
        background: `radial-gradient(120% 90% at 50% 0%, ${accent}22 0%, transparent 55%), linear-gradient(170deg, ${brand} 0%, ${brand}f2 45%, #05070c 100%)`,
      }}
    >
      <main className="mx-auto w-full max-w-md">
        <div className="overflow-hidden rounded-[26px] border border-white/12 bg-white/[0.06] shadow-2xl backdrop-blur-xl">
          {/* رأس البطاقة */}
          <div className="flex items-center gap-3 px-5 py-4" style={{ backgroundColor: `${accent}1f` }}>
            {card.program.logo_url ? (
              <img src={card.program.logo_url} alt={`شعار ${card.program.name}`} className="h-11 w-11 rounded-xl object-cover ring-2 ring-white/20" />
            ) : null}
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-white">{card.program.name}</h1>
              {card.program.tagline && <p className="truncate text-[11px] text-white/55">{card.program.tagline}</p>}
            </div>
          </div>

          {/* الأرصدة */}
          <div className="grid grid-cols-2 gap-px bg-white/10">
            <div className="bg-black/25 px-5 py-5 text-center">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">النقاط</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-white">{Math.round(card.points)}</p>
            </div>
            <div className="bg-black/25 px-5 py-5 text-center">
              <p className="text-[10px] uppercase tracking-[0.22em] text-white/45">رصيد المحفظة</p>
              <p className="mt-1 text-3xl font-bold tabular-nums" style={{ color: accent }}>{fmt(card.wallet_balance)}</p>
            </div>
          </div>

          {/* بيانات العضو */}
          <div className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">العضو</p>
              <p className="text-lg font-semibold text-white">{fullName}</p>
            </div>
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">عضو منذ</p>
              <p className="text-lg font-semibold text-white">{memberSince}</p>
            </div>
          </div>

          {/* رمز المسح */}
          <div className="px-5 pb-6">
            <div className="mx-auto w-fit rounded-2xl bg-white p-4">
              <QRCodeSVG value={card.card_code} size={190} level="M" includeMargin={false} />
              <p className="mt-2 text-center font-mono text-sm font-bold tracking-[0.18em] text-neutral-800">
                {card.card_code}
              </p>
            </div>
            <p className="mt-3 text-center text-[11.5px] text-white/55">
              اعرض هذا الرمز على الكاشير عند الشراء ليتم التعرف عليك تلقائياً.
            </p>
          </div>

          <div className="flex gap-2 border-t border-white/10 px-5 py-4">
            <Button variant="secondary" size="sm" className="h-9 flex-1 gap-1.5 text-xs" onClick={() => load(true)} disabled={refreshing}>
              <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> تحديث الرصيد
            </Button>
            <Button variant="secondary" size="sm" className="h-9 flex-1 gap-1.5 text-xs" onClick={share}>
              <Share2 className="h-3.5 w-3.5" /> مشاركة البطاقة
            </Button>
          </div>
        </div>

        <Button
          className="mt-4 h-12 w-full gap-2 text-sm font-semibold"
          onClick={saveToGoogleWallet}
          disabled={savingPass}
          style={{ backgroundColor: accent }}
        >
          {savingPass ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          إضافة إلى محفظة Google
        </Button>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-[11.5px] leading-relaxed text-white/60">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-white/80">
            <PlusSquare className="h-3.5 w-3.5" /> احفظ البطاقة على جوالك
          </div>
          آيفون: زر المشاركة في سفاري ثم «إضافة إلى الشاشة الرئيسية». أندرويد: قائمة المتصفح ثم «إضافة إلى الشاشة الرئيسية».
        </div>
      </main>
    </div>
  );
}
