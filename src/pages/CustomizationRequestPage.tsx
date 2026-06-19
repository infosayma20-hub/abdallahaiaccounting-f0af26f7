import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Check, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

const sectorOptions = [
  "تجارة تجزئة", "جملة", "مطعم", "شركة خدمات",
  "عيادة/مركز طبي", "شركة مقاولات", "متجر إلكتروني", "أخرى",
];

const changeOptions = [
  "إضافة حقول جديدة للنماذج",
  "إضافة تقارير/لوحات تحكم جديدة",
  "تكاملات (واتساب، SMS، بريد إلكتروني، Odoo، Excel)",
  "قواعد عملات متعددة",
  "تخصيص نقاط البيع",
  "قواعد بنكية للمتجر الإلكتروني",
  "سير عمل موافقات مخصص",
];

const CustomizationRequestPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [sector, setSector] = useState("");
  const [customSector, setCustomSector] = useState("");
  const [changes, setChanges] = useState<string[]>([]);
  const [priority, setPriority] = useState("عادي");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toggleChange = (c: string) => {
    setChanges((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const finalSector = sector === "أخرى" ? customSector : sector;
      const { error } = await supabase.from("support_tickets").insert({
        user_id: dataOwnerId!,
        title: `طلب تخصيص — ${finalSector}`,
        description,
        sector: finalSector,
        priority,
        status: "جديدة",
        requested_changes: changes,
      });
      if (error) throw error;
      toast({ title: "✅ تم إرسال الطلب بنجاح", description: "سنتواصل معك قريباً" });
      navigate("/support/tickets");
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [
    { label: "القطاع", done: !!sector },
    { label: "التعديلات", done: changes.length > 0 },
    { label: "الأولوية", done: true },
    { label: "التفاصيل", done: true },
  ];

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto" dir="rtl">
      <div className="flex items-center gap-2">
        <button onClick={() => window.history.length > 2 ? navigate(-1) : navigate("/customization")} className="p-1.5 rounded-lg hover:bg-muted">
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">طلب تخصيص</h1>
          <p className="text-xs text-muted-foreground">معالج خطوة بخطوة</p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`text-xs ${i <= step ? "text-foreground font-medium" : "text-muted-foreground"} hidden sm:inline`}>{s.label}</span>
            {i < steps.length - 1 && <div className="w-6 h-px bg-border" />}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          {/* Step 0: Sector */}
          {step === 0 && (
            <>
              <p className="text-sm font-bold text-foreground">اختر قطاعك</p>
              <div className="grid grid-cols-2 gap-2">
                {sectorOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSector(s)}
                    className={`p-3 rounded-xl border text-sm text-right transition-all ${sector === s ? "border-primary bg-primary/5 font-bold" : "border-border hover:border-primary/50"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {sector === "أخرى" && (
                <Input value={customSector} onChange={(e) => setCustomSector(e.target.value)} placeholder="اسم القطاع..." />
              )}
              <Button onClick={() => setStep(1)} disabled={!sector || (sector === "أخرى" && !customSector)} className="w-full">التالي</Button>
            </>
          )}

          {/* Step 1: Changes */}
          {step === 1 && (
            <>
              <p className="text-sm font-bold text-foreground">ما التعديلات المطلوبة؟</p>
              <div className="space-y-3">
                {changeOptions.map((c) => (
                  <div key={c} className="flex items-center gap-3">
                    <Checkbox checked={changes.includes(c)} onCheckedChange={() => toggleChange(c)} id={c} />
                    <Label htmlFor={c} className="text-sm cursor-pointer">{c}</Label>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(0)}>السابق</Button>
                <Button onClick={() => setStep(2)} disabled={changes.length === 0} className="flex-1">التالي</Button>
              </div>
            </>
          )}

          {/* Step 2: Priority */}
          {step === 2 && (
            <>
              <p className="text-sm font-bold text-foreground">الأولوية</p>
              <div className="flex gap-3">
                {["عادي", "عاجل"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    className={`flex-1 p-4 rounded-xl border text-center transition-all ${priority === p ? "border-primary bg-primary/5 font-bold" : "border-border hover:border-primary/50"}`}
                  >
                    {p === "عاجل" ? "🔴 عاجل" : "🟢 عادي"}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>السابق</Button>
                <Button onClick={() => setStep(3)} className="flex-1">التالي</Button>
              </div>
            </>
          )}

          {/* Step 3: Details & Submit */}
          {step === 3 && (
            <>
              <p className="text-sm font-bold text-foreground">تفاصيل إضافية</p>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="اشرح التعديلات المطلوبة بالتفصيل..."
                rows={4}
              />

              {/* Summary */}
              <div className="p-4 rounded-xl bg-muted/50 space-y-2">
                <p className="text-xs font-bold text-muted-foreground">ملخص الطلب</p>
                <p className="text-sm"><strong>القطاع:</strong> {sector === "أخرى" ? customSector : sector}</p>
                <p className="text-sm"><strong>الأولوية:</strong> {priority}</p>
                <div className="flex flex-wrap gap-1.5">
                  {changes.map((c) => <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>)}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>السابق</Button>
                <Button onClick={handleSubmit} disabled={submitting} className="flex-1">
                  {submitting ? "جاري الإرسال..." : "إرسال الطلب"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomizationRequestPage;
