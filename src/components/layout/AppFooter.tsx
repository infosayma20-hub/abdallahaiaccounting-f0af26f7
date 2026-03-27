import { Link } from "react-router-dom";

const AppFooter = () => {
  const year = new Date().getFullYear();

  return (
    <footer
      className="mt-auto"
      dir="rtl"
      style={{
        borderTop: "1px solid #F3F4F6",
        padding: "24px 0 16px",
        textAlign: "center",
        fontSize: 12,
        color: "#9CA3AF",
      }}
    >
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
        <span>QOYOD © {year}</span>
        <span className="hidden sm:inline" style={{ color: "#D1D5DB" }}>|</span>
        <div className="flex items-center gap-3">
          <Link to="/terms" className="hover:text-foreground transition-colors">
            أحكام وشروط الاستخدام
          </Link>
          <span style={{ color: "#D1D5DB" }}>|</span>
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            سياسة الخصوصية
          </Link>
          <span style={{ color: "#D1D5DB" }}>|</span>
          <Link to="/support-tickets" className="hover:text-foreground transition-colors">
            الأسئلة الشائعة
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default AppFooter;
