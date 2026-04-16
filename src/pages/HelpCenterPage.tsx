import { useState } from "react";
import { Search, BookOpen, Video, MessageCircle, Mail, Shield, Server, Database, Globe, Lock, HardDrive, Smartphone, CloudOff, Zap, Download, Users, HeadphonesIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

const SUPPORT_WHATSAPP = "970599000000";

const faqItems = [
  { q: "كيف أبدأ استخدام أموالي؟", a: "بعد التسجيل، ستجد شجرة الحسابات جاهزة تلقائياً. ابدأ بإضافة عملائك وموردينك، ثم أنشئ أول فاتورة مبيعات." },
  { q: "هل يدعم النظام أكثر من عملة؟", a: "نعم، يدعم أموالي الشيكل الإسرائيلي (ILS)، الدولار الأمريكي (USD)، والدينار الأردني (JOD) مع تحويل تلقائي وقيود مزدوجة لكل عملة." },
  { q: "كيف أضيف موظفين وصلاحيات؟", a: "من قائمة الإعدادات > المستخدمون، يمكنك إضافة أعضاء الفريق وتحديد صلاحياتهم لكل وحدة." },
  { q: "هل يمكنني استيراد بياناتي من برنامج آخر؟", a: "نعم، يدعم النظام استيراد شجرة الحسابات والعملاء والموردين عبر ملفات Excel/CSV من قائمة الإعدادات." },
  { q: "كيف أُصدر التقارير المالية؟", a: "من قائمة المالية > التقارير، اختر التقرير المطلوب (ميزان المراجعة، قائمة الدخل، الميزانية العمومية) وصدّره بصيغة PDF أو Excel." },
  { q: "كيف أتواصل مع الدعم الفني؟", a: "يمكنك التواصل معنا مباشرة عبر واتساب على مدار ساعات العمل، أو مراسلتنا عبر البريد الإلكتروني." },
  { q: "هل بياناتي آمنة؟", a: "نعم، يعمل أموالي على بنية سحابية مع تشفير كامل وسياسات أمان على مستوى الصف (RLS) لحماية بيانات كل مؤسسة بشكل مستقل تماماً." },
  { q: "هل يتوافق النظام مع متطلبات الضريبة الفلسطينية؟", a: "نعم، يدعم النظام الترقيم التسلسلي للفواتير وتقارير ضريبة القيمة المضافة وفق متطلبات السلطة الضريبية الفلسطينية." },
];

const technicalFaqItems = [
  {
    icon: Server,
    q: "أين توجد السيرفرات؟",
    a: "السيرفرات موجودة في مراكز بيانات Amazon Web Services (AWS) في منطقة أوروبا (أيرلندا). مراكز بيانات AWS من أكبر وأكثر مراكز البيانات أماناً في العالم، وتخدم شركات عالمية مثل Netflix و Samsung و NASA.",
  },
  {
    icon: Globe,
    q: "مع أي شركة استضافة يعمل البرنامج؟",
    a: "البنية التحتية مبنية على Supabase (منصة مفتوحة المصدر) تعمل فوق Amazon Web Services (AWS) — أكبر مزود خدمات سحابية في العالم بحصة سوقية 31%. الواجهة الأمامية موزعة عبر شبكة CDN عالمية لضمان أسرع تحميل.",
  },
  {
    icon: Shield,
    q: "هل البيانات محمية؟ ما طبقات الأمان؟",
    a: "نعم، بعدة طبقات: تشفير AES-256 للبيانات المخزنة (معيار عسكري)، تشفير TLS 1.3 لكل الاتصالات، عزل كامل لبيانات كل شركة (Row Level Security)، مصادقة JWT مشفرة، جدار حماية AWS، ومراقبة مستمرة 24/7.",
  },
  {
    icon: Lock,
    q: "هل عندكم شهادات أمان معتمدة؟",
    a: "نعم: SOC 2 Type II (تُقيّم سنوياً)، متوافق مع GDPR (حماية البيانات الأوروبية)، AWS معتمد بشهادات ISO 27001 و PCI DSS للمدفوعات.",
  },
  {
    icon: HardDrive,
    q: "هل يوجد نسخ احتياطي تلقائي؟",
    a: "نعم، نظام نسخ احتياطي متعدد المستويات: نسخ يومية تلقائية تُحفظ لمدة 7-30 يوم، إمكانية تصدير البيانات يدوياً بأي وقت (Excel/JSON)، وتنبيه تلقائي إذا لم تُنشئ نسخة احتياطية لمدة 30 يوم.",
  },
  {
    icon: Database,
    q: "هل ممكن تضيع البيانات؟",
    a: "احتمال شبه معدوم. البيانات محفوظة في أكثر من نسخة على سيرفرات مختلفة (Multi-AZ). خدمة AWS تضمن 99.999999999% (11 تسعة) من سلامة البيانات. حتى لو تعطل سيرفر كامل، البيانات تنتقل تلقائياً لسيرفر ثاني.",
  },
  {
    icon: Lock,
    q: "هل ممكن حدا يخترق البيانات؟",
    a: "الحماية مشددة: كل مستخدم يرى فقط بياناته (RLS)، كلمات المرور مشفرة بـ bcrypt، حماية من هجمات SQL Injection و XSS و CSRF، تحديد عدد الطلبات (Rate Limiting)، وسجل مراجعة يسجل كل عملية حساسة.",
  },
  {
    icon: CloudOff,
    q: "هل البرنامج يشتغل بدون إنترنت؟",
    a: "نقطة البيع (POS) تدعم العمل بدون إنترنت عبر تقنية PWA مع مزامنة تلقائية عند عودة الاتصال. باقي الوظائف تحتاج إنترنت لأنها تتواصل مباشرة مع قاعدة البيانات السحابية.",
  },
  {
    icon: Zap,
    q: "ما سرعة البرنامج؟",
    a: "سريع جداً بفضل: شبكة CDN عالمية تُحمّل الملفات من أقرب سيرفر، قاعدة بيانات PostgreSQL محسّنة مع فهرسة ذكية، تحميل جزئي للصفحات (Code Splitting)، وتحديثات فورية باستخدام Realtime.",
  },
  {
    icon: Download,
    q: "هل ممكن أنقل بياناتي إذا أوقفت الخدمة؟",
    a: "نعم بالتأكيد. يمكنك تصدير كامل بياناتك بصيغة Excel أو JSON، وتصدير التقارير المالية بصيغة PDF. لا يوجد \"قفل مورّد\" — بياناتك ملكك بالكامل.",
  },
  {
    icon: Users,
    q: "كم مستخدم يتحمل البرنامج؟",
    a: "البنية التحتية تتوسع تلقائياً (Auto-scaling) حسب الحاجة. يتحمل من مستخدم واحد إلى آلاف المستخدمين المتزامنين بدون أي تأثير على الأداء.",
  },
  {
    icon: Smartphone,
    q: "هل البرنامج متوافق مع الجوال؟",
    a: "نعم، متوافق مع كل الأجهزة: كمبيوتر (Windows, Mac, Linux)، جوال وتابلت (iOS, Android) بتصميم متجاوب، ويمكن تثبيته كتطبيق على الجوال بدون متجر التطبيقات عبر تقنية PWA.",
  },
  {
    icon: HeadphonesIcon,
    q: "من يملك البيانات؟ وهل في دعم فني؟",
    a: "أنت تملك بياناتك بالكامل — نحن فقط نوفر البنية التحتية ولا نطّلع على بيانات العملاء. الدعم الفني متوفر مباشرة عبر المنصة مع تحديثات مستمرة وتحسينات أمنية دورية.",
  },
];

const featureCards = [
  { icon: BookOpen, title: "دليل المعرفة", desc: "مقالات مفصّلة تجيب على كل أسئلتك", color: "text-blue-600" },
  { icon: Video, title: "الفيديوهات التعليمية", desc: "شروحات مرئية خطوة بخطوة", color: "text-purple-600" },
  { icon: MessageCircle, title: "تواصل مع الدعم", desc: "فريقنا جاهز لمساعدتك عبر واتساب", color: "text-green-600", action: true },
];

export default function HelpCenterPage() {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<"general" | "technical">("general");

  const filteredGeneral = search.trim()
    ? faqItems.filter(f => f.q.includes(search) || f.a.includes(search))
    : faqItems;

  const filteredTechnical = search.trim()
    ? technicalFaqItems.filter(f => f.q.includes(search) || f.a.includes(search))
    : technicalFaqItems;

  const hasResults = filteredGeneral.length > 0 || filteredTechnical.length > 0;

  return (
    <div className="w-full overflow-x-hidden">
      {/* Hero */}
      <div
        className="w-full py-14 px-4 sm:px-6"
        style={{ background: "linear-gradient(135deg, #0D1B2E 0%, #1a3a5c 50%, #0D1B2E 100%)" }}
      >
        <div className="mx-auto max-w-2xl text-center space-y-3">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white leading-tight">
            كيف يمكننا مساعدتك؟
          </h1>
          <p className="text-white/70 text-sm sm:text-base">
            مقالات تفصيلية تساعدك في استخدام أموالي بشكل فعّال
          </p>
          <div className="pt-4 mx-auto max-w-lg">
            <div className="flex items-center bg-white rounded-xl shadow-lg overflow-hidden">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ابحث عن إجابتك..."
                className="flex-1 px-4 py-3.5 text-sm outline-none bg-transparent text-slate-900 placeholder:text-slate-400"
                dir="rtl"
              />
              <div className="px-3 text-slate-400">
                <Search className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="mx-auto max-w-4xl px-4 sm:px-6 -mt-7 relative z-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {featureCards.map((card) => (
            <div
              key={card.title}
              className="bg-card border border-border rounded-xl p-5 text-center shadow-sm hover:shadow-md transition-shadow"
            >
              <card.icon className={`h-9 w-9 mx-auto mb-2.5 ${card.color}`} strokeWidth={1.5} />
              <h3 className="font-semibold text-foreground text-base mb-1">{card.title}</h3>
              <p className="text-muted-foreground text-xs mb-3">{card.desc}</p>
              {card.action && (
                <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-2 text-xs">
                    <MessageCircle className="h-3.5 w-3.5" /> تواصل الآن
                  </Button>
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Section Tabs */}
      <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-10">
        <div className="flex items-center justify-center gap-2 mb-6">
          <button
            onClick={() => setActiveSection("general")}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeSection === "general"
                ? "bg-[#0D1B2E] text-white shadow-md"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            أسئلة عامة
          </button>
          <button
            onClick={() => setActiveSection("technical")}
            className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
              activeSection === "technical"
                ? "bg-[#0D1B2E] text-white shadow-md"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Shield className="h-4 w-4" />
            البنية التحتية والأمان
          </button>
        </div>
      </div>

      {/* General FAQ */}
      {activeSection === "general" && (
        <div className="mx-auto max-w-2xl px-4 sm:px-6 pb-12">
          <h2 className="text-xl font-bold text-foreground text-center mb-6">الأسئلة الشائعة</h2>
          <Accordion type="multiple" className="space-y-2.5">
            {filteredGeneral.map((item, i) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="border border-border rounded-xl px-4 overflow-hidden bg-card"
              >
                <AccordionTrigger className="text-right text-sm font-medium py-3.5 hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-sm leading-relaxed pb-3.5">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          {filteredGeneral.length === 0 && (
            <p className="text-center text-muted-foreground mt-6 text-sm">لا توجد نتائج مطابقة</p>
          )}
        </div>
      )}

      {/* Technical FAQ */}
      {activeSection === "technical" && (
        <div className="mx-auto max-w-2xl px-4 sm:px-6 pb-12">
          <h2 className="text-xl font-bold text-foreground text-center mb-2">البنية التحتية والأمان</h2>
          <p className="text-center text-muted-foreground text-sm mb-6">كل ما تحتاج معرفته عن السيرفرات، الأمان، والبيانات</p>
          <Accordion type="multiple" className="space-y-2.5">
            {filteredTechnical.map((item, i) => {
              const Icon = item.icon;
              return (
                <AccordionItem
                  key={i}
                  value={`tech-${i}`}
                  className="border border-border rounded-xl px-4 overflow-hidden bg-card"
                >
                  <AccordionTrigger className="text-right text-sm font-medium py-3.5 hover:no-underline">
                    <span className="flex items-center gap-2.5">
                      <Icon className="h-4.5 w-4.5 text-[#1a3a5c] flex-shrink-0" strokeWidth={1.8} />
                      {item.q}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-sm leading-relaxed pb-3.5 pr-7">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
          {filteredTechnical.length === 0 && (
            <p className="text-center text-muted-foreground mt-6 text-sm">لا توجد نتائج مطابقة</p>
          )}
        </div>
      )}

      {/* Contact Footer */}
      <div className="w-full py-10 px-4 bg-muted/30">
        <div className="mx-auto max-w-md text-center space-y-4">
          <h3 className="text-lg font-bold text-foreground">لم تجد إجابتك؟ تواصل معنا</h3>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-2 px-5">
                <MessageCircle className="h-4 w-4" /> واتساب
              </Button>
            </a>
            <a href="mailto:support@amwali.app">
              <Button size="sm" variant="outline" className="gap-2 px-5">
                <Mail className="h-4 w-4" /> البريد الإلكتروني
              </Button>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
