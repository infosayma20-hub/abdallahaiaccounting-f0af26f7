/**
 * PageHeader — Qoyod-style navy banner for page titles.
 * Usage: <PageHeader title="شجرة الحسابات" breadcrumb={["المحاسبة", "شجرة الحسابات"]} />
 */
interface PageHeaderProps {
  title: string;
  breadcrumb?: string[];
}

export default function PageHeader({ title, breadcrumb }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {breadcrumb && breadcrumb.length > 0 && (
        <p className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1 justify-end flex-wrap">
          {breadcrumb.map((item, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1 text-muted-foreground/40">/</span>}
              <span className={i === breadcrumb.length - 1 ? "text-foreground font-medium" : ""}>{item}</span>
            </span>
          ))}
        </p>
      )}
      <div
        className="rounded-xl px-6 py-4"
        style={{
          background: "linear-gradient(135deg, hsl(var(--navy)) 0%, hsl(var(--finix-navy-light)) 100%)",
        }}
      >
        <h1 className="text-lg font-bold text-white text-right" style={{ fontFamily: "Tajawal, sans-serif" }}>
          {title}
        </h1>
      </div>
    </div>
  );
}
