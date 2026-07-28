import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function SpartaMobilePlaceholder({ title }: { title: string }) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground p-5">
      <Link to="/sparta/m" className="text-sm text-primary flex items-center gap-1 mb-6">
        <ArrowRight className="h-4 w-4" /> الرئيسية
      </Link>
      <div className="bg-card border rounded-2xl p-8 text-center mt-12">
        <h1 className="text-xl font-bold mb-3">{title}</h1>
        <p className="text-sm text-muted-foreground">
          هذه الشاشة قيد التطوير ضمن Phase 1. سيتم وصلها بمحرك يونيفاي خلال الخطوة القادمة.
        </p>
      </div>
    </div>
  );
}