import { useState, useRef } from "react";
import { FileText, Upload, Loader2, X, FileImage, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface ParsedResult {
  type: string;
  summary: string;
  items?: { description: string; amount: number; date?: string }[];
  totalAmount?: number;
  vendor?: string;
  suggestions?: string[];
}

const DocumentReader = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ParsedResult | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.size > 10 * 1024 * 1024) {
      toast({ title: "خطأ", description: "الحد الأقصى لحجم الملف 10 ميغابايت", variant: "destructive" });
      return;
    }

    setFile(selected);
    setResult(null);

    if (selected.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target?.result as string);
      reader.readAsDataURL(selected);
    } else {
      setPreview(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file || !user) return;
    setAnalyzing(true);

    try {
      // Convert file to base64
      const base64 = await fileToBase64(file);

      const { data, error } = await supabase.functions.invoke("analyze-document", {
        body: {
          fileData: base64,
          fileName: file.name,
          fileType: file.type,
          userId: user.id,
        },
      });

      if (error) throw error;

      setResult(data as ParsedResult);
    } catch (err: any) {
      toast({
        title: "خطأ في التحليل",
        description: err.message || "تعذر تحليل الوثيقة",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="bg-card rounded-2xl p-6 space-y-4 shadow-card">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-teal-500/10 flex items-center justify-center">
          <FileText className="h-4 w-4 text-teal-500" />
        </div>
        <div>
          <span className="text-sm font-bold text-foreground">قارئ الوثائق</span>
          <Badge className="mr-2 bg-teal-500/10 text-teal-600 dark:text-teal-400 border-0 text-[9px] px-1.5">📄 AI</Badge>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        ارفع فاتورة، كشف بنك، أو أي وثيقة مالية — والذكاء الاصطناعي يحللها لك
      </p>

      {/* Upload area */}
      {!file ? (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full border-2 border-dashed border-muted-foreground/20 rounded-xl p-8 flex flex-col items-center gap-3 hover:border-primary/40 hover:bg-primary/5 transition-all"
        >
          <Upload className="h-8 w-8 text-muted-foreground/40" />
          <div className="text-center">
            <p className="text-xs font-medium text-foreground">اسحب ملف هنا أو اضغط للرفع</p>
            <p className="text-[10px] text-muted-foreground mt-1">PDF, صورة، أو Excel — حد أقصى 10MB</p>
          </div>
        </button>
      ) : (
        <div className="space-y-3">
          {/* File preview */}
          <div className="flex items-center gap-3 bg-secondary/40 rounded-xl p-3">
            {preview ? (
              <img src={preview} alt="preview" className="w-12 h-12 rounded-lg object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-teal-500/10 flex items-center justify-center">
                <FileImage className="h-5 w-5 text-teal-500" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{file.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {(file.size / 1024).toFixed(0)} KB — {file.type || "ملف"}
              </p>
            </div>
            <button onClick={handleClear} className="p-1.5 rounded-lg hover:bg-secondary/80 text-muted-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Analyze button */}
          {!result && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  جاري التحليل...
                </>
              ) : (
                <>
                  <FileText className="h-3.5 w-3.5" />
                  حلل الوثيقة
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-bold text-foreground">نتائج التحليل</span>
          </div>

          <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
            {result.vendor && (
              <p className="text-[11px] text-muted-foreground">
                <span className="font-bold text-foreground">الجهة: </span>{result.vendor}
              </p>
            )}
            <p className="text-[11px] text-foreground leading-relaxed whitespace-pre-line">{result.summary}</p>

            {result.items && result.items.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-muted-foreground">البنود:</span>
                {result.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-card rounded-lg px-3 py-2">
                    <span className="text-[11px] text-foreground truncate">{item.description}</span>
                    <span className="text-[11px] font-bold text-foreground tabular-nums">
                      {item.amount.toLocaleString("en-US")}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {result.totalAmount !== undefined && (
              <div className="flex items-center justify-between bg-primary/5 rounded-lg px-3 py-2 border border-primary/15">
                <span className="text-[11px] font-bold text-foreground">الإجمالي</span>
                <span className="text-sm font-bold text-primary tabular-nums">
                  {result.totalAmount.toLocaleString("en-US")}
                </span>
              </div>
            )}
          </div>

          {result.suggestions && result.suggestions.length > 0 && (
            <div className="bg-teal-500/5 border border-teal-500/15 rounded-xl p-3 space-y-2">
              <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400">💡 اقتراحات:</span>
              {result.suggestions.map((s, i) => (
                <p key={i} className="text-[11px] text-muted-foreground flex gap-1.5">
                  <span className="text-teal-500">•</span> {s}
                </p>
              ))}
            </div>
          )}

          <button
            onClick={handleClear}
            className="w-full py-2 rounded-xl bg-secondary text-xs text-foreground font-medium hover:bg-secondary/80 transition-all"
          >
            تحليل وثيقة أخرى
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf,.xlsx,.xls,.csv"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // Remove data:... prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default DocumentReader;
