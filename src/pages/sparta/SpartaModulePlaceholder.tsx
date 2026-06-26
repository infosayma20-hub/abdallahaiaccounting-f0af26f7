import { useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";

/**
 * Phase 1 module wrapper:
 * Reuses Amwali pages (Products / Invoices / Contacts / Inventory) under Sparta theming.
 * Until we wire each route to the actual component in the next iteration, this card
 * forwards the user to the equivalent Amwali page while keeping the Sparta shell.
 */
export default function SpartaModulePlaceholder({
  title,
  description,
  amwaliRoute,
  amwaliLabel = "افتح الوحدة الكاملة",
}: {
  title: string;
  description: string;
  amwaliRoute: string;
  amwaliLabel?: string;
}) {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto">
      <button onClick={() => navigate("/sparta")} className="text-sm text-muted-foreground mb-4 flex items-center gap-1 hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> الرئيسية
      </button>
      <div className="bg-card border rounded-2xl p-8 text-center">
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{description}</p>
        <button
          onClick={() => (window.location.href = amwaliRoute)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-medium text-white"
          style={{ background: "var(--gradient-sparta)" }}
        >
          {amwaliLabel}
          <ExternalLink className="h-4 w-4" />
        </button>
        <p className="text-[11px] text-muted-foreground mt-4">
          يتم تشغيل الوحدة باستخدام محرك أموالي مع تطبيق ثيم سبارتا تلقائياً.
        </p>
      </div>
    </div>
  );
}