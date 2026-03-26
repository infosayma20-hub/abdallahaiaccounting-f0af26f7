import { Link } from "react-router-dom";

const AppFooter = () => {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/30 bg-background mt-auto" dir="rtl">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 text-[12px] text-muted-foreground">
        <span>فينكس © {year}</span>
        <div className="flex items-center gap-4">
          <Link to="/terms" className="hover:text-primary transition-colors">
            أحكام وشروط الاستخدام
          </Link>
          <Link to="/privacy" className="hover:text-primary transition-colors">
            سياسة الخصوصية
          </Link>
          <Link to="/support-tickets" className="hover:text-primary transition-colors">
            الأسئلة الشائعة
          </Link>
        </div>
        <span className="text-muted-foreground/60">العربية</span>
      </div>
    </footer>
  );
};

export default AppFooter;
