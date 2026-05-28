import { Link } from "react-router-dom";
import MarketingShell from "./MarketingShell";

const features = [
  {
    cat: "محاسبة",
    items: [
      { t: "دفتر يومية ذكي", d: "قيود مزدوجة تلقائية مع منع الحذف والربط بالمستندات الأصلية." },
      { t: "شجرة حسابات معتمدة", d: "حسابات IFRS موحّدة مع حماية الحسابات الأساسية." },
      { t: "تقارير مالية فورية", d: "ميزانية، أرباح وخسائر، وميزان مراجعة بنقرة واحدة." },
      { t: "تعدد العملات", d: "ILS / USD / JOD مع سعر صرف يومي محدّث." },
    ],
  },
  {
    cat: "فواتير وضرائب",
    items: [
      { t: "VAT فلسطيني 16%", d: "فاتورة ضريبية معتمدة - شامل أو غير شامل الضريبة." },
      { t: "فواتير دورية", d: "أصدر فواتير الاشتراكات الشهرية تلقائياً." },
      { t: "إشعارات مدينة ودائنة", d: "بدائل آمنة عن حذف الفواتير - متوافقة مع التدقيق." },
      { t: "مشاركة عبر واتساب", d: "أرسل كشف الحساب بضغطة زرّ مع رابط آمن لمدة 30 يوم." },
    ],
  },
  {
    cat: "نقاط البيع POS",
    items: [
      { t: "يعمل بدون إنترنت", d: "بيع وطباعة في حال انقطاع الشبكة - مزامنة تلقائية لاحقاً." },
      { t: "شاشة مطبخ KDS", d: "طلبات فورية مقسومة حسب الأقسام (مشاوي، بيتزا، مشروبات)." },
      { t: "خرائط طاولات", d: "محرّر مرئي لإدارة الطاولات في المطاعم والكافيهات." },
      { t: "مرتجعات متعدّدة العملات", d: "إغلاق وردية دقيق لكل عملة على حدة." },
    ],
  },
  {
    cat: "ذكاء اصطناعي",
    items: [
      { t: "حسيب AI بالعربي", d: "محاسب صوتي يفهم اللهجة الفلسطينية ويُسجّل القيود." },
      { t: "سامي للمبيعات", d: "روبوت محادثة يلتقط العملاء المحتملين من موقعك." },
      { t: "تحليلات تنبّؤية", d: "AI يكتشف نقص المخزون قبل حدوثه ويُقترح إعادة التزويد." },
      { t: "تلخيص ذكي للوحات", d: "ملخّص مالي يومي يصلك صباحاً." },
    ],
  },
  {
    cat: "موارد بشرية",
    items: [
      { t: "حضور وانصراف ZKTeco", d: "ربط مباشر مع أجهزة البصمة وحساب التأخّر تلقائياً." },
      { t: "رواتب وسلف", d: "محرّك رواتب مرن مع إدارة السلف والقروض والاستقطاعات." },
      { t: "بوابة الموظف", d: "تطبيق PWA للموظف لتقديم الطلبات ومتابعة الراتب." },
      { t: "ورديات وجداول", d: "تخصيص ورديات للموظفين مع حساب ساعات العمل الإضافي." },
    ],
  },
  {
    cat: "إدارة عمليات",
    items: [
      { t: "مخازن متعدّدة", d: "تحويلات بين المستودعات وقيمة مخزون متحرّكة (Moving Avg)." },
      { t: "شيكات صادرة ووارد", d: "تتبّع تواريخ الاستحقاق وحالات التحصيل والتظهير." },
      { t: "أصول ثابتة", d: "استهلاك تلقائي مع جدول الأصول الكامل." },
      { t: "مندوبي مبيعات", d: "تطبيق ميداني للمندوب مع تتبّع GPS وعمولات." },
    ],
  },
];

const FeaturesPage = () => (
  <MarketingShell
    title="ميزات أموالي | محاسبة + POS + AI + موارد بشرية فلسطيني"
    description="استكشف ميزات أموالي الكاملة: محاسبة IFRS، نقاط بيع تعمل أوفلاين، فواتير VAT 16%، محاسب AI بالعربي، رواتب، شيكات، وأصول ثابتة - كلّها في منصّة واحدة."
    canonical="https://amwali.app/features"
  >
    {/* Hero */}
    <section className="px-6 py-20">
      <div className="max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-[#e8ecf1] border border-[#d1d7e0] px-3 py-1.5 rounded-full text-xs font-bold mb-6">
          <span className="flex h-2 w-2 rounded-full bg-[#3b82f6]" />
          منصّة شاملة - تغنيك عن ٥ برامج منفصلة
        </div>
        <h1 className="text-4xl md:text-6xl font-black leading-[1.15] mb-6">
          كل أدوات إدارة أعمالك — <span className="text-[#3b82f6]">في منصّة واحدة</span>
        </h1>
        <p className="text-lg text-[#0D1B2E]/60 font-medium max-w-2xl mx-auto mb-10">
          من فاتورة ضريبية لرواتب موظفين لتقارير AI - أموالي يجمع كل ما تحتاجه الشركات
          الصغيرة والمتوسطة الفلسطينية في تطبيق واحد سريع وذكي.
        </p>
        <Link
          to="/auth?mode=signup"
          className="inline-block bg-[#0D1B2E] text-white px-8 py-4 rounded-2xl text-lg font-black hover:bg-[#1a2e46] transition-all"
        >
          ابدأ تجربتك المجانية - ١٤ يوم
        </Link>
      </div>
    </section>

    {/* Feature groups */}
    <section className="px-6 py-16 bg-white">
      <div className="max-w-7xl mx-auto space-y-20">
        {features.map((g) => (
          <div key={g.cat}>
            <h2 className="text-3xl md:text-4xl font-black mb-10 flex items-center gap-4">
              <span className="h-1 w-12 bg-[#3b82f6] rounded-full" />
              {g.cat}
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
              {g.items.map((it) => (
                <div key={it.t} className="bg-[#fafbfc] border border-[#e8ecf1] rounded-2xl p-6 hover:border-[#3b82f6] hover:shadow-lg transition-all">
                  <div className="w-10 h-10 bg-[#3b82f6]/10 rounded-xl flex items-center justify-center mb-4">
                    <span className="w-4 h-4 bg-[#3b82f6] rounded" />
                  </div>
                  <h3 className="font-black text-lg mb-2">{it.t}</h3>
                  <p className="text-sm text-[#0D1B2E]/60 font-medium leading-relaxed">{it.d}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>

    {/* CTA */}
    <section className="px-6 py-24 bg-[#0D1B2E] text-white">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="text-4xl md:text-5xl font-black mb-6">جرّب كل هذه الميزات مجاناً</h2>
        <p className="text-white/60 font-bold text-lg mb-8">١٤ يوم تجربة كاملة - بدون بطاقة ائتمان</p>
        <Link
          to="/auth?mode=signup"
          className="inline-block bg-[#3b82f6] text-white px-10 py-4 rounded-2xl text-lg font-black hover:bg-blue-600 shadow-2xl shadow-blue-500/30"
        >
          ابدأ الآن
        </Link>
      </div>
    </section>
  </MarketingShell>
);

export default FeaturesPage;