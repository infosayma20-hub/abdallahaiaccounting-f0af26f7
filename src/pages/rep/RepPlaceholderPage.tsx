import { Construction } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function RepPlaceholderPage({ title }: { title: string }) {
  const navigate = useNavigate();
  return (
    <div dir="rtl" className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="w-20 h-20 rounded-full bg-amber-500/10 flex items-center justify-center ring-1 ring-amber-500/30">
        <Construction className="w-10 h-10 text-amber-500" />
      </div>
      <h2 className="text-xl font-bold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-xs">
        هذه الميزة قيد التطوير وسيتم إطلاقها قريباً بإذن الله.
      </p>
      <Button variant="outline" onClick={() => navigate("/rep/home")}>
        رجوع للرئيسية
      </Button>
    </div>
  );
}
