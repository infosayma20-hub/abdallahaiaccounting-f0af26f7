import { useState } from "react";
import { Check, ChevronDown, ChevronUp, RotateCcw, Palette } from "lucide-react";
import { toast } from "sonner";
import { useCompanyTheme } from "@/hooks/useCompanyTheme";
import { useCompany } from "@/hooks/useCompanyContext";
import {
  ThemeColors, THEME_PRESETS, DEFAULT_THEME,
  extractColorsFromLogo, assignColorRoles, ensureAccessibility,
  getTextColorForBg, lightenColor,
} from "@/lib/color-utils";

const PRESET_META: { key: string; label: string; emoji: string }[] = [
  { key: "classic", label: "كلاسيك", emoji: "🟠" },
  { key: "ocean", label: "بحري", emoji: "🔵" },
  { key: "fresh", label: "نضارة", emoji: "🟢" },
  { key: "warm", label: "دفء", emoji: "🟤" },
  { key: "creative", label: "إبداع", emoji: "🟣" },
  { key: "professional", label: "احترافي", emoji: "⚫" },
  { key: "bold", label: "جرأة", emoji: "🔴" },
];

const COLOR_ROLES = [
  { key: "sidebar", label: "لون القائمة الجانبية", scope: "الشريط الجانبي وشريط التنقل", icon: "🎨" },
  { key: "primary", label: "لون الأزرار الرئيسية", scope: "أزرار الحفظ والتأكيد والإجراءات", icon: "✦" },
  { key: "accent", label: "لون التمييز والتفعيل", scope: "العناصر النشطة والروابط المميزة", icon: "💡" },
  { key: "topbar", label: "لون الشريط العلوي", scope: "شريط التنقل في أعلى الشاشة", icon: "📊" },
  { key: "cardAccent", label: "لون البطاقات المميزة", scope: "حدود وعناوين البطاقات الرئيسية", icon: "🏷️" },
] as const;

const PALETTE_COLORS = [
  // Blues
  "#0D1B2A", "#1B3A5C", "#0C4A6E", "#1E40AF", "#2563EB", "#3B82F6",
  // Greens
  "#064E3B", "#065F46", "#047857", "#059669", "#10B981", "#34D399",
  // Reds/Oranges
  "#450A0A", "#7F1D1D", "#991B1B", "#DC2626", "#E8A020", "#F59E0B",
  // Purples/Browns
  "#3B0764", "#581C87", "#6D28D9", "#92400E", "#78350F", "#4B5563",
  // Grays
  "#111827", "#1F2937", "#374151", "#4B5563", "#6B7280", "#9CA3AF",
];

