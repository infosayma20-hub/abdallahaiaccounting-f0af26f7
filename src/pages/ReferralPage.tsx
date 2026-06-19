import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Copy, Gift, Share2, Users, Sparkles } from "lucide-react";

interface Referral {
  id: string;
  referred_email: string | null;
  status: string;
  reward_days: number;
  reward_granted: boolean;
  created_at: string;
  qualified_at: string | null;
}

const ReferralPage = () => {
  const { user } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);

  const link = code ? `${window.location.origin}/auth?mode=signup&ref=${code}` : "";

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: row } = await supabase
        .from("referral_codes")
        .select("code")
        .eq("user_id", dataOwnerId!)
        .maybeSingle();

      if (!row) {
        const { data: gen, error } = await supabase.rpc("generate_referral_code");
        if (error) toast.error("تعذّر إنشاء رمز الإحالة");
        else setCode(gen as string);
      } else {
        setCode(row.code);
      }

      const { data: refs } = await supabase
        .from("referrals")
        .select("*")
        .eq("referrer_user_id", user.id)
        .order("created_at", { ascending: false });
      setReferrals((refs as Referral[]) || []);
      setLoading(false);
    })();
  }, [user]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("تم النسخ!");
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "جرّب أموالي - نظام محاسبة فلسطيني",
          text: "خصم خاص لك على اشتراك أموالي",
          url: link,
        });
      } catch { /* user cancelled */ }
    } else {
      copy(link);
    }
  };

  const qualified = referrals.filter((r) => r.reward_granted).length;
  const pending = referrals.filter((r) => !r.reward_granted).length;
  const earnedDays = referrals.filter((r) => r.reward_granted).reduce((s, r) => s + r.reward_days, 0);

  return (
    <div dir="rtl" className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl md:text-4xl font-black text-[#0D1B2E] mb-2 flex items-center gap-3">
          <Gift className="w-8 h-8 text-[#3b82f6]" />
          برنامج الإحالة
        </h1>
        <p className="text-[#0D1B2E]/60 font-bold">
          ادعُ صاحب عمل آخر — احصل على ٣٠ يوم مجّاناً لكل اشتراك فعّال.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <StatCard icon={<Users className="w-5 h-5" />} label="إحالات ناجحة" value={qualified} accent="emerald" />
        <StatCard icon={<Sparkles className="w-5 h-5" />} label="بانتظار التفعيل" value={pending} accent="amber" />
        <StatCard icon={<Gift className="w-5 h-5" />} label="أيام مكتسبة" value={earnedDays} accent="blue" suffix="يوم" />
      </div>

      <Card className="p-6 bg-gradient-to-br from-[#0D1B2E] to-[#1e3a5f] text-white border-none">
        <div className="text-sm font-bold opacity-70 mb-2">رمز الإحالة الخاص بك</div>
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="text-4xl md:text-5xl font-black tracking-wider font-mono">
            {loading ? "..." : code || "—"}
          </div>
          <Button variant="secondary" size="sm" onClick={() => code && copy(code)} disabled={!code}>
            <Copy className="w-4 h-4 ml-1" /> نسخ
          </Button>
        </div>
        <div className="text-sm font-bold opacity-70 mb-2">رابط الدعوة</div>
        <div className="flex items-center gap-2 bg-white/10 rounded-xl p-3">
          <input
            readOnly
            value={link}
            className="flex-1 bg-transparent text-xs md:text-sm font-mono outline-none truncate"
          />
          <Button size="sm" variant="secondary" onClick={() => copy(link)} disabled={!code}>
            <Copy className="w-4 h-4" />
          </Button>
          <Button size="sm" className="bg-[#3b82f6] hover:bg-blue-600" onClick={share} disabled={!code}>
            <Share2 className="w-4 h-4 ml-1" /> مشاركة
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-black text-lg mb-4">كيف يعمل البرنامج؟</h2>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          {[
            ["١", "شارك رمزك", "أرسل الرابط لأصحاب أعمال آخرين عبر واتساب أو سوشيال ميديا."],
            ["٢", "يسجّلون ويفعّلون", "عند تفعيل اشتراكهم الأول، تُحتسب الإحالة تلقائياً."],
            ["٣", "تحصل على خصم", "نضيف ٣٠ يوم مجّاناً لاشتراكك الحالي عن كل إحالة."],
          ].map(([n, t, d]) => (
            <div key={n} className="bg-[#fafbfc] border border-[#e8ecf1] rounded-2xl p-4">
              <div className="w-8 h-8 bg-[#3b82f6] text-white rounded-full flex items-center justify-center font-black mb-3">{n}</div>
              <h3 className="font-black mb-1">{t}</h3>
              <p className="text-[#0D1B2E]/60 font-medium text-xs leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-black text-lg mb-4">إحالاتك ({referrals.length})</h2>
        {referrals.length === 0 ? (
          <div className="text-center py-12 text-[#0D1B2E]/40 font-bold">
            لا توجد إحالات بعد — ابدأ بمشاركة رابطك!
          </div>
        ) : (
          <div className="divide-y divide-[#e8ecf1]">
            {referrals.map((r) => (
              <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold truncate">{r.referred_email || "مستخدم جديد"}</div>
                  <div className="text-xs text-[#0D1B2E]/50 font-mono">
                    {new Date(r.created_at).toLocaleDateString("ar-PS")}
                  </div>
                </div>
                <StatusBadge granted={r.reward_granted} status={r.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

const StatCard = ({ icon, label, value, accent, suffix }: { icon: React.ReactNode; label: string; value: number; accent: string; suffix?: string }) => (
  <Card className="p-4">
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${
      accent === "emerald" ? "bg-emerald-50 text-emerald-600" :
      accent === "amber" ? "bg-amber-50 text-amber-600" :
      "bg-blue-50 text-blue-600"
    }`}>{icon}</div>
    <div className="text-2xl md:text-3xl font-black font-mono">{value}{suffix && <span className="text-sm font-bold opacity-50 mr-1">{suffix}</span>}</div>
    <div className="text-xs font-bold text-[#0D1B2E]/60 mt-1">{label}</div>
  </Card>
);

const StatusBadge = ({ granted, status }: { granted: boolean; status: string }) => {
  if (granted) return <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-black">✓ مكافأة مُضافة</span>;
  if (status === "qualified") return <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-black">مؤهّل</span>;
  return <span className="px-2.5 py-1 bg-amber-50 text-amber-700 rounded-full text-xs font-black">بانتظار التفعيل</span>;
};

export default ReferralPage;