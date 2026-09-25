import { useEffect, useLayoutEffect, useRef, useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import scarf from "@/assets/studio/linen-scarf.jpg";
import studioNavy from "@/assets/studio/studio-navy-green.png.asset.json";

gsap.registerPlugin(ScrollTrigger);

/** Unify parent-brand scroll story — full-bleed scenes; the U appears only at the opening and closing. */

// TODO: official WhatsApp number not supplied yet (placeholder from the old landing).
const WHATSAPP = "970599000000";
const LOGO_WHITE = "/branding/unify/unify-logo-horizontal-white.png";

const C = { navy: "#0A1026", studio: "#28D98B", erp: "#4D8DFF", elite: "#9B7AFF", light: "#F4F7F6" };

type Product = { id: string; name: string; line: string; accent: string; to: string; action: string; internal?: boolean };
const PRODUCTS: Product[] = [
  { id: "studio", name: "Unify Studio", line: "مواقع ومتاجر تحكي قصة منتجك.", accent: C.studio, to: "#contact", action: "بدي موقع بهالمستوى" },
  { id: "erp", name: "Unify ERP", line: "محاسبة، نقاط بيع، مخزون وموارد بشرية بنظام واحد.", accent: C.erp, to: "/solutions/erp", action: "استكشف Unify ERP", internal: true },
  // No Elite app URL supplied — routes to the inquiry form.
  { id: "elite", name: "Unify Elite", line: "مقابلات وتقارير مدعومة بالذكاء الاصطناعي.", accent: C.elite, to: "#contact", action: "استكشف Unify Elite" },
];

const Demo = ({ dark }: { dark?: boolean }) => (
  <span className={`absolute top-3 left-3 z-20 text-[10px] font-bold px-2 py-0.5 rounded ${dark ? "bg-black/10 text-black/60" : "bg-white/10 text-white/70"}`}>عرض توضيحي</span>
);

/** Unify U outline — used as an opening/closing touch only. */
const UMark = ({ className, color = C.studio }: { className?: string; color?: string }) => (
  <svg viewBox="0 0 200 220" className={className} fill="none" aria-hidden>
    <path d="M20 10 V120 a80 80 0 0 0 160 0 V10" stroke={color} strokeWidth="6" strokeLinecap="round" />
  </svg>
);

/* ---------- scenes ---------- */

const StudioScene = () => (
  <div data-l="studio" className="absolute inset-0 bg-[#f5f1ea] text-[#1b1b1b] overflow-hidden">
    <Demo dark />
    <div data-s="nav" className="absolute top-16 md:top-20 inset-x-0 h-12 flex items-center justify-between px-6 md:px-12 text-xs font-bold border-b border-black/10">
      <span className="latin tracking-[0.35em]">ATELIER</span>
      <span className="opacity-60 hidden sm:inline">المجموعة · القصة · الحرفيّات</span>
      <span className="opacity-60">السلة (1)</span>
    </div>
    <img data-s="img" src={scarf} alt="وشاح كتّان منسوج يدوياً" width={1200} height={1408} className="absolute object-cover" style={{ left: 0, top: 0, width: "100%", height: "100%" }} />
    <div data-s="info" className="absolute inset-x-6 top-[60%] md:inset-x-auto md:top-[30%] md:right-[8%] md:w-[34%] flex flex-col gap-2 md:gap-4">
      <span className="text-[11px] tracking-[0.3em] opacity-60 latin">HANDWOVEN · SS/26</span>
      <h4 className="text-2xl md:text-5xl font-black leading-tight">وشاح كتّان منسوج يدوياً</h4>
      <p className="hidden md:block text-base opacity-70 leading-relaxed">خيوط كتّان طبيعية، ألوان ترابية، وأطراف مفتولة باليد. كل قطعة بتاخد يومين على النول.</p>
      <div className="flex gap-2">{["#c9b594", "#7a7a4e", "#9aa39a"].map((c) => <span key={c} className="w-6 h-6 rounded-full border border-black/20" style={{ background: c }} />)}</div>
      <div className="flex items-center gap-4 mt-1">
        <span className="font-black text-xl md:text-2xl latin">₪ 240</span>
        <span className="px-6 py-2.5 rounded-full text-sm font-bold bg-[#1b1b1b] text-[#f5f1ea]">أضف للسلة</span>
      </div>
    </div>
  </div>
);

// Outer wrapper owns the centering transform; GSAP animates the inner card only.
const Card = ({ k, v, children, className = "" }: { k: string; v: string; children: React.ReactNode; className?: string }) => (
  <div className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 w-[88vw] max-w-[560px]">
    <div {...{ [`data-${k}`]: v }} className={`rounded-3xl border p-6 md:p-8 shadow-2xl ${className}`}>{children}</div>
  </div>
);

const ErpScene = () => (
  <div data-l="erp" className="absolute inset-0 bg-[#0d1733] text-white overflow-hidden">
    <Demo />
    {/* faint workspace behind */}
    <div className="absolute inset-0 opacity-30 flex pt-16">
      <aside className="w-44 border-l border-white/10 p-5 hidden md:flex flex-col gap-4 text-sm text-white/60">
        <span className="latin font-black text-white">Unify ERP</span>
        {["نقطة البيع", "المخزون", "المالية", "الموارد البشرية"].map((t) => <span key={t}>{t}</span>)}
      </aside>
      <div className="flex-1 grid grid-cols-3 gap-4 p-6">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03]" />)}</div>
    </div>
    <Card k="e" v="sale" className="bg-[#111d40] border-white/10">
      <p className="text-sm text-white/50">عملية بيع · من المتجر مباشرة</p>
      <p className="text-2xl md:text-3xl font-black mt-1">فاتورة <span className="latin">#1024</span></p>
      {[["وشاح كتّان منسوج", "240"], ["شنطة قماش", "180"]].map(([n, v]) => <div key={n} className="flex justify-between text-base mt-4 text-white/85"><span>{n}</span><span className="latin">₪{v}</span></div>)}
      <div className="flex justify-between text-xl font-black mt-5 pt-4 border-t border-white/10"><span>المجموع</span><span className="latin" style={{ color: C.erp }}>₪420</span></div>
    </Card>
    <Card k="e" v="stock" className="bg-[#111d40] border-white/10">
      <p className="text-sm text-white/50">المخزون · تحدّث تلقائياً بعد البيع</p>
      {[["وشاح كتّان منسوج", 71, "−1"], ["شنطة قماش", 37, "−1"], ["مفرش طاولة", 15, ""]].map(([n, v, d]) => (
        <div key={n as string} className="mt-5 text-base"><div className="flex justify-between"><span>{n}</span><span className="latin">{v} <span className="text-xs" style={{ color: C.erp }}>{d}</span></span></div>
          <div className="h-2 mt-2 rounded bg-white/10"><div className="h-full rounded" style={{ width: `${v}%`, background: C.erp }} /></div></div>
      ))}
    </Card>
    <Card k="e" v="fin" className="bg-[#111d40] border-white/10">
      <p className="text-sm text-white/50">التقرير المالي · آخر 7 أشهر</p>
      <div data-e="bars" dir="ltr" className="flex items-end gap-2 h-40 mt-5 origin-bottom">{[30, 38, 45, 52, 64, 78, 96].map((h, i) => <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i === 6 ? C.erp : "rgba(77,141,255,.35)" }} />)}</div>
      <div data-e="grow" className="flex flex-wrap gap-2 mt-5">
        {["فرع جديد", "طلبات أكثر ×3", "فريق لازم يكبر"].map((t) => <span key={t} className="px-3 py-1 rounded-full text-sm font-bold bg-white/10">{t}</span>)}
      </div>
      <p className="text-xs text-white/40 mt-4">أرقام توضيحية — مش بيانات حقيقية.</p>
    </Card>
  </div>
);

