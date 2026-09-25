import { useEffect, useRef, useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import fabric from "@/assets/studio/fabric.jpg";
import studioWhite from "@/assets/studio/studio-white-green.png.asset.json";
import studioNavy from "@/assets/studio/studio-navy-green.png.asset.json";

/** Unify parent-brand storytelling landing — six scenes (see blueprint 25/9/2026). */

// TODO: confirm official WhatsApp number (was placeholder on the old landing).
const WHATSAPP = "970599000000";

const C = {
  navy: "#0A1026",
  studio: "#28D98B",
  studioDark: "#087A4D",
  erp: "#4D8DFF",
  elite: "#9B7AFF",
  light: "#F4F7F6",
};

type Product = {
  id: "studio" | "erp" | "elite";
  name: string;
  tagline: string;
  summary: string;
  accent: string;
  detailPath: string;
  action: string;
  order: number;
};

const PRODUCTS: Product[] = [
  { id: "erp", name: "Unify ERP", tagline: "شوف الصورة كاملة", summary: "محاسبة، نقاط بيع، مخزون وموارد بشرية بنظام واحد.", accent: C.erp, detailPath: "/solutions/erp", action: "استكشف Unify ERP", order: 1 },
  { id: "studio", name: "Unify Studio", tagline: "خلّي أول زيارة إلها أثر", summary: "مواقع ومتاجر تحكي قصة منتجك، بحركة مدروسة وتجربة سهلة على الموبايل.", accent: C.studio, detailPath: "#contact", action: "خلّينا نبني قصتك", order: 2 },
  { id: "elite", name: "Unify Elite", tagline: "أبعد من السيرة الذاتية", summary: "مقابلات مدعومة بالذكاء الاصطناعي وتقارير تساعدك تراجع المرشحين.", accent: C.elite, detailPath: "#contact", action: "استكشف Unify Elite", order: 3 },
];

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown(true), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, cls: `transition-all duration-[900ms] ease-out ${shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}` };
}

/** The recurring U-frame. */
const UFrame = ({ accent, children, className = "" }: { accent: string; children: React.ReactNode; className?: string }) => (
  <div
    className={`relative overflow-hidden ${className}`}
    style={{ borderRadius: "0 0 48% 48% / 0 0 28% 28%", border: `1.5px solid ${accent}`, boxShadow: `0 0 80px -20px ${accent}66` }}
  >
    {children}
  </div>
);

const Reveal = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => {
  const r = useReveal();
  return <div ref={r.ref} className={`${r.cls} ${className}`}>{children}</div>;
};

