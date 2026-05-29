import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, MessageCircle, Check, ArrowLeft } from "lucide-react";
import logoMark from "@/assets/amwali-mark-navy.png";
import appsGrid from "@/assets/screens/apps-grid.png";
import repHome from "@/assets/screens/rep-home.png";
import repExpense from "@/assets/screens/rep-expense.png";
import repOrders from "@/assets/screens/rep-orders.png";
import wsRep from "@/assets/screens/workspace-rep.png";
import wsCashier from "@/assets/screens/workspace-cashier.png";
import wsCallcenter from "@/assets/screens/workspace-callcenter.png";
import hrEmployeeHome from "@/assets/screens/hr-employee-home.png";
import hrForms from "@/assets/screens/hr-forms.png";
import hrAttendanceLog from "@/assets/screens/hr-attendance-log.png";
import hrProfile from "@/assets/screens/hr-profile.png";
import hrRosterWeek from "@/assets/screens/hr-roster-week.png";
import hrShiftDialog from "@/assets/screens/hr-shift-dialog.png";
import hrManagerTools from "@/assets/screens/hr-manager-tools.png";
import hrDashboard from "@/assets/screens/hr-dashboard.png";
import finHub from "@/assets/screens/finance-hub.png";
import finLinks from "@/assets/screens/finance-links.png";
import finReports from "@/assets/screens/finance-reports.png";
import finReportsGrid1 from "@/assets/screens/finance-reports-grid1.png";
import finReportsGrid2 from "@/assets/screens/finance-reports-grid2.png";
import finTemplates from "@/assets/screens/finance-templates.png";
import finInvoiceCreate from "@/assets/screens/finance-invoice-create.png";
import finInvoicePrint from "@/assets/screens/finance-invoice-print.png";
import finPolicies from "@/assets/screens/finance-customer-policies.png";

/**
 * AMWALI — صفحة هبوط نظيفة، صادقة، مبنية على صور حقيقية من البرنامج.
 * بدون مبالغات؛ كل قسم يعرض ميزة موجودة فعلاً + صورة من داخل النظام.
 * الأسواق المستهدفة: فلسطين 🇵🇸 · الأردن 🇯🇴 · الخليج العربي 🇸🇦🇦🇪🇰🇼.
 */
const LandingPage = () => {
  const [navBg, setNavBg] = useState(false);

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
                  <img src={hrRosterWeek} alt="جدول الدوام الأسبوعي للفرع" loading="lazy" />
                </div>
                <div className="device-frame max-w-full">
                  <img src={hrShiftDialog} alt="إسناد وردية لموظف — صباحي/ميد/مسائي" loading="lazy" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#e8ecf1] rounded-3xl p-6">
              <span className="text-[10px] font-black text-[#3b82f6] tracking-widest">صلاحيات المدراء</span>
              <h3 className="text-xl md:text-2xl font-black mt-2 mb-3">مدير الفرع يشوف فريقه فقط</h3>
              <p className="text-sm text-[#0D1B2E]/65 leading-relaxed mb-5">
                لمّا الموظف يكون مدير فرع، بيظهر له قسم "إدارة الفريق" تلقائياً: حضور الفريق، جدول الدوام، تبديل ورديات، واعتماد/رفض طلبات موظفيه — بدون ما يشوف موظفين فروع تانية.
              </p>
              <div className="device-frame max-w-[280px] mx-auto">
                <img src={hrManagerTools} alt="أدوات مدير الفرع — حضور الفريق، الدوام، تبديل الورديات، اعتماد الطلبات" loading="lazy" />
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
              { t: "API ومتجر إلكتروني", d: "ربط طلبات قمر (Qamar) وفواتير من أي متجر إلكتروني." },
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
