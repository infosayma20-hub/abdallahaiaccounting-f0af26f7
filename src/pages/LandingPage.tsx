import { useEffect } from "react";
import { Link } from "react-router-dom";
import heroImg from "@/assets/landing-hero-erp.jpg";
import posImg from "@/assets/landing-pos.jpg";
import aiMobileImg from "@/assets/landing-ai-mobile.jpg";
import inventoryImg from "@/assets/landing-inventory.jpg";
import hrImg from "@/assets/landing-hr.jpg";
import reportsImg from "@/assets/landing-reports.jpg";

/**
 * Public marketing landing page — AMWALI أموالي
 * Design: V2 "Modern Technical Density" — clean light theme, bento grid.
 * Palette: bg #fafbfc, surface #e8ecf1, ink #0D1B2E (navy), accent #3b82f6.
 * Type: Cairo (Arabic headings) + DM Sans (Latin numerals).
 * RTL, ILS pricing, Palestinian VAT 16%.
 */
const LandingPage = () => {
  useEffect(() => {
    document.title = "أموالي | نظام ERP فلسطيني متكامل — محاسبة، POS، موارد بشرية وذكاء اصطناعي";
    const setMeta = (name: string, content: string, attr: "name" | "property" = "name") => {
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta(
      "description",
      "أموالي — أول نظام ERP فلسطيني متكامل: محاسبة كاملة، نقاط بيع POS، موارد بشرية ورواتب، مخازن، شيكات، ضريبة 16%، ومحاسب ذكاء اصطناعي بالعربي. صُمّم في فلسطين لأصحاب الأعمال الفلسطينيين."
    );
    setMeta("og:title", "أموالي — نظام ERP الفلسطيني المتكامل", "property");
    setMeta(
      "og:description",
      "نظام ERP فلسطيني شامل: محاسبة، POS، HR، مخازن، شيكات، ضريبة فلسطينية 16%، ومحاسب AI بالعربي.",
      "property"
    );
  }, []);

  return (
    <div
      dir="rtl"
      className="bg-[#fafbfc] text-[#0D1B2E] overflow-x-hidden selection:bg-[#3b82f6] selection:text-white min-h-screen"
      style={{ fontFamily: "'Cairo', sans-serif" }}
    >
      <style>{`
        .font-latin { font-family: 'DM Sans', sans-serif; }
        .bento-card { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .bento-card:hover { transform: translateY(-4px); box-shadow: 0 12px 24px -10px rgba(13, 27, 46, 0.12); }
        .glass-nav { backdrop-filter: blur(12px); border-bottom: 1px solid rgba(232, 236, 241, 0.8); }
        @keyframes ampPulse { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
        .amp-bar { transform-origin: center; animation: ampPulse 1.2s ease-in-out infinite; }
      `}</style>

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass-nav bg-white/70 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="text-2xl font-black text-[#0D1B2E] tracking-tight">أموالي</div>
              <span className="hidden sm:inline-flex items-center gap-1 bg-[#0D1B2E] text-white text-[9px] font-black px-2 py-1 rounded font-latin tracking-wider">ERP · PALESTINE</span>
            </div>
            <div className="hidden md:flex items-center gap-6 font-bold text-sm text-[#0D1B2E]/70">
              <a href="#modules" className="hover:text-[#3b82f6] transition-colors">وحدات النظام</a>
              <a href="#features" className="hover:text-[#3b82f6] transition-colors">الميزات</a>
              <a href="#pricing" className="hover:text-[#3b82f6] transition-colors">الأسعار</a>
              <a href="#ai" className="hover:text-[#3b82f6] transition-colors flex items-center gap-1">
                حسيب AI
                <span className="bg-[#3b82f6]/10 text-[#3b82f6] text-[10px] px-1.5 py-0.5 rounded font-latin">NEW</span>
              </a>
              <a href="#contact" className="hover:text-[#3b82f6] transition-colors">تواصل</a>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/auth" className="text-sm font-bold hidden sm:inline">تسجيل الدخول</Link>
            <Link
              to="/auth?mode=signup"
              className="bg-[#3b82f6] text-white px-5 py-2.5 rounded-xl text-sm font-extrabold hover:bg-blue-600 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
            >
              ابدأ تجربتك المجانية
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 bg-[#e8ecf1] border border-[#d1d7e0] px-3 py-1.5 rounded-full text-xs font-bold mb-8">
            <span className="flex h-2 w-2 rounded-full bg-green-500" />
            أول نظام <span className="font-latin font-black">ERP</span> فلسطيني متوافق مع ضريبة القيمة المضافة 16%
          </div>
          <h1 className="text-5xl md:text-7xl font-black leading-[1.15] mb-6 max-w-5xl mx-auto text-[#0D1B2E]">
            نظام <span className="text-[#3b82f6] font-latin">ERP</span> فلسطيني <br className="hidden md:block" />
            يدير شركتك من الألف إلى الياء
          </h1>
          <p className="text-lg md:text-xl text-[#0D1B2E]/60 mb-10 max-w-3xl mx-auto font-medium leading-relaxed">
            منصة <span className="font-latin font-bold">ERP</span> متكاملة بنيناها في فلسطين، لأصحاب الأعمال الفلسطينيين: محاسبة، نقاط بيع، مخازن، موارد بشرية، شيكات، تقارير، ومحاسب ذكاء اصطناعي بيفهم لهجتك الفلسطينية. كل شي بنظام واحد.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
            <Link
              to="/auth?mode=signup"
              className="w-full sm:w-auto bg-[#0D1B2E] text-white px-8 py-4 rounded-2xl text-lg font-black hover:bg-[#1a2e46] transition-all"
            >
              ابدأ مجاناً 14 يوم
            </Link>
            <a
              href="#modules"
              className="w-full sm:w-auto border-2 border-[#e8ecf1] text-[#0D1B2E] px-8 py-4 rounded-2xl text-lg font-black hover:bg-white transition-all"
            >
              استكشف وحدات النظام
            </a>
          </div>

          {/* Hero Image */}
          <div className="relative mb-20 rounded-3xl overflow-hidden shadow-2xl shadow-[#0D1B2E]/10 border border-[#e8ecf1]">
            <img
              src={heroImg}
              alt="لوحة تحكم نظام ERP أموالي الفلسطيني"
              width={1600}
              height={1024}
              className="w-full h-auto"
            />
          </div>

          {/* Stats Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {[
              { n: "+500", l: "شركة فلسطينية" },
              { n: "+12", l: "وحدة ERP متكاملة" },
              { n: "VAT 16%", l: "ضريبة فلسطينية" },
              { n: "24/7", l: "دعم عربي" },
            ].map((s) => (
              <div key={s.l} className="bg-white border border-[#e8ecf1] rounded-2xl p-6">
                <div className="text-3xl font-black text-[#3b82f6] font-latin mb-1">{s.n}</div>
                <div className="text-sm font-bold text-[#0D1B2E]/60">{s.l}</div>
              </div>
            ))}
          </div>

          {/* Trust Strip */}
          <div className="flex flex-wrap justify-center items-center gap-x-10 gap-y-4 opacity-80 border-y border-[#e8ecf1] py-6 text-sm">
            <div className="font-bold">🇵🇸 صُمّم في فلسطين</div>
            <div className="font-bold">متوافق مع وزارة المالية</div>
            <div className="font-bold">عملة الشيكل ₪ افتراضية</div>
            <div className="font-bold">يعمل بدون إنترنت (POS)</div>
            <div className="font-bold">تخزين سحابي مشفّر</div>
          </div>
        </div>
      </section>

      {/* Bento Features */}
      <section id="features" className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black mb-4">كل أدوات عملك في مكان واحد</h2>
            <p className="text-[#0D1B2E]/60 font-bold">نظام متكامل يغنيك عن خمس برامج منفصلة</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {/* AI Feature (Main) */}
            <div className="md:col-span-4 lg:col-span-3 lg:row-span-2 bento-card bg-[#0D1B2E] rounded-[2rem] p-8 text-white flex flex-col justify-between overflow-hidden relative min-h-[320px]">
              <div className="relative z-10">
                <div className="bg-[#3b82f6] w-fit px-3 py-1 rounded-lg text-[10px] font-black mb-4 uppercase font-latin">حسيب AI</div>
                <h3 className="text-3xl font-black mb-4 leading-tight">محاسبك الذكي بالعربي يفهم لهجتك</h3>
                <p className="text-white/60 font-medium text-lg leading-relaxed">
                  اسأل حسيب عن مبيعاتك، مصاريفك، أو أرباحك المتوقعة بلهجتك اليومية وسيقوم بتحليل كل شيء فوراً.
                </p>
              </div>
              <div className="mt-8 flex items-end gap-1.5 h-12">
                <div className="amp-bar w-1.5 h-4 bg-blue-400 rounded-full" style={{ animationDelay: "0ms" }} />
                <div className="amp-bar w-1.5 h-8 bg-blue-500 rounded-full" style={{ animationDelay: "150ms" }} />
                <div className="amp-bar w-1.5 h-12 bg-white rounded-full" style={{ animationDelay: "300ms" }} />
                <div className="amp-bar w-1.5 h-6 bg-blue-300 rounded-full" style={{ animationDelay: "450ms" }} />
                <div className="amp-bar w-1.5 h-10 bg-blue-400 rounded-full" style={{ animationDelay: "600ms" }} />
                <span className="text-white/40 text-sm font-medium ms-3">"كم دفعنا شيكات الشهر هاد؟"</span>
              </div>
              <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-blue-500/20 blur-3xl pointer-events-none" />
            </div>

            {/* POS */}
            <div className="md:col-span-2 bento-card bg-[#e8ecf1] rounded-[2rem] p-8 flex flex-col justify-between min-h-[200px]">
              <div className="h-12 w-12 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-6">
                <svg className="w-6 h-6 text-[#3b82f6]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              </div>
              <div>
                <h3 className="text-xl font-extrabold mb-2">نقطة بيع POS</h3>
                <p className="text-[#0D1B2E]/50 text-sm font-bold">سريعة، متصلة، وتعمل حتى بدون إنترنت.</p>
              </div>
            </div>

            {/* Invoicing */}
            <div className="md:col-span-2 lg:col-span-3 bento-card bg-white border border-[#e8ecf1] rounded-[2rem] p-8 flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1">
                <h3 className="text-xl font-extrabold mb-2">فواتير + ضريبة 16%</h3>
                <p className="text-[#0D1B2E]/50 text-sm font-bold leading-relaxed">
                  إصدار فواتير ضريبية معتمدة وفقاً لمتطلبات وزارة المالية الفلسطينية بلمسة واحدة.
                </p>
              </div>
              <div className="w-full md:w-32 h-20 bg-[#fafbfc] border border-dashed border-[#d1d7e0] rounded-xl flex items-center justify-center font-latin font-bold text-xs text-[#0D1B2E]/40">
                INVOICE #4282
              </div>
            </div>

            {/* Reports */}
            <div className="md:col-span-2 bento-card bg-[#e8ecf1] rounded-[2rem] p-8">
              <div className="h-12 w-12 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-6">
                <svg className="w-6 h-6 text-[#3b82f6]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
              </div>
              <h3 className="text-xl font-extrabold mb-2">تقارير فورية</h3>
              <p className="text-[#0D1B2E]/50 text-sm font-bold">لوحة تحكم ذكية تلخص وضع عملك في ثوانٍ.</p>
            </div>

            {/* Mobile PWA */}
            <div className="md:col-span-2 lg:col-span-1 lg:row-span-2 bento-card bg-[#3b82f6] rounded-[2rem] p-8 text-white flex flex-col items-center text-center min-h-[320px]">
              <div className="w-full h-48 bg-white/10 rounded-2xl mt-auto mb-6 flex items-end justify-center overflow-hidden">
                <div className="w-1/2 h-4/5 bg-white rounded-t-xl mb-[-10px] shadow-2xl shadow-black/20" />
              </div>
              <h3 className="text-lg font-black mb-1">تطبيق جوال</h3>
              <p className="text-white/70 text-xs font-bold">عملك في جيبك دائماً</p>
            </div>

            {/* Cheques */}
            <div className="md:col-span-2 bento-card bg-white border border-[#e8ecf1] rounded-[2rem] p-8">
              <h3 className="text-xl font-extrabold mb-2">شيكات وسندات</h3>
              <p className="text-[#0D1B2E]/50 text-sm font-bold">تتبع مواعيد الاستحقاق وسندات القبض والصرف آلياً.</p>
            </div>

            {/* HR */}
            <div className="md:col-span-2 bento-card bg-white border border-[#e8ecf1] rounded-[2rem] p-8">
              <h3 className="text-xl font-extrabold mb-2">موظفين وحضور</h3>
              <p className="text-[#0D1B2E]/50 text-sm font-bold">رواتب، حضور، انصراف، ومهام في مكان واحد.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions by Sector */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black mb-4">لكل قطاع حلّه</h2>
            <p className="text-[#0D1B2E]/60 font-bold">خصائص مصممة لتناسب طبيعة تجارتك</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { title: "محلات تجارية", desc: "إدارة مخازن متطورة، باركود، وتنبيهات بنقص الكميات." },
              { title: "مطاعم وكافيهات", desc: "إدارة طاولات، مطبخ، وطلبات خارجية بمرونة عالية." },
              { title: "شركات خدمات", desc: "عروض أسعار، عقود، وفواتير دورية للمشاريع." },
            ].map((s) => (
              <div
                key={s.title}
                className="bg-[#e8ecf1] p-10 rounded-3xl group cursor-pointer hover:bg-[#3b82f6] transition-all"
              >
                <div className="w-12 h-12 bg-white rounded-xl mb-6 flex items-center justify-center">
                  <div className="w-6 h-6 bg-[#3b82f6] rounded-md group-hover:bg-white transition-colors" />
                </div>
                <h4 className="text-2xl font-black mb-4 group-hover:text-white">{s.title}</h4>
                <p className="text-[#0D1B2E]/60 font-bold group-hover:text-white/80">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 bg-[#0D1B2E] text-white rounded-t-[4rem]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black mb-4">اختر الخطة التي تناسبك</h2>
            <p className="text-white/50 font-bold">أسعار شفافة وبسيطة، بدون رسوم خفية</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <PricingCard
              name="أساسي"
              price="₪150"
              features={["مستخدم واحد", "إصدار فواتير ضريبية", "إدارة المخزون", "دعم فني عبر البريد"]}
              cta="ابدأ الآن"
            />
            <PricingCard
              name="احترافي"
              price="₪350"
              featured
              features={["حتى 5 مستخدمين", "جميع ميزات الأساسي", "حسيب AI المتقدم", "تطبيق الجوال الكامل", "دعم هاتفي مباشر"]}
              cta="ابدأ تجربة مجانية"
            />
            <PricingCard
              name="مؤسسات"
              price="اتصل بنا"
              features={["مستخدمين غير محدودين", "ربط الفروع المتعددة", "تخصيص كامل للنظام", "مدير حساب خاص"]}
              cta="تواصل معنا"
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-6 bg-[#0D1B2E] text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-black mb-6 leading-tight">
            جاهز تنقل شركتك لمستوى جديد من الذكاء؟
          </h2>
          <p className="text-white/60 font-bold text-lg mb-10">جربه مجاناً 14 يوم بدون بطاقة ائتمان</p>
          <Link
            to="/auth?mode=signup"
            className="inline-block bg-[#3b82f6] text-white px-12 py-5 rounded-2xl text-xl font-black hover:bg-blue-600 shadow-2xl shadow-blue-500/30 transition-all"
          >
            انضم إلى أموالي اليوم
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="bg-[#0D1B2E] text-white/40 pt-20 pb-10 px-6 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-12">
          <div className="max-w-xs">
            <div className="text-2xl font-black text-white mb-4">أموالي</div>
            <p className="font-bold text-sm leading-relaxed mb-6">
              نطور حلولاً تقنية فلسطينية لتمكين أصحاب الأعمال من إدارة تجارتهم بذكاء وسهولة.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-12">
            <FooterCol title="المنتج" links={[["الميزات", "#features"], ["الأسعار", "#pricing"], ["حسيب AI", "#features"]]} />
            <FooterCol title="الشركة" links={[["تسجيل الدخول", "/auth"], ["إنشاء حساب", "/auth?mode=signup"], ["اتصل بنا", "mailto:support@amwali.com"]]} />
            <FooterCol title="قانوني" links={[["سياسة الخصوصية", "/privacy"], ["شروط الخدمة", "/terms"]]} />
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-20 pt-10 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-bold">
          <span>© {new Date().getFullYear()} أموالي. جميع الحقوق محفوظة.</span>
          <span className="font-latin">Made in Palestine with ❤</span>
        </div>
      </footer>
    </div>
  );
};

const PricingCard = ({
  name,
  price,
  features,
  cta,
  featured = false,
}: {
  name: string;
  price: string;
  features: string[];
  cta: string;
  featured?: boolean;
}) => (
  <div
    className={`p-8 rounded-3xl ${
      featured
        ? "bg-[#3b82f6] relative scale-100 md:scale-105 z-10 shadow-2xl shadow-blue-500/20"
        : "bg-white/5 border border-white/10"
    }`}
  >
    {featured && (
      <div className="absolute -top-4 right-8 bg-white text-[#3b82f6] text-[10px] font-black px-3 py-1 rounded-full">
        الأكثر طلباً
      </div>
    )}
    <h5 className="text-xl font-black mb-2">{name}</h5>
    <div className="text-4xl font-latin font-bold mb-6">
      {price} {price.startsWith("₪") && <span className="text-sm font-normal opacity-50">/ شهر</span>}
    </div>
    <ul className="space-y-3 mb-8 font-bold text-sm">
      {features.map((f) => (
        <li key={f} className={featured ? "text-white" : "text-white/70"}>
          ✓ {f}
        </li>
      ))}
    </ul>
    <Link
      to="/auth?mode=signup"
      className={`block text-center w-full py-3 rounded-xl font-black transition-all ${
        featured ? "bg-white text-[#3b82f6] shadow-xl" : "border border-white/20 hover:bg-white hover:text-[#0D1B2E]"
      }`}
    >
      {cta}
    </Link>
  </div>
);

const FooterCol = ({ title, links }: { title: string; links: [string, string][] }) => (
  <div className="flex flex-col gap-3">
    <span className="text-white font-black text-sm mb-2">{title}</span>
    {links.map(([label, href]) => {
      const isExternal = href.startsWith("http") || href.startsWith("mailto:");
      const isHash = href.startsWith("#");
      if (isExternal || isHash) {
        return (
          <a key={label} href={href} className="text-sm hover:text-white transition-colors">
            {label}
          </a>
        );
      }
      return (
        <Link key={label} to={href} className="text-sm hover:text-white transition-colors">
          {label}
        </Link>
      );
    })}
  </div>
);

export default LandingPage;