const EliteScene = () => (
  <div data-l="elite" className="absolute inset-0 bg-[#140f2e] text-white overflow-hidden">
    <Demo />
    <Card k="v" v="brief" className="bg-[#1d1640] border-white/10">
      <p className="text-sm text-white/50">وظيفة شاغرة · الوصف الوظيفي</p>
      <p className="text-2xl md:text-3xl font-black mt-1">مسؤول/ة مبيعات — الفرع الجديد</p>
      <ul className="text-base text-white/80 mt-5 space-y-2 list-disc pr-5"><li>تواصل يومي مع العملاء</li><li>متابعة الطلبات والمخزون</li><li>خبرة سنتين بالمبيعات</li></ul>
    </Card>
    <Card k="v" v="talk" className="bg-[#1d1640] border-white/10">
      <p className="text-sm text-white/50">مقتطف مقابلة (توضيحي)</p>
      <div className="flex items-center gap-[3px] h-14 my-5" aria-hidden>
        {Array.from({ length: 36 }).map((_, i) => <span key={i} className="wave flex-1 rounded" style={{ background: C.elite, animationDelay: `${i * 55}ms` }} />)}
      </div>
      <p className="text-base text-white/60">س: احكيلنا عن عميل صعب تعاملت معه.</p>
      <p className="text-lg mt-3">ج: سمعت مشكلته أول، وبعدين عرضت عليه حلّين واختار الأنسب إله…</p>
    </Card>
    <Card k="v" v="report" className="bg-[#1d1640] border-white/10">
      <p className="text-sm text-white/50">تقرير حسب المعايير</p>
      {[["التواصل", 82, "أمثلة واضحة ومحددة"], ["حل المشكلات", 74, "منهجية منطقية"], ["الخبرة", 60, "أقل من المطلوب قليلاً"]].map(([n, v, w]) => (
        <div key={n as string} className="mt-5 text-base"><div className="flex justify-between"><span>{n}</span><span className="latin font-bold">{v}</span></div>
          <div className="h-2 mt-2 rounded bg-white/10"><div className="h-full rounded" style={{ width: `${v}%`, background: C.elite }} /></div>
          <p className="text-xs text-white/50 mt-1">{w}</p></div>
      ))}
      <p className="text-xs text-white/40 mt-5">مساعدة للقرار — القرار لفريقك.</p>
    </Card>
  </div>
);

