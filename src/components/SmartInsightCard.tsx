import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface SmartInsightCardProps {
  expenses: number;
  revenue: number;
  transactionCount: number;
}

const SmartInsightCard = ({ expenses, revenue, transactionCount }: SmartInsightCardProps) => {
  // Generate a simple insight based on data
  const getInsight = () => {
    if (transactionCount === 0) return "ابدأ بتسجيل أول عملية لتحصل على تحليلات ذكية 🚀";
    if (expenses > revenue && revenue > 0) {
      const pct = Math.round(((expenses - revenue) / revenue) * 100);
      return `⚠️ المصروفات تتجاوز الإيرادات بنسبة ${pct}% — حاول تقليل النفقات`;
    }
    if (revenue > expenses && expenses > 0) {
      const margin = Math.round(((revenue - expenses) / revenue) * 100);
      return `✅ هامش ربحك ${margin}% — أداء مالي جيد، استمر!`;
    }
    if (expenses > 0 && revenue === 0) return "💡 لديك مصروفات فقط — سجّل إيراداتك لتحليل أفضل";
    return `📊 لديك ${transactionCount} عملية مسجّلة — استمر في التسجيل للحصول على تقارير أدق`;
  };

  return (
    <Card className="border-0 shadow-sm overflow-hidden bg-gradient-to-l from-primary/5 via-background to-accent/10">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-primary/10 flex-shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-primary mb-1">💡 ملاحظة ذكية اليوم</p>
            <p className="text-sm text-foreground leading-relaxed">{getInsight()}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SmartInsightCard;
