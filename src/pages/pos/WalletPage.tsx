/** محفظة العملاء (Wallet) — شاشة تمهيدية لاستكشاف الفكرة قبل التنفيذ الفعلي. */
import { useNavigate } from "react-router-dom";
import { Wallet, Gift, RefreshCcw, CreditCard, Users, TrendingUp, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const IDEAS = [
  {
    icon: CreditCard,
    title: "رصيد مدفوع مسبقاً",
    desc: "الزبون يشحن مبلغ في محفظته ويدفع منه في نقطة البيع. القيد: مدين صندوق / دائن التزام محفظة عملاء (حساب مطلوبات).",
  },
  {
    icon: Gift,
    title: "نقاط الولاء",
    desc: "كل شيكل مبيعات = نقطة، والنقاط تتحوّل لخصم. تُحتسب كمصروف تسويق عند الاستبدال وليس عند التجميع.",
  },
  {
    icon: RefreshCcw,
    title: "استرجاع بدل كاش",
    desc: "بدل إرجاع النقد عند إلغاء صنف أو مرتجع، يُضاف المبلغ لمحفظة الزبون فوراً.",
  },
  {
    icon: Users,
    title: "محفظة الموظف",
    desc: "ربطها بخصم وجبات الموظفين والسلف بدل القيود اليدوية الحالية.",
  },
  {
    icon: TrendingUp,
    title: "تقارير",
    desc: "إجمالي الأرصدة غير المستهلكة (التزام على الشركة)، أكثر الزبائن شحناً، ومعدل الاستهلاك الشهري.",
  },
];

export default function WalletPage() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4" dir="rtl">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="رجوع"
          onClick={() => (window.history.length > 2 ? navigate(-1) : navigate("/pos"))}
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
        <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-500">
          <Wallet className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">محفظة العملاء (Wallet)</h1>
          <p className="text-xs text-muted-foreground">
            مساحة أولية لتحديد شكل المحفظة قبل بناء قاعدة البيانات والقيود المحاسبية.
          </p>
        </div>
        <Badge variant="secondary" className="ms-auto">قيد التصميم</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {IDEAS.map(({ icon: Icon, title, desc }) => (
          <Card key={title} className="border-border">
            <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2">
              <Icon className="h-4 w-4 text-emerald-500" />
              <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-xs leading-relaxed">{desc}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">الخطوة التالية</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <p>1) نختار أي بند نبدأ فيه (الشحن المسبق هو الأبسط والأكثر طلباً).</p>
          <p>2) نضيف جدول أرصدة المحافظ + جدول حركات (شحن / صرف / مرتجع) مربوط بالزبون.</p>
          <p>3) نربطه بحساب التزام في دليل الحسابات حتى تبقى القيود متوازنة.</p>
          <p>4) نضيف زر «الدفع من المحفظة» في شاشة الدفع بنقطة البيع.</p>
        </CardContent>
      </Card>
    </div>
  );
}
