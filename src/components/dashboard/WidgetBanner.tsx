/**
 * WidgetBanner — small navy banner for dashboard card titles.
 * Matches the PageHeader style: navy bg, light-blue top border, white text.
 */
interface WidgetBannerProps {
  title: string;
  icon?: string;
  children?: React.ReactNode;
}

export default function WidgetBanner({ title, icon, children }: WidgetBannerProps) {
  return (
    <div className="mb-4 -mx-5 -mt-5 rounded-t-2xl overflow-hidden" style={{ borderTop: "3px solid #5B9BD5" }}>
      <div className="flex items-center justify-between px-5 py-2.5" style={{ backgroundColor: "#1B3A5C" }}>
        <h3 className="text-[13px] font-normal text-white flex items-center gap-1.5">
          {icon && <span>{icon}</span>}
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}
