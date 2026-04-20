/**
 * InsightsWidget — رؤى ذكية متعددة النقاط، يستخدم نفس edge function (mode=insights).
 */
import { useEffect, useState } from "react";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  config: any;
  title?: string | null;
}

export default function InsightsWidget({ config, title }: Props) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("dashboard-brief", {
        body: { period: config?.period || "month", mode: "insights" },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setContent(data.content);
    } catch (e: any) {
      setError(e.message || "تعذر توليد الرؤى");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInsights(); }, [config?.period]);

  return (
    <div className="h-full bg-card border border-border rounded-2xl p-4 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3 widget-no-drag">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <h4 className="text-sm font-bold text-foreground truncate">{title || "رؤى ذكية"}</h4>
        </div>
        <button
          onClick={fetchInsights}
          disabled={loading}
          className="p-1 rounded hover:bg-muted text-muted-foreground"
          title="تحديث"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto text-sm leading-relaxed">
        {loading && !content ? (
          <div className="space-y-2">
            <div className="h-3 bg-muted rounded animate-pulse" />
            <div className="h-3 bg-muted rounded animate-pulse w-5/6" />
            <div className="h-3 bg-muted rounded animate-pulse w-4/6" />
          </div>
        ) : error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <div className="text-foreground/90 whitespace-pre-line">{content}</div>
        )}
      </div>
    </div>
  );
}
