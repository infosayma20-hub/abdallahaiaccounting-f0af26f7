import { Link } from "react-router-dom";
import { ReactNode, useEffect } from "react";

interface Props {
  children: ReactNode;
  title: string;
  description: string;
  canonical?: string;
}

/**
 * Lightweight public shell used by /features, /blog, /blog/:slug.
 * Mirrors landing nav/footer styling without re-importing the heavy LandingPage.
 */
const MarketingShell = ({ children, title, description, canonical }: Props) => {
  useEffect(() => {
    document.title = title;
    const setMeta = (name: string, content: string, attr: "name" | "property" = "name") => {
      let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta("description", description);
    setMeta("og:title", title, "property");
    setMeta("og:description", description, "property");
    if (canonical) {
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.setAttribute("rel", "canonical");
        document.head.appendChild(link);
      }
      link.setAttribute("href", canonical);
    }
  }, [title, description, canonical]);

  return (
    <div
      dir="rtl"
      className="bg-[#fafbfc] text-[#0D1B2E] min-h-screen"
      style={{ fontFamily: "'Cairo', sans-serif" }}
    >
      <style>{`.font-latin{font-family:'DM Sans',sans-serif;}`}</style>
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-[#e8ecf1] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-2xl font-black tracking-tight">أموالي</Link>
          <div className="hidden md:flex items-center gap-6 font-bold text-sm text-[#0D1B2E]/70">
            <Link to="/features" className="hover:text-[#3b82f6]">الميزات</Link>
            <Link to="/blog" className="hover:text-[#3b82f6]">المدوّنة</Link>
            <Link to="/#pricing" className="hover:text-[#3b82f6]">الأسعار</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="text-sm font-bold hidden sm:inline">دخول</Link>
            <Link
              to="/auth?mode=signup"
              className="bg-[#3b82f6] text-white px-4 py-2 rounded-xl text-sm font-extrabold hover:bg-blue-600 shadow-md shadow-blue-500/20"
            >
              ابدأ مجاناً
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-24">{children}</main>

      <footer className="bg-[#0D1B2E] text-white/40 mt-24 pt-16 pb-8 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-10">
          <div className="max-w-xs">
            <div className="text-2xl font-black text-white mb-3">أموالي</div>
            <p className="font-bold text-sm leading-relaxed">
              نظام محاسبة ونقاط بيع وذكاء اصطناعي للشركات الفلسطينية.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-10 text-sm">
            <FCol title="المنتج" links={[["الميزات","/features"],["الأسعار","/#pricing"]]} />
            <FCol title="موارد" links={[["المدوّنة","/blog"],["مركز المساعدة","/help"]]} />
            <FCol title="قانوني" links={[["الخصوصية","/privacy"],["الشروط","/terms"]]} />
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-12 pt-6 border-t border-white/5 text-xs font-bold flex justify-between">
          <span>© {new Date().getFullYear()} أموالي</span>
          <span className="font-latin">Made in Palestine</span>
        </div>
      </footer>
    </div>
  );
};

const FCol = ({ title, links }: { title: string; links: [string, string][] }) => (
  <div className="flex flex-col gap-2">
    <span className="text-white font-black mb-1">{title}</span>
    {links.map(([l, h]) => (
      <Link key={l} to={h} className="hover:text-white">{l}</Link>
    ))}
  </div>
);

export default MarketingShell;