import { useEffect, useLayoutEffect, useRef, useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import fabric from "@/assets/studio/fabric.jpg";
import studioWhite from "@/assets/studio/studio-white-green.png.asset.json";
import unifyLogo from "@/assets/unify-logo-vertical-official.png.asset.json";

gsap.registerPlugin(ScrollTrigger);

/** Unify parent-brand scroll story — one pinned stage, one continuous U-frame. */

// TODO: official WhatsApp number not supplied yet (placeholder from the old landing).
const WHATSAPP = "970599000000";

const C = { navy: "#0A1026", studio: "#28D98B", erp: "#4D8DFF", elite: "#9B7AFF", light: "#F4F7F6" };

type Product = { id: string; name: string; line: string; accent: string; to: string; action: string; internal?: boolean };
/** Directory is generated from this list — add products here. */
const PRODUCTS: Product[] = [
  { id: "studio", name: "Unify Studio", line: "مواقع ومتاجر تحكي قصة منتجك.", accent: C.studio, to: "#contact", action: "بدي موقع بهالمستوى" },
  { id: "erp", name: "Unify ERP", line: "محاسبة، نقاط بيع، مخزون وموارد بشرية بنظام واحد.", accent: C.erp, to: "/solutions/erp", action: "استكشف Unify ERP", internal: true },
  // No Elite app URL supplied — routes to the inquiry form.
  { id: "elite", name: "Unify Elite", line: "مقابلات وتقارير مدعومة بالذكاء الاصطناعي.", accent: C.elite, to: "#contact", action: "استكشف Unify Elite" },
];

const Demo = () => (
  <span className="absolute top-3 left-3 z-20 text-[10px] font-bold px-2 py-0.5 rounded bg-white/15 backdrop-blur text-white/80">عرض توضيحي</span>
);

const Btn = ({ p, label }: { p: Product; label?: string }) =>
  p.internal ? (
    <Link to={p.to} className="inline-block px-6 py-3 rounded-xl font-extrabold text-sm" style={{ background: p.accent, color: C.navy }}>{label ?? p.action}</Link>
  ) : (
    <a href={p.to} className="inline-block px-6 py-3 rounded-xl font-extrabold text-sm" style={{ background: p.accent, color: C.navy }}>{label ?? p.action}</a>
  );

/* ---------- inner compositions of the frame ---------- */

const StudioLayer = () => (
  <div data-l="studio" className="absolute inset-0 bg-[#f5f1ea] text-[#1b1b1b]">
    <Demo />
    <div data-s="nav" className="absolute top-0 inset-x-0 h-12 flex items-center justify-between px-6 text-xs font-bold border-b border-black/10 bg-[#f5f1ea]">
      <span className="latin tracking-[0.3em]">ATELIER · DEMO</span><span className="opacity-60">المجموعة · القصة · السلة (1)</span>
    </div>
    <img data-s="img" src={fabric} alt="قماش — صورة منتج توضيحية" className="absolute object-cover" style={{ inset: 0, width: "100%", height: "100%" }} />
    <div data-s="info" className="absolute inset-x-5 bottom-4 md:inset-x-auto md:top-20 md:bottom-8 md:right-8 md:w-[38%] flex flex-col justify-center gap-1.5 md:gap-3">
      <span className="text-[11px] tracking-widest opacity-60 latin">SS / 26</span>
      <h4 className="text-2xl md:text-3xl font-black leading-tight">وشاح كتّان منسوج يدوياً</h4>
      <p className="hidden md:block text-sm opacity-70">خيوط طبيعية، ألوان ترابية، وقصة كل قطعة مكتوبة على بطاقتها.</p>
      <div className="flex gap-2 mt-1">{["#c9a27a", "#6b7d5c", "#2f3a4a"].map((c) => <span key={c} className="w-5 h-5 rounded-full border border-black/20" style={{ background: c }} />)}</div>
      <span className="font-black text-lg latin">₪ 240</span>
      <span className="self-start px-5 py-2 rounded-full text-xs font-bold bg-[#1b1b1b] text-[#f5f1ea]">أضف للسلة</span>
    </div>
  </div>
);

const ErpLayer = () => (
  <div data-l="erp" className="absolute inset-0 bg-[#0d1733] text-white flex">
    <Demo />
    <aside className="w-14 md:w-44 border-l border-white/10 p-3 hidden sm:flex flex-col gap-3 text-xs text-white/60">
      <span className="latin font-black text-white">Unify ERP</span>
      {["نقطة البيع", "المخزون", "المالية", "الموارد البشرية"].map((t) => <span key={t}>{t}</span>)}
    </aside>
    <div className="flex-1 relative p-4 md:p-6 grid grid-cols-3 gap-3">
      <div data-e="sale" className="rounded-xl bg-white/5 border border-white/10 p-4 col-span-1">
        <p className="text-[11px] text-white/50">عملية بيع</p>
        <p className="font-black mt-1">فاتورة #1024</p>
        {[["وشاح كتّان", "240"], ["شنطة قماش", "180"]].map(([n, v]) => <div key={n} className="flex justify-between text-xs mt-2 text-white/80"><span>{n}</span><span className="latin">₪{v}</span></div>)}
        <div className="flex justify-between font-black mt-3 pt-2 border-t border-white/10"><span>المجموع</span><span className="latin">₪420</span></div>
      </div>
      <div data-e="stock" className="rounded-xl bg-white/5 border border-white/10 p-4 col-span-1">
        <p className="text-[11px] text-white/50">المخزون</p>
        {[["وشاح كتّان", 72], ["شنطة قماش", 38], ["مفرش", 15]].map(([n, v]) => (
          <div key={n as string} className="mt-3 text-xs"><div className="flex justify-between"><span>{n}</span><span className="latin">{v}</span></div>
            <div className="h-1.5 mt-1 rounded bg-white/10"><div className="h-full rounded" style={{ width: `${v}%`, background: C.erp }} /></div></div>
        ))}
      </div>
      <div data-e="fin" className="rounded-xl bg-white/5 border border-white/10 p-4 col-span-1">
        <p className="text-[11px] text-white/50">نظرة مالية</p>
        <div className="flex items-end gap-1.5 h-24 mt-3">{[40, 55, 35, 70, 62, 85, 78].map((h, i) => <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i === 5 ? C.erp : "rgba(77,141,255,.35)" }} />)}</div>
        <p className="text-xs text-white/60 mt-3">الإيرادات والمصاريف بمكان واحد</p>
      </div>
      <p className="col-span-3 text-[11px] text-white/40 self-end">أرقام توضيحية — مش بيانات حقيقية.</p>
    </div>
  </div>
);

