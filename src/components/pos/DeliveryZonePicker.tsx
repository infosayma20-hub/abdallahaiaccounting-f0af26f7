import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Search, AlertTriangle, Loader2, Zap, Database, Link2Off, ExternalLink, RefreshCw, Pencil, Check, X } from "lucide-react";

export interface DeliveryInfo {
  city: string;
  area: string;
  branch_id: string;
  branch_name: string;
  original_fee: number;
  final_fee: number;
  manually_adjusted: boolean;
}

interface Zone {
  id: string;
  city: string;
  area_name: string;
  branch_id: string;
  branch_name: string;
  price: number;
  is_active: boolean;
  wheels_area_id?: number | null;
  wheels_fixed_price?: number | null;
  area_aliases?: string[] | null;
}

interface Props {
  dataOwnerId: string;
  value: DeliveryInfo | null;
  onChange: (info: DeliveryInfo | null) => void;
  /** Lock branch to this id (edit mode) */
  lockedBranchId?: string | null;
}

/**
 * Delivery zone picker: city → area → cheapest branch (auto), editable final fee.
 * On tie between branches, the user must explicitly pick one.
 */
export default function DeliveryZonePicker({ dataOwnerId, value, onChange, lockedBranchId }: Props) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState<string>(value?.city || "");
  const [search, setSearch] = useState<string>(value?.area || "");
  const [showOptions, setShowOptions] = useState(false);
  const [tiePending, setTiePending] = useState<{ city: string; area: string; options: Zone[] } | null>(null);
  const [livePrice, setLivePrice] = useState<{
    status: "idle" | "loading" | "live" | "cached" | "manual" | "area_unmapped" | "error";
    price: number | null;
    error?: string | null;
    latency_ms?: number | null;
  }>({ status: "idle", price: null });
  // Bumped to force a manual refetch of the live Wheels price (B3).
  const [refetchTick, setRefetchTick] = useState(0);
  // Manual override state — when the agent overrides the price (because
  // Wheels returned 0, the area isn't mapped, or special case), we flip
  // `manually_adjusted` to true on the value and skip auto-fetches.
  const [editingPrice, setEditingPrice] = useState(false);
  const [draftPrice, setDraftPrice] = useState<string>("");
  // Set of branch_ids that are mapped to Wheels (loaded from wheels_branch_config).
  // Used to distinguish "branch not on Wheels" vs "area on a Wheels branch lacks mapping".
  const [wheelsBranchIds, setWheelsBranchIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!dataOwnerId) return;
    setLoading(true);
    supabase
      .from("delivery_zones" as any)
      .select("id, city, area_name, branch_id, branch_name, price, is_active, wheels_area_id, wheels_fixed_price, area_aliases")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .order("city")
      .order("area_name")
      .then(({ data }) => {
        setZones(((data as any) || []) as Zone[]);
        setLoading(false);
      });
    // Load which branches are mapped to Wheels so we can distinguish missing area
    // mappings (warning) from branches that aren't on Wheels at all (info).
    supabase
      .from("wheels_branch_config" as any)
      .select("branch_id, is_active")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .then(({ data }) => {
        setWheelsBranchIds(new Set(((data as any) || []).map((r: any) => r.branch_id)));
      });
  }, [dataOwnerId]);

  const cities = useMemo(() => Array.from(new Set(zones.map(z => z.city))).sort(), [zones]);

  // Normalize Arabic text for fuzzy matching: unify hamza/alef variants,
  // ya/alef-maksura, ta-marbuta/ha, strip tatweel/diacritics, collapse
  // whitespace/dashes. Helps when callers type slightly different spellings
  // (e.g. "الجيديدة" vs "الجديدة", "المعاجين القدس" vs "المعاجين - القدس").
  const normalizeAr = (s: string): string => {
    if (!s) return "";
    return s
      .toString()
      .replace(/[\u200f\u200e]/g, "")
      .replace(/[ـًٌٍَُِّْ]/g, "")
      .replace(/[إأآا]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/\s*-\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  };

  // Areas filtered by city + search, grouped by area name
  const areaGroups = useMemo(() => {
    const q = normalizeAr(search);
    // Common generic qualifiers users often add that aren't in stored area names.
    // We DROP them from the query tokens so "شارع هواش" still matches "هواش",
    // "مخيم عسكر الجديد" matches "عسكر الجديد", "شارع عماد الدين" matches "طلعة عماد الدين", etc.
    const STOP = new Set([
      "شارع","مخيم","حي","منطقه","منطقة","حاره","حارة","ضاحيه","ضاحية",
      "طلعه","طلعة","دوار","مستشفي","مستشفى","عماره","عمارة","مفرق","مدخل","قرب","بجانب","جانب","ال"
    ]);
    const rawTokens = q ? q.split(" ").filter(Boolean) : [];
    let tokens = rawTokens.filter(t => !STOP.has(t) && t.length > 1);
    // If user typed only stop-words, fall back to original tokens so we still search.
    if (!tokens.length && rawTokens.length) tokens = rawTokens;
    const filtered = zones.filter(z => {
      if (city && z.city !== city) return false;
      if (!tokens.length) return true;
      // Build a haystack from area_name + city + aliases, all normalized.
      const hay = [
        normalizeAr(z.area_name),
        normalizeAr(z.city),
        ...((z.area_aliases || []).map(normalizeAr)),
      ].join(" | ");
      // Every non-stop token must appear somewhere.
      return tokens.every(t => hay.includes(t));
    });
    const map = new Map<string, Zone[]>();
    for (const z of filtered) {
      const key = `${z.city}::${z.area_name}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(z);
    }
    return Array.from(map.entries())
      .map(([key, list]) => {
        const [c, a] = key.split("::");
        const sorted = [...list].sort((x, y) => x.price - y.price);
        const cheapest = sorted[0];
        const tieCount = sorted.filter(s => s.price === cheapest.price).length;
        return { city: c, area: a, options: sorted, cheapest, tie: tieCount > 1 };
      })
      .slice(0, 100);
  }, [zones, city, search]);

  const selectZone = (zone: Zone) => {
    const info: DeliveryInfo = {
      city: zone.city,
      area: zone.area_name,
      branch_id: zone.branch_id,
      branch_name: zone.branch_name,
      original_fee: Number(zone.price),
      final_fee: Number(zone.price),
      manually_adjusted: false,
    };
    onChange(info);
    setSearch(zone.area_name);
    setCity(zone.city);
    setShowOptions(false);
    setTiePending(null);
  };

  const handleAreaPick = (group: { city: string; area: string; options: Zone[]; cheapest: Zone; tie: boolean }) => {
    if (lockedBranchId) {
      const match = group.options.find(o => o.branch_id === lockedBranchId);
      if (match) return selectZone(match);
    }
    if (group.tie) {
      // Don't auto-select on tie — surface branch picker
      setSearch(group.area);
      setCity(group.city);
      setShowOptions(false);
      setTiePending({ city: group.city, area: group.area, options: group.options });
      onChange(null);
      return;
    }
    selectZone(group.cheapest);
  };

  // Branch options for current selected area (for tie / change)
  const branchOptionsForArea = useMemo(() => {
    if (!value) return [];
    return zones
      .filter(z => z.city === value.city && z.area_name === value.area)
      .sort((a, b) => a.price - b.price);
  }, [zones, value]);

  // Fetch the LIVE delivery price from Wheels API whenever the selected
  // zone (city+area+branch) changes. Falls back to the cached wheels_fixed_price
  // and finally to the internal price if the branch isn't mapped to Wheels.
  useEffect(() => {
    if (!value) { setLivePrice({ status: "idle", price: null }); return; }
    // If the agent explicitly overrode the price, don't clobber it with a
    // live fetch. The refresh button clears the override (see below).
    if (value.manually_adjusted) {
      setLivePrice({ status: "idle", price: Number(value.final_fee) });
      return;
    }
    const z = zones.find(
      x => x.branch_id === value.branch_id && x.area_name === value.area && x.city === value.city,
    );
    const branchHasWheels = wheelsBranchIds.has(value.branch_id);
    // CASE A: Branch itself is not on Wheels (e.g. "فرع افتراضي") → internal price.
    if (!branchHasWheels) {
      const fallback = Number(z?.price ?? value.original_fee);
      setLivePrice({ status: "manual", price: fallback });
      if (value.final_fee !== fallback) {
        onChange({ ...value, final_fee: fallback, manually_adjusted: false });
      }
      return;
    }
    // CASE B: Branch IS on Wheels but this specific area lacks a wheels_area_id.
    // The internal price is used temporarily; agent must map the area in settings.
    if (!z?.wheels_area_id) {
      const fallback = Number(z?.price ?? value.original_fee);
      setLivePrice({ status: "area_unmapped", price: fallback });
      if (value.final_fee !== fallback) {
        onChange({ ...value, final_fee: fallback, manually_adjusted: false });
      }
      return;
    }
    // CASE C: Both branch and area are mapped → fetch live price from Wheels.
    let cancelled = false;
    setLivePrice({ status: "loading", price: Number(z.wheels_fixed_price ?? z.price) });
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("wheels-test", {
          body: { mode: "price", branch_id: value.branch_id, wheels_area_id: z.wheels_area_id },
        });
        if (cancelled) return;
        if (error || !(data as any)?.success || (data as any)?.price == null) {
          const cached = Number(z.wheels_fixed_price ?? z.price);
          setLivePrice({ status: "cached", price: cached, error: (data as any)?.error || error?.message || null });
          if (value.final_fee !== cached) onChange({ ...value, final_fee: cached, manually_adjusted: false });
          return;
        }
        const p = Number((data as any).price);
        setLivePrice({ status: "live", price: p, latency_ms: (data as any)?.latency_ms ?? null });
        if (value.final_fee !== p) onChange({ ...value, final_fee: p, manually_adjusted: false });
      } catch (e: any) {
        if (cancelled) return;
        const cached = Number(z.wheels_fixed_price ?? z.price);
        setLivePrice({ status: "cached", price: cached, error: e?.message || "تعذّر الاتصال بـ Wheels" });
        if (value.final_fee !== cached) onChange({ ...value, final_fee: cached, manually_adjusted: false });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.branch_id, value?.area, value?.city, zones, wheelsBranchIds, refetchTick, value?.manually_adjusted]);

  return (
    <div className="space-y-2 rounded-xl border-2 border-orange-300/40 bg-orange-50/40 dark:bg-orange-950/10 p-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-orange-700">
        <MapPin className="h-3.5 w-3.5" /> منطقة التوصيل *
      </div>

      {/* City chips */}
      <div className="flex flex-wrap gap-1.5">
        {cities.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => { setCity(c); setSearch(""); onChange(null); }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
              city === c ? "bg-orange-500 text-white border-orange-500" : "bg-background border-border hover:border-orange-400"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setShowOptions(true); if (value) onChange(null); }}
          onFocus={() => setShowOptions(true)}
          placeholder="ابحث عن المنطقة..."
          className="w-full h-9 rounded-lg border border-border bg-background pr-8 pl-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
        />
      </div>

      {/* Area list */}
      {showOptions && !loading && areaGroups.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background divide-y divide-border">
          {areaGroups.map(g => (
            <button
              key={`${g.city}-${g.area}`}
              type="button"
              onClick={() => handleAreaPick(g)}
              className="w-full text-right px-2.5 py-1.5 text-[11px] hover:bg-orange-100/50 dark:hover:bg-orange-950/30 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-muted-foreground text-[9px] shrink-0">{g.city}</span>
                <span className="font-semibold truncate">{g.area}</span>
                {g.tie && (
                  <span className="text-[9px] text-amber-600 font-bold shrink-0 flex items-center gap-0.5">
                    <AlertTriangle className="h-2.5 w-2.5" /> السعر متساوٍ - اختر الفرع
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono font-bold shrink-0">
                {g.tie ? `₪${g.cheapest.price} × ${g.options.length}` : `₪${g.cheapest.price} — ${g.cheapest.branch_name}`}
              </span>
            </button>
          ))}
        </div>
      )}
      {showOptions && !loading && areaGroups.length === 0 && search && (
        <div className="text-[11px] text-muted-foreground p-2">لا توجد نتائج</div>
      )}

      {/* Tie branch picker (shown when user taps an area with equal prices) */}
      {tiePending && !value && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-2.5 space-y-2">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            السعر متساوٍ بين أكثر من فرع — يرجى اختيار الفرع
          </div>
          <div className="text-[10px] text-muted-foreground">
            {tiePending.city} — {tiePending.area}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {tiePending.options.map(opt => (
              <button
                key={opt.id}
                type="button"
                disabled={!!lockedBranchId && lockedBranchId !== opt.branch_id}
                onClick={() => selectZone(opt)}
                className={`px-2.5 py-2 rounded-lg text-[11px] font-bold border-2 transition bg-background hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-950/20 text-right ${
                  !!lockedBranchId && lockedBranchId !== opt.branch_id ? "opacity-40 cursor-not-allowed" : "border-border"
                }`}
              >
                <div className="font-bold">{opt.branch_name}</div>
                <div className="text-[10px] font-mono text-muted-foreground">₪{opt.price}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Selected zone summary + branch override + fee edit */}
      {value && (
        <div className="rounded-lg bg-background border border-orange-300 p-2 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold">{value.area}</span>
            <span className="text-muted-foreground">{value.city}</span>
          </div>

          {branchOptionsForArea.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {branchOptionsForArea.map(b => (
                <button
                  key={b.id}
                  type="button"
                  disabled={!!lockedBranchId && lockedBranchId !== b.branch_id}
                  onClick={() => selectZone(b)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                    value.branch_id === b.branch_id
                      ? "bg-orange-500 text-white border-orange-500"
                      : "bg-muted/40 border-border hover:border-orange-400"
                  } ${!!lockedBranchId && lockedBranchId !== b.branch_id ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  {b.branch_name}
                </button>
              ))}
            </div>
          )}

          {/* Live price badge (read-only) */}
          <div className={`flex items-center justify-between gap-2 rounded-md px-2 py-1.5 ${
            value.manually_adjusted
              ? "bg-amber-50 dark:bg-amber-950/20 border border-amber-300"
              : livePrice.status === "area_unmapped"
                ? "bg-red-50 dark:bg-red-950/20 border border-red-300"
                : "bg-muted/40"
          }`}>
            <div className="flex items-center gap-1.5 text-[10px] font-bold flex-wrap">
              {value.manually_adjusted && (
                <><Pencil className="h-3 w-3 text-amber-600" /><span className="text-amber-700">سعر معدّل يدوياً</span></>
              )}
              {!value.manually_adjusted && livePrice.status === "loading" && (
                <><Loader2 className="h-3 w-3 animate-spin text-orange-500" /><span className="text-muted-foreground">جاري جلب السعر من Wheels...</span></>
              )}
              {!value.manually_adjusted && livePrice.status === "live" && (
                <>
                  <Zap className="h-3 w-3 text-emerald-600" />
                  <span
                    className="text-emerald-700"
                    title={livePrice.latency_ms != null ? `زمن استجابة Wheels: ${livePrice.latency_ms} مللي ثانية` : "السعر الحي من Wheels"}
                  >
                    السعر الحي من Wheels{livePrice.latency_ms != null ? ` · ${livePrice.latency_ms}ms` : ""}
                  </span>
                </>
              )}
              {!value.manually_adjusted && livePrice.status === "cached" && (
                <><Database className="h-3 w-3 text-amber-600" /><span className="text-amber-700" title={livePrice.error || ""}>السعر المخزّن (تعذّر الاتصال بـ Wheels)</span></>
              )}
              {!value.manually_adjusted && livePrice.status === "manual" && (
                <><Database className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">سعر داخلي (الفرع غير مربوط بـ Wheels)</span></>
              )}
              {!value.manually_adjusted && livePrice.status === "area_unmapped" && (
                <>
                  <Link2Off className="h-3 w-3 text-red-600" />
                  <span className="text-red-700">هذه المنطقة غير مربوطة بـ Wheels — اربطها من الإعدادات</span>
                  <a
                    href="/pos/delivery-zones"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-red-700 underline flex items-center gap-0.5 hover:text-red-900"
                  >
                    فتح <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Inline manual price editor. */}
              {editingPrice ? (
                <>
                  <span className="text-[10px] font-bold text-muted-foreground">₪</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min="0"
                    autoFocus
                    value={draftPrice}
                    onChange={e => setDraftPrice(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        const n = Number(draftPrice);
                        if (!isNaN(n) && n >= 0) {
                          onChange({ ...value, final_fee: n, manually_adjusted: true });
                          setEditingPrice(false);
                        }
                      } else if (e.key === "Escape") {
                        setEditingPrice(false);
                      }
                    }}
                    className="w-20 h-7 rounded border border-amber-400 bg-background px-1.5 text-sm font-mono font-bold tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400 text-right"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const n = Number(draftPrice);
                      if (!isNaN(n) && n >= 0) {
                        onChange({ ...value, final_fee: n, manually_adjusted: true });
                        setEditingPrice(false);
                      }
                    }}
                    title="حفظ"
                    className="p-1 rounded hover:bg-emerald-100 text-emerald-600 transition"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingPrice(false)}
                    title="إلغاء"
                    className="p-1 rounded hover:bg-red-100 text-red-500 transition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  {/* Refresh from Wheels — also clears any manual override. */}
                  {(value.manually_adjusted ||
                    livePrice.status === "live" ||
                    livePrice.status === "cached" ||
                    livePrice.status === "loading") && (
                    <button
                      type="button"
                      onClick={() => {
                        // Clearing manual flag triggers the live-fetch effect.
                        if (value.manually_adjusted) {
                          onChange({ ...value, manually_adjusted: false });
                        }
                        setRefetchTick(t => t + 1);
                      }}
                      disabled={livePrice.status === "loading"}
                      title={value.manually_adjusted ? "إلغاء التعديل وإعادة الجلب من Wheels" : "إعادة جلب السعر من Wheels"}
                      aria-label="إعادة جلب السعر من Wheels"
                      className="p-1 rounded hover:bg-orange-100 dark:hover:bg-orange-950/30 text-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    >
                      <RefreshCw className={`h-3 w-3 ${livePrice.status === "loading" ? "animate-spin" : ""}`} />
                    </button>
                  )}
                  {/* Manual override pencil — always available so the agent can
                      fix bad Wheels responses (e.g. price = 0) or override
                      when the area isn't mapped. */}
                  <button
                    type="button"
                    onClick={() => {
                      setDraftPrice(String(Number(value.final_fee || 0)));
                      setEditingPrice(true);
                    }}
                    title="تعديل السعر يدوياً"
                    aria-label="تعديل السعر يدوياً"
                    className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-950/30 text-amber-600 transition"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <div className={`font-mono font-bold text-sm tabular-nums ${value.manually_adjusted ? "text-amber-700" : ""}`}>
                    ₪{Number(value.manually_adjusted ? value.final_fee : (livePrice.price ?? value.final_fee)).toFixed(2)}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}