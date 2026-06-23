import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Search, AlertTriangle, Loader2, Zap, Database } from "lucide-react";

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
    status: "idle" | "loading" | "live" | "cached" | "manual" | "error";
    price: number | null;
    error?: string | null;
  }>({ status: "idle", price: null });

  useEffect(() => {
    if (!dataOwnerId) return;
    setLoading(true);
    supabase
      .from("delivery_zones" as any)
      .select("id, city, area_name, branch_id, branch_name, price, is_active, wheels_area_id, wheels_fixed_price")
      .eq("user_id", dataOwnerId)
      .eq("is_active", true)
      .order("city")
      .order("area_name")
      .then(({ data }) => {
        setZones(((data as any) || []) as Zone[]);
        setLoading(false);
      });
  }, [dataOwnerId]);

  const cities = useMemo(() => Array.from(new Set(zones.map(z => z.city))).sort(), [zones]);

  // Areas filtered by city + search, grouped by area name
  const areaGroups = useMemo(() => {
    const filtered = zones.filter(z => (!city || z.city === city) && (!search.trim() || z.area_name.includes(search.trim())));
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
      .slice(0, 50);
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
    const z = zones.find(
      x => x.branch_id === value.branch_id && x.area_name === value.area && x.city === value.city,
    );
    // Branch not mapped to Wheels → show internal price as "manual"
    if (!z?.wheels_area_id) {
      setLivePrice({ status: "manual", price: Number(z?.price ?? value.original_fee) });
      if (value.final_fee !== Number(z?.price ?? value.original_fee)) {
        onChange({ ...value, final_fee: Number(z?.price ?? value.original_fee), manually_adjusted: false });
      }
      return;
    }
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
        setLivePrice({ status: "live", price: p });
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
  }, [value?.branch_id, value?.area, value?.city, zones]);

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
          <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold">
              {livePrice.status === "loading" && (
                <><Loader2 className="h-3 w-3 animate-spin text-orange-500" /><span className="text-muted-foreground">جاري جلب السعر من Wheels...</span></>
              )}
              {livePrice.status === "live" && (
                <><Zap className="h-3 w-3 text-emerald-600" /><span className="text-emerald-700">السعر الحي من Wheels</span></>
              )}
              {livePrice.status === "cached" && (
                <><Database className="h-3 w-3 text-amber-600" /><span className="text-amber-700" title={livePrice.error || ""}>السعر المخزّن (تعذّر الاتصال بـ Wheels)</span></>
              )}
              {livePrice.status === "manual" && (
                <><Database className="h-3 w-3 text-muted-foreground" /><span className="text-muted-foreground">سعر داخلي (الفرع غير مربوط بـ Wheels)</span></>
              )}
            </div>
            <div className="font-mono font-bold text-sm tabular-nums">
              ₪{Number(livePrice.price ?? value.final_fee).toFixed(2)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}