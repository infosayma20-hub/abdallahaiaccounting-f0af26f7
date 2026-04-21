import { useEffect, useRef, useState } from "react";
import { Sparkles, Wand2, Maximize2, Minimize2, Scale, Check, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

/**
 * EditableText — an inline-editable text block that lives inside the print preview.
 * - Click to edit (contentEditable)
 * - Floating mini-toolbar with AI actions (formal / expand / improve / shorten / legal)
 * - Emits onChange with the raw string. The print layout uses the same node, so
 *   the WYSIWYG edit IS what prints.
 *
 * The toolbar is wrapped in `.no-print` so it never appears in the print window.
 */

type AIMode = "formal" | "expand" | "improve" | "shorten" | "legal";

interface EditableTextProps {
  value: string;
  onChange: (next: string) => void;
  /** Tag to render — defaults to <p>. Use "span" for inline edits. */
  as?: "p" | "span" | "div";
  /** Optional context string sent to the AI (e.g. "عرض سعر للمشتريات"). */
  aiContext?: string;
  /** Disable editing (read-only preview). */
  disabled?: boolean;
  /** Inline styles passed through to the editable element. */
  style?: React.CSSProperties;
  /** Placeholder shown when value is empty. */
  placeholder?: string;
  /** Multiline mode (Enter inserts newline). Default true. */
  multiline?: boolean;
}

const MODE_META: Record<AIMode, { label: string; icon: typeof Wand2; tooltip: string }> = {
  improve: { label: "تحسين", icon: Wand2, tooltip: "تحسين الصياغة والإملاء" },
  formal: { label: "رسمي", icon: Sparkles, tooltip: "أسلوب رسمي مهني" },
  expand: { label: "توسيع", icon: Maximize2, tooltip: "نص أكثر تفصيلاً" },
  shorten: { label: "مختصر", icon: Minimize2, tooltip: "نص موجز" },
  legal: { label: "قانوني", icon: Scale, tooltip: "أسلوب قانوني للعقود" },
};

export default function EditableText({
  value,
  onChange,
  as = "p",
  aiContext,
  disabled,
  style,
  placeholder,
  multiline = true,
}: EditableTextProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loadingMode, setLoadingMode] = useState<AIMode | null>(null);
  const [originalBeforeAI, setOriginalBeforeAI] = useState<string | null>(null);

  // Keep the contentEditable's text in sync when value changes from outside
  // (e.g. AI replacement) — but NOT while the user is typing, to avoid caret jumps.
  useEffect(() => {
    if (!ref.current) return;
    if (document.activeElement === ref.current) return;
    if (ref.current.innerText !== value) {
      ref.current.innerText = value;
    }
  }, [value]);

  const Tag: any = as;

  const commitFromDom = () => {
    if (!ref.current) return;
    const next = ref.current.innerText;
    if (next !== value) onChange(next);
  };

  const runAI = async (mode: AIMode) => {
    const text = ref.current?.innerText?.trim() || value?.trim() || "";
    if (!text) {
      toast({ title: "لا يوجد نص لمعالجته", variant: "destructive" });
      return;
    }
    setLoadingMode(mode);
    setOriginalBeforeAI(text);
    try {
      const { data, error } = await supabase.functions.invoke("enhance-template-text", {
        body: { text, mode, context: aiContext },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const enhanced = (data?.text || "").trim();
      if (!enhanced) throw new Error("لم يتم إرجاع نص محسَّن");
      onChange(enhanced);
      if (ref.current) ref.current.innerText = enhanced;
      toast({ title: "✨ تم تحسين النص" });
    } catch (err: any) {
      toast({
        title: "تعذّر تحسين النص",
        description: err?.message || "حاول مرة أخرى",
        variant: "destructive",
      });
      setOriginalBeforeAI(null);
    } finally {
      setLoadingMode(null);
    }
  };

  const undoAI = () => {
    if (originalBeforeAI == null) return;
    onChange(originalBeforeAI);
    if (ref.current) ref.current.innerText = originalBeforeAI;
    setOriginalBeforeAI(null);
    toast({ title: "تم التراجع" });
  };

  if (disabled) {
    return (
      <Tag style={style}>
        {value || (placeholder ? <span style={{ color: "#9CA3AF" }}>{placeholder}</span> : null)}
      </Tag>
    );
  }

  return (
    <span style={{ position: "relative", display: as === "span" ? "inline-block" : "block" }}>
      <Tag
        ref={ref as any}
        contentEditable
        suppressContentEditableWarning
        dir="rtl"
        onFocus={() => setIsEditing(true)}
        onBlur={() => {
          commitFromDom();
          // Delay so toolbar click can register before we hide it
          setTimeout(() => setIsEditing(false), 200);
        }}
        onInput={commitFromDom}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (!multiline && e.key === "Enter") e.preventDefault();
        }}
        style={{
          ...style,
          outline: isEditing ? "2px dashed hsl(var(--primary))" : "none",
          outlineOffset: 2,
          borderRadius: 3,
          minHeight: "1em",
          cursor: "text",
          transition: "outline 0.15s",
        }}
      >
        {value}
      </Tag>

      {isEditing && (
        <span
          contentEditable={false}
          className="no-print"
          onMouseDown={(e) => e.preventDefault() /* keep focus on editor */}
          style={{
            position: "absolute",
            top: -38,
            right: 0,
            zIndex: 50,
            display: "inline-flex",
            gap: 2,
            background: "hsl(var(--popover))",
            color: "hsl(var(--popover-foreground))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            padding: 3,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {(Object.keys(MODE_META) as AIMode[]).map((mode) => {
            const meta = MODE_META[mode];
            const Icon = meta.icon;
            const isLoading = loadingMode === mode;
            return (
              <button
                key={mode}
                type="button"
                title={meta.tooltip}
                disabled={loadingMode !== null}
                onClick={() => runAI(mode)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  fontSize: 11,
                  fontWeight: 500,
                  background: "transparent",
                  border: "none",
                  borderRadius: 5,
                  cursor: loadingMode !== null ? "wait" : "pointer",
                  color: "inherit",
                  opacity: loadingMode !== null && !isLoading ? 0.5 : 1,
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (loadingMode === null) e.currentTarget.style.background = "hsl(var(--accent))";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Icon className="w-3 h-3" />
                )}
                {meta.label}
              </button>
            );
          })}

          {originalBeforeAI != null && (
            <>
              <span style={{ width: 1, background: "hsl(var(--border))", margin: "2px 4px" }} />
              <button
                type="button"
                title="التراجع عن آخر تحسين"
                onClick={undoAI}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  fontSize: 11,
                  fontWeight: 500,
                  background: "transparent",
                  border: "none",
                  borderRadius: 5,
                  cursor: "pointer",
                  color: "hsl(var(--destructive))",
                }}
              >
                <X className="w-3 h-3" /> تراجع
              </button>
            </>
          )}
        </span>
      )}
    </span>
  );
}