const EliteLayer = () => (
  <div data-l="elite" className="absolute inset-0 bg-[#140f2e] text-white p-4 md:p-6 grid grid-cols-3 gap-3">
    <Demo />
    <div data-v="brief" className="rounded-xl bg-white/5 border border-white/10 p-4">
      <p className="text-[11px] text-white/50">الوصف الوظيفي</p>
      <p className="font-black mt-1">مسؤول/ة مبيعات</p>
      <ul className="text-xs text-white/70 mt-3 space-y-1.5 list-disc pr-4"><li>تواصل مع العملاء</li><li>متابعة الطلبات</li><li>خبرة سنتين</li></ul>
    </div>
    <div data-v="talk" className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col">
      <p className="text-[11px] text-white/50">مقتطف مقابلة (توضيحي)</p>
      <div className="flex items-center gap-[3px] h-10 my-3" aria-hidden>
        {Array.from({ length: 28 }).map((_, i) => <span key={i} className="wave flex-1 rounded" style={{ background: C.elite, animationDelay: `${i * 60}ms` }} />)}
      </div>
      <p className="text-xs text-white/60">س: احكيلنا عن عميل صعب تعاملت معه.</p>
      <p className="text-xs mt-2">ج: سمعت مشكلته أول، وبعدين عرضت عليه حلّين…</p>
    </div>
    <div data-v="report" className="rounded-xl bg-white/5 border border-white/10 p-4">
      <p className="text-[11px] text-white/50">تقرير حسب المعايير</p>
      {[["التواصل", 82, "أمثلة واضحة ومحددة"], ["حل المشكلات", 74, "منهجية منطقية"], ["الخبرة", 60, "أقل من المطلوب قليلاً"]].map(([n, v, w]) => (
        <div key={n as string} className="mt-3 text-xs"><div className="flex justify-between"><span>{n}</span><span className="latin">{v}</span></div>
          <div className="h-1.5 mt-1 rounded bg-white/10"><div className="h-full rounded" style={{ width: `${v}%`, background: C.elite }} /></div>
          <p className="text-[10px] text-white/50 mt-1">{w}</p></div>
      ))}
      <p className="text-[10px] text-white/40 mt-3">مساعدة للقرار — القرار لفريقك.</p>
    </div>
  </div>
);

