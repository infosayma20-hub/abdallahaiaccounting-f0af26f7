/**
 * TextWidget — ملاحظة نصية / عنوان قسم على اللوحة.
 * Config: { text: string, align?: "right" | "center" | "left", size?: "sm" | "md" | "lg" }
 */
interface Props {
  config: any;
  title?: string | null;
}

export default function TextWidget({ config, title }: Props) {
  const text = config?.text || title || "اكتب نصاً...";
  const align = config?.align || "right";
  const size = config?.size || "md";
  const sizeClass = size === "lg" ? "text-lg" : size === "sm" ? "text-xs" : "text-sm";
  return (
    <div className="h-full w-full p-4 rounded-2xl bg-gradient-to-br from-primary/5 to-transparent border border-border/30 flex items-center"
         style={{ justifyContent: align === "center" ? "center" : align === "left" ? "flex-start" : "flex-end" }}>
      <p className={`${sizeClass} font-semibold text-foreground whitespace-pre-wrap`}>{text}</p>
    </div>
  );
}
