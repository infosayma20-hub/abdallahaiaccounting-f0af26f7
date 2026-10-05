import { useState, type ReactNode, type RefObject } from "react";
import { Search, Barcode, Printer, PauseCircle, ChefHat, FileText, MoreHorizontal, Sun, Moon, CircleStop } from "lucide-react";
import type { PosV2Tokens } from "./posV2Theme";
import { usePrinterOnline } from "./usePrinterOnline";
import BridgeStatusIndicator from "@/components/pos/BridgeStatusIndicator";

export type PosV2MenuItem = { key: string; label: string; icon?: ReactNode; onClick: () => void; danger?: boolean };

type Props = {
  t: PosV2Tokens;
  cashierName: string;
  shiftLine: string;
  logoUrl?: string | null;
  searchRef: RefObject<HTMLInputElement>;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  onSearchEnter: () => void;
  onCameraScan: () => void;
  heldCount: number;
  onHeld: () => void;
  showKitchen: boolean;
  onKitchen: () => void;
  notificationsNode: ReactNode;
  canInvoices: boolean;
  onInvoices: () => void;
  menuItems: PosV2MenuItem[];
  onToggleTheme: () => void;
  canCloseShift: boolean;
  onCloseShift: () => void;
};

function IconBtn({ t, label, badge, onClick, children }: { t: PosV2Tokens; label: string; badge?: number; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col items-center justify-center shrink-0"
      style={{ minWidth: 56, height: 52, borderRadius: 10, color: t.text, gap: 2 }}
      title={label}
    >
      {children}
      <span style={{ fontSize: 11, color: t.muted, fontWeight: 600 }}>{label}</span>
      {!!badge && badge > 0 && (
        <span
          className="absolute flex items-center justify-center"
          style={{ top: 2, insetInlineEnd: 8, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: t.accent, color: t.onAccent, fontSize: 10, fontWeight: 800 }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export default function POSv2TopBar(p: Props) {
  const { t } = p;
  const [menuOpen, setMenuOpen] = useState(false);
  const printerOnline = usePrinterOnline();

  return (
    <header
      dir="rtl"
      className="flex items-center gap-3 px-4 shrink-0"
      style={{ height: 68, background: t.surface, borderBottom: `1px solid ${t.border}`, color: t.text }}
    >
      {/* Right: brand + cashier */}
      <div className="flex items-center gap-2.5 shrink-0 min-w-0">
        {p.logoUrl ? (
          <img src={p.logoUrl} alt="" className="object-cover" style={{ width: 40, height: 40, borderRadius: 10 }} />
        ) : (
          <div className="flex items-center justify-center" style={{ width: 40, height: 40, borderRadius: 10, background: t.accent, color: t.onAccent, fontWeight: 800, fontSize: 20 }}>ي</div>
        )}
        <div className="min-w-0 leading-tight">
          <div className="truncate" style={{ fontSize: 14, fontWeight: 800, maxWidth: 180 }}>{p.cashierName}</div>
          {p.shiftLine && <div className="truncate" style={{ fontSize: 11, color: p.t.muted, maxWidth: 220 }}>{p.shiftLine}</div>}
        </div>
      </div>

      {/* Center: unified search */}
      <div className="flex-1 flex justify-center min-w-0">
        <div className="relative w-full" style={{ maxWidth: 520 }}>
          <Search className="absolute top-1/2 -translate-y-1/2 pointer-events-none" style={{ insetInlineStart: 14, width: 18, height: 18, color: t.muted }} />
          <input
            ref={p.searchRef}
            value={p.searchQuery}
            onChange={(e) => p.onSearchChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); p.onSearchEnter(); } }}
            placeholder="ابحث عن منتج أو امسح الباركود"
            className="w-full focus:outline-none"
            style={{ height: 46, borderRadius: 12, background: t.input, border: `1px solid ${t.border}`, color: t.text, paddingInlineStart: 42, paddingInlineEnd: 46, fontSize: 14 }}
          />
          <button
            type="button"
            onClick={p.onCameraScan}
            className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center"
            style={{ insetInlineEnd: 6, width: 36, height: 36, borderRadius: 8, color: t.muted }}
            title="مسح باركود بالكاميرا"
          >
            <Barcode style={{ width: 18, height: 18 }} />
          </button>
        </div>
      </div>

      {/* Left: printer pill + 5 buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {printerOnline === false && (
          <div className="flex items-center gap-1.5 shrink-0" style={{ height: 34, padding: "0 12px", borderRadius: 17, background: t.warnBg, color: t.warnText, fontSize: 12, fontWeight: 700 }}>
            <Printer style={{ width: 15, height: 15 }} />
            الطابعة غير متصلة
          </div>
        )}
        <IconBtn t={t} label="المعلّقة" badge={p.heldCount} onClick={p.onHeld}><PauseCircle style={{ width: 20, height: 20 }} strokeWidth={1.8} /></IconBtn>
        <IconBtn t={t} label={t.dark ? "فاتح" : "داكن"} onClick={p.onToggleTheme}>
          {t.dark ? <Sun style={{ width: 20, height: 20 }} strokeWidth={1.8} /> : <Moon style={{ width: 20, height: 20 }} strokeWidth={1.8} />}
        </IconBtn>
        {p.showKitchen && <IconBtn t={t} label="المطبخ" onClick={p.onKitchen}><ChefHat style={{ width: 20, height: 20 }} strokeWidth={1.8} /></IconBtn>}
        <div className="flex flex-col items-center justify-center shrink-0" style={{ minWidth: 56, height: 52, gap: 2 }} title="الطلبات والتنبيهات المعلقة">
          <div className="pos-v2-notif" style={{ color: t.text }}>{p.notificationsNode}</div>
          <span style={{ fontSize: 11, color: t.muted, fontWeight: 600 }}>التنبيهات</span>
        </div>
        <div className="flex flex-col items-center justify-center shrink-0" style={{ minWidth: 56, height: 52, gap: 2 }} title="حالة الطابعات">
          <div className="pos-v2-printer" style={{ color: t.text }}><BridgeStatusIndicator /></div>
          <span style={{ fontSize: 11, color: t.muted, fontWeight: 600 }}>الطابعات</span>
        </div>
        {p.canInvoices && <IconBtn t={t} label="الفواتير" onClick={p.onInvoices}><FileText style={{ width: 20, height: 20 }} strokeWidth={1.8} /></IconBtn>}
        <div className="relative">
          <IconBtn t={t} label="المزيد" onClick={() => setMenuOpen((v) => !v)}><MoreHorizontal style={{ width: 20, height: 20 }} strokeWidth={1.8} /></IconBtn>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div
                data-pos-v2-menu
                className="absolute z-50 py-1"
                style={{ top: "100%", insetInlineEnd: 0, marginTop: 6, minWidth: 240, borderRadius: 12, background: t.surface, border: `1px solid ${t.border}`, boxShadow: "0 12px 32px rgba(0,0,0,0.25)" }}
              >
                {p.menuItems.map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => { setMenuOpen(false); m.onClick(); }}
                    className="w-full flex items-center gap-2.5 text-right"
                    style={{ height: 44, padding: "0 14px", color: m.danger ? t.warnText : t.text, fontSize: 13, borderTop: m.danger ? `1px solid ${t.border}` : undefined }}
                  >
                    {m.icon}
                    {m.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {p.canCloseShift && (
          <button type="button" onClick={p.onCloseShift} className="relative flex flex-col items-center justify-center shrink-0" style={{ minWidth: 62, height: 52, borderRadius: 10, color: t.warnText, gap: 2 }} title="إغلاق العهدة">
            <CircleStop style={{ width: 21, height: 21 }} strokeWidth={1.9} />
            <span style={{ fontSize: 11, fontWeight: 700 }}>إغلاق العهدة</span>
          </button>
        )}
      </div>
    </header>
  );
}
