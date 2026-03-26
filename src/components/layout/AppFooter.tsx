import { Link } from "react-router-dom";

const AppFooter = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/20 mt-auto pt-6 pb-4" dir="rtl">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2 text-[12px] text-muted-foreground">
        <span>QOYOD © {year}</span>
        <span className="hidden sm:inline text-border">|</span>
        <div className="flex items-center gap-3">
          <Link to="/terms" className="hover:text-foreground transition-colors">
            أحكام وشروط الاستخدام
          </Link>
          <span className="text-border">|</span>
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            سياسة الخصوصية
          </Link>
          <span className="text-border">|</span>
          <Link to="/support-tickets" className="hover:text-foreground transition-colors">
            الأسئلة الشائعة
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default AppFooter;
