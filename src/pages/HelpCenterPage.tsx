import { useState } from "react";
import { Search, BookOpen, Video, MessageCircle, ChevronDown, Mail } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

const SUPPORT_WHATSAPP = "970599000000"; // placeholder — update with real number

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
    <div className="min-h-screen" dir="rtl">
      {/* Hero */}
      <div className="relative py-16 px-4" style={{ background: "linear-gradient(135deg, #0D1B2E 0%, #1a3a5c 50%, #0D1B2E 100%)" }}>
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold text-white">كيف يمكننا مساعدتك؟</h1>
          <p className="text-white/70 text-lg">مقالات تفصيلية تساعدك في استخدام أموالي بشكل فعّال</p>
          <div className="mt-8 max-w-xl mx-auto">
            <div className="flex items-center bg-white rounded-xl shadow-lg overflow-hidden">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ابحث عن إجابتك..."
                className="flex-1 px-5 py-4 text-sm text-foreground outline-none bg-transparent"
                dir="rtl"
              />
              <div className="px-4 text-muted-foreground">
                <Search className="h-5 w-5" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="max-w-5xl mx-auto px-4 -mt-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {featureCards.map((card) => (
            <div key={card.title} className="bg-card border border-border rounded-xl p-6 text-center shadow-sm hover:shadow-md transition-shadow">
              <card.icon className={`h-10 w-10 mx-auto mb-3 ${card.color}`} strokeWidth={1.5} />
              <h3 className="font-semibold text-foreground text-lg mb-1">{card.title}</h3>
              <p className="text-muted-foreground text-sm mb-3">{card.desc}</p>
              {card.action && (
                <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-2">
                    <MessageCircle className="h-4 w-4" /> تواصل الآن
                  </Button>
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-foreground text-center mb-8">الأسئلة الشائعة</h2>
        <Accordion type="multiple" className="space-y-3">
          {filtered.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border border-border rounded-xl px-5 overflow-hidden bg-card">
              <AccordionTrigger className="text-right text-sm font-medium py-4 hover:no-underline">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-sm leading-relaxed pb-4">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        {filtered.length === 0 && (
          <p className="text-center text-muted-foreground mt-6">لا توجد نتائج مطابقة</p>
        )}
      </div>

      {/* Contact Footer */}
      <div className="py-12 px-4" style={{ background: "hsl(var(--muted) / 0.3)" }}>
        <div className="max-w-xl mx-auto text-center space-y-5">
          <h3 className="text-xl font-bold text-foreground">لم تجد إجابتك؟ تواصل معنا</h3>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer">
              <Button className="bg-green-600 hover:bg-green-700 text-white gap-2 px-6">
                <MessageCircle className="h-4 w-4" /> واتساب
              </Button>
            </a>
            <a href="mailto:support@amwali.app">
              <Button variant="outline" className="gap-2 px-6 border-[#0D1B2E] text-[#0D1B2E] hover:bg-[#0D1B2E]/5">
                <Mail className="h-4 w-4" /> البريد الإلكتروني
              </Button>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
