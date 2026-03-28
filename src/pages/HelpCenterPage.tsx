import { useState } from "react";
import { Search, BookOpen, Video, MessageCircle, Mail } from "lucide-react";
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

const featureCards = [
  { icon: BookOpen, title: "دليل المعرفة", desc: "مقالات مفصّلة تجيب على كل أسئلتك", color: "text-blue-600" },
  { icon: Video, title: "الفيديوهات التعليمية", desc: "شروحات مرئية خطوة بخطوة", color: "text-purple-600" },
  { icon: MessageCircle, title: "تواصل مع الدعم", desc: "فريقنا جاهز لمساعدتك عبر واتساب", color: "text-green-600", action: true },
];

export default function HelpCenterPage() {
  const [search, setSearch] = useState("");

  const filtered = search.trim()
    ? faqItems.filter(f => f.q.includes(search) || f.a.includes(search))
    : faqItems;

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

      {/* FAQ */}
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12">
        <h2 className="text-xl font-bold text-foreground text-center mb-6">الأسئلة الشائعة</h2>
        <Accordion type="multiple" className="space-y-2.5">
          {filtered.map((item, i) => (
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
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground mt-6 text-sm">لا توجد نتائج مطابقة</p>
        )}
      </div>

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
