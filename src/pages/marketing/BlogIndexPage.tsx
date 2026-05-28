import { Link } from "react-router-dom";
import MarketingShell from "./MarketingShell";
import { blogPosts } from "@/data/blogPosts";

const BlogIndexPage = () => (
  <MarketingShell
    title="مدوّنة أموالي | محاسبة وضرائب وأعمال في فلسطين"
    description="مقالات ودلائل عملية حول ضريبة القيمة المضافة، نقاط البيع، الذكاء الاصطناعي في المحاسبة، وإدارة الأعمال الصغيرة والمتوسطة في فلسطين."
    canonical="https://amwali.app/blog"
  >
    <section className="px-6 py-16">
      <div className="max-w-5xl mx-auto">
        <div className="mb-12">
          <h1 className="text-4xl md:text-6xl font-black mb-4">المدوّنة</h1>
          <p className="text-lg text-[#0D1B2E]/60 font-medium">
            دلائل عملية ومحتوى ذو قيمة لأصحاب الأعمال الفلسطينيين.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-8">
          {blogPosts.map((p) => (
            <Link
              key={p.slug}
              to={`/blog/${p.slug}`}
              className="group bg-white border border-[#e8ecf1] rounded-3xl overflow-hidden hover:shadow-2xl hover:shadow-blue-500/10 hover:-translate-y-1 transition-all"
            >
              <div className="h-48 relative" style={{ background: p.cover }}>
                <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur px-3 py-1 rounded-full text-xs font-black text-[#0D1B2E]">
                  {p.category}
                </div>
              </div>
              <div className="p-6">
                <h2 className="text-xl font-black mb-3 leading-snug group-hover:text-[#3b82f6] transition-colors">
                  {p.title}
                </h2>
                <p className="text-sm text-[#0D1B2E]/60 font-medium leading-relaxed mb-4 line-clamp-2">
                  {p.description}
                </p>
                <div className="flex items-center gap-3 text-xs font-bold text-[#0D1B2E]/40">
                  <span className="font-latin">{new Date(p.date).toLocaleDateString("ar-PS")}</span>
                  <span>•</span>
                  <span>{p.readMinutes} دقائق قراءة</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  </MarketingShell>
);

export default BlogIndexPage;