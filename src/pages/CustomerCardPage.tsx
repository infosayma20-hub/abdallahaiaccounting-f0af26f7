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

const isIOS =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

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
    if (savingPass) return;
    setSavingPass(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-wallet-pass", { body: { code: card.card_code } });
      const res = data as { success?: boolean; saveUrl?: string; error?: string } | null;
      if (error || !res?.saveUrl) {
        const map: Record<string, string> = {
          wallet_not_configured: "خدمة محفظة Google غير مفعّلة بعد",
          card_not_found: "لم يتم العثور على البطاقة",
          invalid_code: "رمز البطاقة غير صالح",
          wallet_api_error: "تعذّر إنشاء البطاقة لدى Google، حاول لاحقاً",
        };
        toast.error(map[res?.error ?? ""] ?? "تعذّر إضافة البطاقة إلى محفظة Google");
        return;
      }
window.location.href = res.saveUrl;
    } finally {
      setSavingPass(false);
    }
  };

  /** إصدار بطاقة Apple Wallet (.pkpass) — تفتح نافذة «إضافة إلى المحفظة» في آيفون */
  const saveToAppleWallet = async () => {
    if (savingPass) return;
    setSavingPass(true);
    try {
      const base = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${base}/functions/v1/apple-wallet-pass?code=${encodeURIComponent(card.card_code)}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        const map: Record<string, string> = {
          wallet_not_configured: "خدمة Apple Wallet غير مفعّلة بعد — لم تُضف شهادة البطاقة",
          card_not_found: "لم يتم العثور على البطاقة",
          invalid_code: "رمز البطاقة غير صالح",
          pass_error: "تعذّر إنشاء البطاقة، حاول لاحقاً",
        };
        toast.error(map[err.error ?? ""] ?? "تعذّر إضافة البطاقة إلى Apple Wallet");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${card.card_code}.pkpass`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      console.error(e);
      toast.error("تعذّر إضافة البطاقة إلى Apple Wallet");
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-[100dvh] w-full"
      style={{
        background: `radial-gradient(100% 60% at 50% 0%, ${accent}10 0%, transparent 60%), #FAF9F8`,
        fontFamily: `"Segoe UI", "Segoe UI Web (Arabic)", system-ui, -apple-system, sans-serif`,
      }}
    >
      <div className="h-1 w-full" style={{ backgroundColor: accent }} />
      <main className="mx-auto w-full max-w-md px-4 py-5">
        <div className="overflow-hidden rounded-[10px] border border-[#e1dfdd] bg-white shadow-[0_3.2px_7.2px_rgba(0,0,0,0.10)]">
          {/* رأس البطاقة */}
          <div className="flex items-center gap-3 border-b border-[#f3f2f1] px-5 py-4">
            {card.program.logo_url ? (
              <img
                src={card.program.logo_url}
                alt={`شعار ${card.program.name}`}
                className="h-12 w-12 rounded-full border border-[#edebe9] bg-white object-contain p-1"
              />
            ) : null}
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-semibold text-[#242424]">{card.program.name}</h1>
              {card.program.tagline && <p className="truncate text-[11px] text-[#616161]">{card.program.tagline}</p>}
            </div>
          </div>

          {/* الأرصدة */}
          <div className="grid grid-cols-2 gap-px bg-[#edebe9]">
            <div className="bg-white px-5 py-5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#616161]">النقاط</p>
              <p className="mt-1 text-[26px] font-semibold tabular-nums text-[#242424]">{Math.round(card.points)}</p>
            </div>
            <div className="bg-white px-5 py-5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#616161]">رصيد المحفظة</p>
              <p className="mt-1 text-[26px] font-semibold tabular-nums" style={{ color: accent }}>{fmt(card.wallet_balance)}</p>
            </div>
          </div>

          {/* بيانات العضو */}
          <div className="flex items-center justify-between border-t border-[#f3f2f1] px-5 py-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#616161]">العضو</p>
              <p className="text-[16px] font-semibold text-[#242424]">{fullName}</p>
            </div>
            <div className="text-left">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#616161]">عضو منذ</p>
              <p className="text-[16px] font-semibold text-[#242424]">{memberSince}</p>
            </div>
          </div>

          {/* رمز المسح */}
          <div className="px-5 pb-5">
            <div className="mx-auto w-fit rounded-[6px] border border-[#edebe9] bg-white p-4">
              <QRCodeSVG value={card.card_code} size={180} level="M" includeMargin={false} fgColor="#242424" bgColor="#FFFFFF" />
              <p className="mt-2 text-center font-mono text-[13px] font-semibold tracking-[0.2em] text-[#242424]">
                {card.card_code}
              </p>
            </div>
            <p className="mt-3 text-center text-[11.5px] text-[#616161]">
              اعرض هذا الرمز على الكاشير عند الشراء ليتم التعرف عليك تلقائياً.
            </p>
          </div>

          <div className="flex gap-2 border-t border-[#f3f2f1] px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              className="h-9 flex-1 gap-1.5 rounded-[4px] border-[#d1d1d1] text-xs text-[#242424]"
              onClick={() => load(true)}
              disabled={refreshing}
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> تحديث الرصيد
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 flex-1 gap-1.5 rounded-[4px] border-[#d1d1d1] text-xs text-[#242424]"
              onClick={share}
            >
              <Share2 className="h-3.5 w-3.5" /> مشاركة البطاقة
            </Button>
          </div>

          <div className="border-t border-[#f3f2f1] px-5 py-2 text-center text-[10px] text-[#a6a6a6]">
            Powered by Unify ERP
          </div>
        </div>

{isIOS && (
          <Button
            className="mt-4 h-11 w-full gap-2 rounded-[4px] text-[14px] font-semibold text-white hover:opacity-90"
            onClick={saveToAppleWallet}
            disabled={savingPass}
            style={{ backgroundColor: "#0A0A0A" }}
          >
            {savingPass ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            إضافة إلى Apple Wallet
          </Button>
        )}

        <Button
          className={`mt-4 h-11 w-full gap-2 rounded-[4px] text-[14px] font-semibold ${
            isIOS ? "border-[#d1d1d1] text-[#242424]" : "text-white hover:opacity-90"
          }`}
          variant={isIOS ? "outline" : "default"}
          onClick={saveToGoogleWallet}
          disabled={savingPass}
          style={isIOS ? undefined : { backgroundColor: accent }}
        >
          {savingPass ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          إضافة إلى محفظة Google
        </Button>

        <div className="mt-4 rounded-[4px] border border-[#e1dfdd] bg-white px-4 py-3 text-[11.5px] leading-relaxed text-[#616161]">
          <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-[#242424]">
            <PlusSquare className="h-3.5 w-3.5" /> احفظ البطاقة على جوالك
          </div>
          آيفون: اضغط «إضافة إلى Apple Wallet» ثم «إضافة». أندرويد: «إضافة إلى محفظة Google». أو شارك البطاقة ثم «إضافة إلى الشاشة الرئيسية».
        </div>
      </main>
    </div>
  );
}
