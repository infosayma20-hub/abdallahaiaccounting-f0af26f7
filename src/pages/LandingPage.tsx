import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Check, Plus, Minus,
  LayoutGrid, ShoppingCart, UtensilsCrossed, Users,
  Store, Coffee, Factory, Building2, Wrench, Plane, GraduationCap, Car,
  AlertTriangle, ShieldAlert, BellRing, Star,
} from "lucide-react";
import logoFull from "@/assets/amwali-logo-full.png.asset.json";
import appsGrid from "@/assets/screens/apps-grid.png";
import repHome from "@/assets/screens/rep-home.png";
import finHub from "@/assets/screens/finance-hub.png";

/**
 * AMWALI — Landing page (Qoyod-inspired: clean, minimal, trust-first).
 * RTL Arabic. Light background, navy text, blue accent.
 */
const LandingPage = () => {
  const [navBg, setNavBg] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    document.title = "أموالي | نظام ERP عربي متكامل — محاسبة، POS، بائع متجول، موارد بشرية";
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
      "أموالي — نظام ERP عربي متكامل لفلسطين والأردن والخليج: محاسبة، نقاط بيع، بائع متجول، حضور موظفين، شيكات، ضريبة، ومحاسب ذكي بالعربي."
    );
    setMeta("og:title", "أموالي — ERP عربي متكامل", "property");

    const onScroll = () => setNavBg(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { href: "#products", label: "المنتجات" },
    { href: "#sectors", label: "القطاعات" },
    { href: "#partners", label: "الشركاء" },
    { href: "#pricing", label: "الأسعار" },
    { href: "#faq", label: "الأسئلة" },
  ];

  const problems = [
    { icon: AlertTriangle, title: "غياب التوجيه الواضح", desc: "مش عارف من وين تبدأ بتنظيم محاسبتك، وكل مصدر يقولك شي مختلف." },
    { icon: ShieldAlert, title: "حلول غير موثوقة", desc: "أنظمة كتير تدّعي إنها متكاملة، بس بتفشل عند أول تدقيق أو تكامل حقيقي." },
    { icon: BellRing, title: "لا تنبيهات ولا حماية", desc: "لما يصير خطأ ما في تحذير مبكر، وبتكتشف المشكلة بعد فوات الأوان." },
  ];

  const products = [
    { icon: LayoutGrid, color: "bg-blue-50 text-blue-600", title: "المحاسبة", desc: "برنامج محاسبة متكامل لإدارة الفواتير، القيود، والتقارير المالية." },
    { icon: ShoppingCart, color: "bg-emerald-50 text-emerald-600", title: "نقاط البيع", desc: "كاشير سحابي يربط كل عملية بيع مباشرة بحساباتك، مع فواتير معتمدة." },
    { icon: UtensilsCrossed, color: "bg-amber-50 text-amber-600", title: "نقاط بيع المطاعم", desc: "نظام كامل للكاشير وإدارة المطعم: من الطلبات لشاشات المطبخ." },
    { icon: Users, color: "bg-violet-50 text-violet-600", title: "خدمات أموالي المحترفة", desc: "خدمات محاسبية على يد محاسبين معتمدين. رتّب سجلاتك واستعد لأي تدقيق." },
  ];

  const sectors = [
    { icon: Store, color: "bg-orange-50 text-orange-500", title: "التجزئة", desc: "ملابس، إلكترونيات، بقالة، عطور، ومحلات تجزئة عامة." },
    { icon: Coffee, color: "bg-red-50 text-red-500", title: "المطاعم والمقاهي", desc: "مطاعم، كافيهات، عربات طعام، مخابز، ومصانع تعبئة المياه." },
    { icon: Factory, color: "bg-emerald-50 text-emerald-600", title: "التصنيع", desc: "مصانع، ورش صناعية، تكاليف إنتاج، وورش تجميع." },
    { icon: Building2, color: "bg-indigo-50 text-indigo-600", title: "العقارات والإنشاءات", desc: "مقاولات، مكاتب عقارية، إدارة أملاك، واستشارات هندسية." },
    { icon: Wrench, color: "bg-pink-50 text-pink-500", title: "الخدمات", desc: "استشارات، إعلان، تجميل، صيانة، مغاسل، وصالونات." },
    { icon: Plane, color: "bg-sky-50 text-sky-500", title: "السفر والسياحة", desc: "فنادق، وكالات سفر، نقل سياحي، ومنظّمي رحلات." },
    { icon: GraduationCap, color: "bg-yellow-50 text-yellow-600", title: "التعليم", desc: "مدارس، حضانات، مراكز تدريب، ومدارس تعليم قيادة." },
    { icon: Car, color: "bg-rose-50 text-rose-500", title: "التأجير", desc: "تأجير سيارات، معدات ثقيلة، شقق مفروشة، وقاعات أفراح." },
  ];

  const faqs = [
    { q: "هل أموالي متوافق مع متطلبات الفوترة الإلكترونية؟", a: "نعم، أموالي متوافق مع أنظمة الفوترة الإلكترونية في فلسطين والأردن والسعودية، مع تحديثات مستمرة لأي متطلبات جديدة." },
    { q: "هل أحتاج خبرة محاسبية لاستخدام أموالي؟", a: "لا. الواجهة مصمّمة لأصحاب الأعمال قبل المحاسبين، وفريق الدعم يساعدك في التأسيس الأولي مجاناً." },
    { q: "هل بياناتي محفوظة بشكل آمن؟", a: "نعم، جميع البيانات مشفّرة ومحفوظة على سيرفرات آمنة، مع نسخ احتياطية يومية وصلاحيات دقيقة لكل مستخدم." },
    { q: "هل أقدر أجرّب أموالي قبل الاشتراك؟", a: "أكيد. تجربة مجانية 14 يوم، بدون بطاقة ائتمان، وبكل الميزات." },
    { q: "هل يدعم أموالي نقاط البيع والمتاجر الإلكترونية؟", a: "نعم، أموالي يشمل نقاط بيع سحابية ويتكامل مع المتاجر الإلكترونية والتطبيقات الخارجية." },
    { q: "شو اللي يميّز أموالي عن باقي البرامج المحاسبية؟", a: "أموالي عربي بالكامل، مصمّم لمنطقتنا، ويجمع المحاسبة والـ POS والموارد البشرية والبائع المتجول في منصة واحدة." },
  ];

  return (
    <div dir="rtl" className="bg-white text-[#0D1B2E] min-h-screen" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <style>{`.font-latin{font-family:'DM Sans',sans-serif}`}</style>

      {/* NAV */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all ${navBg ? "bg-white/90 backdrop-blur-md border-b border-[#eef1f5]" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link to="/landing" className="flex items-center">
              <img src={logoFull.url} alt="أموالي" className="h-9 w-auto" />
            </Link>
            <div className="hidden lg:flex items-center gap-7 text-sm font-bold text-[#0D1B2E]/80">
              {navLinks.map((l) => (
                <a key={l.href} href={l.href} className="hover:text-[#2563eb] transition-colors">{l.label}</a>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="text-sm font-bold text-[#0D1B2E] px-4 py-2 hover:text-[#2563eb] transition">دخول</Link>
            <Link to="/auth?mode=signup" className="bg-[#0D1B2E] text-white px-5 py-2.5 rounded-full text-sm font-extrabold hover:bg-[#1B3A5C] transition">
              ابدأ مجاناً
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="pt-32 pb-20 px-6 bg-gradient-to-b from-[#eaf1fb] via-[#f4f8fd] to-white">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-[#0D1B2E] text-white text-xs font-bold px-4 py-2 rounded-full mb-8">
              <span className="bg-orange-400 text-[10px] px-2 py-0.5 rounded-full">تنبيه</span>
              <span>عقوبات التأخر في تقديم البيانات الضريبية</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </div>
            <h1 className="text-5xl md:text-6xl font-black leading-[1.1] mb-6">
              الطريقة الموثوقة <br/>
              للحصول على <span className="text-[#2563eb]">نظام محاسبي</span> متكامل
            </h1>
            <p className="text-lg text-[#0D1B2E]/70 leading-relaxed mb-10 max-w-lg">
              واجه استحقاقات الفوترة الإلكترونية بثقة. إرشاد خطوة بخطوة من فريق محلي موثوق، على منصة محاسبية جاهزة بالكامل.
            </p>
            <div className="flex items-center gap-3 flex-wrap mb-8">
              <Link to="/auth?mode=signup" className="bg-[#2563eb] text-white px-6 py-4 rounded-xl text-sm font-extrabold hover:bg-blue-700 transition flex items-center gap-2">
                أصدر أول فاتورة مجاناً <ArrowLeft className="w-4 h-4" />
              </Link>
              <a href="#contact" className="bg-white border border-[#e5eaf0] text-[#0D1B2E] px-6 py-4 rounded-xl text-sm font-extrabold hover:border-[#0D1B2E] transition">
                تحدث مع المبيعات
              </a>
            </div>
            <div className="flex items-center gap-5 text-xs font-bold text-[#0D1B2E]/60 flex-wrap">
              <span>متوافق ضريبياً</span>
              <span className="opacity-30">|</span>
              <span>دعم 24/7</span>
              <span className="opacity-30">|</span>
              <span>25,000+ منشأة</span>
              <span className="opacity-30">|</span>
              <span>+10 سنوات في السوق</span>
            </div>
          </div>
          <div className="relative">
            <div className="bg-white rounded-3xl shadow-2xl shadow-blue-900/10 border border-[#eef1f5] overflow-hidden">
              <img src={finHub} alt="واجهة أموالي" className="w-full block" />
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEMS */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-black text-center mb-4 leading-tight">
            موعد الالتزام يقترب، ومعظم الشركات <br className="hidden md:block"/>
            لا تعرف من أين تبدأ
          </h2>
          <div className="grid md:grid-cols-3 gap-6 mt-16">
            {problems.map((p) => (
              <div key={p.title} className="bg-white border border-[#eef1f5] rounded-2xl p-8 text-center hover:shadow-lg hover:shadow-blue-900/5 transition">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#2563eb] flex items-center justify-center mx-auto mb-6">
                  <p.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-black mb-3">{p.title}</h3>
                <p className="text-sm text-[#0D1B2E]/60 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCTS */}
      <section id="products" className="py-24 px-6 bg-[#f5f8fc]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block bg-white border border-[#dbe4f0] text-[#2563eb] text-xs font-bold px-4 py-1.5 rounded-full mb-5">منتجات أموالي</span>
            <h2 className="text-3xl md:text-5xl font-black mb-5">حلول أموالي تغطي كل جانب من عملك</h2>
            <p className="text-[#0D1B2E]/60 max-w-2xl mx-auto leading-relaxed">
              مع أموالي، تنضم لمنظومة كاملة: محاسبة، نقاط بيع، إدارة مطاعم، وخدمات احترافية. اختر المنتج المناسب لمنشأتك.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {products.map((p) => (
              <div key={p.title} className="bg-white rounded-2xl p-7 border border-[#eef1f5] hover:border-[#c7d5ea] transition">
                <div className={`w-12 h-12 rounded-xl ${p.color} flex items-center justify-center mb-5`}>
                  <p.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-black mb-2">{p.title}</h3>
                <p className="text-sm text-[#0D1B2E]/60 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTORS */}
      <section id="sectors" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block bg-[#f5f8fc] border border-[#dbe4f0] text-[#2563eb] text-xs font-bold px-4 py-1.5 rounded-full mb-5">القطاعات · أموالي يخدم كل الأعمال</span>
            <h2 className="text-3xl md:text-5xl font-black mb-5">
              حلول محاسبية <span className="text-[#2563eb]">مصمّمة لقطاعك</span>
            </h2>
            <p className="text-[#0D1B2E]/60 max-w-2xl mx-auto leading-relaxed">
              من المطاعم للعيادات، ومن التجزئة للعقارات، أموالي يفهم احتياج كل قطاع ويوفّر الأدوات المتخصصة لتشغيله بدقة.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {sectors.map((s) => (
              <div key={s.title} className="bg-white rounded-2xl p-6 border border-[#eef1f5] hover:shadow-lg hover:shadow-blue-900/5 transition group cursor-pointer">
                <div className="flex items-start justify-between mb-5">
                  <div className={`w-12 h-12 rounded-xl ${s.color} flex items-center justify-center`}>
                    <s.icon className="w-6 h-6" />
                  </div>
                  <ArrowLeft className="w-4 h-4 text-[#2563eb] opacity-0 group-hover:opacity-100 transition" />
                </div>
                <h3 className="font-black mb-2">{s.title}</h3>
                <p className="text-xs text-[#0D1B2E]/60 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <a href="#products" className="inline-flex items-center gap-2 bg-[#0D1B2E] text-white px-6 py-3.5 rounded-xl text-sm font-extrabold hover:bg-[#1B3A5C] transition">
              تصفّح كل القطاعات <ArrowLeft className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* WE HAVE YOUR BACK */}
      <section className="py-24 px-6 bg-[#f5f8fc]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-flex items-center gap-2 bg-white border border-[#dbe4f0] text-[#0D1B2E] text-xs font-bold px-4 py-1.5 rounded-full mb-5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full"/> ملتزمون معك بالكامل
            </span>
            <h2 className="text-3xl md:text-5xl font-black">
              أموالي <span className="text-[#2563eb]">بجانبك دائماً</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl p-8 border border-[#eef1f5]">
              <div className="aspect-[4/3] bg-[#eaf1fb] rounded-2xl mb-6 flex items-center justify-center overflow-hidden">
                <img src={repHome} alt="دعم" className="max-h-full object-contain"/>
              </div>
              <h3 className="text-xl font-black mb-3">تأسيس ودعم فني في أي وقت</h3>
              <p className="text-[#0D1B2E]/60 leading-relaxed">
                فريق أموالي المحلي يساعدك في تأسيس النظام من البداية، وتصدر فواتيرك بثقة. لو صار أي مشكلة، إحنا متوفّرون دائماً.
              </p>
            </div>
            <div className="bg-white rounded-3xl p-8 border border-[#eef1f5]">
              <div className="aspect-[4/3] bg-[#eaf1fb] rounded-2xl mb-6 flex items-center justify-center overflow-hidden">
                <img src={appsGrid} alt="تجربة" className="max-h-full object-contain"/>
              </div>
              <h3 className="text-xl font-black mb-3">جرّب كل شيء قبل الانطلاق</h3>
              <p className="text-[#0D1B2E]/60 leading-relaxed">
                أموالي يمنحك بيئة تجريبية آمنة لاختبار النظام بدون أي مخاطرة. اكتشف المشاكل مبكراً وتجنّب أي غرامات.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* STATS + TESTIMONIALS */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-black mb-5">
              أموالي <span className="text-[#2563eb]">شريكك في النجاح والتميز</span>
            </h2>
            <p className="text-[#0D1B2E]/60 max-w-2xl mx-auto">
              آلاف المنشآت تختار أموالي لإدارة محاسبتها وفوترتها الإلكترونية كل يوم.
            </p>
          </div>
          <div className="bg-[#f5f8fc] rounded-3xl p-10 grid grid-cols-2 md:grid-cols-4 gap-6 mb-14 border border-[#eef1f5]">
            {[
              ["+25K", "منشأة تستخدم أموالي"],
              ["+100K", "مستخدم شهرياً"],
              ["+25M", "عملية محاسبية شهرياً"],
              ["+10", "سنوات في السوق"],
            ].map(([n, l]) => (
              <div key={l} className="text-center">
                <div className="text-4xl md:text-5xl font-black text-[#2563eb] mb-2 font-latin">{n}</div>
                <div className="text-sm text-[#0D1B2E]/60 font-bold">{l}</div>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { name: "صالح أحمد", role: "مدير تنفيذي", tag: "مدراء تنفيذيون", quote: "بعد ما جرّبنا كذا نظام محاسبي وخسرنا معهم، أموالي طلع الحل المثالي، وفوترته الإلكترونية خلّتنا نتابع حساباتنا من أي مكان." },
              { name: "عبدالكريم س.", role: "مدير تنفيذي", tag: "مدراء تنفيذيون", quote: "أموالي كان أول من دخل السوق بالفوترة الإلكترونية، وأعطانا صورة مالية كاملة عن أعمالنا بدون أي معاناة." },
              { name: "خلود م.", role: "صاحبة عمل", tag: "أصحاب أعمال", quote: "أموالي ساعدني أنتقل من الفواتير الورقية للإلكترونية، وبيّن لي المشاريع الأكثر ربحية عشان أركّز عليها." },
            ].map((t) => (
              <div key={t.name} className="bg-white rounded-2xl p-7 border border-[#eef1f5]">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400"/>)}
                </div>
                <p className="text-sm leading-relaxed text-[#0D1B2E]/80 mb-6">"{t.quote}"</p>
                <div className="pt-5 border-t border-[#eef1f5] flex items-center justify-between">
                  <div>
                    <div className="font-extrabold text-sm">{t.name}</div>
                    <div className="text-xs text-[#0D1B2E]/50">{t.role}</div>
                  </div>
                  <span className="text-[10px] font-bold text-[#2563eb] bg-blue-50 px-2 py-1 rounded-full">{t.tag}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <span className="inline-block bg-blue-50 text-[#2563eb] text-xs font-bold px-4 py-1.5 rounded-full mb-5">الأسئلة الشائعة</span>
            <h2 className="text-3xl md:text-5xl font-black mb-4">عندك بعض الأسئلة؟</h2>
            <p className="text-[#0D1B2E]/60">كل ما تحتاج معرفته عن أموالي والفوترة الإلكترونية والالتزام قبل ما تبدأ.</p>
          </div>
          <div className="space-y-3">
            {faqs.map((f, i) => (
              <div key={i} className="border border-[#eef1f5] rounded-2xl overflow-hidden bg-white">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-right font-extrabold hover:bg-[#f9fbfd] transition"
                >
                  <span>{f.q}</span>
                  {openFaq === i ? <Minus className="w-5 h-5 text-[#2563eb] flex-shrink-0"/> : <Plus className="w-5 h-5 text-[#2563eb] flex-shrink-0"/>}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-sm text-[#0D1B2E]/70 leading-relaxed">{f.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section id="contact" className="py-20 px-6 bg-white">
        <div className="max-w-6xl mx-auto bg-[#0D1B2E] text-white rounded-3xl px-8 py-16 text-center">
          <h2 className="text-3xl md:text-5xl font-black mb-5">
            ابدأ إدارة محاسبتك <span className="text-[#4A9EE8]">بمرونة كاملة</span>
          </h2>
          <p className="text-white/70 mb-10 max-w-xl mx-auto leading-relaxed">
            جرّب أموالي مجاناً لمدة 14 يوم. بدون بطاقة ائتمان. وابدأ بإصدار فواتير معتمدة خلال دقائق.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap mb-6">
            <Link to="/auth?mode=signup" className="bg-[#2563eb] text-white px-8 py-4 rounded-xl text-sm font-extrabold hover:bg-blue-700 transition">
              ابدأ تجربتك المجانية
            </Link>
            <a href="https://wa.me/970599000000" target="_blank" rel="noreferrer" className="bg-white/10 border border-white/20 text-white px-8 py-4 rounded-xl text-sm font-extrabold hover:bg-white/15 transition">
              تحدث مع المبيعات
            </a>
          </div>
          <div className="flex items-center justify-center gap-6 text-xs font-bold text-white/60 flex-wrap">
            <span>تجربة 14 يوم</span>
            <span className="opacity-40">•</span>
            <span>بدون بطاقة ائتمان</span>
            <span className="opacity-40">•</span>
            <span>دعم 24/7</span>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white border-t border-[#eef1f5] pt-16 pb-8 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-10 mb-10">
          <div>
            <img src={logoFull.url} alt="أموالي" className="h-10 w-auto mb-5" />
            <p className="text-sm text-[#0D1B2E]/60 leading-relaxed">
              أموالي حل محاسبي سحابي حديث ورائد، يمكّن آلاف الشركات من إدارة أعمالها المالية بكفاءة والالتزام الكامل بالأنظمة الضريبية.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-black tracking-widest mb-4 text-[#0D1B2E]">المنتجات والخدمات</h4>
            <ul className="space-y-3 text-sm text-[#0D1B2E]/70">
              <li><a href="#products" className="hover:text-[#2563eb]">أموالي لأصحاب الأعمال</a></li>
              <li><a href="#products" className="hover:text-[#2563eb]">أموالي للمحاسبين</a></li>
              <li><a href="#products" className="hover:text-[#2563eb]">نقاط البيع</a></li>
              <li><a href="#products" className="hover:text-[#2563eb]">تطبيق أموالي</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-black tracking-widest mb-4 text-[#0D1B2E]">التكاملات</h4>
            <ul className="space-y-3 text-sm text-[#0D1B2E]/70">
              <li><a href="#" className="hover:text-[#2563eb]">الفوترة الإلكترونية</a></li>
              <li><a href="#" className="hover:text-[#2563eb]">سوق التكاملات</a></li>
              <li><a href="#" className="hover:text-[#2563eb]">واجهة أموالي البرمجية</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-black tracking-widest mb-4 text-[#0D1B2E]">المصادر والمحتوى</h4>
            <ul className="space-y-3 text-sm text-[#0D1B2E]/70">
              <li><a href="#" className="hover:text-[#2563eb]">مركز المساعدة</a></li>
              <li><a href="#" className="hover:text-[#2563eb]">المدوّنة</a></li>
              <li><a href="#faq" className="hover:text-[#2563eb]">الأسئلة الشائعة</a></li>
              <li><a href="#" className="hover:text-[#2563eb]">قوالب أعمال</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto pt-8 border-t border-[#eef1f5] text-xs text-[#0D1B2E]/50 text-center">
          © 2026 أموالي — نظام ERP عربي متكامل. فلسطين · الأردن · الخليج العربي.
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

    const onScroll = () => setNavBg(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      dir="rtl"
      className="bg-[#fafbfc] text-[#0D1B2E] overflow-x-hidden min-h-screen pb-16 md:pb-0"
      style={{ fontFamily: "'Cairo', sans-serif" }}
    >
      <style>{`
        .font-latin { font-family: 'DM Sans', sans-serif; }
        .device-frame {
          background: linear-gradient(160deg, #0D1B2E, #1B3A5C);
          padding: 14px 10px 18px;
          border-radius: 38px;
          box-shadow: 0 30px 60px -20px rgba(13,27,46,.45), 0 0 0 1px rgba(255,255,255,.05) inset;
          position: relative;
        }
        .device-frame::before {
          content:"";
          position:absolute; top:6px; left:50%; transform:translateX(-50%);
          width:90px; height:18px; background:#000; border-radius:0 0 14px 14px;
        }
        .device-frame img { border-radius: 26px; display:block; width:100%; }
        .browser-frame {
          background: #fff; border:1px solid #e8ecf1; border-radius:18px;
          box-shadow: 0 30px 60px -25px rgba(13,27,46,.25);
          overflow:hidden;
        }
        .browser-frame .bar {
          background:#f5f7fa; padding:10px 14px; display:flex; gap:6px; border-bottom:1px solid #e8ecf1;
        }
        .browser-frame .dot { width:10px; height:10px; border-radius:50%; }
        .browser-frame img { display:block; width:100%; }
      `}</style>

      {/* ============ NAV ============ */}
      <nav className={`fixed top-0 w-full z-50 px-6 py-4 transition-all duration-300 ${navBg ? "bg-white/80 backdrop-blur-md border-b border-[#e8ecf1] shadow-sm" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <img src={logoMark} alt="أموالي" className="w-9 h-9 rounded-xl" />
              <div className="text-2xl font-black text-[#0D1B2E] tracking-tight">أموالي</div>
            </div>
            <div className="hidden md:flex items-center gap-6 font-bold text-sm text-[#0D1B2E]/70">
              <a href="#apps" className="hover:text-[#3b82f6] transition-colors">واجهة النظام</a>
              <a href="#workspaces" className="hover:text-[#3b82f6] transition-colors">مساحات العمل</a>
              <a href="#rep" className="hover:text-[#3b82f6] transition-colors">البائع المتجول</a>
              <a href="#attendance" className="hover:text-[#3b82f6] transition-colors">حضور الموظفين</a>
              <a href="#hr" className="hover:text-[#3b82f6] transition-colors">لوحة HR</a>
             <a href="#finance" className="hover:text-[#3b82f6] transition-colors">المركز المالي</a>
              <a href="#features" className="hover:text-[#3b82f6] transition-colors">الميزات</a>
              <a href="#pricing" className="hover:text-[#3b82f6] transition-colors">الأسعار</a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="text-sm font-bold hidden sm:inline">دخول</Link>
            <Link
              to="/auth?mode=signup"
              className="bg-[#3b82f6] text-white px-5 py-2.5 rounded-xl text-sm font-extrabold hover:bg-blue-600 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
            >
              جرّب مجاناً
            </Link>
          </div>
        </div>
      </nav>

      {/* ============ HERO ============ */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#3b82f6]/10 text-[#3b82f6] text-xs font-extrabold px-4 py-2 rounded-full mb-6">
            <span>🇵🇸 فلسطين</span><span className="opacity-40">·</span>
            <span>🇯🇴 الأردن</span><span className="opacity-40">·</span>
            <span>🇸🇦 السعودية</span><span className="opacity-40">·</span>
            <span>🇦🇪 الإمارات</span><span className="opacity-40">·</span>
            <span>🇰🇼 الكويت</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-black leading-[1.15] mb-6 max-w-4xl mx-auto">
            نظام ERP عربي واحد <br/>
            <span className="text-[#3b82f6]">يدير كل شغلك</span> من جوالك أو لابتوبك
          </h1>
          <p className="text-lg md:text-xl text-[#0D1B2E]/70 max-w-2xl mx-auto mb-8 leading-relaxed">
            محاسبة كاملة، نقاط بيع، بائع متجول، حضور موظفين، رواتب، شيكات، مخازن — منصة واحدة عربية بدون ترجمة وبدون تعقيد.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap mb-12">
            <Link to="/auth?mode=signup" className="bg-[#0D1B2E] text-white px-7 py-4 rounded-xl text-sm font-extrabold hover:bg-[#1B3A5C] transition-all flex items-center gap-2">
              ابدأ مجاناً — بدون بطاقة <ArrowLeft className="w-4 h-4" />
            </Link>
            <a href="#rep" className="bg-white border border-[#e8ecf1] text-[#0D1B2E] px-7 py-4 rounded-xl text-sm font-extrabold hover:border-[#3b82f6] transition-all">
              شوف البائع المتجول
            </a>
          </div>

          {/* Apps grid hero screenshot */}
          <div id="apps" className="browser-frame max-w-5xl mx-auto">
            <div className="bar">
              <span className="dot bg-red-400"/><span className="dot bg-yellow-400"/><span className="dot bg-green-400"/>
              <span className="text-[10px] text-[#0D1B2E]/40 mr-3 font-latin">app.amwali.app/apps</span>
            </div>
            <img src={appsGrid} alt="واجهة تطبيقات أموالي — لوحة، محاسبة، POS، مخزون، CRM، HR، تقارير، بائع متجول" loading="lazy" />
          </div>
          <p className="text-xs text-[#0D1B2E]/50 mt-4 font-bold">صورة حقيقية من داخل النظام — كل تطبيق يفتح ميزة كاملة</p>
        </div>
      </section>

      {/* ============ APPS LIST ============ */}
      <section className="py-16 px-6 bg-white border-y border-[#e8ecf1]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-xs font-black text-[#3b82f6] tracking-widest">المنصة</span>
            <h2 className="text-3xl md:text-4xl font-black mt-2 mb-3">16 تطبيقاً مدمجاً — قاعدة بيانات واحدة</h2>
            <p className="text-[#0D1B2E]/60">كل تطبيق يشتغل لحاله ومع غيره. تفعّل اللي بدك إياه فقط.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm font-bold">
            {[
              "لوحة المعلومات","المالية (حسابات وقيود)","المحاسب الذكي AI","المحاسبة الضريبية",
              "نقطة البيع POS","المبيعات","المشتريات","المخزون",
              "البائع المتجول","الموارد البشرية","إدارة المهام","الورشات والمناجر",
              "إدارة علاقات العملاء CRM","الأصول الثابتة","نماذج للطباعة","التقارير",
            ].map((app) => (
              <div key={app} className="bg-[#fafbfc] border border-[#e8ecf1] rounded-xl px-4 py-3 flex items-center gap-2 hover:border-[#3b82f6] hover:bg-white transition-colors">
                <Check className="w-4 h-4 text-[#3b82f6] flex-shrink-0" />
                <span className="text-[#0D1B2E]">{app}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ WORKSPACES — MULTIPLE LOGIN SCREENS ============ */}
      <section id="workspaces" className="py-20 px-6 bg-gradient-to-b from-[#fafbfc] to-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-xs font-black text-[#3b82f6] tracking-widest">مساحات العمل المتعددة · MULTI-WORKSPACE</span>
            <h2 className="text-3xl md:text-5xl font-black mt-3 mb-4">
              موظف واحد · <span className="text-[#3b82f6]">عدة شاشات دخول</span>
            </h2>
            <p className="text-[#0D1B2E]/70 max-w-2xl mx-auto leading-relaxed">
              نظامك مش مجرد لوحة وحدة. كل موظف يدخل بحسابه ويختار <strong>الشاشة المناسبة لشغله الحالي</strong> — مندوب الصبح، كاشير الظهر، وخدمة عملاء بالليل. كل صلاحياته تتفعّل تلقائياً.
            </p>
          </div>

          {/* 3 workspace screens side by side */}
          <div className="grid md:grid-cols-3 gap-8 mb-14">
            {[
              { img: wsRep, t: "المندوب + الموظف", d: "بائع متجول عنده دوام موظف رسمي — يدخل على شاشة المندوب لطلباته ومصاريفه، أو شاشة الموظف لقسائم راتبه." },
              { img: wsCashier, t: "الكاشير + الموظف", d: "كاشير الفرع يدخل على شاشة POS للبيع، أو شاشة الموظف لإجازاته وحضوره." },
              { img: wsCallcenter, t: "كول سنتر + موظف + متابعة", d: "موظف الكول سنتر يستقبل المكالمات، يتابع الزبائن، ويشوف قسائم راتبه — كله من نفس الحساب." },
            ].map((ws) => (
              <div key={ws.t}>
                <div className="device-frame max-w-[280px] mx-auto">
                  <img src={ws.img} alt={`شاشة اختيار مساحة العمل: ${ws.t}`} loading="lazy" />
                </div>
                <h3 className="text-center font-extrabold mt-5 mb-1 text-[#0D1B2E]">{ws.t}</h3>
                <p className="text-center text-sm text-[#0D1B2E]/60 leading-relaxed px-2">{ws.d}</p>
              </div>
            ))}
          </div>

          {/* Why it matters */}
          <div className="bg-[#0D1B2E] text-white rounded-3xl p-8 md:p-10">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-2xl md:text-3xl font-black mb-4">
                  ليش هاي الميزة <span className="text-[#4A9EE8]">مهمة جداً؟</span>
                </h3>
                <p className="text-white/70 leading-relaxed mb-5">
                  بدل ما يكون عندك ٣ أنظمة منفصلة (POS، CRM، HR) كل واحد بحساب لحاله — أموالي بيخلي الموظف يدخل بحساب واحد ويتنقّل بين الشاشات اللي عنده صلاحية عليها. الإدارة تتحكم بشكل دقيق: مين يشوف شو، ومتى.
                </p>
                <div className="flex items-center gap-2 text-xs font-bold text-[#4A9EE8] bg-[#4A9EE8]/10 px-3 py-2 rounded-lg inline-flex">
                  <Check className="w-4 h-4" /> Role-Based Access · RBAC مدمج
                </div>
              </div>
              <ul className="space-y-3 text-sm">
                {[
                  ["شاشة المندوب", "طلبات، تحصيلات، مصاريف اليوم، عهدة"],
                  ["شاشة الكاشير (POS)", "بيع، فواتير، إغلاق وردية"],
                  ["شاشة الموظف", "دوام، إجازات، قسائم راتب، رسائل HR"],
                  ["شاشة الكول سنتر", "استقبال المكالمات وتحويلها للفرع"],
                  ["متابعة الزبائن", "بحث، عرض الطلبات، تسجيل المكالمات"],
                  ["لوحة الإدارة الكاملة", "محاسبة، تقارير، ضريبة، شجرة حسابات"],
                ].map(([t, d]) => (
                  <li key={t} className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-3">
                    <Check className="w-5 h-5 text-[#4A9EE8] flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-extrabold">{t}</div>
                      <div className="text-xs text-white/60 mt-0.5">{d}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ============ REP MOBILE — HERO FEATURE ============ */}
      <section id="rep" className="py-20 px-6 bg-[#0D1B2E] text-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-xs font-black text-[#4A9EE8] tracking-widest">البائع المتجول · VAN SALES</span>
            <h2 className="text-3xl md:text-5xl font-black mt-3 mb-4">
              مندوبك يدير يومه كاملاً <span className="text-[#4A9EE8]">من جواله</span>
            </h2>
            <p className="text-white/70 max-w-2xl mx-auto leading-relaxed">
              مستودع متحرك لكل مندوب، عهدة يومية، فواتير، تحصيل، مرتجعات، ومصاريف — كله من شاشة موبايل مصممة للمندوب الميداني.
            </p>
          </div>

          {/* 3 phones */}
          <div className="grid md:grid-cols-3 gap-8 mb-14">
            <div>
              <div className="device-frame max-w-[280px] mx-auto">
                <img src={repHome} alt="الشاشة الرئيسية للبائع المتجول — وردية، فاتورة، مردود، زبائن، سندات" loading="lazy" />
              </div>
              <h3 className="text-center font-extrabold mt-5 mb-1">شاشة المندوب الرئيسية</h3>
              <p className="text-center text-sm text-white/60">يفتح ورديته، يشوف اسمه، ويوصل لكل العمليات بضغطة وحدة.</p>
            </div>
            <div>
              <div className="device-frame max-w-[280px] mx-auto">
                <img src={repOrders} alt="قائمة طلبات المندوب اليومية مع أرقام الفواتير والمبالغ" loading="lazy" />
              </div>
              <h3 className="text-center font-extrabold mt-5 mb-1">طلباتي — فواتير اليوم</h3>
              <p className="text-center text-sm text-white/60">كل فاتورة عملها بتظهر فوراً — نقد أو آجل — مع إمكانية الإلغاء.</p>
            </div>
            <div>
              <div className="device-frame max-w-[280px] mx-auto">
                <img src={repExpense} alt="تسجيل مصروف للمندوب: نقل، وقود، ضيافة، صرف لمورد" loading="lazy" />
              </div>
              <h3 className="text-center font-extrabold mt-5 mb-1">مصاريف العهدة</h3>
              <p className="text-center text-sm text-white/60">وقود، نقل، ضيافة، أو صرف لمورد — يدخل القيد المحاسبي تلقائياً.</p>
            </div>
          </div>

          {/* Capabilities */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { t: "مستودع لكل مندوب", d: "كل بائع عنده مستودع مستقل بسيارته. سندات تحميل وإرجاع وتسوية." },
              { t: "دورة اليوم (الوردية)", d: "فتح وإغلاق اليوم مع مطابقة نقدية تلقائية." },
              { t: "فاتورة + قيد + مخزون", d: "بيع واحد ينشئ الفاتورة والقيد المحاسبي وحركة المخزون بمعاملة ذرّية." },
              { t: "تحصيل وسندات قبض", d: "سند قبض مرتبط بالعميل مباشرة من الجوال." },
              { t: "مردود مبيعات", d: "إرجاع البضاعة وقيد المرتجع في نفس اللحظة." },
              { t: "إدارة الزبائن", d: "إضافة عميل جديد ميدانياً مع رقم جوال وعنوان." },
              { t: "عمولات يدوية", d: "احتساب عمولة المبيعات والتحصيل لكل فترة بنسب مرنة." },
              { t: "يعمل بدون إنترنت", d: "PWA — يكمل البيع لو انقطع النت ويزامن لما يرجع." },
            ].map((c) => (
              <div key={c.t} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:border-[#4A9EE8]/50 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-4 h-4 text-[#4A9EE8]" />
                  <h4 className="font-extrabold text-sm">{c.t}</h4>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ EMPLOYEE MOBILE APP — DEEP DIVE ============ */}
      <section id="attendance" className="py-20 px-6 bg-gradient-to-b from-white to-[#fafbfc]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-xs font-black text-[#3b82f6] tracking-widest">تطبيق الموظف · MOBILE-FIRST</span>
            <h2 className="text-3xl md:text-5xl font-black mt-3 mb-4">
              كل موظف عنده <span className="text-[#3b82f6]">تطبيق خاص فيه</span> على جواله
            </h2>
            <p className="text-[#0D1B2E]/70 max-w-2xl mx-auto leading-relaxed">
              يبصم بـ QR محمي + GPS، يشوف ساعاته، قسائم راتبه، يطلب إجازة، يصحّح بصمة، ويتلقّى تنبيهات البصمات الناقصة — كله من جواله.
            </p>
            <p className="text-xs text-[#0D1B2E]/50 mt-3 font-bold">الصور من حساب مطعم "الدجاج الملكي" — أحد عملائنا الفعليين 🇵🇸</p>
          </div>

          {/* 4 employee mobile screens */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
            {[
              { img: hrEmployeeHome, t: "الرئيسية", d: "ساعة البصمة، حالة اليوم، إحصائيات الشهر، آخر 5 أيام." },
              { img: hrForms, t: "النماذج", d: "إجازة، سلفة، قرض حسن، تصحيح بصمة، رسالة لـ HR." },
              { img: hrAttendanceLog, t: "دوامي", d: "سجل شهري كامل: تأخير، حضور، إجازات، ساعات إجمالية." },
              { img: hrProfile, t: "ملفي", d: "بياناتي، الفرع، الشِفت، تعديل المعلومات، تغيير كلمة المرور." },
            ].map((s) => (
              <div key={s.t}>
                <div className="device-frame max-w-[220px] mx-auto">
                  <img src={s.img} alt={`شاشة الموظف — ${s.t}`} loading="lazy" />
                </div>
                <h3 className="text-center font-extrabold mt-4 mb-1 text-sm">{s.t}</h3>
                <p className="text-center text-xs text-[#0D1B2E]/60 leading-relaxed px-1">{s.d}</p>
              </div>
            ))}
          </div>

          {/* QR + GPS biometric explainer */}
          <div className="bg-[#0D1B2E] text-white rounded-3xl p-8 md:p-10 mb-12">
            <div className="grid md:grid-cols-3 gap-8 items-start">
              <div className="md:col-span-2">
                <span className="text-[10px] font-black text-[#4A9EE8] tracking-widest">QR + GPS BIOMETRIC</span>
                <h3 className="text-2xl md:text-3xl font-black mt-2 mb-4">
                  بصمة من <span className="text-[#4A9EE8]">كاميرا الجوال</span> — مع QR محمي وموقع جغرافي
                </h3>
                <p className="text-white/70 leading-relaxed mb-6">
                  الموظف يفتح كاميرا جواله، يصوّر QR الفرع، والنظام يتحقّق من <strong>3 شروط</strong> قبل ما يقبل البصمة:
                  الرمز ساري، الموقع داخل نطاق الفرع، والوقت ضمن وردية الموظف. كل محاولة بتنحفظ مع IP والـ User-Agent للتدقيق.
                </p>
                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  {[
                    ["🔐 QR Token متغيّر", "كل فرع له token دوّار — ما يصير نسخ ولصق"],
                    ["📍 GPS إجباري", "موقع الموظف لازم يطابق إحداثيات الفرع"],
                    ["⏰ ربط بالوردية", "تأخير وانصراف مبكر يُحسبوا تلقائياً"],
                    ["📱 إدخال يدوي بديل", "لو الكاميرا ما اشتغلت — كود يدوي"],
                    ["🔔 تنبيه بصمة ناقصة", "إشعار للموظف لو دخل بدون خروج"],
                    ["✍️ طلب تصحيح", "يقدّم طلب تصحيح بصمة من النموذج"],
                  ].map(([t, d]) => (
                    <div key={t} className="bg-white/5 border border-white/10 rounded-xl p-3">
                      <div className="font-extrabold mb-1">{t}</div>
                      <div className="text-white/60">{d}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Highlighted Malaky-branded phone */}
              <div className="relative">
                <div className="absolute -top-3 -right-3 bg-[#4A9EE8] text-white text-[10px] font-black px-3 py-1.5 rounded-full z-10 shadow-lg">
                  مطعم الدجاج الملكي
                </div>
                <div className="device-frame max-w-[240px] mx-auto ring-2 ring-[#4A9EE8]/40">
                  <img src={hrEmployeeHome} alt="تطبيق موظف مطعم الدجاج الملكي على الجوال" loading="lazy" />
                </div>
              </div>
            </div>
          </div>

          {/* Shifts + Manager tools */}
          <div className="grid md:grid-cols-2 gap-8 mb-12">
            <div className="bg-white border border-[#e8ecf1] rounded-3xl p-6">
              <span className="text-[10px] font-black text-[#3b82f6] tracking-widest">الورديات وجدول الدوام</span>
              <h3 className="text-xl md:text-2xl font-black mt-2 mb-3">ورديات صباحي · ميد · مسائي</h3>
              <p className="text-sm text-[#0D1B2E]/65 leading-relaxed mb-5">
                مدير الفرع يبني جدول الدوام الأسبوعي بضغطة، أو ينسخ من الأسبوع السابق. لكل يوم: دوام / إجازة / OFF / تغطية، ولكل وردية وقت بداية ونهاية محدّد.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="device-frame max-w-full">
                  <img src={hrRosterWeek} alt="جدول الدوام الأسبوعي للفرع" loading="lazy" className="aspect-[9/19] object-cover object-top" />
                </div>
                <div className="device-frame max-w-full">
                  <img src={hrShiftDialog} alt="إسناد وردية لموظف — صباحي/ميد/مسائي" loading="lazy" className="aspect-[9/19] object-cover object-top" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#e8ecf1] rounded-3xl p-6">
              <span className="text-[10px] font-black text-[#3b82f6] tracking-widest">صلاحيات المدراء</span>
              <h3 className="text-xl md:text-2xl font-black mt-2 mb-3">مدير الفرع يشوف فريقه فقط</h3>
              <p className="text-sm text-[#0D1B2E]/65 leading-relaxed mb-5">
                لمّا الموظف يكون مدير فرع، بيظهر له قسم "إدارة الفريق" تلقائياً: حضور الفريق، جدول الدوام، تبديل ورديات، واعتماد/رفض طلبات موظفيه — بدون ما يشوف موظفين فروع تانية.
              </p>
              <div className="device-frame max-w-[260px] mx-auto">
                <img src={hrManagerTools} alt="أدوات مدير الفرع — حضور الفريق، الدوام، تبديل الورديات، اعتماد الطلبات" loading="lazy" className="aspect-[9/19] object-cover object-top" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ HR DASHBOARD — EMPLOYEES 360 ============ */}
      <section id="hr" className="py-20 px-6 bg-[#0D1B2E] text-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-xs font-black text-[#4A9EE8] tracking-widest">لوحة HR · EMPLOYEES 360°</span>
            <h2 className="text-3xl md:text-5xl font-black mt-3 mb-4">
              كل موظفينك في <span className="text-[#4A9EE8]">شاشة واحدة</span>
            </h2>
            <p className="text-white/70 max-w-2xl mx-auto leading-relaxed">
              لوحة موارد بشرية متكاملة: حضور اليوم، الطلبات المعلّقة، البصمات الناقصة، الرواتب، والقروض — كله Real-time.
            </p>
          </div>

          <div className="browser-frame max-w-5xl mx-auto mb-10">
            <div className="bar">
              <span className="dot bg-red-400"/><span className="dot bg-yellow-400"/><span className="dot bg-green-400"/>
              <span className="text-[10px] text-[#0D1B2E]/40 mr-3 font-latin">app.amwali.app/hr</span>
            </div>
            <img src={hrDashboard} alt="لوحة الموارد البشرية الكاملة — حضور، طلبات، رواتب، تنبيهات" loading="lazy" />
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { t: "حضور اليوم Real-time", d: "حاضر، متأخر، ناقص بصمة، غائب — مع تفاصيل لكل قسم وفرع." },
              { t: "طلبات معلّقة", d: "نماذج، قروض، إجازات — كلها بمكان واحد للاعتماد." },
              { t: "بصمات ناقصة", d: "تنبيه فوري لأي موظف دخل وما خرج، أو نسي يبصم." },
              { t: "تكلفة الموظفين", d: "رواتب الشهر، متوسط الموظف، عدد النشطين — Live." },
              { t: "محرك رواتب قوي", d: "5 مصادر بيانات: حضور، عقود، سلف، خصومات، علاوات." },
              { t: "إعدادات HR مرنة", d: "أنواع الأيام، العطل الرسمية، الورديات، السياسات." },
              { t: "تقارير HR كاملة", d: "تقارير حضور، رواتب، إجازات، تكلفة موظفين، أداء." },
              { t: "Employees 360°", d: "ملف شامل لكل موظف: عقد، حضور، رواتب، طلبات، رسائل." },
            ].map((f) => (
              <div key={f.t} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-[#4A9EE8]/50 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <Check className="w-4 h-4 text-[#4A9EE8]" />
                  <h4 className="font-extrabold text-sm">{f.t}</h4>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FEATURES — HONEST GRID ============ */}
      {/* ============ FINANCE CENTER — DESKTOP HEAVY ============ */}
      <section id="finance" className="py-24 px-6 bg-gradient-to-b from-white to-[#fafbfc] border-y border-[#e8ecf1]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block text-[11px] font-black tracking-[0.25em] text-[#3b82f6] bg-[#3b82f6]/10 px-3 py-1.5 rounded-full">المركز المالي · FINANCE HUB</span>
            <h2 className="text-3xl md:text-5xl font-black mt-4 mb-4 text-[#0D1B2E]">نظام مالي إداري متكامل</h2>
            <p className="text-[#0D1B2E]/65 max-w-2xl mx-auto leading-relaxed">
              مساحة عمل موحّدة — السندات، الدفاتر، الذمم، والتقارير في مكان واحد.
              قوالب جاهزة، فلاتر مخصّصة، تنبيهات، وسياسات تصنيف زبائن تحميك من المخاطر.
            </p>
          </div>

          {/* HUB SCREEN */}
          <div className="browser-frame max-w-6xl mx-auto mb-6">
            <div className="bar"><span className="dot bg-[#ff5f57]"/><span className="dot bg-[#febc2e]"/><span className="dot bg-[#28c840]"/></div>
            <img src={finHub} alt="مركز المالية — السندات والدفاتر والذمم في مكان واحد" className="w-full block"/>
          </div>
          <p className="text-center text-[12px] text-[#0D1B2E]/50 mb-16">
            ملخص نقدي مباشر · شجرة سندات بالاختصارات (Alt+K/I/J/E/R) · روابط سريعة لكل المالية.
          </p>

          {/* LINKS + LATEST */}
          <div className="grid md:grid-cols-2 gap-6 mb-20 items-center">
            <div>
              <h3 className="text-2xl font-black mb-3 text-[#0D1B2E]">روابط مالية — كل شي بنقرة</h3>
              <ul className="space-y-2.5 text-[14px] text-[#0D1B2E]/75 leading-relaxed">
                <li>✔ <b>الدفاتر:</b> شجرة الحسابات · دفتر اليومية · دفتر الأستاذ · ميزان المراجعة · مراكز التكلفة.</li>
                <li>✔ <b>النقد والبنوك:</b> صناديق، بنوك، شيكات قبض/دفع، عملات أجنبية.</li>
                <li>✔ <b>الذمم:</b> زبائن، موردين، سندات قبض، سندات صرف.</li>
                <li>✔ <b>التقارير والامتثال:</b> تقارير، ضريبة 16%، أصول ثابتة، إغلاق فترات.</li>
                <li>✔ <b>آخر الفواتير · آخر السندات · آخر القيود</b> — لوحة مباشرة بدون تحديث.</li>
              </ul>
            </div>
            <div className="browser-frame">
              <div className="bar"><span className="dot bg-[#ff5f57]"/><span className="dot bg-[#febc2e]"/><span className="dot bg-[#28c840]"/></div>
              <img src={finLinks} alt="الروابط المالية وآخر الحركات" className="w-full block"/>
            </div>
          </div>

          {/* INVOICE FLOW */}
          <div className="mb-20">
            <div className="text-center mb-8">
              <span className="text-[11px] font-black tracking-widest text-[#3b82f6]">الفاتورة</span>
              <h3 className="text-2xl md:text-3xl font-black mt-2 text-[#0D1B2E]">فاتورة احترافية بشعارك — جاهزة للطباعة</h3>
              <p className="text-[13px] text-[#0D1B2E]/60 mt-2 max-w-2xl mx-auto">
                إدخال ذرّي بالاختصارات (Alt+N سطر جديد · Ctrl+Enter حفظ) · حساب ضريبة 16% تلقائي · مسوّدات محفوظة تلقائياً · معاينة وطباعة بقالب جاهز يحمل شعار شركتك.
              </p>
            </div>
            <div className="max-w-3xl mx-auto">
              <div className="browser-frame">
                <div className="bar"><span className="dot bg-[#ff5f57]"/><span className="dot bg-[#febc2e]"/><span className="dot bg-[#28c840]"/></div>
                <img src={finInvoicePrint} alt="معاينة طباعة الفاتورة بشعار الشركة" className="w-full block"/>
              </div>
            </div>
          </div>

          {/* TEMPLATES */}
          <div className="grid md:grid-cols-2 gap-6 mb-20 items-center">
            <div className="browser-frame md:order-2">
              <div className="bar"><span className="dot bg-[#ff5f57]"/><span className="dot bg-[#febc2e]"/><span className="dot bg-[#28c840]"/></div>
              <img src={finTemplates} alt="مكتبة قوالب الطباعة — مالية، عقود، إشعارات، مراسلات" className="w-full block"/>
            </div>
            <div className="md:order-1">
              <span className="text-[11px] font-black tracking-widest text-[#3b82f6]">قوالب الطباعة</span>
              <h3 className="text-2xl font-black mt-2 mb-3 text-[#0D1B2E]">صمّم قوالبك بدون مبرمج</h3>
              <p className="text-[#0D1B2E]/70 text-[14px] leading-relaxed mb-4">
                مكتبة قوالب جاهزة (مالية، عقود، إشعارات، مراسلات) — وعدّل التصميم بالسحب والإفلات.
                إشعار دين، مطالبة مالية، عرض سعر، عقد بيع، إشعار تأخر سداد، وصل استلام، إشعار دائن… كله بشعارك وألوانك.
              </p>
              <ul className="text-[13px] text-[#0D1B2E]/70 space-y-1.5">
                <li>• محرر بدون كود — أدلّة محاذاة (Snap Guides).</li>
                <li>• اختر قالب لكل نوع مستند (فاتورة بيع، شراء، عرض، عقد).</li>
                <li>• نص عربي مضبوط (Noto Sans Arabic) + خط لاتيني للأرقام.</li>
              </ul>
            </div>
          </div>

          {/* REPORTS HUB */}
          <div className="mb-20">
            <div className="text-center mb-8">
              <span className="text-[11px] font-black tracking-widest text-[#3b82f6]">التقارير</span>
              <h3 className="text-2xl md:text-3xl font-black mt-2 mb-2 text-[#0D1B2E]">90 تقرير جاهز + منشئ تقارير مخصّص</h3>
              <p className="text-[13px] text-[#0D1B2E]/60 max-w-2xl mx-auto">
                فلاتر زمنية، مؤشرات فترة (إيرادات، صافي ربح، ذمم مدينة/دائنة، ضريبة، قيمة المخزون)، وتقارير محفوظة لكل مستخدم.
              </p>
            </div>

            {/* 8 categories grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { t: "المالية", n: "12", d: "ميزان مراجعة · ميزانية عمومية · أرباح وخسائر · دفتر الأستاذ · دفتر اليومية · كشف حساب · حركة الصندوق · حركة البنوك · الشيكات · أعمار الذمم · التدفقات النقدية" },
                { t: "المبيعات", n: "9", d: "إجمالي المبيعات · سجل الفواتير · حسب الزبون · التحصيلات · يومية · مرتجعات · حسب الصنف · أداء المبيعات" },
                { t: "المشتريات", n: "6", d: "إجمالي المشتريات · فواتير · حسب المورد · المدفوعات · مرتجعات · مقارنة أسعار الموردين" },
                { t: "المخزون", n: "5", d: "جرد وتقييم · حركة المخزون · أصناف تحت الحد · أصناف راكدة · ربحية الأصناف" },
                { t: "الموارد البشرية", n: "6", d: "الرواتب الشهرية · حضور وانصراف · رصيد الإجازات · بيانات الموظفين · مسحوبات · تكلفة الموظفين حسب القسم" },
                { t: "الأصول الثابتة", n: "6", d: "سجل الأصول · استهلاك شهري · جدول تفصيلي · أصول مستهلكة · أرباح/خسائر بيع · الأصول حسب الموقع" },
                { t: "تقارير الذمم والأداء", n: "11", d: "DSO · DPO · أعمار ذمم زبائن وموردين · كفاءة تحصيل · ربحية زبون · ربحية مورد · كشف موحّد · شيكات واردة/صادرة" },
                { t: "البائع المتجول", n: "6", d: "ملخص يومي · ربحية حسب المندوب · حسب الصنف · حسب الزبون · حسب المورد · تقرير الطلبات" },
              ].map(c => (
                <div key={c.t} className="bg-white border border-[#e8ecf1] rounded-2xl p-4 hover:border-[#3b82f6]/50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-black text-[13px] text-[#0D1B2E]">{c.t}</h4>
                    <span className="text-[10px] font-black bg-[#3b82f6]/10 text-[#3b82f6] px-2 py-0.5 rounded-full">{c.n} تقرير</span>
                  </div>
                  <p className="text-[11px] text-[#0D1B2E]/60 leading-relaxed">{c.d}</p>
                </div>
              ))}
            </div>

            {/* 3 key capabilities */}
            <div className="grid md:grid-cols-3 gap-5 mb-6">
              <div className="bg-gradient-to-br from-[#3b82f6]/5 to-white border border-[#3b82f6]/20 rounded-2xl p-5">
                <div className="text-[10px] font-black tracking-widest text-[#3b82f6] mb-2">جديد · NEW</div>
                <h4 className="font-black text-[15px] mb-2 text-[#0D1B2E]">منشئ التقارير المخصّصة</h4>
                <p className="text-[12px] text-[#0D1B2E]/65 leading-relaxed">
                  صمّم تقريرك بنفسك: اختر الأعمدة، أضف فلاتر، اعمل Drill-down، جمّع حسب أي حقل، واحفظه باسمك للوصول السريع.
                </p>
              </div>
              <div className="bg-gradient-to-br from-[#22C55E]/5 to-white border border-[#22C55E]/20 rounded-2xl p-5">
                <div className="text-[10px] font-black tracking-widest text-[#22C55E] mb-2">DASHBOARDS</div>
                <h4 className="font-black text-[15px] mb-2 text-[#0D1B2E]">لوحات المعلومات المخصّصة</h4>
                <p className="text-[12px] text-[#0D1B2E]/65 leading-relaxed">
                  اسحب وأفلت KPIs، رسومات، تقارير محفوظة، ونصوص ذكية. شارك اللوحة بلينك عام، أو صدّرها PDF/PNG.
                </p>
              </div>
              <div className="bg-gradient-to-br from-[#F59E0B]/5 to-white border border-[#F59E0B]/20 rounded-2xl p-5">
                <div className="text-[10px] font-black tracking-widest text-[#F59E0B] mb-2">SCHEDULED</div>
                <h4 className="font-black text-[15px] mb-2 text-[#0D1B2E]">التقارير الدورية</h4>
                <p className="text-[12px] text-[#0D1B2E]/65 leading-relaxed">
                  قوالب جاهزة: يومي، أسبوعي، شهري، ربعي، نصف سنوي، سنوي — تصلك تلقائياً بالإيميل أو واتساب.
                </p>
              </div>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { t: "DSO / DPO", d: "متوسط أيام التحصيل والسداد" },
                { t: "أعمار الذمم", d: "متأخر 30 / 60 / 90 / +90 يوم" },
                { t: "ربحية الزبون", d: "هامش لكل عميل ومورد" },
                { t: "ساعات الذروة POS", d: "أداء الكاشيرين والمنتجات" },
              ].map(k => (
                <div key={k.t} className="bg-white border border-[#e8ecf1] rounded-xl p-3 text-center">
                  <div className="text-[13px] font-black text-[#0D1B2E]">{k.t}</div>
                  <div className="text-[10.5px] text-[#0D1B2E]/55 mt-1">{k.d}</div>
                </div>
              ))}
            </div>
          </div>

          {/* CUSTOMER POLICIES — FOCUS ZOOM */}
          <div className="bg-gradient-to-br from-[#0D1B2E] to-[#1B3A5C] rounded-3xl p-8 md:p-14 text-white">
            <div className="max-w-3xl mx-auto text-center mb-10">
              <span className="inline-block text-[11px] font-black tracking-[0.3em] text-[#FCD34D] bg-[#FCD34D]/10 border border-[#FCD34D]/30 px-3 py-1.5 rounded-full">
                ميزة فريدة في السوق
              </span>
              <h3 className="text-3xl md:text-5xl font-black mt-4 mb-4">سياسات تصنيف الزبائن</h3>
              <p className="text-white/70 text-[14.5px] md:text-[16px] leading-relaxed">
                بالسوق عنا — <b className="text-white">ما في تصنيف للزبائن</b>. النتيجة:
                شيكات راجعة، ديون مش محصّلة، خسائر بالملايين، ومندوبين بيبيعوا لزبون
                خطر بدون ما المدير يدري. مع أموالي — <b className="text-white">كل زبون له فئة، له سقف، له شروط دفع، له تنبيه</b>.
              </p>
            </div>

            {/* The big zoom screenshot */}
            <div className="rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 max-w-5xl mx-auto bg-white">
              <img src={finPolicies} alt="سياسات تصنيف الزبائن A B C D — سقوف ائتمان، شروط دفع، خصومات، متابعة" className="w-full block"/>
            </div>

            {/* Class breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-10">
              {[
                { c: "A", color: "#22C55E", title: "عملاء مميزون", limit: "20,000 ₪", terms: "60 يوم", disc: "5%", note: "مدير المبيعات يتابع شخصياً" },
                { c: "B", color: "#3B82F6", title: "عملاء جيدون", limit: "10,000 ₪", terms: "45 يوم", disc: "2%", note: "متابعة دورية من المندوب" },
                { c: "C", color: "#F59E0B", title: "عملاء عاديون", limit: "5,000 ₪", terms: "30 يوم", disc: "—", note: "متابعة عادية" },
                { c: "D", color: "#EF4444", title: "عملاء مخاطرة", limit: "1,000 ₪", terms: "نقدي فقط", disc: "—", note: "تنبيه فوري للمدير عند أي فاتورة" },
              ].map(p => (
                <div key={p.c} className="bg-white/5 backdrop-blur rounded-2xl p-5 border border-white/10">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg" style={{ background: p.color + '22', color: p.color, border: `1px solid ${p.color}55` }}>{p.c}</span>
                    <div className="font-extrabold text-[14px]">{p.title}</div>
                  </div>
                  <div className="text-[12px] text-white/70 space-y-1">
                    <div>سقف ائتمان: <b className="text-white">{p.limit}</b></div>
                    <div>شروط دفع: <b className="text-white">{p.terms}</b></div>
                    <div>خصم: <b className="text-white">{p.disc}</b></div>
                  </div>
                  <div className="text-[11px] text-white/55 mt-3 leading-relaxed border-t border-white/10 pt-3">{p.note}</div>
                </div>
              ))}
            </div>

            {/* How it protects */}
            <div className="grid md:grid-cols-3 gap-4 mt-8">
              {[
                { t: "حماية تلقائية", d: "النظام بيمنع المندوب من بيع زبون فئة D بالأجل — حتى لو حاول." },
                { t: "تنبيهات لحظية", d: "تجاوز السقف؟ شيك راجع؟ تأخر سداد؟ — إشعار فوري للمدير." },
                { t: "متابعة مجدولة", d: "كل فئة لها مدة متابعة (7/15/30/45 يوم) — مذكّرات تلقائية." },
              ].map(x => (
                <div key={x.t} className="bg-white/5 rounded-xl p-4 border border-white/10">
                  <div className="font-black text-[14px] mb-1">{x.t}</div>
                  <div className="text-[12px] text-white/65 leading-relaxed">{x.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ FEATURES — HONEST GRID ============ */}
      <section id="features" className="py-20 px-6 bg-white border-y border-[#e8ecf1]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span className="text-xs font-black text-[#3b82f6] tracking-widest">الميزات</span>
            <h2 className="text-3xl md:text-4xl font-black mt-3 mb-3">كل اللي تحتاجه — موجود</h2>
            <p className="text-[#0D1B2E]/60">ميزات حقيقية مدمجة. بدون إضافات مدفوعة وبدون مفاجآت.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { t: "محاسبة كاملة بمعايير IFRS", d: "شجرة حسابات، قيود يومية، ميزان مراجعة، قائمة دخل، ميزانية عمومية." },
              { t: "نقطة بيع POS", d: "تشتغل أوفلاين، ربط طابعات حرارية، إغلاق وردية، مردود متعدد العملات." },
              { t: "ضريبة محلية", d: "ضريبة فلسطين 16%، الأردن، والخليج — تقارير دورية جاهزة." },
              { t: "عملات متعددة", d: "شيكل، دينار، ريال، درهم، دولار — أسعار صرف يومية تلقائية." },
              { t: "إدارة شيكات", d: "شيكات قبض ودفع، إيداع، تظهير لمورد، شيكات تحت التحصيل." },
              { t: "مخازن متعددة", d: "تحويل بين فروع، جرد، تسوية، حركات مخزون مرتبطة بالفواتير." },
              { t: "تقارير مالية", d: "ميزان، أرباح وخسائر، ميزانية، أعمار ديون، كشف حساب لكل عميل/مورد." },
              { t: "محاسب AI بالعربي", d: "حسيب — يدخل الفواتير والسندات من كلامك الصوتي بالعربي الدارج." },
              { t: "بوابات منفصلة", d: "بوابة عميل، بوابة موظف، بوابة مالك، بوابة مندوب — كل واحد بصلاحياته." },
              { t: "نسخ احتياطي وأمان", d: "RLS متعدد المستأجرين، سجل تدقيق كامل، استعادة خلال 24 ساعة." },
              { t: "API ومتجر إلكتروني", d: "ربط الفواتير وطلبات أي متجر إلكتروني خارجي عبر API." },
              { t: "بدون حد للمستخدمين", d: "أضف موظفين بدون رسوم إضافية لكل مستخدم." },
            ].map((f) => (
              <div key={f.t} className="bg-[#fafbfc] border border-[#e8ecf1] rounded-2xl p-5 hover:border-[#3b82f6] transition-colors">
                <h3 className="font-extrabold text-base mb-2 text-[#0D1B2E]">{f.t}</h3>
                <p className="text-sm text-[#0D1B2E]/65 leading-relaxed">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-xs font-black text-[#3b82f6] tracking-widest">الأسعار</span>
            <h2 className="text-3xl md:text-4xl font-black mt-3 mb-3">سعر واحد — كل الميزات</h2>
            <p className="text-[#0D1B2E]/60">بدون درجات. بدون رسوم لكل مستخدم. بدون مفاجآت.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            <div className="bg-white border border-[#e8ecf1] rounded-2xl p-8 text-center">
              <h3 className="font-extrabold mb-2">تجريبي</h3>
              <div className="text-4xl font-black mb-1">مجاناً</div>
              <p className="text-sm text-[#0D1B2E]/60 mb-6">14 يوم — كل الميزات</p>
              <Link to="/auth?mode=signup" className="block bg-[#fafbfc] border border-[#e8ecf1] text-[#0D1B2E] rounded-xl py-3 font-extrabold text-sm hover:border-[#3b82f6] transition">ابدأ التجربة</Link>
            </div>
            <div className="bg-[#0D1B2E] text-white rounded-2xl p-8 text-center relative">
              <span className="absolute -top-3 right-1/2 translate-x-1/2 bg-[#3b82f6] text-white text-[10px] font-black px-3 py-1 rounded-full">الأكثر طلباً</span>
              <h3 className="font-extrabold mb-2">شركتك</h3>
              <div className="text-4xl font-black mb-1 font-latin">99 <span className="text-lg">$/شهر</span></div>
              <p className="text-sm text-white/60 mb-6">مستخدمين بلا حدود · كل التطبيقات</p>
              <Link to="/auth?mode=signup" className="block bg-[#3b82f6] text-white rounded-xl py-3 font-extrabold text-sm hover:bg-blue-600 transition">اشترك الآن</Link>
            </div>
            <div className="bg-white border border-[#e8ecf1] rounded-2xl p-8 text-center">
              <h3 className="font-extrabold mb-2">مؤسسات</h3>
              <div className="text-4xl font-black mb-1">حسب الطلب</div>
              <p className="text-sm text-[#0D1B2E]/60 mb-6">تخصيص، تكامل، ودعم مخصص</p>
              <a href="https://wa.me/970599000000" target="_blank" rel="noreferrer" className="block bg-[#fafbfc] border border-[#e8ecf1] text-[#0D1B2E] rounded-xl py-3 font-extrabold text-sm hover:border-[#3b82f6] transition">تواصل معنا</a>
            </div>
          </div>
        </div>
      </section>

      {/* ============ CTA ============ */}
      <section className="py-20 px-6 bg-[#0D1B2E] text-white text-center">
        <div className="max-w-3xl mx-auto">
          <Sparkles className="w-10 h-10 text-[#4A9EE8] mx-auto mb-5" />
          <h2 className="text-3xl md:text-5xl font-black mb-5">جاهز تنظّم شغلك؟</h2>
          <p className="text-white/70 mb-8 leading-relaxed">
            14 يوم تجربة كاملة بدون بطاقة. لو ما عجبك، ما في أي التزام.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link to="/auth?mode=signup" className="bg-[#3b82f6] text-white px-8 py-4 rounded-xl text-sm font-extrabold hover:bg-blue-600 transition">
              ابدأ مجاناً
            </Link>
            <a href="https://wa.me/970599000000" target="_blank" rel="noreferrer" className="bg-white/10 border border-white/20 text-white px-8 py-4 rounded-xl text-sm font-extrabold hover:bg-white/15 transition flex items-center gap-2">
              <MessageCircle className="w-4 h-4" /> تواصل واتساب
            </a>
          </div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="py-10 px-6 bg-[#fafbfc] border-t border-[#e8ecf1] text-center text-sm text-[#0D1B2E]/60">
        <div className="flex items-center justify-center gap-2 mb-2">
          <img src={logoMark} alt="" className="w-6 h-6 rounded-lg" />
          <span className="font-extrabold text-[#0D1B2E]">أموالي</span>
        </div>
        <p>© 2026 أموالي — ERP عربي. فلسطين · الأردن · الخليج العربي.</p>
      </footer>
    </div>
  );
};

export default LandingPage;
