/**
 * DailyBriefBanner — لافتة ملخص يومي ذكي بالعربية أعلى لوحة المعلومات.
 */
import { useEffect, useState } from "react";
import { Sparkles, Loader2, RefreshCw, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  storageKey?: string;
}

export default function DailyBriefBanner({ storageKey = "dashboard-brief" }: Props) {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = `${storageKey}-${new Date().toISOString().slice(0, 10)}`;

  const fetchBrief = async (force = false) => {
    if (!force) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) { setContent(cached); return; }
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("dashboard-brief", {
        body: { period: "today", mode: "brief" },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setContent(data.content);
      localStorage.setItem(cacheKey, data.content);
    } catch (e: any) {
      setError(e.message || "تعذر توليد الملخص");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBrief(false); }, []);

  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-l from-primary/5 via-primary/[0.02] to-transparent p-4 mb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground">ملخص اليوم</h3>
            <p className="text-[10px] text-muted-foreground">رؤية سريعة بالذكاء الاصطناعي</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => fetchBrief(true)} disabled={loading} title="تحديث">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCollapsed(c => !c)} title={collapsed ? "عرض" : "إخفاء"}>
            {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-3">
          {loading && !content ? (
            <div className="space-y-2">
              <div className="h-3 bg-muted rounded animate-pulse w-full" />
              <div className="h-3 bg-muted rounded animate-pulse w-5/6" />
              <div className="h-3 bg-muted rounded animate-pulse w-3/4" />
            </div>
          ) : error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : (
            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">{content}</p>
          )}
        </div>
      )}
    </div>
  );
}
