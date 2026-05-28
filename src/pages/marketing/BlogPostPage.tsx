import { Link, useParams, Navigate } from "react-router-dom";
import MarketingShell from "./MarketingShell";
import { getPostBySlug, blogPosts } from "@/data/blogPosts";
import { useEffect } from "react";

const BlogPostPage = () => {
  const { slug } = useParams();
  const post = slug ? getPostBySlug(slug) : undefined;

  useEffect(() => {
    if (!post) return;
    const ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      author: { "@type": "Organization", name: "أموالي AMWALI" },
      publisher: { "@type": "Organization", name: "أموالي AMWALI" },
    });
    ld.id = "blog-jsonld";
    document.head.appendChild(ld);
    return () => { document.getElementById("blog-jsonld")?.remove(); };
  }, [post]);

  if (!post) return <Navigate to="/blog" replace />;

  const related = blogPosts.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <MarketingShell
      title={`${post.title} | مدوّنة أموالي`}
      description={post.description}
      canonical={`https://amwali.app/blog/${post.slug}`}
    >
      <article className="px-6 py-12">
        <div className="max-w-3xl mx-auto">
          <Link to="/blog" className="text-sm font-bold text-[#3b82f6] mb-6 inline-block">← العودة للمدوّنة</Link>
          <div className="inline-block bg-[#e8ecf1] px-3 py-1 rounded-full text-xs font-black mb-4">
            {post.category}
          </div>
          <h1 className="text-3xl md:text-5xl font-black leading-tight mb-6">{post.title}</h1>
          <div className="flex items-center gap-3 text-sm font-bold text-[#0D1B2E]/50 mb-10">
            <span className="font-latin">{new Date(post.date).toLocaleDateString("ar-PS")}</span>
            <span>•</span>
            <span>{post.readMinutes} دقائق قراءة</span>
          </div>
          <div className="h-64 md:h-80 rounded-3xl mb-12" style={{ background: post.cover }} />
          <div className="space-y-6 text-lg leading-loose">
            {post.body.map((b, i) => {
              if (b.type === "h2") return <h2 key={i} className="text-2xl md:text-3xl font-black mt-10 mb-2">{b.text}</h2>;
              if (b.type === "h3") return <h3 key={i} className="text-xl font-black mt-6 mb-1">{b.text}</h3>;
              if (b.type === "p") return <p key={i} className="text-[#0D1B2E]/80 font-medium">{b.text}</p>;
              if (b.type === "ul") return (
                <ul key={i} className="list-disc pr-6 space-y-2 text-[#0D1B2E]/80 font-medium">
                  {b.items?.map((it, j) => <li key={j}>{it}</li>)}
                </ul>
              );
              if (b.type === "callout") return (
                <div key={i} className="bg-[#3b82f6]/10 border-r-4 border-[#3b82f6] rounded-2xl p-5 text-[#0D1B2E] font-bold">
                  💡 {b.text}
                </div>
              );
              return null;
            })}
          </div>
          <div className="mt-16 bg-[#0D1B2E] text-white rounded-3xl p-8 md:p-10 text-center">
            <h3 className="text-2xl md:text-3xl font-black mb-3">جرّب أموالي مجاناً ١٤ يوم</h3>
            <p className="text-white/60 font-bold mb-6">منصّة متكاملة لإدارة شركتك الفلسطينية</p>
            <Link
              to="/auth?mode=signup"
              className="inline-block bg-[#3b82f6] text-white px-8 py-3.5 rounded-2xl font-black hover:bg-blue-600 transition-all"
            >
              ابدأ الآن
            </Link>
          </div>
          {related.length > 0 && (
            <div className="mt-20">
              <h3 className="text-2xl font-black mb-6">اقرأ أيضاً</h3>
              <div className="grid md:grid-cols-2 gap-6">
                {related.map((p) => (
                  <Link key={p.slug} to={`/blog/${p.slug}`} className="block bg-white border border-[#e8ecf1] rounded-2xl p-5 hover:border-[#3b82f6] transition-all">
                    <div className="text-xs font-black text-[#3b82f6] mb-2">{p.category}</div>
                    <h4 className="font-black leading-snug">{p.title}</h4>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>
    </MarketingShell>
  );
};

export default BlogPostPage;