/* thumbnails of the scenes for the closing frames */
const Thumb = ({ id }: { id: string }) =>
  id === "studio" ? (
    <img src={scarf} alt="" className="absolute inset-0 w-full h-full object-cover" />
  ) : id === "erp" ? (
    <div className="absolute inset-0 bg-[#111d40] p-3 flex flex-col justify-end"><div dir="ltr" className="flex items-end gap-1 h-2/3">{[30, 45, 52, 64, 78, 96].map((h, i) => <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i === 5 ? C.erp : "rgba(77,141,255,.4)" }} />)}</div></div>
  ) : (
    <div className="absolute inset-0 bg-[#1d1640] flex items-center gap-[2px] px-3">{Array.from({ length: 20 }).map((_, i) => <span key={i} className="wave flex-1 rounded" style={{ background: C.elite, animationDelay: `${i * 70}ms` }} />)}</div>
  );

/** Caption bar — sits under the scene so it never covers the product. */
const Caption = ({ id, accent, eyebrow, title, children }: { id: string; accent: string; eyebrow: string; title: string; children?: React.ReactNode }) => (
  <div data-c={id} className="copy absolute z-30 bottom-0 inset-x-0 bg-[#0A1026]/95 border-t border-white/10 text-white">
    <div className="max-w-6xl mx-auto px-5 py-3 md:py-4 flex flex-col md:flex-row md:items-center gap-2 md:gap-6">
      <div className="flex-1">
        <p className="text-xs font-bold latin" style={{ color: accent }}>{eyebrow}</p>
        <h2 className="text-lg md:text-2xl font-black leading-tight">{title}</h2>
      </div>
      {children}
    </div>
  </div>
);

const Bridge = ({ id, text }: { id: string; text: string }) => (
  <p data-b={id} className="bridge absolute z-30 top-[11vh] md:top-[12vh] inset-x-0 text-center px-6 text-lg md:text-2xl font-black text-white/90 opacity-0 invisible">{text}</p>
);

