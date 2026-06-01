import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MapPin, Search, AlertTriangle } from "lucide-react";

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
  const [feeInput, setFeeInput] = useState<string>(value?.final_fee?.toString() || "");
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    if (!dataOwnerId) return;
    setLoading(true);
    supabase
      .from("delivery_zones" as any)
      .select("id, city, area_name, branch_id, branch_name, price, is_active")
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

  const selectZone = (zone: Zone, manuallyAdjusted = false) => {
    const info: DeliveryInfo = {
      city: zone.city,
      area: zone.area_name,
      branch_id: zone.branch_id,
      branch_name: zone.branch_name,
      original_fee: Number(zone.price),
      final_fee: Number(zone.price),
      manually_adjusted: manuallyAdjusted,
    };
    onChange(info);
    setSearch(zone.area_name);
    setCity(zone.city);
    setFeeInput(String(zone.price));
    setShowOptions(false);
  };

  const handleAreaPick = (group: { city: string; area: string; options: Zone[]; cheapest: Zone; tie: boolean }) => {
    if (lockedBranchId) {
      const match = group.options.find(o => o.branch_id === lockedBranchId);
      if (match) return selectZone(match);
    }
    if (group.tie) {
      // Don't auto-select on tie — open inline list below
      setSearch(group.area);
      setCity(group.city);
      setShowOptions(true);
      onChange(null);
      return;
    }
    selectZone(group.cheapest);
  };

  const handleFeeChange = (v: string) => {
    setFeeInput(v);
    if (!value) return;
    const n = parseFloat(v);
    if (!isNaN(n)) {
      onChange({ ...value, final_fee: n, manually_adjusted: n !== value.original_fee });
    }
  };

  // Branch options for current selected area (for tie / change)
  const branchOptionsForArea = useMemo(() => {
    if (!value) return [];
    return zones
      .filter(z => z.city === value.city && z.area_name === value.area)
      .sort((a, b) => a.price - b.price);
  }, [zones, value]);

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
                    <AlertTriangle className="h-2.5 w-2.5" /> اختيار يدوي
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
                  {b.branch_name} — ₪{b.price}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <label className="text-[10px] text-muted-foreground shrink-0">سعر التوصيل النهائي:</label>
            <input
              type="number"
              step="0.5"
              value={feeInput}
              onChange={e => handleFeeChange(e.target.value)}
              className="flex-1 h-7 rounded border border-border bg-background px-2 text-xs font-mono text-left"
              dir="ltr"
            />
            <span className="text-[10px]">₪</span>
            {value.manually_adjusted && (
              <span className="text-[9px] text-amber-700 font-bold">معدّل يدوياً</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}