/* ---------- copy overlays ---------- */
const Copy = ({ id, eyebrow, title, body, children, accent }: { id: string; eyebrow?: string; title: string; body?: string; children?: React.ReactNode; accent: string }) => (
  <div data-c={id} className="copy absolute z-30 inset-x-0 bottom-6 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:right-10 md:left-auto md:w-[30%] px-6 md:px-0 text-center md:text-right">
    {eyebrow && <p className="text-sm font-bold mb-2" style={{ color: accent }}>{eyebrow}</p>}
    <h2 className="text-2xl md:text-4xl font-black leading-tight">{title}</h2>
    {body && <p className="mt-3 text-white/70 text-sm md:text-base">{body}</p>}
    {children && <div className="mt-5">{children}</div>}
  </div>
);

export default function UnifyStoryLanding() {
  const root = useRef<HTMLDivElement>(null);
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
        gsap.set(q("[data-l=erp],[data-l=elite]"), { autoAlpha: 0 });
        gsap.set(q("[data-s=img]"), { scale: 1.6 });
        gsap.set(q("[data-s=info],[data-s=nav]"), { autoAlpha: 0, y: 30 });
        gsap.set(q("[data-e],[data-v]"), { autoAlpha: 0.15, y: 40 });
        gsap.set(q(".mini"), { autoAlpha: 0, y: 60 });

        const frameStart = desk ? { width: "46vw", height: "56vh", top: "30vh" } : { width: "84vw", height: "34vh", top: "48vh" };
        const frameStage = desk ? { width: "58vw", height: "76vh", top: "12vh" } : { width: "92vw", height: "52vh", top: "8vh" };
        gsap.set(q(".frame"), { ...frameStart, xPercent: -50, left: "50%", borderColor: C.studio });

        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut" },
          scrollTrigger: {
            trigger: q(".stage")[0],
            start: "top top",
            end: desk ? "+=650%" : "+=420%",
            pin: true,
            scrub: 0.8,
            onUpdate: (st) => {
              const l = st.labels ?? {};
              const t = st.progress * tl.duration();
              const order = ["intro", "studio", "erp", "elite", "all"];
              let cur = "intro";
              order.forEach((k) => { if (tl.labels[k] !== undefined && t >= tl.labels[k] - 0.3) cur = k; });
              void l;
              setActive(cur);
            },
          },
        });

        tl.addLabel("intro")
          .to(q(".hero"), { y: -120, autoAlpha: 0, duration: 1 })
          .to(q(".frame"), { ...frameStage, borderRadius: "28px", duration: 1.2 }, "<")
          .addLabel("studio")
          .to(q(".copy[data-c=studio]"), { autoAlpha: 1, duration: 0.4 }, "<0.6")
          .to(q("[data-s=img]"), desk ? { scale: 1, width: "56%", height: "80%", top: "15%", left: "4%", duration: 1.4 } : { scale: 1, height: "55%", top: "12%", duration: 1.4 })
          .to(q("[data-s=nav]"), { autoAlpha: 1, y: 0, duration: 0.5 }, "<0.5")
          .to(q("[data-s=info]"), { autoAlpha: 1, y: 0, duration: 0.7 }, "<0.2")
          .to(q(".frame"), { scale: desk ? 0.88 : 0.94, duration: 0.8 })
          .to({}, { duration: 0.6 })
          // bridge → ERP
          .to(q(".copy[data-c=studio]"), { autoAlpha: 0, duration: 0.3 })
          .to(q(".bridge[data-b=erp]"), { autoAlpha: 1, duration: 0.3 }, "<")
          .to(q(".frame"), { scale: 1, width: desk ? "64vw" : "92vw", height: desk ? "66vh" : "56vh", borderRadius: "14px", borderColor: C.erp, duration: 1 })
          .to(q(".glow"), { background: `radial-gradient(circle at 50% 50%, ${C.erp}33, transparent 60%)`, duration: 1 }, "<")
          .to(q("[data-l=studio]"), { autoAlpha: 0, scale: 0.9, duration: 0.8 }, "<0.2")
          .to(q("[data-l=erp]"), { autoAlpha: 1, duration: 0.8 }, "<")
          .to(q(".bridge[data-b=erp]"), { autoAlpha: 0, duration: 0.3 })
          .addLabel("erp")
          .to(q(".copy[data-c=erp]"), { autoAlpha: 1, duration: 0.4 }, "<")
          .to(q("[data-e=sale]"), { autoAlpha: 1, y: 0, scale: 1.04, duration: 0.6 })
          .to({}, { duration: 0.5 })
          .to(q("[data-e=sale]"), { scale: 1, duration: 0.3 })
          .to(q("[data-e=stock]"), { autoAlpha: 1, y: 0, scale: 1.04, duration: 0.6 }, "<")
          .to({}, { duration: 0.5 })
          .to(q("[data-e=stock]"), { scale: 1, duration: 0.3 })
          .to(q("[data-e=fin]"), { autoAlpha: 1, y: 0, scale: 1.04, duration: 0.6 }, "<")
          .to({}, { duration: 0.6 })
          // bridge → Elite
          .to(q(".copy[data-c=erp]"), { autoAlpha: 0, duration: 0.3 })
          .to(q(".bridge[data-b=elite]"), { autoAlpha: 1, duration: 0.3 }, "<")
          .to(q(".frame"), { width: desk ? "52vw" : "88vw", height: desk ? "70vh" : "56vh", borderRadius: "40px 40px 50% 50% / 40px 40px 22% 22%", borderColor: C.elite, duration: 1 })
          .to(q(".glow"), { background: `radial-gradient(circle at 50% 50%, ${C.elite}33, transparent 60%)`, duration: 1 }, "<")
          .to(q("[data-l=erp]"), { autoAlpha: 0, duration: 0.7 }, "<0.2")
          .to(q("[data-l=elite]"), { autoAlpha: 1, duration: 0.7 }, "<")
          .to(q(".bridge[data-b=elite]"), { autoAlpha: 0, duration: 0.3 })
          .addLabel("elite")
          .to(q(".copy[data-c=elite]"), { autoAlpha: 1, duration: 0.4 }, "<")
          .to(q("[data-v=brief]"), { autoAlpha: 1, y: 0, duration: 0.5 })
          .to({}, { duration: 0.4 })
          .to(q("[data-v=talk]"), { autoAlpha: 1, y: 0, duration: 0.5 })
          .to({}, { duration: 0.4 })
          .to(q("[data-v=report]"), { autoAlpha: 1, y: 0, duration: 0.5 })
          .to({}, { duration: 0.6 })
          // pull back → complete picture in the U
          .to(q(".copy[data-c=elite]"), { autoAlpha: 0, duration: 0.3 })
          .to(q(".frame"), { scale: 0.35, top: desk ? "-4vh" : "0vh", autoAlpha: 0, duration: 1 })
          .to(q(".glow"), { background: `radial-gradient(circle at 50% 60%, ${C.studio}22, transparent 60%)`, duration: 1 }, "<")
          .addLabel("all")
          .to(q(".mini"), { autoAlpha: 1, y: 0, stagger: 0.15, duration: 0.7 }, "<0.4")
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

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const msg = `مرحبا Unify 👋\nالاسم: ${f.get("name")}\nالتواصل: ${f.get("contact")}\nوصف المشروع: ${f.get("type")}\nالخدمة: ${f.get("service")}`;
    window.open(`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  };

  const [studio, erp, elite] = PRODUCTS;

  return (
    <div ref={root} dir="rtl" style={{ fontFamily: "'Cairo', sans-serif", background: C.navy, color: "#fff" }} className="min-h-screen overflow-x-clip">
      <style>{`.latin{font-family:'Poppins','Montserrat',sans-serif}
        .wave{height:30%;animation:uw 1.1s ease-in-out infinite alternate}
        @keyframes uw{to{height:100%}}
        @media (prefers-reduced-motion: reduce){.wave{animation:none;height:50%}}`}</style>

      {/* persistent nav */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-[#0A1026]/70 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-5 h-16 flex items-center gap-5">
          <img src={unifyLogo.url} alt="Unify" className="h-10 w-auto" />
          <nav className="hidden md:flex items-center gap-5 text-sm text-white/70">
            {PRODUCTS.map((p) => <a key={p.id} href={`#dir-${p.id}`} className="latin hover:text-white">{p.name.replace("Unify ", "")}</a>)}
            <a href="#solutions" className="hover:text-white">تصفّح الحلول مباشرة</a>
          </nav>
          <Link to="/auth" className="text-sm font-extrabold px-4 py-2 rounded-lg" style={{ background: C.erp, color: C.navy }}>دخول ERP</Link>
          <a href="#solutions" className="md:hidden text-xs text-white/70">الحلول</a>
        </div>
      </header>

      {reduced ? (
        /* static readable chapters */
        <main className="pt-24 max-w-5xl mx-auto px-5 space-y-24 pb-16">
          <section className="text-center"><h1 className="text-4xl font-black">من أول انطباع، لكل خطوة نمو</h1><p className="mt-4 text-white/70">مواقع تحكي قصتك. نظام يدير أعمالك. وذكاء اصطناعي يساعدك تختار فريقك.</p></section>
          {[{ p: studio, t: "خلّي أول زيارة إلها أثر.", L: StudioLayer }, { p: erp, t: "شوف الصورة كاملة.", L: ErpLayer }, { p: elite, t: "تعرّف على المرشح، أبعد من السيرة الذاتية.", L: EliteLayer }].map(({ p, t, L }) => (
            <section key={p.id} className="space-y-5"><h2 className="text-3xl font-black" style={{ color: p.accent }}>{t}</h2>
              <div className="relative h-[420px] rounded-2xl overflow-hidden border" style={{ borderColor: p.accent }}><L /></div><Btn p={p} /></section>
          ))}
        </main>
      ) : (
        <section className="stage relative h-screen overflow-hidden">
          <div className="glow absolute inset-0" style={{ background: `radial-gradient(circle at 50% 60%, ${C.studio}22, transparent 60%)` }} />

          <div className="hero absolute z-30 inset-x-0 top-20 md:top-24 text-center px-5">
            <h1 className="text-3xl md:text-6xl font-black leading-tight">من أول انطباع، لكل خطوة نمو</h1>
            <p className="mt-3 text-white/70 text-sm md:text-lg">مواقع تحكي قصتك. نظام يدير أعمالك. وذكاء اصطناعي يساعدك تختار فريقك.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2 text-sm">
              {PRODUCTS.map((p) => <a key={p.id} href={`#dir-${p.id}`} className="latin px-4 py-2 rounded-full border" style={{ borderColor: p.accent + "88" }}>{p.name}</a>)}
              <Link to="/auth" className="px-4 py-2 rounded-full bg-white/10">دخول ERP</Link>
            </div>
            <p className="mt-4 text-xs text-white/40">مرّر لتبدأ القصة ↓</p>
          </div>

          <div className="frame absolute overflow-hidden border-2 z-10" style={{ borderRadius: "0 0 48% 48% / 0 0 26% 26%", boxShadow: "0 40px 120px -30px rgba(0,0,0,.7)" }}>
            <StudioLayer /><ErpLayer /><EliteLayer />
          </div>

          <div className="bridge absolute z-30 top-1/2 -translate-y-1/2 inset-x-0 text-center px-6 opacity-0 invisible" data-b="erp"><p className="text-2xl md:text-4xl font-black drop-shadow-lg">ووراء كل واجهة مميزة… إدارة تمسك التفاصيل.</p></div>
          <div className="bridge absolute z-30 top-1/2 -translate-y-1/2 inset-x-0 text-center px-6 opacity-0 invisible" data-b="elite"><p className="text-2xl md:text-4xl font-black drop-shadow-lg">ولما تكبر الفكرة… بتحتاج ناس تكبر معها.</p></div>

          <Copy id="studio" eyebrow="Unify Studio" accent={C.studio} title="خلّي أول زيارة إلها أثر." body="مواقع تحكي قصة منتجك، بحركة مدروسة وتجربة سهلة.">
            <button onClick={() => goContact("Unify Studio")} className="px-6 py-3 rounded-xl font-extrabold text-sm" style={{ background: C.studio, color: C.navy }}>بدي موقع بهالمستوى</button>
          </Copy>
          <Copy id="erp" eyebrow="Unify ERP" accent={C.erp} title="شوف الصورة كاملة." body="بيع، مخزون، ومالية — كل التفاصيل قدامك."><Btn p={erp} /></Copy>
          <Copy id="elite" eyebrow="Unify Elite" accent={C.elite} title="تعرّف على المرشح، أبعد من السيرة الذاتية." body="مقابلات وتقارير مدعومة بالذكاء الاصطناعي تساعد فريقك يتخذ قراره.">
            <button onClick={() => goContact("Unify Elite")} className="px-6 py-3 rounded-xl font-extrabold text-sm" style={{ background: C.elite, color: C.navy }}>استكشف Unify Elite</button>
          </Copy>

          {/* complete picture: three frames under one U */}
          <div className="absolute inset-x-0 top-[22vh] md:top-[26vh] z-20 flex justify-center gap-3 md:gap-6 px-4 pointer-events-none">
            {PRODUCTS.map((p, i) => (
              <div key={p.id} className="mini w-[28vw] md:w-[18vw] h-[20vh] md:h-[28vh] rounded-b-[40%] border-2 flex items-end justify-center pb-4 latin font-black text-sm md:text-lg"
                style={{ borderColor: p.accent, background: `linear-gradient(to top, ${p.accent}33, transparent)`, marginTop: i === 1 ? "4vh" : 0 }}>{p.name}</div>
            ))}
          </div>
          <div data-c="all" className="copy absolute z-30 inset-x-0 bottom-[14vh] text-center px-6">
            <h2 className="text-3xl md:text-5xl font-black">حلول مختلفة. وراءها Unify.</h2>
            <a href="#solutions" className="inline-block mt-4 text-sm underline text-white/70">تصفّح الحلول</a>
          </div>
        </section>
      )}

      {/* Scene 5 directory — generated from PRODUCTS */}
      <section id="solutions" className="max-w-6xl mx-auto px-5 py-24">
        <h2 className="text-3xl md:text-4xl font-black text-center mb-12">حلول مختلفة. وراءها Unify.</h2>
        <div className="grid gap-px md:grid-cols-[repeat(auto-fit,minmax(260px,1fr))] bg-white/10 border border-white/10">
          {PRODUCTS.map((p) => (
            <div key={p.id} id={`dir-${p.id}`} className="bg-[#0A1026] p-8 flex flex-col gap-4">
              <span className="h-1 w-10" style={{ background: p.accent }} />
              <h3 className="latin text-2xl font-black">{p.name}</h3>
              <p className="text-white/70 text-sm flex-1">{p.line}</p>
              {p.internal ? <Btn p={p} /> : <button onClick={() => goContact(p.name)} className="self-start px-6 py-3 rounded-xl font-extrabold text-sm" style={{ background: p.accent, color: C.navy }}>{p.action}</button>}
            </div>
          ))}
        </div>
      </section>

      {/* Scene 6 — light inquiry */}
      <section id="contact" style={{ background: C.light, color: C.navy }} className="py-24">
        <div className="max-w-3xl mx-auto px-5 text-center">
          <img src={studioWhite.url} alt="Unify Studio" className="h-12 mx-auto mb-6" />
          <h2 className="text-3xl md:text-5xl font-black leading-tight">عجبك اللي شفته؟ خلّينا نحكي قصة مشروعك.</h2>
          <form onSubmit={submit} className="mt-10 grid gap-3 text-right">
            <input name="name" required placeholder="الاسم" className="h-12 px-4 rounded-xl border border-black/15 bg-white" />
            <input name="contact" required placeholder="رقم الهاتف أو البريد" className="h-12 px-4 rounded-xl border border-black/15 bg-white" />
            <input name="type" placeholder="احكيلنا باختصار عن مشروعك" className="h-12 px-4 rounded-xl border border-black/15 bg-white" />
            <select name="service" value={service} onChange={(e) => setService(e.target.value)} className="h-12 px-4 rounded-xl border border-black/15 bg-white">
              {PRODUCTS.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
            <button className="h-12 rounded-xl font-extrabold" style={{ background: C.navy, color: "#fff" }}>ابدأ مشروعك مع Unify Studio</button>
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
