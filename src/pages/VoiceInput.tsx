import { useState } from "react";
import { Mic, MicOff, RotateCcw, ArrowRight, Check, Pencil, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

type RecordingState = "idle" | "recording" | "preview";

const VoiceInput = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<RecordingState>("idle");

  const mockTransaction = {
    debit: "مصروفات الكهرباء",
    credit: "الصندوق",
    amount: "₪500",
    description: "دفعت 500 شيكل كهرباء من الصندوق",
  };

  return (
    <div className="px-4 pt-6 min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <ArrowRight className="h-5 w-5 text-foreground" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">الإدخال الصوتي</h1>
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" />
            <p className="text-xs text-muted-foreground">مدعوم بالذكاء الاصطناعي</p>
          </div>
        </div>
      </div>

      {state !== "preview" ? (
        <div className="flex-1 flex flex-col items-center justify-center -mt-16">
          {/* Microphone Button */}
          <div className="relative mb-8">
            {state === "recording" && (
              <>
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse-ring" />
                <div className="absolute -inset-4 rounded-full bg-primary/10 animate-pulse-ring" style={{ animationDelay: "0.5s" }} />
              </>
            )}
            <button
              onClick={() => setState(state === "idle" ? "recording" : "preview")}
              className={`relative z-10 w-28 h-28 rounded-full flex items-center justify-center transition-all active:scale-95 ${
                state === "recording"
                  ? "bg-destructive text-destructive-foreground shadow-xl"
                  : "bg-primary text-primary-foreground shadow-lg"
              }`}
            >
              {state === "recording" ? (
                <MicOff className="h-10 w-10" />
              ) : (
                <Mic className="h-10 w-10" />
              )}
            </button>
          </div>

          {/* Sound Wave Animation */}
          {state === "recording" && (
            <div className="flex items-center gap-1.5 mb-6 h-10">
              {[...Array(7)].map((_, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full bg-primary"
                  style={{
                    animation: "sound-wave 0.8s ease-in-out infinite",
                    animationDelay: `${i * 0.1}s`,
                    height: "8px",
                  }}
                />
              ))}
            </div>
          )}

          {/* Instructions */}
          <p className="text-sm text-muted-foreground text-center max-w-xs leading-relaxed">
            {state === "idle"
              ? 'اضغط على الميكروفون وتحدث…\nمثال: "دفعت 500 شيكل كهرباء من الصندوق"'
              : "جارِ التسجيل… اضغط لإيقاف التسجيل"}
          </p>

          {/* Controls */}
          {state === "recording" && (
            <div className="flex gap-4 mt-8">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setState("idle")}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                إعادة
              </Button>
              <Button
                size="lg"
                onClick={() => setState("preview")}
                className="gap-2"
              >
                <MicOff className="h-4 w-4" />
                إيقاف
              </Button>
            </div>
          )}
        </div>
      ) : (
        /* Preview Screen */
        <div className="flex-1 space-y-4">
          <div className="text-center mb-6">
            <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">تم استخراج العملية بنجاح</p>
            <p className="text-xs text-muted-foreground mt-1">تحقق من التفاصيل قبل التأكيد</p>
          </div>

          {/* Extracted Transaction */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-5 space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">الحساب المدين</span>
                <span className="text-sm font-semibold text-foreground">{mockTransaction.debit}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">الحساب الدائن</span>
                <span className="text-sm font-semibold text-foreground">{mockTransaction.credit}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-xs text-muted-foreground">المبلغ</span>
                <span className="text-lg font-bold text-primary">{mockTransaction.amount}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-xs text-muted-foreground">الوصف</span>
                <span className="text-sm text-foreground">{mockTransaction.description}</span>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => setState("idle")}
            >
              <Pencil className="h-4 w-4" />
              تعديل يدوي
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={() => navigate("/")}
            >
              <Check className="h-4 w-4" />
              تأكيد العملية
            </Button>
          </div>

          {/* AI Notice */}
          <p className="text-[10px] text-center text-muted-foreground mt-4 flex items-center justify-center gap-1">
            <Sparkles className="h-3 w-3" />
            تم تحويل الصوت إلى قيد محاسبي باستخدام الذكاء الاصطناعي
          </p>
        </div>
      )}
    </div>
  );
};

export default VoiceInput;
