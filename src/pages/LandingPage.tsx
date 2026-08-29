import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Check, Plus, Minus,
  LayoutGrid, ShoppingCart, UtensilsCrossed, Users,
  Store, Coffee, Factory, Building2, Wrench, Plane, GraduationCap, Car,
  AlertTriangle, ShieldAlert, BellRing, Star,
} from "lucide-react";
const logoFull = { url: "/branding/unify/unify-logo-horizontal.png" };
import appsGrid from "@/assets/screens/apps-grid.png";
import repHome from "@/assets/screens/rep-home.png";
import finHub from "@/assets/screens/finance-hub.png";

/**
 * Unify ERP — Landing page (Qoyod-inspired: clean, minimal, trust-first).
 * RTL Arabic. Light background, navy text, blue accent.
 */
const LandingPage = () => {
  const [navBg, setNavBg] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    document.title = "يونيفاي | نظام ERP عربي متكامل — محاسبة، POS، بائع متجول، موارد بشرية";
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
      "يونيفاي — نظام ERP عربي متكامل لفلسطين والأردن والخليج: محاسبة، نقاط بيع، بائع متجول، حضور موظفين، شيكات، ضريبة، ومحاسب ذكي بالعربي."
    );
    setMeta("og:title", "يونيفاي — ERP عربي متكامل", "property");

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
    { icon: Users, color: "bg-violet-50 text-violet-600", title: "خدمات يونيفاي المحترفة", desc: "خدمات محاسبية على يد محاسبين معتمدين. رتّب سجلاتك واستعد لأي تدقيق." },
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
    { q: "هل يونيفاي متوافق مع متطلبات الفوترة الإلكترونية؟", a: "نعم، يونيفاي متوافق مع أنظمة الفوترة الإلكترونية في فلسطين والأردن والسعودية، مع تحديثات مستمرة لأي متطلبات جديدة." },
    { q: "هل أحتاج خبرة محاسبية لاستخدام يونيفاي؟", a: "لا. الواجهة مصمّمة لأصحاب الأعمال قبل المحاسبين، وفريق الدعم يساعدك في التأسيس الأولي مجاناً." },
    { q: "هل بياناتي محفوظة بشكل آمن؟", a: "نعم، جميع البيانات مشفّرة ومحفوظة على سيرفرات آمنة، مع نسخ احتياطية يومية وصلاحيات دقيقة لكل مستخدم." },
    { q: "هل أقدر أجرّب يونيفاي قبل الاشتراك؟", a: "أكيد. تجربة مجانية 14 يوم، بدون بطاقة ائتمان، وبكل الميزات." },
    { q: "هل يدعم يونيفاي نقاط البيع والمتاجر الإلكترونية؟", a: "نعم، يونيفاي يشمل نقاط بيع سحابية ويتكامل مع المتاجر الإلكترونية والتطبيقات الخارجية." },
    { q: "شو اللي يميّز يونيفاي عن باقي البرامج المحاسبية؟", a: "يونيفاي عربي بالكامل، مصمّم لمنطقتنا، ويجمع المحاسبة والـ POS والموارد البشرية والبائع المتجول في منصة واحدة." },
  ];

  return (
    <div dir="rtl" className="bg-white text-[#0D1B2E] min-h-screen" style={{ fontFamily: "'Cairo', sans-serif" }}>
      <style>{`.font-latin{font-family:'DM Sans',sans-serif}`}</style>

      {/* NAV */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all ${navBg ? "bg-white/90 backdrop-blur-md border-b border-[#eef1f5]" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <Link to="/landing" className="flex items-center">
              <img src={logoFull.url} alt="يونيفاي" className="h-9 w-auto" />
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
              <img src={finHub} alt="واجهة يونيفاي" className="w-full block" />
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
            <span className="inline-block bg-white border border-[#dbe4f0] text-[#2563eb] text-xs font-bold px-4 py-1.5 rounded-full mb-5">منتجات يونيفاي</span>
            <h2 className="text-3xl md:text-5xl font-black mb-5">حلول يونيفاي تغطي كل جانب من عملك</h2>
            <p className="text-[#0D1B2E]/60 max-w-2xl mx-auto leading-relaxed">
              مع يونيفاي، تنضم لمنظومة كاملة: محاسبة، نقاط بيع، إدارة مطاعم، وخدمات احترافية. اختر المنتج المناسب لمنشأتك.
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
            <span className="inline-block bg-[#f5f8fc] border border-[#dbe4f0] text-[#2563eb] text-xs font-bold px-4 py-1.5 rounded-full mb-5">القطاعات · يونيفاي يخدم كل الأعمال</span>
            <h2 className="text-3xl md:text-5xl font-black mb-5">
              حلول محاسبية <span className="text-[#2563eb]">مصمّمة لقطاعك</span>
            </h2>
            <p className="text-[#0D1B2E]/60 max-w-2xl mx-auto leading-relaxed">
              من المطاعم للعيادات، ومن التجزئة للعقارات، يونيفاي يفهم احتياج كل قطاع ويوفّر الأدوات المتخصصة لتشغيله بدقة.
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
              يونيفاي <span className="text-[#2563eb]">بجانبك دائماً</span>
            </h2>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl p-8 border border-[#eef1f5]">
              <div className="aspect-[4/3] bg-[#eaf1fb] rounded-2xl mb-6 flex items-center justify-center overflow-hidden">
                <img src={repHome} alt="دعم" className="max-h-full object-contain"/>
              </div>
              <h3 className="text-xl font-black mb-3">تأسيس ودعم فني في أي وقت</h3>
              <p className="text-[#0D1B2E]/60 leading-relaxed">
                فريق يونيفاي المحلي يساعدك في تأسيس النظام من البداية، وتصدر فواتيرك بثقة. لو صار أي مشكلة، إحنا متوفّرون دائماً.
              </p>
            </div>
            <div className="bg-white rounded-3xl p-8 border border-[#eef1f5]">
              <div className="aspect-[4/3] bg-[#eaf1fb] rounded-2xl mb-6 flex items-center justify-center overflow-hidden">
                <img src={appsGrid} alt="تجربة" className="max-h-full object-contain"/>
              </div>
              <h3 className="text-xl font-black mb-3">جرّب كل شيء قبل الانطلاق</h3>
              <p className="text-[#0D1B2E]/60 leading-relaxed">
                يونيفاي يمنحك بيئة تجريبية آمنة لاختبار النظام بدون أي مخاطرة. اكتشف المشاكل مبكراً وتجنّب أي غرامات.
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
              يونيفاي <span className="text-[#2563eb]">شريكك في النجاح والتميز</span>
            </h2>
            <p className="text-[#0D1B2E]/60 max-w-2xl mx-auto">
              آلاف المنشآت تختار يونيفاي لإدارة محاسبتها وفوترتها الإلكترونية كل يوم.
            </p>
          </div>
          <div className="bg-[#f5f8fc] rounded-3xl p-10 grid grid-cols-2 md:grid-cols-4 gap-6 mb-14 border border-[#eef1f5]">
            {[
              ["+25K", "منشأة تستخدم يونيفاي"],
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
              { name: "صالح أحمد", role: "مدير تنفيذي", tag: "مدراء تنفيذيون", quote: "بعد ما جرّبنا كذا نظام محاسبي وخسرنا معهم، يونيفاي طلع الحل المثالي، وفوترته الإلكترونية خلّتنا نتابع حساباتنا من أي مكان." },
              { name: "عبدالكريم س.", role: "مدير تنفيذي", tag: "مدراء تنفيذيون", quote: "يونيفاي كان أول من دخل السوق بالفوترة الإلكترونية، وأعطانا صورة مالية كاملة عن أعمالنا بدون أي معاناة." },
              { name: "خلود م.", role: "صاحبة عمل", tag: "أصحاب أعمال", quote: "يونيفاي ساعدني أنتقل من الفواتير الورقية للإلكترونية، وبيّن لي المشاريع الأكثر ربحية عشان أركّز عليها." },
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
            <p className="text-[#0D1B2E]/60">كل ما تحتاج معرفته عن يونيفاي والفوترة الإلكترونية والالتزام قبل ما تبدأ.</p>
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
            جرّب يونيفاي مجاناً لمدة 14 يوم. بدون بطاقة ائتمان. وابدأ بإصدار فواتير معتمدة خلال دقائق.
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
            <img src={logoFull.url} alt="يونيفاي" className="h-10 w-auto mb-5" />
            <p className="text-sm text-[#0D1B2E]/60 leading-relaxed">
              يونيفاي حل محاسبي سحابي حديث ورائد، يمكّن آلاف الشركات من إدارة أعمالها المالية بكفاءة والالتزام الكامل بالأنظمة الضريبية.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-black tracking-widest mb-4 text-[#0D1B2E]">المنتجات والخدمات</h4>
            <ul className="space-y-3 text-sm text-[#0D1B2E]/70">
              <li><a href="#products" className="hover:text-[#2563eb]">يونيفاي لأصحاب الأعمال</a></li>
              <li><a href="#products" className="hover:text-[#2563eb]">يونيفاي للمحاسبين</a></li>
              <li><a href="#products" className="hover:text-[#2563eb]">نقاط البيع</a></li>
              <li><a href="#products" className="hover:text-[#2563eb]">تطبيق يونيفاي</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-black tracking-widest mb-4 text-[#0D1B2E]">التكاملات</h4>
            <ul className="space-y-3 text-sm text-[#0D1B2E]/70">
              <li><a href="#" className="hover:text-[#2563eb]">الفوترة الإلكترونية</a></li>
              <li><a href="#" className="hover:text-[#2563eb]">سوق التكاملات</a></li>
              <li><a href="#" className="hover:text-[#2563eb]">واجهة يونيفاي البرمجية</a></li>
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
          © 2026 يونيفاي — نظام ERP عربي متكامل. فلسطين · الأردن · الخليج العربي.
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