export default function UnifyStoryLanding() {
  const [scale, setScale] = useState(1);
  const [service, setService] = useState("Unify Studio");

  useEffect(() => {
    document.title = "Unify — من أول انطباع، لكل خطوة نمو";
    const onScroll = () => setScale(1 + Math.min(window.scrollY / 2500, 0.12));
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const goContact = (s: string) => {
    setService(s);
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
  };

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const msg = `مرحبا Unify 👋\nالاسم: ${f.get("name")}\nالتواصل: ${f.get("contact")}\nنوع المشروع: ${f.get("type")}\nالخدمة: ${f.get("service")}`;
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  };

  return (
    <div dir="rtl" style={{ fontFamily: "'Cairo', sans-serif", background: C.navy, color: "#fff" }} className="min-h-screen overflow-x-hidden">
      <style>{`.latin{font-family:'Poppins','Montserrat',sans-serif} @media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important}}`}</style>

      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md" style={{ background: `${C.navy}cc`, borderBottom: "1px solid #ffffff14" }}>
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center gap-6">
          <img src="/branding/unify/unify-logo-horizontal-white.png" alt="Unify" className="h-8 w-auto" />
          <nav className="hidden md:flex items-center gap-5 text-sm font-bold text-white/70">
            {[...PRODUCTS].sort((a, b) => a.order - b.order).map((p) => (
              <a key={p.id} href={`#${p.id}`} className="latin hover:text-white">{p.name.replace("Unify ", "")}</a>
            ))}
            <a href="#contact" className="hover:text-white">تواصل</a>
          </nav>
          <div className="flex-1" />
          <Link to="/auth" className="text-sm font-extrabold px-4 py-2 rounded-lg" style={{ background: C.erp }}>دخول ERP</Link>
        </div>
      </header>

      {/* 01 — Hero */}
      <section className="relative min-h-[100dvh] pt-24 pb-16 px-5 flex items-center">
        <div className="max-w-7xl mx-auto w-full grid md:grid-cols-2 gap-12 items-center">
          <div className="animate-fade-in">
            <p className="latin text-xs tracking-[0.3em] text-white/50 mb-5">UNIFY</p>
            <h1 className="text-4xl md:text-6xl font-black leading-[1.2]">من أول انطباع،<br />لكل خطوة نمو.</h1>
            <p className="mt-6 text-lg text-white/70 max-w-lg leading-relaxed">مواقع تحكي قصتك. نظام يدير أعمالك. وذكاء اصطناعي يساعدك تختار فريقك.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#solutions" className="px-6 py-3.5 rounded-xl font-extrabold" style={{ background: "#fff", color: C.navy }}>اكتشف حلول Unify</a>
              <button onClick={() => goContact("Unify Studio")} className="px-6 py-3.5 rounded-xl font-extrabold border" style={{ borderColor: C.studio, color: C.studio }}>بدي موقع بهالمستوى</button>
            </div>
            <div className="mt-8 flex gap-5 text-sm latin font-bold">
              {PRODUCTS.map((p) => (
                <a key={p.id} href={`#${p.id}`} className="flex items-center gap-2 text-white/70 hover:text-white">
                  <span className="w-2 h-2 rounded-full" style={{ background: p.accent }} />{p.name.replace("Unify ", "")}
                </a>
              ))}
            </div>
          </div>
          <div className="flex justify-center">
            <UFrame accent="#ffffff" className="w-[78%] max-w-[420px] aspect-[3/4]">
              <img src={fabric} alt="تفصيلة قماش بإضاءة تحريرية" width={1200} height={1408} className="w-full h-full object-cover transition-transform duration-300" style={{ transform: `scale(${scale})` }} />
            </UFrame>
          </div>
        </div>
      </section>

      {/* 02 — Studio */}
      <section id="studio" className="py-28 px-5">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-14 items-center">
          <Reveal className="order-2 md:order-1 flex justify-center">
            <UFrame accent={C.studio} className="w-full max-w-[440px] bg-[#F4F7F6]">
              <div style={{ color: C.navy }}>
                <img src={fabric} alt="منتج تجريبي" loading="lazy" width={1200} height={1408} className="w-full h-64 object-cover object-top" />
                <div className="p-6 pb-14 text-center">
                  <p className="latin text-[10px] tracking-[0.25em] opacity-50">DEMO · LINEN COLLECTION</p>
                  <h3 className="text-2xl font-black mt-2">قميص الكتّان العاجي</h3>
                  <p className="text-sm opacity-70 mt-2">درزة يدوية، قماش يتنفّس، وقَصّة مريحة لكل يوم.</p>
                  <p className="latin font-black text-xl mt-3">₪ 000 <span className="text-[10px] font-bold opacity-50">(سعر توضيحي)</span></p>
                  <span className="inline-block mt-4 px-6 py-2.5 rounded-full text-sm font-extrabold" style={{ background: C.navy, color: "#fff" }}>أضف للسلة</span>
                </div>
              </div>
            </UFrame>
          </Reveal>
          <Reveal className="order-1 md:order-2">
            <img src={studioWhite.url} alt="Unify Studio" className="h-9 w-auto mb-8" />
            <h2 className="text-3xl md:text-5xl font-black leading-tight">خلّي أول زيارة<br />إلها أثر.</h2>
            <p className="mt-6 text-white/70 text-lg leading-relaxed max-w-md">نصمم مواقع تحكي قصة منتجك، بحركة مدروسة وتجربة سهلة على الموبايل.</p>
            <ol className="mt-8 space-y-3 text-white/80">
              {["الانتباه للتفصيل", "فهم المنتج", "دعوة واضحة للشراء"].map((s, i) => (
                <li key={s} className="flex items-center gap-3"><span className="latin text-xs font-bold w-7 h-7 rounded-full grid place-items-center" style={{ border: `1px solid ${C.studio}`, color: C.studio }}>0{i + 1}</span>{s}</li>
              ))}
            </ol>
            <button onClick={() => goContact("Unify Studio")} className="mt-10 px-6 py-3.5 rounded-xl font-extrabold" style={{ background: C.studio, color: C.navy }}>خلّينا نبني قصتك</button>
          </Reveal>
        </div>
      </section>

      {/* 03 — ERP */}
      <section id="erp" className="py-28 px-5">
        <Reveal className="max-w-3xl mx-auto text-center mb-16">
          <p className="text-white/50 text-lg">ووراء كل واجهة مميزة… إدارة تمسك التفاصيل.</p>
          <div className="w-16 h-px mx-auto my-8" style={{ background: C.erp }} />
          <h2 className="text-3xl md:text-5xl font-black">شوف الصورة كاملة.</h2>
        </Reveal>
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          {[
            { t: "عملية بيع", rows: [["فاتورة POS-0412", "₪ 186.00"], ["نقدي", "مدفوعة"], ["الفرع", "رام الله"]] },
            { t: "حركة مخزون", rows: [["قميص كتّان", "+ 40"], ["وارد مشتريات", "PO-0118"], ["الرصيد", "212 قطعة"]] },
            { t: "ملخص مالي", rows: [["المبيعات", "₪ 00,000"], ["المصاريف", "₪ 0,000"], ["صافي", "₪ 0,000"]] },
          ].map((c) => (
            <Reveal key={c.t}>
              <div className="rounded-2xl p-6 h-full" style={{ background: "#ffffff08", border: `1px solid ${C.erp}55` }}>
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-extrabold">{c.t}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full text-white/60 border border-white/15">بيانات تجريبية</span>
                </div>
                {c.rows.map(([a, b]) => (
                  <div key={a} className="flex justify-between py-2.5 border-t border-white/10 text-sm"><span className="text-white/60">{a}</span><span className="latin font-bold">{b}</span></div>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="max-w-6xl mx-auto mt-10 flex flex-wrap items-center justify-between gap-6">
          <div className="flex flex-wrap gap-2">
            {["المحاسبة", "نقاط البيع", "المخزون", "الموارد البشرية"].map((x) => (
              <span key={x} className="px-4 py-2 rounded-full text-sm font-bold" style={{ background: `${C.erp}1f`, color: "#cfe0ff" }}>{x}</span>
            ))}
          </div>
          <div className="flex gap-3">
            <Link to="/solutions/erp" className="px-6 py-3 rounded-xl font-extrabold" style={{ background: C.erp }}>استكشف Unify ERP</Link>
            <Link to="/auth" className="px-6 py-3 rounded-xl font-extrabold border border-white/20">دخول النظام</Link>
          </div>
        </Reveal>
      </section>

      {/* 04 — Elite */}
      <section id="elite" className="py-28 px-5">
        <Reveal className="max-w-3xl mx-auto text-center mb-16">
          <p className="text-white/50 text-lg">ولما تكبر الفكرة… بتحتاج ناس تكبر معها.</p>
          <div className="w-16 h-px mx-auto my-8" style={{ background: C.elite }} />
          <h2 className="text-3xl md:text-5xl font-black">تعرّف على المرشح، أبعد من السيرة الذاتية.</h2>
        </Reveal>
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          <Reveal><div className="rounded-2xl p-6 h-full" style={{ background: "#ffffff08", border: `1px solid ${C.elite}55` }}>
            <p className="text-xs text-white/50 mb-3">01 · متطلبات الوظيفة</p>
            <h3 className="font-extrabold mb-4">مسؤول خدمة عملاء</h3>
            {["تواصل واضح بالعربي", "هدوء تحت الضغط", "خبرة سنة على الأقل"].map((x) => <p key={x} className="text-sm text-white/70 py-1.5">• {x}</p>)}
          </div></Reveal>
          <Reveal><div className="rounded-2xl p-6 h-full" style={{ background: "#ffffff08", border: `1px solid ${C.elite}55` }}>
            <p className="text-xs text-white/50 mb-3">02 · مقتطف مقابلة</p>
            <div className="flex items-end gap-1 h-10 mb-4" aria-hidden>
              {[4, 8, 5, 9, 3, 7, 10, 6, 4, 8, 5, 7, 3, 6].map((h, i) => <span key={i} className="w-1.5 rounded-full" style={{ height: `${h * 10}%`, background: C.elite }} />)}
            </div>
            <p className="text-sm text-white/80 leading-relaxed">«لما يكون الزبون معصّب، أول إشي بسمعه للآخر، وبعدين بلخّصله المشكلة قبل ما أقترح حل.»</p>
            <p className="text-xs text-white/40 mt-3">مرشح مجهول الاسم</p>
          </div></Reveal>
          <Reveal><div className="rounded-2xl p-6 h-full" style={{ background: "#ffffff08", border: `1px solid ${C.elite}55` }}>
            <div className="flex justify-between mb-3"><p className="text-xs text-white/50">03 · تقرير المعايير</p><span className="text-[10px] px-2 py-0.5 rounded-full border border-white/15 text-white/60">عرض توضيحي</span></div>
            <h3 className="font-extrabold mb-2">التواصل: قوي</h3>
            <p className="text-sm text-white/70 leading-relaxed">السبب: يعيد صياغة المشكلة قبل الحل، ويستخدم لغة هادئة ومحددة.</p>
            <p className="text-xs text-white/40 mt-4">القرار النهائي بيد فريقك.</p>
          </div></Reveal>
        </div>
        <Reveal className="text-center mt-10">
          <p className="text-white/70 mb-6">مقابلات مدعومة بالذكاء الاصطناعي وتقارير تساعدك تراجع المرشحين وتتخذ قرارك.</p>
          <button onClick={() => goContact("Unify Elite")} className="px-6 py-3.5 rounded-xl font-extrabold" style={{ background: C.elite }}>استكشف Unify Elite</button>
        </Reveal>
      </section>

      {/* 05 — Solutions */}
      <section id="solutions" className="py-28 px-5">
        <Reveal className="text-center mb-14">
          <img src="/branding/unify/unify-mark.png" alt="" className="h-14 mx-auto mb-6 brightness-0 invert" />
          <h2 className="text-3xl md:text-5xl font-black">حلول مختلفة. وراءها Unify.</h2>
          <p className="mt-4 text-white/60">اختار اللي يحتاجه مشروعك اليوم.</p>
        </Reveal>
        <div className="max-w-6xl mx-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {PRODUCTS.map((p) => (
            <Reveal key={p.id}>
              <div className="rounded-2xl p-7 h-full flex flex-col" style={{ background: "#ffffff06", borderTop: `3px solid ${p.accent}` }}>
                <h3 className="latin text-xl font-bold">{p.name}</h3>
                <p className="font-extrabold mt-2" style={{ color: p.accent }}>{p.tagline}</p>
                <p className="text-sm text-white/65 mt-3 leading-relaxed flex-1">{p.summary}</p>
                {p.id === "erp" ? (
                  <Link to="/solutions/erp" className="mt-6 text-sm font-extrabold" style={{ color: p.accent }}>{p.action} ←</Link>
                ) : (
                  <button onClick={() => goContact(p.name)} className="mt-6 text-sm font-extrabold text-right" style={{ color: p.accent }}>{p.action} ←</button>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* 06 — Contact */}
      <section id="contact" className="py-28 px-5" style={{ background: "#fff", color: C.navy }}>
        <div className="max-w-2xl mx-auto text-center">
          <img src={studioNavy.url} alt="Unify Studio" className="h-10 w-auto mx-auto mb-8" />
          <h2 className="text-3xl md:text-4xl font-black leading-tight">عجبك اللي شفته؟<br />خلّينا نحكي قصة مشروعك.</h2>
          <form onSubmit={submit} className="mt-10 grid gap-4 text-right">
            <input name="name" required placeholder="الاسم" className="px-4 py-3.5 rounded-xl border outline-none focus:border-[#087A4D]" style={{ background: C.light, borderColor: "#dfe5e3" }} />
            <input name="contact" required placeholder="رقم الموبايل أو الإيميل" className="px-4 py-3.5 rounded-xl border outline-none focus:border-[#087A4D]" style={{ background: C.light, borderColor: "#dfe5e3" }} />
            <input name="type" required placeholder="نوع المشروع (متجر أزياء، مطعم، شركة…)" className="px-4 py-3.5 rounded-xl border outline-none focus:border-[#087A4D]" style={{ background: C.light, borderColor: "#dfe5e3" }} />
            <select name="service" value={service} onChange={(e) => setService(e.target.value)} className="px-4 py-3.5 rounded-xl border" style={{ background: C.light, borderColor: "#dfe5e3", color: C.navy }}>
              {PRODUCTS.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
            <button type="submit" className="mt-2 px-6 py-4 rounded-xl font-extrabold text-white" style={{ background: C.studioDark }}>أرسل عبر واتساب</button>
          </form>
        </div>
      </section>

      <footer className="py-8 px-5 text-center text-xs text-white/40">
        <span className="latin">© {new Date().getFullYear()} Unify</span> · <Link to="/privacy" className="hover:text-white">الخصوصية</Link> · <Link to="/terms" className="hover:text-white">الشروط</Link>
      </footer>
    </div>
  );
}
