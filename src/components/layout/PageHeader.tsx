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
        <p className="text-[13px] text-muted-foreground mb-2 flex items-center gap-1 justify-end flex-wrap">
          {breadcrumb.map((item, i) => (
            <span key={i}>
              {i > 0 && <span className="mx-1 text-muted-foreground/40">/</span>}
              <span className={i === breadcrumb.length - 1 ? "text-foreground font-medium" : ""}>{item}</span>
            </span>
          ))}
        </p>
      )}
      <div className="w-full" style={{ borderTop: "3px solid #5B9BD5" }}>
        <div
          className="w-full px-6 py-4"
          style={{ backgroundColor: "#1B3A5C" }}
        >
          <h1
            className="text-right text-white"
            style={{
              fontFamily: "Tajawal, sans-serif",
              fontSize: "22px",
              fontWeight: 500,
            }}
          >
            {title}
          </h1>
        </div>
      </div>
    </div>
  );
}
