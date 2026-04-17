import { Loader2 } from "lucide-react";

interface PageLoaderProps {
  /** Optional loading message shown under the spinner */
  message?: string;
  /** Use full-screen height instead of inline section height */
  fullScreen?: boolean;
}

/**
 * Unified loading indicator across all modules.
 * Uses the standard primary spinner (orange/brand accent in light/dark).
 */
const PageLoader = ({ message, fullScreen = false }: PageLoaderProps) => {
  const heightClass = fullScreen ? "min-h-[60vh]" : "py-20";
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${heightClass}`}
      dir="rtl"
    >
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      {message && (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
    </div>
  );
};

export default PageLoader;
