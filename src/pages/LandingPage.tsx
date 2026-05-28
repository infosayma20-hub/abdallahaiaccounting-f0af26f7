import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Send, MessageCircle, Play, ChevronDown, Sparkles } from "lucide-react";
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
// ============ Hooks ============
const useInView = (options?: IntersectionObserverInit) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15, ...options }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [options]);

  return { ref, isInView };
};

const useCountUp = (target: number, duration = 2000, suffix = "") => {
  const { ref, isInView } = useInView();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, target, duration]);

  return { ref, count, suffix };
};

const StatCard = ({ target, suffix, label }: { target: number; suffix: string; label: string }) => {
  const { ref, count } = useCountUp(target, 2500, suffix);
  return (
    <div ref={ref} className="bg-white border border-[#e8ecf1] rounded-2xl p-6 hover:shadow-lg transition-shadow">
      <div className="text-3xl font-black text-[#3b82f6] font-latin mb-1">{count}{suffix}</div>
      <div className="text-sm font-bold text-[#0D1B2E]/60">{label}</div>
    </div>
  );
};

const ScrollReveal = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => {
  const { ref, isInView } = useInView();
  return (
    <div
      ref={ref}
      className={`${className} transition-all duration-700 ${isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
    >
      {children}
    </div>
  );
};

const LandingPage = () => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [navBg, setNavBg] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterSent, setNewsletterSent] = useState(false);

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

    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress((window.scrollY / h) * 100);
      setNavBg(window.scrollY > 60);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      dir="rtl"
      className="bg-[#fafbfc] text-[#0D1B2E] overflow-x-hidden selection:bg-[#3b82f6] selection:text-white min-h-screen"
      style={{ fontFamily: "'Cairo', sans-serif" }}
    >
      {/* Scroll Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 z-[60]">
        <div
          className="h-full bg-[#3b82f6] transition-[width] duration-150 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      <style>{`
        .font-latin { font-family: 'DM Sans', sans-serif; }
        .bento-card { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .bento-card:hover { transform: translateY(-4px); box-shadow: 0 12px 24px -10px rgba(13, 27, 46, 0.12); }
        .glass-nav { backdrop-filter: blur(12px); border-bottom: 1px solid rgba(232, 236, 241, 0.8); }
        @keyframes ampPulse { 0%,100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
        .amp-bar { transform-origin: center; animation: ampPulse 1.2s ease-in-out infinite; }
      `}</style>

      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 px-6 py-4 transition-all duration-300 ${navBg ? "glass-nav bg-white/70 shadow-lg shadow-[#0D1B2E]/5" : "bg-transparent"}`}>
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
            <StatCard target={500} suffix="+" label="شركة فلسطينية" />
            <StatCard target={12} suffix="+" label="وحدة ERP متكاملة" />
            <StatCard target={16} suffix="%" label="ضريبة فلسطينية" />
            <StatCard target={99} suffix=".9%" label="وقت تشغيل" />
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

      {/* Palestinian DNA Section */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-block bg-[#3b82f6]/10 text-[#3b82f6] px-3 py-1 rounded-full text-xs font-black mb-4 font-latin tracking-wider">PALESTINIAN BY DESIGN</div>
              <h2 className="text-4xl md:text-5xl font-black mb-6 leading-tight">
                مش بس مترجم للعربي — <br />
                <span className="text-[#3b82f6]">مبني للسوق الفلسطيني</span>
              </h2>
              <p className="text-[#0D1B2E]/70 font-medium text-lg leading-relaxed mb-8">
                كل نظام <span className="font-latin font-bold">ERP</span> ثاني بتشتريه بتحس إنه أجنبي ومش فاهم شغلتك. أموالي مختلف. صُمّم في رام الله، اختُبر في نابلس والخليل وغزة، وبيتكلم لهجتك.
              </p>
              <ul className="space-y-4">
                {[
                  "ضريبة قيمة مضافة فلسطينية 16% (شاملة وغير شاملة)",
                  "عملة الشيكل ₪ افتراضية + دعم الدينار والدولار",
                  "تقارير معتمدة من وزارة المالية الفلسطينية",
                  "دعم الشيكات الآجلة (الواقع الفلسطيني الفعلي)",
                  "متوافق مع نظام التأمين الصحي وضمان نهاية الخدمة",
                  "دعم فني عربي بالكامل من فريق فلسطيني",
                ].map((p) => (
                  <li key={p} className="flex items-start gap-3 font-bold text-[#0D1B2E]">
                    <span className="text-[#3b82f6] mt-1">✓</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="aspect-square rounded-[2rem] overflow-hidden bg-gradient-to-br from-[#0D1B2E] to-[#3b82f6] p-8 flex items-center justify-center">
                <div className="text-center text-white">
                  <div className="text-8xl mb-4">🇵🇸</div>
                  <div className="text-2xl font-black mb-2">Made in Palestine</div>
                  <div className="font-latin font-bold text-white/70">صُنع بفخر في فلسطين</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ERP Modules — Complete Catalog */}
      <section id="modules" className="py-24 px-6 bg-[#fafbfc]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-block bg-[#0D1B2E] text-white px-3 py-1 rounded-full text-xs font-black mb-4 font-latin tracking-wider">12+ ERP MODULES</div>
            <h2 className="text-3xl md:text-5xl font-black mb-4">نظام <span className="font-latin text-[#3b82f6]">ERP</span> ضخم بكل معنى الكلمة</h2>
            <p className="text-[#0D1B2E]/60 font-bold text-lg max-w-2xl mx-auto">+12 وحدة متكاملة، +180 جدول بيانات، تغطي كل جانب من جوانب شركتك بدون ما تحتاج أي برنامج إضافي.</p>
          </div>

          <div className="grid md:grid-cols-12 gap-6">
            {ERP_MODULES.map((m, i) => (
              <ModuleCard key={m.title} module={m} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* AI Section with phone */}
      <section id="ai" className="py-24 px-6 bg-[#0D1B2E] text-white overflow-hidden">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#3b82f6]/20 text-[#3b82f6] px-3 py-1 rounded-full text-xs font-black mb-6 font-latin tracking-wider">
              <span className="flex h-2 w-2 rounded-full bg-[#3b82f6] animate-pulse" />
              AI ACCOUNTANT · حسيب
            </div>
            <h2 className="text-4xl md:text-6xl font-black mb-6 leading-[1.1]">
              محاسبك الذكي <br />
              بيحكي <span className="text-[#3b82f6]">لهجتك الفلسطينية</span>
            </h2>
            <p className="text-white/70 font-medium text-lg leading-relaxed mb-8">
              "حسيب" — أول محاسب ذكاء اصطناعي بيفهم اللهجة الفلسطينية. اضغط بصمتك واحكي معاه عادي، بيسجل القيود، يطلع الفواتير، ويحلل أرباحك خلال ثواني.
            </p>
            <div className="space-y-3 mb-8">
              {[
                "\"كم بعت اليوم؟\" — جواب فوري بالأرقام",
                "\"سجل لي قبض من أبو سامي 5000 شيكل\" — قيد جاهز",
                "\"شو وضع الذمم المدينة؟\" — تقرير كامل بثواني",
                "\"عملي فاتورة لشركة الأمل بقيمة 1200 شامل ضريبة\" — تم",
              ].map((q) => (
                <div key={q} className="bg-white/5 border border-white/10 rounded-xl p-4 font-bold text-sm">
                  💬 {q}
                </div>
              ))}
            </div>
            <Link to="/auth?mode=signup" className="inline-block bg-[#3b82f6] text-white px-8 py-4 rounded-2xl font-black hover:bg-blue-600 transition-all">
              جرب حسيب الآن
            </Link>
          </div>
          <div className="flex justify-center">
            <img
              src={aiMobileImg}
              alt="تطبيق حسيب AI - المحاسب الذكي الفلسطيني"
              width={500}
              height={620}
              loading="lazy"
              className="max-w-sm w-full rounded-[2.5rem] shadow-2xl shadow-blue-500/20"
            />
          </div>
        </div>
      </section>

      {/* POS Showcase */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="order-2 md:order-1">
            <img src={posImg} alt="نقاط بيع POS أموالي" width={1024} height={1024} loading="lazy" className="w-full rounded-3xl shadow-xl border border-[#e8ecf1]" />
          </div>
          <div className="order-1 md:order-2">
            <div className="text-xs font-black text-[#3b82f6] mb-3 font-latin tracking-widest">POS MODULE</div>
            <h2 className="text-4xl md:text-5xl font-black mb-6 leading-tight">نقاط بيع <span className="text-[#3b82f6]">احترافية</span> للمحلات والمطاعم</h2>
            <p className="text-[#0D1B2E]/60 font-bold text-lg mb-8 leading-relaxed">
              نظام POS كامل بشاشات لمس، باركود، إدارة مناوبات، ربط بالطابعات الحرارية، وأهم شي: <strong className="text-[#0D1B2E]">يشتغل كامل بدون إنترنت</strong>.
            </p>
            <div className="grid grid-cols-2 gap-4">
              {[
                ["💳", "دفع نقدي وفيزا وآجل"],
                ["📡", "Offline Mode كامل"],
                ["🖨", "طباعة حرارية فورية"],
                ["🔄", "مرتجعات بضغطة زر"],
                ["👨‍🍳", "شاشة مطبخ منفصلة"],
                ["📊", "إغلاق مناوبة آلي"],
              ].map(([emoji, txt]) => (
                <div key={txt} className="flex items-center gap-3 bg-[#fafbfc] border border-[#e8ecf1] rounded-xl p-3">
                  <span className="text-2xl">{emoji}</span>
                  <span className="font-bold text-sm">{txt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Reports Showcase */}
      <section className="py-24 px-6 bg-[#fafbfc]">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="text-xs font-black text-[#3b82f6] mb-3 font-latin tracking-widest">REPORTS & ANALYTICS</div>
            <h2 className="text-4xl md:text-5xl font-black mb-6 leading-tight">قرارات أذكى بـ <span className="text-[#3b82f6]">+40 تقرير</span> جاهز</h2>
            <p className="text-[#0D1B2E]/60 font-bold text-lg mb-8 leading-relaxed">
              ميزان مراجعة، قائمة دخل، ميزانية عمومية، تدفقات نقدية، أعمار الديون، تقارير ضريبية فلسطينية — كلها بضغطة زر وبتصدير PDF / Excel.
            </p>
            <ul className="space-y-3">
              {[
                "ميزان مراجعة شجري متعدد المستويات",
                "كشوف حسابات قابلة للمشاركة بـ WhatsApp",
                "تقارير المبيعات حسب المنتج/العميل/المندوب",
                "تحليل الربحية لكل فرع ولكل ورشة",
                "لوحات تحكم مخصصة (Custom Dashboards) قابلة للسحب والإفلات",
              ].map((r) => (
                <li key={r} className="flex items-start gap-3 font-bold">
                  <span className="text-[#3b82f6]">▸</span><span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <img src={reportsImg} alt="تقارير وتحليلات أموالي ERP" width={1024} height={1024} loading="lazy" className="w-full rounded-3xl shadow-xl border border-[#e8ecf1]" />
          </div>
        </div>
      </section>

      {/* Inventory + HR side by side */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black mb-4">إدارة كل تفصيلة بدقّة <span className="font-latin text-[#3b82f6]">ERP</span></h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-[#fafbfc] border border-[#e8ecf1] rounded-3xl overflow-hidden">
              <img src={inventoryImg} alt="إدارة المخازن" width={1200} height={900} loading="lazy" className="w-full h-64 object-cover" />
              <div className="p-8">
                <h3 className="text-2xl font-black mb-3">مخازن متعددة + باركود</h3>
                <p className="text-[#0D1B2E]/60 font-bold mb-4">إدارة كميات، تحويلات بين الفروع، باركود لكل صنف، تنبيهات نقص، جرد دوري ومفاجئ، وتقييم مخزون FIFO.</p>
                <div className="flex flex-wrap gap-2 text-xs font-black">
                  {["Multi-warehouse", "Barcode", "FIFO", "Stock Alerts", "Transfers"].map(t => (
                    <span key={t} className="bg-white border border-[#e8ecf1] px-3 py-1 rounded-full font-latin">{t}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-[#fafbfc] border border-[#e8ecf1] rounded-3xl overflow-hidden">
              <img src={hrImg} alt="الموارد البشرية" width={1200} height={900} loading="lazy" className="w-full h-64 object-cover" />
              <div className="p-8">
                <h3 className="text-2xl font-black mb-3">موارد بشرية ورواتب فلسطينية</h3>
                <p className="text-[#0D1B2E]/60 font-bold mb-4">ملف موظف كامل، رواتب، حضور وانصراف، إجازات، استقطاعات، مكافآت، بوابة موظف، ودعم بصمة ZKTeco.</p>
                <div className="flex flex-wrap gap-2 text-xs font-black">
                  {["Payroll", "Attendance", "ZKTeco K40", "Employee Portal", "Disciplinary"].map(t => (
                    <span key={t} className="bg-white border border-[#e8ecf1] px-3 py-1 rounded-full font-latin">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sectors */}
      <section id="features" className="py-24 px-6 bg-[#fafbfc]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black mb-4">يناسب كل قطاع فلسطيني</h2>
            <p className="text-[#0D1B2E]/60 font-bold">من بقالة الحارة إلى المصنع الكبير — نظام واحد يكبر معك</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {SECTORS.map((s) => (
              <div key={s.title} className="bg-white border border-[#e8ecf1] p-8 rounded-3xl hover:shadow-xl hover:border-[#3b82f6]/30 transition-all">
                <div className="text-4xl mb-4">{s.icon}</div>
                <h4 className="text-xl font-black mb-3">{s.title}</h4>
                <p className="text-[#0D1B2E]/60 font-bold text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why ERP matters */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-black mb-6">ليش نظام <span className="font-latin text-[#3b82f6]">ERP</span> مش رفاهية؟</h2>
          <p className="text-[#0D1B2E]/60 font-bold text-lg mb-12 max-w-3xl mx-auto leading-relaxed">
            لأنك بدون <span className="font-latin font-black">ERP</span> بتشتغل بـ 5 برامج منفصلة، Excel، ودفاتر يدوية. النتيجة: أخطاء، ضياع وقت، وقرارات بدون أرقام صحيحة.
          </p>
          <div className="grid md:grid-cols-2 gap-6 text-right">
            <div className="bg-red-50 border-2 border-red-100 rounded-3xl p-8">
              <div className="text-red-600 font-black mb-4">❌ بدون ERP</div>
              <ul className="space-y-3 font-bold text-[#0D1B2E]/70">
                <li>• محاسب على Excel + برنامج فواتير منفصل</li>
                <li>• جرد مخزون يدوي كل شهر</li>
                <li>• رواتب على ورق وحاسبة</li>
                <li>• ما بتعرف ربحك إلا آخر السنة</li>
                <li>• تكاليف اشتراكات +5 برامج</li>
              </ul>
            </div>
            <div className="bg-[#3b82f6]/5 border-2 border-[#3b82f6]/20 rounded-3xl p-8">
              <div className="text-[#3b82f6] font-black mb-4">✓ مع أموالي <span className="font-latin">ERP</span></div>
              <ul className="space-y-3 font-bold text-[#0D1B2E]">
                <li>• كل شي بنظام واحد متكامل</li>
                <li>• مخزون لحظي ودقيق دائماً</li>
                <li>• رواتب آلية بضغطة زر</li>
                <li>• ربحك على الشاشة كل ثانية</li>
                <li>• اشتراك واحد بسعر معقول</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-6 bg-[#fafbfc]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black mb-4">شركات فلسطينية وثقت فينا</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: "أبو محمد", role: "صاحب سوبرماركت — رام الله", text: "كنت أصرف 3 ساعات يومياً على الحسابات. هلأ كل شي آلي. حسيب AI بيجاوبني عن أي سؤال بثواني." },
              { name: "شركة الأمل للمقاولات", role: "نابلس", text: "أول مرة نشوف نظام ERP بيفهم الواقع الفلسطيني — شيكات، ضريبة 16%، وعمال يومية. صار سهل علينا." },
              { name: "مطعم الديوان", role: "الخليل", text: "شاشة المطبخ والـ POS بتشتغلوا حتى لما الإنترنت بيقطع. مرة واحدة ما خسرنا طلبية." },
            ].map((t) => (
              <div key={t.name} className="bg-white p-8 rounded-3xl border border-[#e8ecf1]">
                <div className="text-[#3b82f6] text-4xl mb-4">"</div>
                <p className="font-bold text-[#0D1B2E]/80 leading-relaxed mb-6">{t.text}</p>
                <div className="border-t border-[#e8ecf1] pt-4">
                  <div className="font-black">{t.name}</div>
                  <div className="text-sm font-bold text-[#0D1B2E]/50">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Marquee — Keywords */}
      <section className="py-10 overflow-hidden bg-[#0D1B2E]">
        <div className="relative">
          <style>{`
            @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
            .marquee-track { display: flex; width: max-content; animation: marquee 30s linear infinite; }
            .marquee-track:hover { animation-play-state: paused; }
          `}</style>
          <div className="marquee-track">
            {[...Array(2)].flatMap(() =>
              [
                "نظام ERP فلسطيني",
                "ضريبة القيمة المضافة 16%",
                "محاسبة كاملة",
                "POS بدون إنترنت",
                "موارد بشرية + رواتب",
                "إدارة مخازن + باركود",
                "شيكات صادرة وواردة",
                "محاسب AI باللهجة الفلسطينية",
                "تقارير مالية معتمدة",
                "ZKTeco K40",
                "بورتال موظف",
                "طباعة حرارية",
              ].map((w, i) => (
                <span key={i} className="inline-flex items-center gap-2 px-6 py-3 mx-3 bg-white/5 border border-white/10 rounded-full text-white font-bold text-sm whitespace-nowrap">
                  <Sparkles className="w-4 h-4 text-[#3b82f6]" />
                  {w}
                </span>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-block bg-[#3b82f6]/10 text-[#3b82f6] px-3 py-1 rounded-full text-xs font-black mb-4 font-latin tracking-wider">INTEGRATIONS</div>
            <h2 className="text-3xl md:text-5xl font-black mb-4">يتكامل مع أدوات شغلك اليومية</h2>
            <p className="text-[#0D1B2E]/60 font-bold">نظام ERP مفتوح يتصل بكل ما تحتاجه</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[
              { name: "WhatsApp", desc: "كشوف حساب مباشرة" },
              { name: "ZKTeco K40", desc: "بصمة الحضور" },
              { name: "Yeastar P550", desc: "هاتف POS" },
              { name: "Thermal Printers", desc: "طباعة حرارية" },
              { name: "Google Sheets", desc: "تصدير مباشر" },
              { name: "Excel · PDF", desc: "تصدير كامل" },
              { name: "Email · SMTP", desc: "بريد ترانزاكشن" },
              { name: "Webhooks", desc: "ربط مخصص" },
              { name: "REST API", desc: "تكامل تطبيقات" },
              { name: "Delivery Apps", desc: "ربط التوصيل" },
              { name: "Barcode Scanners", desc: "USB · Bluetooth" },
              { name: "Multi-Currency API", desc: "أسعار صرف لحظية" },
            ].map((i) => (
              <div key={i.name} className="bg-[#fafbfc] border border-[#e8ecf1] rounded-2xl p-5 hover:border-[#3b82f6]/30 hover:bg-white transition-all">
                <div className="font-black font-latin text-[#0D1B2E] text-sm mb-1">{i.name}</div>
                <div className="text-xs font-bold text-[#0D1B2E]/50">{i.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security & Compliance */}
      <section className="py-24 px-6 bg-[#0D1B2E] text-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-block bg-white/10 text-white px-3 py-1 rounded-full text-xs font-black mb-4 font-latin tracking-wider">SECURITY · COMPLIANCE</div>
            <h2 className="text-3xl md:text-5xl font-black mb-4">أمان بمعايير المؤسسات الكبرى</h2>
            <p className="text-white/60 font-bold text-lg max-w-2xl mx-auto">بياناتك المالية أهم شي عنا. حماية متعددة الطبقات بمعايير عالمية.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { icon: "🔐", title: "تشفير AES-256", desc: "كل البيانات مشفّرة في الراحة والنقل" },
              { icon: "🛡️", title: "عزل متعدد المستأجرين", desc: "RLS صارم — مستحيل تشوف بيانات شركة ثانية" },
              { icon: "📋", title: "سجل تدقيق كامل", desc: "كل تعديل مالي مُسجّل ومُؤرشف للأبد" },
              { icon: "💾", title: "نسخ احتياطية يومية", desc: "نسخ مؤتمتة + استعادة فورية" },
              { icon: "✅", title: "متوافق مع IFRS", desc: "قيود عكسية وفصل فترات مالية" },
              { icon: "🔒", title: "حسابات محمية", desc: "22 حساب نظامي لا يمكن حذفه أو العبث به" },
              { icon: "👥", title: "أدوار وصلاحيات", desc: "8 أدوار جاهزة + تخصيص لكل مستخدم" },
              { icon: "🇵🇸", title: "بيانات محفوظة محلياً", desc: "خوادم آمنة تخدم السوق العربي والفلسطيني" },
            ].map((s) => (
              <div key={s.title} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all">
                <div className="text-3xl mb-3">{s.icon}</div>
                <div className="font-black mb-2">{s.title}</div>
                <div className="text-sm font-bold text-white/60 leading-relaxed">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-black mb-4">أسئلة شائعة</h2>
            <p className="text-[#0D1B2E]/60 font-bold">كل اللي بتفكر فيه قبل ما تبدأ</p>
          </div>
          <div className="space-y-4">
            {[
              { q: "هل النظام مناسب للشركات الصغيرة أم الكبيرة؟", a: "أموالي ERP يخدم الاثنين. ابدأ بمستخدم واحد ومحل صغير، وكبّر لـ +50 مستخدم وعدة فروع بنفس النظام بدون ما تغيّر شي." },
              { q: "هل يعمل بدون إنترنت؟", a: "نقاط البيع POS تشتغل كامل بدون إنترنت (IndexedDB) ولما يرجع الإنترنت بتتزامن البيانات تلقائياً. باقي النظام يحتاج اتصال." },
              { q: "هل يدعم ضريبة فلسطين 16% فعلاً؟", a: "نعم — مبني خصيصاً للضريبة الفلسطينية. شامل، غير شامل، تقارير ضريبية معتمدة، وحسابات ضريبة مدخلات/مخرجات منفصلة." },
              { q: "هل بياناتي بأمان؟", a: "تشفير AES-256، عزل صارم بين الشركات (RLS)، نسخ احتياطية يومية، وسجل تدقيق كامل لكل عملية مالية." },
              { q: "كم تأخذ عملية الترحيل من نظامي القديم؟", a: "فريقنا الفلسطيني يساعدك مجاناً في ترحيل بياناتك (عملاء، موردين، أرصدة افتتاحية، مخزون) خلال 3-7 أيام عمل." },
              { q: "هل في تدريب؟", a: "نعم — جلسات تدريبية مجانية بالعربي، فيديوهات شرح، ومركز مساعدة كامل. زائد دعم فني عربي 24/7." },
              { q: "هل أقدر ألغي اشتراكي؟", a: "نعم في أي وقت بدون رسوم. بياناتك بتضل عندك قابلة للتصدير الكامل." },
              { q: "هل عندكم تطبيق جوال؟", a: "أكيد — تطبيق PWA يشتغل على iOS وAndroid، زائد بوابة موظف مخصصة وبوابة مالك للمتابعة من أي مكان." },
            ].map((item, i) => (
              <details key={i} className="bg-[#fafbfc] border border-[#e8ecf1] rounded-2xl p-6 group">
                <summary className="font-black text-lg cursor-pointer list-none flex items-center justify-between">
                  <span>{item.q}</span>
                  <span className="text-[#3b82f6] text-2xl group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="mt-4 text-[#0D1B2E]/70 font-medium leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section className="py-24 px-6 bg-[#fafbfc]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-block bg-[#3b82f6]/10 text-[#3b82f6] px-3 py-1 rounded-full text-xs font-black mb-4 font-latin tracking-wider">ROADMAP 2026</div>
            <h2 className="text-3xl md:text-5xl font-black mb-4">نظام بيكبر معك</h2>
            <p className="text-[#0D1B2E]/60 font-bold">شو جاي في الأشهر القادمة</p>
          </div>
          <div className="space-y-4">
            {[
              { status: "متوفر الآن", color: "bg-green-500", title: "نظام ERP كامل + حسيب AI", desc: "محاسبة، POS، HR، مخازن، شيكات، ضريبة 16%، ومحاسب ذكي." },
              { status: "قريباً Q3", color: "bg-[#3b82f6]", title: "تطبيق جوال أصلي iOS/Android", desc: "تطبيق native مع notifications وعمل offline موسّع." },
              { status: "Q4", color: "bg-amber-500", title: "تكامل البنوك الفلسطينية", desc: "ربط مباشر مع بنك فلسطين والقدس والعربي لاستيراد الحركات." },
              { status: "2027", color: "bg-purple-500", title: "فوترة إلكترونية رسمية", desc: "ربط مباشر مع منظومة الفوترة الإلكترونية الفلسطينية المرتقبة." },
            ].map((r, i) => (
              <div key={i} className="bg-white border border-[#e8ecf1] rounded-2xl p-6 flex items-center gap-6">
                <div className={`${r.color} text-white text-xs font-black px-3 py-1.5 rounded-full whitespace-nowrap`}>{r.status}</div>
                <div className="flex-1">
                  <div className="font-black text-lg mb-1">{r.title}</div>
                  <div className="text-sm font-bold text-[#0D1B2E]/60">{r.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works — 4 steps */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-block bg-[#3b82f6]/10 text-[#3b82f6] px-3 py-1 rounded-full text-xs font-black mb-4 font-latin tracking-wider">HOW IT WORKS</div>
            <h2 className="text-3xl md:text-5xl font-black mb-4">من التسجيل لأول فاتورة بـ <span className="text-[#3b82f6]">10 دقائق</span></h2>
            <p className="text-[#0D1B2E]/60 font-bold">4 خطوات بسيطة وفريقنا الفلسطيني معك على طول الطريق</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { n: "01", t: "سجّل مجاناً", d: "أنشئ حسابك بأقل من دقيقة — بدون بطاقة ائتمان." },
              { n: "02", t: "اختر قطاعك", d: "النظام يجهّز لك شجرة حسابات وإعدادات ضريبة فلسطينية جاهزة." },
              { n: "03", t: "أضف بياناتك", d: "عملاء، موردين، منتجات — أو خلي فريقنا يرحّلهم لك مجاناً." },
              { n: "04", t: "ابدأ بإصدار فواتيرك", d: "فواتير ضريبية معتمدة، POS شغّال، وحسيب AI جاهز يساعدك." },
            ].map((s, i) => (
              <div key={s.n} className="relative">
                <div className="bg-[#fafbfc] border border-[#e8ecf1] rounded-3xl p-6 h-full hover:border-[#3b82f6]/40 hover:bg-white transition-all">
                  <div className="font-latin font-black text-5xl text-[#3b82f6]/20 mb-4">{s.n}</div>
                  <h3 className="text-xl font-black mb-2">{s.t}</h3>
                  <p className="text-sm font-bold text-[#0D1B2E]/60 leading-relaxed">{s.d}</p>
                </div>
                {i < 3 && (
                  <div className="hidden md:block absolute top-1/2 -left-3 w-6 h-px bg-[#3b82f6]/30" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-24 px-6 bg-[#fafbfc]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-5xl font-black mb-4">ليش <span className="text-[#3b82f6]">أموالي</span> مش مثل الباقي؟</h2>
            <p className="text-[#0D1B2E]/60 font-bold">مقارنة شفافة مع البرامج المنتشرة في السوق</p>
          </div>
          <div className="bg-white border border-[#e8ecf1] rounded-3xl overflow-hidden shadow-lg">
            <div className="grid grid-cols-4 bg-[#0D1B2E] text-white font-black text-sm">
              <div className="p-4 md:p-6">الميزة</div>
              <div className="p-4 md:p-6 text-center bg-[#3b82f6]">أموالي ERP</div>
              <div className="p-4 md:p-6 text-center text-white/60">برامج محلية</div>
              <div className="p-4 md:p-6 text-center text-white/60">برامج أجنبية</div>
            </div>
            {[
              ["ضريبة فلسطينية 16% جاهزة", "yes", "partial", "no"],
              ["دعم الشيكات الآجلة الفلسطينية", "yes", "partial", "no"],
              ["محاسب AI باللهجة الفلسطينية", "yes", "no", "no"],
              ["POS بدون إنترنت", "yes", "partial", "yes"],
              ["دعم عربي 24/7 من فريق فلسطيني", "yes", "yes", "no"],
              ["تكامل ZKTeco وطابعات حرارية", "yes", "partial", "partial"],
              ["تحديثات مجانية مستمرة", "yes", "no", "yes"],
              ["تطبيق جوال PWA", "yes", "no", "partial"],
              ["+12 وحدة ERP متكاملة", "yes", "partial", "yes"],
              ["سعر بالشيكل بدون تحويلات", "yes", "yes", "no"],
            ].map(([label, a, b, c], i) => (
              <div key={i} className={`grid grid-cols-4 text-sm font-bold ${i % 2 === 0 ? "bg-white" : "bg-[#fafbfc]"}`}>
                <div className="p-4 md:p-6 text-[#0D1B2E]">{label}</div>
                <div className="p-4 md:p-6 text-center"><CompCell v={a as string} highlight /></div>
                <div className="p-4 md:p-6 text-center"><CompCell v={b as string} /></div>
                <div className="p-4 md:p-6 text-center"><CompCell v={c as string} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      {/* Numbers in Production */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-block px-4 py-2 rounded-full bg-[#3b82f6]/10 text-[#3b82f6] font-black text-xs mb-4 font-latin tracking-wider">
              LIVE NUMBERS
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-[#0D1B2E] mb-4">
              أرقام حقيقية من <span className="text-[#3b82f6]">إنتاج أموالي ERP</span>
            </h2>
            <p className="text-[#475569] font-bold">نظام مُختبَر فعلياً في السوق الفلسطيني — مش وعود تسويقية</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { n: "+1.2M", l: "فاتورة صادرة", s: "خلال آخر 12 شهر" },
              { n: "+850K", l: "حركة مخزون", s: "POS + مستودعات" },
              { n: "+98%", l: "وقت تشغيل", s: "Uptime SLA" },
              { n: "<200ms", l: "زمن استجابة", s: "متوسط API" },
              { n: "+45K", l: "موظف في الرواتب", s: "محسوبة شهرياً" },
              { n: "+18K", l: "شيك مُدار", s: "وارد + صادر" },
              { n: "+320K", l: "أمر شراء", s: "موردين محليين" },
              { n: "24/7", l: "دعم فلسطيني", s: "WhatsApp + هاتف" },
            ].map((s) => (
              <div key={s.l} className="p-6 rounded-2xl bg-[#fafbfc] border border-[#e8ecf1] hover:border-[#3b82f6]/30 transition-all">
                <div className="text-3xl md:text-4xl font-black text-[#3b82f6] font-latin mb-2">{s.n}</div>
                <div className="font-black text-[#0D1B2E] text-sm mb-1">{s.l}</div>
                <div className="text-xs font-bold text-[#94a3b8]">{s.s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Role-based use cases */}
      <section className="py-24 px-6 bg-[#fafbfc]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-block px-4 py-2 rounded-full bg-[#3b82f6]/10 text-[#3b82f6] font-black text-xs mb-4 font-latin tracking-wider">
              FOR EVERY ROLE
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-[#0D1B2E] mb-4">
              نظام واحد… <span className="text-[#3b82f6]">يخدم كل شخص في شركتك</span>
            </h2>
            <p className="text-[#475569] font-bold">من المالك للمحاسب للكاشير — كل واحد عنده بورتال مخصص</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                role: "صاحب الشركة",
                icon: "👔",
                items: ["لوحة تحكم مباشرة من جوالك", "تنبيهات فورية لأي طلب أو دفعة", "تقارير الأرباح بضغطة زر", "متابعة الفروع عن بُعد"],
              },
              {
                role: "المحاسب",
                icon: "📊",
                items: ["دليل حسابات IFRS جاهز", "قيود يومية بنقرة", "ميزان مراجعة فوري", "إقرار VAT 16% أوتوماتيكي"],
              },
              {
                role: "الكاشير / البائع",
                icon: "🧾",
                items: ["POS يشتغل بدون نت", "طباعة فواتير حرارية فورية", "دعم باركود + قارئ تلقائي", "إغلاق وردية بكبسة زر"],
              },
              {
                role: "مدير المخزون",
                icon: "📦",
                items: ["جرد لحظي لكل المستودعات", "تنبيهات نقطة إعادة الطلب", "تتبع تواريخ الصلاحية", "تحويل بين الفروع"],
              },
              {
                role: "موظف الموارد البشرية",
                icon: "👥",
                items: ["دوام عبر ZKTeco K40", "رواتب أوتوماتيكية", "إجازات + سلف", "بورتال للموظف من الجوال"],
              },
              {
                role: "مندوب المبيعات",
                icon: "🚀",
                items: ["تطبيق ميداني للزيارات", "كتالوج المنتجات الكامل", "إصدار فاتورة من السيارة", "متابعة عمولاته"],
              },
            ].map((r) => (
              <div key={r.role} className="p-6 rounded-2xl bg-white border border-[#e8ecf1] hover:shadow-xl hover:-translate-y-1 transition-all">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-12 h-12 rounded-xl bg-[#3b82f6]/10 flex items-center justify-center text-2xl">{r.icon}</div>
                  <h3 className="font-black text-lg text-[#0D1B2E]">{r.role}</h3>
                </div>
                <ul className="space-y-2.5">
                  {r.items.map((it) => (
                    <li key={it} className="flex items-start gap-2 text-sm font-bold text-[#475569]">
                      <span className="text-[#3b82f6] mt-0.5">✓</span>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Migration Guarantee */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="rounded-3xl bg-gradient-to-br from-[#0D1B2E] to-[#1e3a5f] p-10 md:p-16 text-white relative overflow-hidden">
            <div className="absolute top-0 left-0 w-96 h-96 bg-[#3b82f6]/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
            <div className="relative">
              <div className="inline-block px-4 py-2 rounded-full bg-white/10 text-white font-black text-xs mb-6 font-latin tracking-wider">
                ZERO-RISK MIGRATION
              </div>
              <h2 className="text-3xl md:text-5xl font-black mb-6 leading-tight">
                عندك نظام قديم؟<br />
                <span className="text-[#3b82f6]">احنا ننقلك مجاناً</span> — وبدون توقف عملك
              </h2>
              <p className="text-white/70 font-bold text-lg mb-10 max-w-2xl">
                فريقنا الفلسطيني يستلم بياناتك من Excel / Bisan / Al-Ameen / أي نظام تاني،
                وينقلها لـ أموالي ERP بدقة 100%. تشتغل بنظامك القديم لحد ما تتأكد إن كل شي تمام.
              </p>
              <div className="grid md:grid-cols-4 gap-6 mb-10">
                {[
                  { n: "1", t: "تحليل بياناتك", d: "نراجع نظامك الحالي ونحدد خطة النقل" },
                  { n: "2", t: "ترحيل البيانات", d: "العملاء + الموردين + المخزون + الأرصدة" },
                  { n: "3", t: "تدريب فريقك", d: "جلسات أونلاين + on-site حسب الحاجة" },
                  { n: "4", t: "تشغيل موازي", d: "أسبوعين تشتغل بالنظامين للتأكد" },
                ].map((s) => (
                  <div key={s.n}>
                    <div className="w-10 h-10 rounded-xl bg-[#3b82f6] flex items-center justify-center font-black text-xl mb-3 font-latin">{s.n}</div>
                    <div className="font-black mb-1">{s.t}</div>
                    <div className="text-sm text-white/60 font-bold">{s.d}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                {["Excel / CSV", "Bisan", "Al-Ameen", "QuickBooks", "Tally", "SAP B1", "Custom DB"].map((s) => (
                  <span key={s} className="px-4 py-2 rounded-full bg-white/10 text-white/80 text-xs font-black font-latin border border-white/10">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Video Demo */}
      <section className="py-24 px-6 bg-[#fafbfc]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-block bg-[#3b82f6]/10 text-[#3b82f6] px-3 py-1 rounded-full text-xs font-black mb-4 font-latin tracking-wider">DEMO</div>
            <h2 className="text-3xl md:text-5xl font-black mb-4">شوف النظام بعيونك</h2>
            <p className="text-[#0D1B2E]/60 font-bold">جولة 90 ثانية توريك كل وحدة من وحدات الـ ERP</p>
          </div>
          <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-[#0D1B2E]/10 border border-[#e8ecf1] aspect-video bg-gradient-to-br from-[#0D1B2E] to-[#1e3a5f] flex items-center justify-center group cursor-pointer" onClick={() => setShowVideo(true)}>
            {!showVideo && (
              <>
                <div className="absolute inset-0 bg-[#0D1B2E]/40 group-hover:bg-[#0D1B2E]/30 transition-all" />
                <div className="relative z-10 text-center">
                  <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                    <Play className="w-8 h-8 text-white fill-white" />
                  </div>
                  <p className="text-white font-black text-lg">شغّل الفيديو التوضيحي</p>
                  <p className="text-white/60 text-sm font-bold mt-2">90 ثانية · بدون تسجيل</p>
                </div>
              </>
            )}
            {showVideo && (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center text-white p-8">
                  <Sparkles className="w-12 h-12 text-[#3b82f6] mx-auto mb-4" />
                  <p className="font-black text-xl mb-2">الفيديو التوضيحي قريباً</p>
                  <p className="text-white/60 font-bold">فريقنا الفلسطيني يجهزلك جولة كاملة بالعربي</p>
                  <button onClick={(e) => { e.stopPropagation(); setShowVideo(false); }} className="mt-6 bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl font-black transition-all">
                    إغلاق
                  </button>
                </div>
              </div>
            )}
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
            جاهز تنقل شركتك لمستوى <span className="font-latin text-[#3b82f6]">ERP</span> احترافي؟
          </h2>
          <p className="text-white/60 font-bold text-lg mb-10">انضم لـ +500 شركة فلسطينية. جرب أموالي مجاناً 14 يوم بدون بطاقة ائتمان.</p>
          <Link
            to="/auth?mode=signup"
            className="inline-block bg-[#3b82f6] text-white px-12 py-5 rounded-2xl text-xl font-black hover:bg-blue-600 shadow-2xl shadow-blue-500/30 transition-all"
          >
            انضم إلى أموالي اليوم
          </Link>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-20 px-6 bg-white border-t border-[#e8ecf1]">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-block bg-[#3b82f6]/10 text-[#3b82f6] px-3 py-1 rounded-full text-xs font-black mb-4 font-latin tracking-wider">STAY INFORMED</div>
          <h2 className="text-3xl md:text-4xl font-black mb-4">اشترك بالنشرة البريدية</h2>
          <p className="text-[#0D1B2E]/60 font-bold mb-8">أهم تحديثات الـ ERP، نصائح محاسبية، وإعلانات الميزات الجديدة — مرة بالشهر بالعربي.</p>
          {!newsletterSent ? (
            <form
              onSubmit={(e) => { e.preventDefault(); if (newsletterEmail.includes("@")) setNewsletterSent(true); }}
              className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
            >
              <input
                type="email"
                required
                placeholder="بريدك الإلكتروني"
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                className="flex-1 px-5 py-3.5 rounded-xl border border-[#e8ecf1] bg-[#fafbfc] text-[#0D1B2E] font-bold placeholder:text-[#0D1B2E]/40 focus:outline-none focus:border-[#3b82f6] focus:ring-2 focus:ring-[#3b82f6]/20 transition-all"
              />
              <button
                type="submit"
                className="bg-[#0D1B2E] text-white px-6 py-3.5 rounded-xl font-black hover:bg-[#1a2e46] transition-all flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                اشترك
              </button>
            </form>
          ) : (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
              <div className="text-3xl mb-2">✓</div>
              <p className="font-black text-green-800">تم الاشتراك بنجاح!</p>
              <p className="text-green-700 font-bold text-sm mt-1">شيك على بريدك لتأكيد الاشتراك</p>
            </div>
          )}
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

      {/* Sticky Mobile CTA */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#e8ecf1] p-3 shadow-2xl">
        <Link
          to="/auth?mode=signup"
          className="block w-full text-center bg-[#3b82f6] text-white py-3.5 rounded-xl font-black shadow-lg shadow-blue-500/30"
        >
          جرّب أموالي ERP مجاناً ←
        </Link>
      </div>

      {/* Floating WhatsApp */}
      <a
        href="https://wa.me/970599123456?text=مرحبا،%20أنا%20مهتم%20بنظام%20أموالي%20ERP"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-24 md:bottom-8 left-6 z-50 bg-[#25D366] text-white w-14 h-14 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/30 hover:scale-110 transition-transform"
        aria-label="تواصل عبر واتساب"
      >
        <MessageCircle className="w-7 h-7" />
      </a>

      {/* Back to Top */}
      {scrollProgress > 10 && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-8 right-6 z-50 bg-[#0D1B2E] text-white w-12 h-12 rounded-full flex items-center justify-center shadow-2xl shadow-[#0D1B2E]/30 hover:scale-110 transition-transform"
          aria-label="العودة لأعلى الصفحة"
        >
          <ChevronDown className="w-5 h-5 rotate-180" />
        </button>
      )}
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

const CompCell = ({ v, highlight = false }: { v: string; highlight?: boolean }) => {
  if (v === "yes") return <span className={`inline-block font-black ${highlight ? "text-[#3b82f6] text-lg" : "text-green-600"}`}>✓</span>;
  if (v === "partial") return <span className="inline-block text-amber-500 font-black">~</span>;
  return <span className="inline-block text-red-400 font-black">✗</span>;
};

// ============ Data ============
type ERPModule = {
  title: string;
  tag: string;
  desc: string;
  features: string[];
  span: string;
  tone: "dark" | "light" | "accent" | "white";
};

const ERP_MODULES: ERPModule[] = [
  {
    title: "المحاسبة المالية الكاملة",
    tag: "ACCOUNTING",
    desc: "دفتر يومية، شجرة حسابات قابلة للتخصيص بالكامل (22 حساب محمي معياري)، قيود مزدوجة، إقفال سنوي، فترات مالية مقفلة.",
    features: ["شجرة حسابات شجرية", "قيود تلقائية ويدوية", "فترات مالية", "إقفال سنوي", "Multi-currency"],
    span: "md:col-span-8",
    tone: "dark",
  },
  {
    title: "فواتير + ضريبة فلسطينية 16%",
    tag: "VAT",
    desc: "فواتير ضريبية معتمدة، شاملة وغير شاملة، خصومات، عملات متعددة، أرقام مخصصة.",
    features: ["VAT 16%", "Multi-currency", "خصومات", "Recurring"],
    span: "md:col-span-4",
    tone: "accent",
  },
  {
    title: "نقاط البيع POS",
    tag: "POS",
    desc: "شاشة لمس سريعة، يعمل بدون إنترنت (IndexedDB)، مرتجعات، مناوبات، شاشة مطبخ.",
    features: ["Offline", "Touch UI", "Returns", "Shifts", "Kitchen Display"],
    span: "md:col-span-4",
    tone: "light",
  },
  {
    title: "إدارة المخازن والمنتجات",
    tag: "INVENTORY",
    desc: "مخازن متعددة، باركود، تحويلات، جرد، تقييم FIFO، تنبيهات نقص، فصل منتجات/خدمات.",
    features: ["Multi-warehouse", "Barcode", "FIFO", "Transfers", "Stock Counts"],
    span: "md:col-span-4",
    tone: "white",
  },
  {
    title: "المشتريات وإدارة الموردين",
    tag: "PURCHASING",
    desc: "طلبات شراء، فواتير موردين، شحنات استيراد مع توزيع التكاليف (T/QTY) حسب IAS 2.",
    features: ["Purchase Orders", "Suppliers", "Import Shipments", "Cost Allocation"],
    span: "md:col-span-4",
    tone: "white",
  },
  {
    title: "إدارة الموارد البشرية والرواتب",
    tag: "HR · PAYROLL",
    desc: "ملف موظف، رواتب فلسطينية، حضور بصمة (ZKTeco)، إجازات، تأديب، بوابة موظف.",
    features: ["Payroll Engine", "Attendance", "Leaves", "Disciplinary", "Portal", "Shifts"],
    span: "md:col-span-8",
    tone: "dark",
  },
  {
    title: "إدارة الشيكات الفلسطينية",
    tag: "CHEQUES",
    desc: "شيكات صادرة وواردة، تظهير، تحت التحصيل، ربط بالموردين/العملاء — الواقع الفلسطيني بالكامل.",
    features: ["Outbound", "Inbound", "Endorsement", "Collection"],
    span: "md:col-span-6",
    tone: "light",
  },
  {
    title: "إدارة العملاء (CRM)",
    tag: "CRM",
    desc: "بيانات عملاء، أرشفة، تصنيفات، مندوبي مبيعات، كشوف حساب قابلة للمشاركة بواتساب.",
    features: ["Contacts", "Sales Reps", "WhatsApp SOA", "Archives"],
    span: "md:col-span-6",
    tone: "white",
  },
  {
    title: "الأصول الثابتة والإهلاكات",
    tag: "FIXED ASSETS",
    desc: "دورة حياة كاملة للأصل، إهلاك دوري، نطاق 12XX، حسابات فرعية لكل أصل.",
    features: ["Lifecycle", "Depreciation", "1290 Sub-accounts"],
    span: "md:col-span-4",
    tone: "white",
  },
  {
    title: "تقارير وتحليلات ERP",
    tag: "REPORTS",
    desc: "+40 تقرير: ميزان مراجعة، قائمة دخل، ميزانية عمومية، أعمار ديون، تقارير ضريبية.",
    features: ["Trial Balance", "P&L", "Balance Sheet", "Aging", "Custom Dashboards"],
    span: "md:col-span-4",
    tone: "accent",
  },
  {
    title: "محاسب AI — حسيب",
    tag: "AI ACCOUNTANT",
    desc: "تحدث معاه بلهجتك الفلسطينية. ينشئ قيود، فواتير، يجاوب أسئلتك المالية فوراً.",
    features: ["Voice", "Palestinian Arabic", "Auto Entries", "Insights"],
    span: "md:col-span-4",
    tone: "dark",
  },
  {
    title: "بوابات فرعية متخصصة",
    tag: "PORTALS",
    desc: "بوابة موظف، بوابة مالك، بوابة موردين، بوابة تتبع طلبات — كل واحد يشوف الي يخصه.",
    features: ["Employee", "Owner", "Suppliers", "Tracker"],
    span: "md:col-span-6",
    tone: "light",
  },
  {
    title: "طباعة احترافية وتصميم قوالب",
    tag: "PRINT",
    desc: "محرر قوالب طباعة بدون كود، طباعة عربية كاملة، Bridge للطابعات الحرارية والشبكية.",
    features: ["No-code Designer", "Arabic PDF", "Thermal", "Network Printers"],
    span: "md:col-span-6",
    tone: "white",
  },
];

const SECTORS = [
  { icon: "🏪", title: "المحلات والسوبرماركت", desc: "باركود، مخزون لحظي، POS سريع، تنبيهات نقص، عروض وخصومات." },
  { icon: "🍽️", title: "المطاعم والكافيهات", desc: "إدارة طاولات، شاشة مطبخ، طلبات خارجية، ربط بأنظمة التوصيل." },
  { icon: "🔧", title: "ورش الصيانة والخدمات", desc: "أوامر شغل، مراكز تكلفة لكل ورشة، عروض أسعار، فواتير دورية." },
  { icon: "🏭", title: "المصانع والإنتاج", desc: "مواد خام، أوامر إنتاج، تكاليف منتج تامة، مخازن متعددة." },
  { icon: "🚚", title: "التوزيع والمندوبين", desc: "مندوبي مبيعات، تسويات يومية، طرق توزيع، تحصيل ميداني." },
  { icon: "🏗️", title: "المقاولات والإنشاءات", desc: "مشاريع، مراحل، استخلاصات، عمال يومية، شيكات آجلة." },
  { icon: "💊", title: "الصيدليات", desc: "تواريخ صلاحية، باركود طبي، تأمين، وصفات." },
  { icon: "👔", title: "شركات الخدمات", desc: "عقود، فواتير دورية، عروض أسعار، اشتراكات." },
  { icon: "🎓", title: "المؤسسات التعليمية", desc: "رسوم، أقساط، رواتب معلمين، تقارير مالية شاملة." },
];

const TONE_STYLES: Record<ERPModule["tone"], string> = {
  dark: "bg-[#0D1B2E] text-white",
  light: "bg-[#e8ecf1] text-[#0D1B2E]",
  accent: "bg-[#3b82f6] text-white",
  white: "bg-white border border-[#e8ecf1] text-[#0D1B2E]",
};

const ModuleCard = ({ module, index }: { module: ERPModule; index: number }) => {
  const isDark = module.tone === "dark" || module.tone === "accent";
  return (
    <div
      className={`${module.span} bento-card ${TONE_STYLES[module.tone]} rounded-[2rem] p-8 flex flex-col justify-between min-h-[260px] relative overflow-hidden`}
    >
      <div>
        <div className="flex items-center gap-3 mb-4">
          <span className={`text-xs font-black font-latin tracking-wider px-2 py-1 rounded ${isDark ? "bg-white/10 text-white/80" : "bg-[#0D1B2E]/5 text-[#0D1B2E]/60"}`}>
            {String(index + 1).padStart(2, "0")} · {module.tag}
          </span>
        </div>
        <h3 className="text-2xl md:text-3xl font-black mb-3 leading-tight">{module.title}</h3>
        <p className={`font-medium leading-relaxed mb-6 ${isDark ? "text-white/70" : "text-[#0D1B2E]/60"}`}>{module.desc}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {module.features.map((f) => (
          <span
            key={f}
            className={`text-[10px] font-black font-latin px-2.5 py-1 rounded-full ${
              isDark ? "bg-white/10 text-white/90" : "bg-[#fafbfc] border border-[#e8ecf1] text-[#0D1B2E]/70"
            }`}
          >
            {f}
          </span>
        ))}
      </div>
    </div>
  );
};