const BrandIdentitySettings = () => {
  const { theme, logoPalette, updateTheme, resetTheme } = useCompanyTheme();
  const { company } = useCompany();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [customHex, setCustomHex] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const handlePresetSelect = async (key: string) => {
    const preset = THEME_PRESETS[key];
    if (!preset) return;
    await updateTheme(preset);
    toast.success(`تم تطبيق ثيم "${PRESET_META.find((p) => p.key === key)?.label}"`);
  };

  const handleExtractFromLogo = async () => {
    if (!company.logo_url) {
      toast.error("ارفع شعارك أولاً لاستخراج الألوان");
      return;
    }
    setExtracting(true);
    try {
      const palette = await extractColorsFromLogo(company.logo_url);
      if (!palette.length) {
        toast.error("لم يتم العثور على ألوان كافية في الشعار");
        return;
      }
      const roles = assignColorRoles(palette);
      const safe = ensureAccessibility(roles);
      await updateTheme(safe);
      toast.success("تم استخراج الألوان وتطبيقها من شعارك");
    } catch {
      toast.error("فشل استخراج الألوان من الشعار");
    } finally {
      setExtracting(false);
    }
  };

  const handleColorChange = async (roleKey: string, hex: string) => {
    const updated: ThemeColors = { ...theme, [roleKey]: hex, presetName: "custom", extractedFromLogo: false };
    await updateTheme(updated);
    setEditingRole(null);
  };

  const handleReset = async () => {
    await resetTheme();
    setConfirmReset(false);
    toast.success("تم استعادة الألوان الافتراضية");
  };

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Header */}
      <div className="p-5 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-base"
            style={{ background: lightenColor(theme.primary, 0.85) }}>
            🎨
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-foreground">هوية الشركة البصرية</h3>
            <p className="text-xs text-muted-foreground">خصص ألوان البرنامج لتناسب علامتك</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {[theme.sidebar, theme.primary, theme.accent].map((c, i) => (
            <div key={i} className="w-3.5 h-3.5 rounded-full border border-white shadow-sm" style={{ background: c }} />
          ))}
        </div>
      </div>

      {/* Presets */}
      <div className="px-5 pb-4">
        <p className="text-[11px] font-semibold text-muted-foreground mb-3 tracking-wide">ثيمات جاهزة</p>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {PRESET_META.map((p) => {
            const preset = THEME_PRESETS[p.key];
            const isActive = theme.presetName === p.key;
            return (
              <button
                key={p.key}
                onClick={() => handlePresetSelect(p.key)}
                className={`flex-shrink-0 w-[90px] rounded-xl border-2 p-2.5 transition-all ${
                  isActive ? "border-accent shadow-md" : "border-border hover:border-muted-foreground/30"
                }`}
              >
                {/* Mini preview */}
                <div className="w-full h-12 rounded-lg overflow-hidden flex mb-1.5">
                  <div className="w-5 h-full" style={{ background: preset.sidebar }} />
                  <div className="flex-1 flex flex-col p-1 bg-secondary/30">
                    <div className="w-full h-1.5 rounded" style={{ background: preset.topbar }} />
                    <div className="flex-1 flex items-end gap-0.5 mt-1">
                      <div className="w-5 h-3 rounded-sm" style={{ background: preset.primary }} />
                      <div className="w-3 h-3 rounded-sm" style={{ background: preset.accent }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-center gap-1">
                  {isActive && <Check className="h-3 w-3 text-accent" />}
                  <span className="text-[10px] font-medium text-foreground">{p.emoji} {p.label}</span>
                </div>
              </button>
            );
          })}

          {/* Logo preset */}
          <button
            onClick={handleExtractFromLogo}
            disabled={extracting || !company.logo_url}
            className={`flex-shrink-0 w-[90px] rounded-xl border-2 p-2.5 transition-all ${
              theme.extractedFromLogo ? "border-accent shadow-md" : "border-dashed border-border hover:border-muted-foreground/30"
            } disabled:opacity-40`}
          >
            <div className="w-full h-12 rounded-lg overflow-hidden flex items-center justify-center bg-secondary/30">
              {extracting ? (
                <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              ) : company.logo_url ? (
                <img src={company.logo_url} alt="" className="h-8 w-8 object-contain" />
              ) : (
                <Palette className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex items-center justify-center gap-1 mt-1.5">
              {theme.extractedFromLogo && <Check className="h-3 w-3 text-accent" />}
              <span className="text-[10px] font-medium text-foreground">شعارك</span>
            </div>
          </button>
        </div>
      </div>

      {/* Advanced toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="w-full px-5 py-3 flex items-center justify-between border-t border-border hover:bg-secondary/30 transition-colors"
      >
        <span className="text-xs font-semibold text-muted-foreground">تخصيص متقدم</span>
        {showAdvanced ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {/* Advanced color roles */}
      {showAdvanced && (
        <div className="px-5 pb-4 space-y-1 animate-fade-in">
          {COLOR_ROLES.map((role) => (
            <div key={role.key} className="flex items-center justify-between py-3 border-b border-border last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-sm">{role.icon}</span>
                <div>
                  <p className="text-[13px] font-bold text-foreground">{role.label}</p>
                  <p className="text-[11px] text-muted-foreground">{role.scope}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full border-2 border-white shadow-md cursor-pointer hover:scale-110 transition-transform"
                  style={{ background: theme[role.key as keyof ThemeColors] as string }}
                  onClick={() => setEditingRole(editingRole === role.key ? null : role.key)}
                />
                <button
                  onClick={() => setEditingRole(editingRole === role.key ? null : role.key)}
                  className="text-xs text-accent hover:underline"
                >
                  تغيير
                </button>
              </div>
            </div>
          ))}

          {/* Color picker inline */}
          {editingRole && (
            <div className="bg-secondary/40 rounded-xl p-4 space-y-3 animate-fade-in">
              <p className="text-xs font-semibold text-foreground">
                اختر لون {COLOR_ROLES.find((r) => r.key === editingRole)?.label}
              </p>

              {/* Logo colors */}
              {logoPalette.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-2">من شعارك</p>
                  <div className="flex gap-2">
                    {logoPalette.map((c) => (
                      <button
                        key={c}
                        onClick={() => handleColorChange(editingRole, c)}
                        className="w-10 h-10 rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Palette grid */}
              <div>
                <p className="text-[10px] text-muted-foreground mb-2">ألوان مقترحة</p>
                <div className="grid grid-cols-6 gap-1.5">
                  {PALETTE_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => handleColorChange(editingRole, c)}
                      className="w-7 h-7 rounded-full border border-white/50 shadow-sm hover:scale-110 transition-transform"
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Custom hex */}
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-muted-foreground whitespace-nowrap">كود اللون:</p>
                <div className="flex items-center gap-1.5 flex-1">
                  <input
                    value={customHex}
                    onChange={(e) => setCustomHex(e.target.value)}
                    placeholder="#E8A020"
                    className="h-8 w-24 px-2 text-xs rounded-lg bg-background border border-border font-mono"
                    dir="ltr"
                  />
                  {customHex && /^#[0-9A-Fa-f]{6}$/.test(customHex) && (
                    <>
                      <div className="w-6 h-6 rounded-full border border-border" style={{ background: customHex }} />
                      <button
                        onClick={() => { handleColorChange(editingRole, customHex); setCustomHex(""); }}
                        className="text-[10px] text-accent hover:underline"
                      >
                        تأكيد
                      </button>
                    </>
                  )}
                </div>
              </div>

              <button
                onClick={() => setEditingRole(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                إغلاق
              </button>
            </div>
          )}

          {/* Locked notice */}
          <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
            <span>—</span>
            <span>ألوان النصوص والحالات والجداول ثابتة لضمان سهولة القراءة</span>
          </div>
        </div>
      )}

      {/* Reset */}
      <div className="px-5 py-3 border-t border-border">
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            استعادة الألوان الافتراضية
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-foreground">هل أنت متأكد؟</span>
            <button onClick={handleReset} className="text-xs text-destructive font-semibold hover:underline">نعم، استعدها</button>
            <button onClick={() => setConfirmReset(false)} className="text-xs text-muted-foreground hover:underline">إلغاء</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BrandIdentitySettings;
