import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import useAppLanguage from "@/i18n/useAppLanguage";

const AppFooter = () => {
  const year = new Date().getFullYear();
  const { t } = useTranslation();
  const { meta } = useAppLanguage();

  return (
    <footer
      className="mt-auto"
      dir={meta.dir}
      style={{
        borderTop: "1px solid #F3F4F6",
        padding: "24px 0 16px",
        textAlign: "center",
        fontSize: 12,
        color: "#9CA3AF",
      }}
    >
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
        <span>Unify ERP © {year}</span>
        <span className="hidden sm:inline" style={{ color: "#D1D5DB" }}>|</span>
        <div className="flex items-center gap-3">
          <Link to="/terms" className="hover:text-foreground transition-colors">
            {t("common:footer.terms")}
          </Link>
          <span style={{ color: "#D1D5DB" }}>|</span>
          <Link to="/privacy" className="hover:text-foreground transition-colors">
            {t("common:footer.privacy")}
          </Link>
          <span style={{ color: "#D1D5DB" }}>|</span>
          <Link to="/help" className="hover:text-foreground transition-colors">
            {t("common:footer.help")}
          </Link>
          <span style={{ color: "#D1D5DB" }}>|</span>
          <Link to="/security" className="hover:text-foreground transition-colors">
            {t("common:footer.security")}
          </Link>
        </div>
      </div>
    </footer>
  );
};

export default AppFooter;
