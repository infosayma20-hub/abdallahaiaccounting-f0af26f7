import { Copy, X } from "lucide-react";
import { useState } from "react";

interface DuplicateBannerProps {
  sourceRef: string;
}

const DuplicateBanner = ({ sourceRef }: DuplicateBannerProps) => {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2.5 flex items-center justify-between" dir="rtl">
      <div className="flex items-center gap-2 text-sm">
        <Copy className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="text-amber-800 dark:text-amber-300">
          هذا مستند مشابه لـ <span className="font-bold font-mono">{sourceRef}</span> — راجع البيانات قبل الحفظ
        </span>
      </div>
      <button onClick={() => setVisible(false)} className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default DuplicateBanner;