export default function UnifyStoryLanding() {
  const root = useRef<HTMLDivElement>(null);
  const endRef = useRef<number>(0);
  const [reduced, setReduced] = useState(false);
  const [service, setService] = useState("Unify Studio");

  useEffect(() => {
    document.title = "Unify — من أول انطباع، لكل خطوة نمو";
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useLayoutEffect(() => {
    if (reduced || !root.current) return;
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add({ desk: "(min-width: 768px)", mob: "(max-width: 767px)" }, (c) => {
        const desk = !!c.conditions?.desk;
        const q = gsap.utils.selector(root);
        const copies = q(".copy") as HTMLElement[];
        const setActive = (id: string) =>
          copies.forEach((el) => {
            const on = el.dataset.c === id;
            el.toggleAttribute("inert", !on);
            el.style.pointerEvents = on ? "auto" : "none";
          });

        gsap.set(q(".copy"), { autoAlpha: 0 });
        gsap.set(q("[data-l=studio]"), { autoAlpha: 0 });
        gsap.set(q("[data-l=erp],[data-l=elite]"), { autoAlpha: 0 });
        gsap.set(q("[data-s=img]"), { scale: 2.6, transformOrigin: "55% 40%" });
        gsap.set(q("[data-s=info],[data-s=nav]"), { autoAlpha: 0, y: 30 });
        gsap.set(q("[data-e=sale],[data-e=stock],[data-e=fin],[data-v]"), { autoAlpha: 0, y: 80, scale: 0.92 });
        gsap.set(q("[data-e=grow]"), { autoAlpha: 0, y: 10 });
        gsap.set(q("[data-e=bars]"), { scaleY: 0.4 });
        gsap.set(q(".mini"), { autoAlpha: 0, y: 60 });
        gsap.set(q(".uend"), { autoAlpha: 0, scale: 0.8 });

        const slot = desk
          ? { left: "8%", top: "20%", width: "42%", height: "68%" }
          : { left: "6%", top: "17%", width: "88%", height: "40%" };
        const back = { autoAlpha: 0.25, scale: 0.86, y: desk ? -60 : -40, duration: 0.5 };

        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut" },
          scrollTrigger: {
            trigger: q(".stage")[0],
            start: "top top",
            end: desk ? "+=700%" : "+=480%",
            pin: true,
            scrub: 0.8,
            onRefresh: (st) => { endRef.current = st.end; },
            onUpdate: (st) => {
              const t = st.progress * tl.duration();
              let cur = "intro";
              ["intro", "studio", "erp", "elite", "all"].forEach((k) => { if (tl.labels[k] !== undefined && t >= tl.labels[k] - 0.2) cur = k; });
              setActive(cur);
            },
          },
        });

        tl.addLabel("intro")
          // opening: U mark + hero give way to a macro of the weave
          .to(q(".hero"), { y: -80, autoAlpha: 0, duration: 0.8 })
          .to(q(".ustart"), { scale: 6, autoAlpha: 0, duration: 1 }, "<")
          .to(q("[data-l=studio]"), { autoAlpha: 1, duration: 0.6 }, "<0.3")
          .to(q("[data-s=img]"), { scale: 1.9, duration: 1 })
          .addLabel("studio")
          // pull back: the fabric becomes a product on a crafted store page
          .to(q("[data-s=img]"), { scale: 1, ...slot, borderRadius: 18, duration: 1.6 })
          .to(q("[data-s=nav]"), { autoAlpha: 1, y: 0, duration: 0.5 }, "<0.7")
          .to(q("[data-s=info]"), { autoAlpha: 1, y: 0, duration: 0.7 }, "<0.2")
          .to(q(".copy[data-c=studio]"), { autoAlpha: 1, duration: 0.4 }, "<0.3")
          .to({}, { duration: 0.8 })
          // Studio page recedes; the ERP workspace appears behind it
          .to(q(".copy[data-c=studio]"), { autoAlpha: 0, duration: 0.3 })
          .to(q("[data-l=erp]"), { autoAlpha: 1, duration: 0.6 }, "<")
          .to(q("[data-l=studio]"), { scale: 0.42, x: desk ? "-28vw" : 0, y: desk ? "8vh" : "-30vh", borderRadius: 24, autoAlpha: 0.9, duration: 1.1 }, "<")
          .to(q(".bridge[data-b=erp]"), { autoAlpha: 1, duration: 0.3 }, "<0.4")
          .to(q("[data-e=sale]"), { autoAlpha: 1, y: 0, scale: 1, duration: 0.8 }, "<0.3")
          .to(q("[data-l=studio]"), { autoAlpha: 0, duration: 0.6 })
          .addLabel("erp")
          .to(q(".bridge[data-b=erp]"), { autoAlpha: 0, duration: 0.3 }, "<")
          .to(q(".copy[data-c=erp]"), { autoAlpha: 1, duration: 0.4 }, "<")
          .to({}, { duration: 0.5 })
          .to(q("[data-e=sale]"), back)
          .to(q("[data-e=stock]"), { autoAlpha: 1, y: 0, scale: 1, duration: 0.7 }, "<")
          .to({}, { duration: 0.5 })
          .to(q("[data-e=sale]"), { autoAlpha: 0, duration: 0.3 })
          .to(q("[data-e=stock]"), back, "<")
          .to(q("[data-e=fin]"), { autoAlpha: 1, y: 0, scale: 1, duration: 0.7 }, "<")
          // growth shot: numbers climb, the business needs people
          .to(q("[data-e=bars]"), { scaleY: 1, duration: 0.8 })
          .to(q("[data-e=grow]"), { autoAlpha: 1, y: 0, duration: 0.4 }, "<0.4")
          .to({}, { duration: 0.5 })
          // → Elite
          .to(q(".copy[data-c=erp]"), { autoAlpha: 0, duration: 0.3 })
          .to(q(".bridge[data-b=elite]"), { autoAlpha: 1, duration: 0.3 }, "<")
          .to(q("[data-e=stock]"), { autoAlpha: 0, duration: 0.3 }, "<")
          .to(q("[data-e=fin]"), back, "<")
          .to(q("[data-l=elite]"), { autoAlpha: 1, duration: 0.8 })
          .to(q("[data-v=brief]"), { autoAlpha: 1, y: 0, scale: 1, duration: 0.7 }, "<0.2")
          .to(q("[data-l=erp]"), { autoAlpha: 0, duration: 0.4 })
          .addLabel("elite")
          .to(q(".bridge[data-b=elite]"), { autoAlpha: 0, duration: 0.3 }, "<")
          .to(q(".copy[data-c=elite]"), { autoAlpha: 1, duration: 0.4 }, "<")
          .to({}, { duration: 0.5 })
          .to(q("[data-v=brief]"), back)
          .to(q("[data-v=talk]"), { autoAlpha: 1, y: 0, scale: 1, duration: 0.7 }, "<")
          .to({}, { duration: 0.5 })
          .to(q("[data-v=brief]"), { autoAlpha: 0, duration: 0.3 })
          .to(q("[data-v=talk]"), back, "<")
          .to(q("[data-v=report]"), { autoAlpha: 1, y: 0, scale: 1, duration: 0.7 }, "<")
          .to({}, { duration: 0.6 })
          // closing: the scenes settle into three clickable frames under the U
          .to(q(".copy[data-c=elite]"), { autoAlpha: 0, duration: 0.3 })
          .to(q("[data-l=elite]"), { autoAlpha: 0, duration: 0.7 }, "<")
          .addLabel("all")
          .to(q(".uend"), { autoAlpha: 1, scale: 1, duration: 0.7 }, "<0.2")
          .to(q(".mini"), { autoAlpha: 1, y: 0, stagger: 0.15, duration: 0.7 }, "<0.2")
          .to(q(".copy[data-c=all]"), { autoAlpha: 1, duration: 0.4 }, "<0.3")
          .to({}, { duration: 0.6 });

        setActive("intro");
        const refresh = () => ScrollTrigger.refresh();
        window.addEventListener("load", refresh);
        document.fonts?.ready.then(refresh);
        return () => window.removeEventListener("load", refresh);
      });
    }, root);
    return () => ctx.revert();
  }, [reduced]);

  const goContact = (s: string) => {
    setService(s);
    document.getElementById("contact")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
  };

  /** "Browse solutions" = jump to the closing frames (or the static list in reduced mode). */
  const goSolutions = () => {
    if (reduced || !endRef.current) {
      document.getElementById("solutions")?.scrollIntoView({ behavior: "auto" });
      return;
    }
    window.scrollTo({ top: endRef.current, behavior: "auto" });
  };

  const pick = (p: Product) => (p.internal ? null : goContact(p.name));

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const msg = `مرحبا Unify 👋\nالاسم: ${f.get("name")}\nالتواصل: ${f.get("contact")}\nوصف المشروع: ${f.get("type")}\nالخدمة: ${f.get("service")}`;
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  };

  const btn = (p: Product, label?: string) =>
    p.internal ? (
      <Link to={p.to} className="inline-block px-6 py-3 rounded-xl font-extrabold text-sm text-center" style={{ background: p.accent, color: C.navy }}>{label ?? p.action}</Link>
    ) : (
      <button onClick={() => goContact(p.name)} className="px-6 py-3 rounded-xl font-extrabold text-sm" style={{ background: p.accent, color: C.navy }}>{label ?? p.action}</button>
    );

  const [studio, erp, elite] = PRODUCTS;

  return (
    <div ref={root} dir="rtl" style={{ fontFamily: "'Cairo', sans-serif", background: C.navy, color: "#fff" }} className="min-h-screen overflow-x-clip">
      <style>{`.latin{font-family:'Poppins','Montserrat',sans-serif}
        .wave{height:30%;animation:uw 1.1s ease-in-out infinite alternate}
        @keyframes uw{to{height:100%}}
        @media (prefers-reduced-motion: reduce){.wave{animation:none;height:50%}}`}</style>

      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-[#0A1026]/80 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center gap-6">
          <img src={LOGO_WHITE} alt="Unify" className="h-14 w-auto -my-2" />
          <nav className="hidden md:flex items-center gap-5 text-sm text-white/70">
            {PRODUCTS.map((p) => <button key={p.id} onClick={goSolutions} className="latin hover:text-white">{p.name.replace("Unify ", "")}</button>)}
            <button onClick={goSolutions} className="hover:text-white">تصفّح الحلول مباشرة</button>
          </nav>
          <Link to="/auth" className="text-sm font-extrabold px-4 py-2 rounded-lg" style={{ background: C.erp, color: C.navy }}>دخول ERP</Link>
          <button onClick={goSolutions} className="md:hidden text-xs text-white/70">الحلول</button>
        </div>
      </header>

      {reduced ? (
        <main className="pt-24 max-w-5xl mx-auto px-5 space-y-24 pb-16">
          <section className="text-center"><h1 className="text-4xl font-black">من أول انطباع، لكل خطوة نمو</h1><p className="mt-4 text-white/70">مواقع تحكي قصتك. نظام يدير أعمالك. وذكاء اصطناعي يساعدك تختار فريقك.</p></section>
          {[{ p: studio, t: "خلّي أول زيارة إلها أثر.", L: StudioScene }, { p: erp, t: "شوف الصورة كاملة.", L: ErpScene }, { p: elite, t: "تعرّف على المرشح، أبعد من السيرة الذاتية.", L: EliteScene }].map(({ p, t, L }) => (
            <section key={p.id} className="space-y-5"><h2 className="text-3xl font-black" style={{ color: p.accent }}>{t}</h2>
              <div className="relative h-[520px] rounded-2xl overflow-hidden border [&_[data-s=img]]:!w-[45%] [&_[data-s=img]]:!h-[70%] [&_[data-s=img]]:!top-[22%] [&_[data-s=img]]:!left-[5%]" style={{ borderColor: p.accent }}><L /></div>{btn(p)}</section>
          ))}
          <section id="solutions" className="grid gap-4 md:grid-cols-3">
            {PRODUCTS.map((p) => (
              <div key={p.id} className="rounded-2xl border p-6 flex flex-col gap-3" style={{ borderColor: p.accent + "66" }}>
                <h3 className="latin text-xl font-black">{p.name}</h3><p className="text-white/70 text-sm flex-1">{p.line}</p>{btn(p)}
              </div>
            ))}
          </section>
        </main>
      ) : (
        <section className="stage relative h-screen overflow-hidden">
          <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 65%, ${C.studio}1f, transparent 60%)` }} />

          {/* opening */}
          <UMark className="ustart absolute left-1/2 top-[52%] md:top-[50%] -translate-x-1/2 w-40 md:w-56 opacity-80" />
          <div className="hero absolute z-30 inset-x-0 top-24 md:top-28 text-center px-5">
            <h1 className="text-3xl md:text-6xl font-black leading-tight">من أول انطباع، لكل خطوة نمو</h1>
            <p className="mt-3 text-white/70 text-sm md:text-lg">مواقع تحكي قصتك. نظام يدير أعمالك. وذكاء اصطناعي يساعدك تختار فريقك.</p>
            <p className="mt-[34vh] md:mt-[30vh] text-xs text-white/40">مرّر لتبدأ القصة ↓</p>
          </div>

          <StudioScene />
          <ErpScene />
          <EliteScene />

          <Bridge id="erp" text="ووراء كل واجهة مميزة… إدارة تمسك التفاصيل." />
          <Bridge id="elite" text="ولما تكبر الفكرة… بتحتاج ناس تكبر معها." />

          <Caption id="studio" accent={C.studio} eyebrow="Unify Studio" title="خلّي أول زيارة إلها أثر.">{btn(studio)}</Caption>
          <Caption id="erp" accent={C.erp} eyebrow="Unify ERP" title="بيع، مخزون، ومالية — كل التفاصيل قدامك.">{btn(erp)}</Caption>
          <Caption id="elite" accent={C.elite} eyebrow="Unify Elite" title="تعرّف على المرشح، أبعد من السيرة الذاتية.">{btn(elite)}</Caption>

          {/* closing: three clickable frames under the U */}
          <div data-c="all" className="copy absolute inset-0 z-30 flex flex-col items-center justify-center px-4 pt-16">
            <UMark className="uend w-10 md:w-14 mb-3" />
            <h2 className="text-2xl md:text-5xl font-black text-center">حلول مختلفة. وراءها Unify.</h2>
            <div className="mt-8 grid grid-cols-3 gap-3 md:gap-6 w-full max-w-4xl">
              {PRODUCTS.map((p) => {
                const inner = (
                  <>
                    <div className="relative h-[16vh] md:h-[26vh] rounded-b-[40%] overflow-hidden border-2" style={{ borderColor: p.accent }}><Thumb id={p.id} /></div>
                    <p className="latin font-black mt-3 text-sm md:text-xl">{p.name}</p>
                    <p className="hidden md:block text-sm text-white/60 mt-1">{p.line}</p>
                    <span className="inline-block mt-2 md:mt-3 text-xs md:text-sm font-bold" style={{ color: p.accent }}>{p.action} ←</span>
                  </>
                );
                return p.internal ? (
                  <Link key={p.id} to={p.to} className="mini block text-center hover:-translate-y-1 transition-transform">{inner}</Link>
                ) : (
                  <button key={p.id} onClick={() => pick(p)} className="mini block text-center hover:-translate-y-1 transition-transform">{inner}</button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section id="contact" style={{ background: C.light, color: C.navy }} className="py-24">
        <div className="max-w-3xl mx-auto px-5 text-center">
          <img src={studioNavy.url} alt="Unify Studio" className="h-14 mx-auto mb-6" />
          <h2 className="text-3xl md:text-5xl font-black leading-tight">عجبك اللي شفته؟ خلّينا نحكي قصة مشروعك.</h2>
          <form onSubmit={submit} className="mt-10 grid gap-3 text-right">
            <input name="name" required placeholder="الاسم" className="h-12 px-4 rounded-xl border border-black/15 bg-white" />
            <input name="contact" required placeholder="رقم الهاتف أو البريد" className="h-12 px-4 rounded-xl border border-black/15 bg-white" />
            <input name="type" placeholder="احكيلنا باختصار عن مشروعك" className="h-12 px-4 rounded-xl border border-black/15 bg-white" />
            <select name="service" value={service} onChange={(e) => setService(e.target.value)} className="h-12 px-4 rounded-xl border border-black/15 bg-white">
              {PRODUCTS.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
            <button className="h-12 rounded-xl font-extrabold" style={{ background: C.navy, color: "#fff" }}>ابدأ مشروعك مع Unify</button>
            <p className="text-xs text-black/50 text-center">بيفتحلك واتساب برسالة جاهزة — ما في إرسال تلقائي.</p>
          </form>
        </div>
      </section>

      <footer className="py-8 text-center text-xs text-white/50">
        <span className="latin">© {new Date().getFullYear()} Unify</span> · <Link to="/privacy" className="hover:text-white">الخصوصية</Link> · <Link to="/terms" className="hover:text-white">الشروط</Link>
      </footer>
    </div>
  );
}
