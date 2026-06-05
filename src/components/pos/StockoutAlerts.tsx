import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, X, PackageX, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { installAudioUnlock, playAlertBeep } from "@/lib/audio-unlock";

/**
 * Stockout alerts — branch/cashier raises a quick alert to the call center
 * that an item or component (e.g. "خلص الأرز", "خلص البروست") is unavailable.
 *
 * Two pieces exported:
 *   • <StockoutAlertButton/>  — small button for the POS top bar
 *   • <StockoutAlertsBanner/> — sticky red banner for the Call Center screen
 *
 * Backed by the `stockout_alerts` table (realtime). No product is deleted or
 * disabled — this is purely a notification surface.
 */

interface AlertRow {
  id: string;
  branch_id: string | null;
  product_id: string | null;
  modifier_option_id: string | null;
  custom_label: string | null;
  raised_by_name: string | null;
  raised_at: string;
  status: "active" | "resolved";
  resolved_by_name: string | null;
  resolved_at: string | null;
  note: string | null;
}

interface ProductOption { id: string; name: string; }

function describeAlert(a: AlertRow, productMap: Map<string, string>, modMap: Map<string, string>): string {
  if (a.custom_label && a.custom_label.trim()) return a.custom_label.trim();
  if (a.product_id) return productMap.get(a.product_id) || "صنف";
  if (a.modifier_option_id) return modMap.get(a.modifier_option_id) || "مكوّن";
  return "غير محدد";
}

/* ─────────────────────────────── Branch button ─────────────────────────────── */

export function StockoutAlertButton({
  dataOwnerId,
  branchId,
  branchName,
  iconOnly = false,
}: {
  dataOwnerId: string;
  branchId: string | null;
  branchName?: string | null;
  iconOnly?: boolean;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [mods, setMods] = useState<ProductOption[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ kind: "product" | "modifier" | "custom"; id?: string; label: string } | null>(null);
  const [customText, setCustomText] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [myActive, setMyActive] = useState<AlertRow[]>([]);

  // Load product + modifier names for the picker
  useEffect(() => {
    if (!open || !dataOwnerId) return;
    (async () => {
      const [{ data: ps }, { data: ms }] = await Promise.all([
        supabase.from("products").select("id,name").eq("user_id", dataOwnerId).order("name").limit(500),
        supabase
          .from("modifier_options")
          .select("id,name,group_id,modifier_groups!inner(user_id)")
          .eq("modifier_groups.user_id", dataOwnerId)
          .order("name")
          .limit(500),
      ]);
      setProducts(((ps as any[]) || []).map(p => ({ id: p.id, name: p.name })));
      setMods(((ms as any[]) || []).map(m => ({ id: m.id, name: m.name })));
    })();
  }, [open, dataOwnerId]);

  // Show this branch's currently-active alerts so the cashier doesn't double-raise
  // Also drives the count badge on the icon-only button, so it must run
  // regardless of dialog open state and stay live via realtime.
  useEffect(() => {
    if (!dataOwnerId) return;
    const load = async () => {
      let q = supabase
        .from("stockout_alerts")
        .select("*")
        .eq("user_id", dataOwnerId)
        .eq("status", "active")
        .order("raised_at", { ascending: false })
        .limit(20);
      if (branchId) q = q.eq("branch_id", branchId);
      const { data } = await q;
      setMyActive(((data as any[]) || []) as AlertRow[]);
    };
    load();
    const ch = supabase
      .channel(`stockout-btn-${dataOwnerId}-${branchId || "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stockout_alerts", filter: `user_id=eq.${dataOwnerId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [dataOwnerId, branchId]);

  const filteredProducts = useMemo(() => {
    const s = search.trim();
    if (!s) return products.slice(0, 30);
    return products.filter(p => p.name?.includes(s)).slice(0, 30);
  }, [products, search]);
  const filteredMods = useMemo(() => {
    const s = search.trim();
    if (!s) return mods.slice(0, 20);
    return mods.filter(m => m.name?.includes(s)).slice(0, 20);
  }, [mods, search]);

  const reset = () => {
    setSelected(null); setCustomText(""); setNote(""); setSearch("");
  };

  const submit = async () => {
    if (!dataOwnerId) return;
    let payload: Partial<AlertRow> & { user_id: string } = {
      user_id: dataOwnerId,
      branch_id: branchId,
      raised_by: user?.id ?? null as any,
      raised_by_name: (user?.user_metadata as any)?.full_name || user?.email || branchName || null,
      note: note.trim() || null,
    } as any;
    if (selected?.kind === "product" && selected.id) payload.product_id = selected.id;
    else if (selected?.kind === "modifier" && selected.id) payload.modifier_option_id = selected.id;
    else {
      const txt = (selected?.kind === "custom" ? customText : "").trim();
      if (!txt) { toast.error("اختر صنف/مكوّن أو اكتب وصف التنبيه"); return; }
      payload.custom_label = txt;
    }
    setSaving(true);
    const { error } = await supabase.from("stockout_alerts").insert(payload as any);
    setSaving(false);
    if (error) { toast.error("تعذّر إرسال التنبيه"); return; }
    toast.success("تم إرسال التنبيه للكول سنتر");
    reset(); setOpen(false);
  };

  const resolve = async (id: string) => {
    const { error } = await supabase
      .from("stockout_alerts")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id ?? null,
        resolved_by_name: (user?.user_metadata as any)?.full_name || user?.email || null,
      } as any)
      .eq("id", id);
    if (error) { toast.error("تعذّر الإلغاء"); return; }
    setMyActive(prev => prev.filter(a => a.id !== id));
    toast.success("تم تعليم التنبيه كمنتهي");
  };

  return (
    <>
      {iconOnly ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative h-9 w-9 rounded-lg flex items-center justify-center hover:bg-white/[0.08] transition-all shrink-0"
          title="تنبيه نفاد صنف للكول سنتر"
        >
          <PackageX className="h-5 w-5 text-amber-300" />
          {myActive.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-amber-500 text-[9px] font-bold text-white flex items-center justify-center">
              {myActive.length}
            </span>
          )}
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="gap-1 border-amber-300 text-amber-800 hover:bg-amber-50"
          title="تنبيه نفاد صنف للكول سنتر"
        >
          <PackageX className="w-4 h-4" />
          تنبيه نفاد صنف
        </Button>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تنبيه نفاد صنف/مكوّن</DialogTitle>
            <DialogDescription>
              يصل التنبيه فوراً للكول سنتر حتى لا يأخذوا طلبات على أصناف غير متوفرة.
            </DialogDescription>
          </DialogHeader>

          {myActive.length > 0 && (
            <div className="rounded-md border bg-amber-50 p-2 text-xs space-y-1">
              <div className="font-semibold text-amber-900">تنبيهات نشطة من هذا الفرع:</div>
              {myActive.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-2">
                  <span>• {a.custom_label || a.product_id || a.modifier_option_id}</span>
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-amber-700" onClick={() => resolve(a.id)}>
                    <X className="w-3 h-3 ml-1" /> إلغاء التنبيه
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <Label className="text-xs">بحث عن الصنف أو المكوّن</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="مثال: أرز، بروست، صلصة…" />
            </div>

            <div className="max-h-56 overflow-auto rounded-md border p-2 space-y-2">
              {filteredProducts.length > 0 && (
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">أصناف</div>
                  <div className="flex flex-wrap gap-1">
                    {filteredProducts.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelected({ kind: "product", id: p.id, label: p.name })}
                        className={`text-xs rounded-md border px-2 py-1 ${selected?.id === p.id ? "bg-amber-100 border-amber-400" : "hover:bg-muted"}`}
                      >{p.name}</button>
                    ))}
                  </div>
                </div>
              )}
              {filteredMods.length > 0 && (
                <div>
                  <div className="text-[11px] text-muted-foreground mb-1">مكوّنات/خيارات</div>
                  <div className="flex flex-wrap gap-1">
                    {filteredMods.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelected({ kind: "modifier", id: m.id, label: m.name })}
                        className={`text-xs rounded-md border px-2 py-1 ${selected?.id === m.id ? "bg-amber-100 border-amber-400" : "hover:bg-muted"}`}
                      >{m.name}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-md border p-2">
              <Label className="text-xs">أو اكتب تنبيه يدوي</Label>
              <Input
                value={customText}
                onChange={(e) => { setCustomText(e.target.value); if (e.target.value) setSelected({ kind: "custom", label: e.target.value }); }}
                placeholder="مثال: خلص الفرن — لا تأخذوا طلبات بيتزا"
              />
            </div>

            <div>
              <Label className="text-xs">ملاحظة (اختياري)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="تفاصيل إضافية…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={submit} disabled={saving} className="bg-amber-600 hover:bg-amber-700">
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <AlertTriangle className="w-4 h-4 ml-1" />}
              إرسال للكول سنتر
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─────────────────────────── Call center banner ─────────────────────────── */

/**
 * Headless listener — plays a beep + toast for any newly-arrived active alert
 * without rendering any UI. Mount once at a global POS scope so call-center
 * users hear the alert even when the "سجل المحوّلة" sheet is closed.
 */
export function StockoutAlertsListener({ dataOwnerId }: { dataOwnerId: string }) {
  const seenRef = useRef<Set<string>>(new Set());
  const firstLoadRef = useRef(false);

  useEffect(() => { installAudioUnlock(); }, []);

  useEffect(() => {
    if (!dataOwnerId) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("stockout_alerts")
        .select("id,custom_label,product_id,modifier_option_id,status")
        .eq("user_id", dataOwnerId)
        .eq("status", "active")
        .order("raised_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      const rows = ((data as any[]) || []) as AlertRow[];
      let newest: AlertRow | null = null;
      let beep = false;
      const seen = seenRef.current;
      rows.forEach(r => {
        if (!seen.has(r.id)) {
          if (firstLoadRef.current) { beep = true; if (!newest) newest = r; }
          seen.add(r.id);
        }
      });
      if (beep) {
        try { playAlertBeep(); } catch {}
        const label = newest?.custom_label || "صنف غير متوفر";
        try { toast.warning(`🚨 تنبيه نفاد: ${label}`, { duration: 6000 }); } catch {}
      }
      firstLoadRef.current = true;
    };
    load();
    const ch = supabase
      .channel(`stockout-listener-${dataOwnerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stockout_alerts", filter: `user_id=eq.${dataOwnerId}` }, () => load())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [dataOwnerId]);

  return null;
}

export function StockoutAlertsBanner({ dataOwnerId }: { dataOwnerId: string }) {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [productMap, setProductMap] = useState<Map<string, string>>(new Map());
  const [modMap, setModMap] = useState<Map<string, string>>(new Map());
  const [branchMap, setBranchMap] = useState<Map<string, string>>(new Map());
  const [collapsed, setCollapsed] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const [firstLoadDone, setFirstLoadDone] = useState(false);

  // Make sure audio is unlockable on first user gesture so the beep works.
  useEffect(() => { installAudioUnlock(); }, []);

  const load = async () => {
    if (!dataOwnerId) return;
    const { data } = await supabase
      .from("stockout_alerts")
      .select("*")
      .eq("user_id", dataOwnerId)
      .eq("status", "active")
      .order("raised_at", { ascending: false })
      .limit(50);
    const rows = ((data as any[]) || []) as AlertRow[];
    setAlerts(rows);
    // Beep + toast for newly-arrived alerts (skip on the very first load).
    setSeenIds(prev => {
      const next = new Set(prev);
      let beep = false;
      let newest: AlertRow | null = null;
      rows.forEach(r => {
        if (!prev.has(r.id)) {
          if (firstLoadDone) { beep = true; if (!newest) newest = r; }
          next.add(r.id);
        }
      });
      if (beep) {
        try { playAlertBeep(); } catch {}
        const label = newest?.custom_label || "صنف غير متوفر";
        try { toast.warning(`🚨 تنبيه نفاد: ${label}`, { duration: 6000 }); } catch {}
      }
      return next;
    });
    if (!firstLoadDone) setFirstLoadDone(true);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dataOwnerId]);

  // Lookup names once for the IDs referenced by current alerts.
  useEffect(() => {
    if (!dataOwnerId || alerts.length === 0) return;
    const pIds = Array.from(new Set(alerts.map(a => a.product_id).filter(Boolean) as string[]));
    const mIds = Array.from(new Set(alerts.map(a => a.modifier_option_id).filter(Boolean) as string[]));
    const bIds = Array.from(new Set(alerts.map(a => a.branch_id).filter(Boolean) as string[]));
    (async () => {
      if (pIds.length) {
        const { data } = await supabase.from("products").select("id,name").in("id", pIds);
        setProductMap(new Map(((data as any[]) || []).map(p => [p.id, p.name])));
      }
      if (mIds.length) {
        const { data } = await supabase.from("modifier_options").select("id,name").in("id", mIds);
        setModMap(new Map(((data as any[]) || []).map(m => [m.id, m.name])));
      }
      if (bIds.length) {
        const { data } = await supabase.from("branches").select("id,name").in("id", bIds);
        setBranchMap(new Map(((data as any[]) || []).map(b => [b.id, b.name])));
      }
    })();
  }, [alerts, dataOwnerId]);

  // Realtime subscription
  useEffect(() => {
    if (!dataOwnerId) return;
    const ch = supabase
      .channel(`stockout-${dataOwnerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stockout_alerts", filter: `user_id=eq.${dataOwnerId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataOwnerId]);

  const resolve = async (id: string) => {
    const { error } = await supabase
      .from("stockout_alerts")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id ?? null,
        resolved_by_name: (user?.user_metadata as any)?.full_name || user?.email || null,
      } as any)
      .eq("id", id);
    if (error) toast.error("تعذّر الإلغاء");
  };

  if (alerts.length === 0) return null;

  return (
    <div dir="rtl" className="rounded-md border border-red-300 bg-red-50 text-red-900 px-3 py-2 mb-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="w-4 h-4" />
          أصناف/مكوّنات غير متوفرة الآن ({alerts.length})
        </div>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-800" onClick={() => setCollapsed(v => !v)}>
          {collapsed ? "عرض" : "إخفاء"}
        </Button>
      </div>
      {!collapsed && (
        <ul className="mt-1 space-y-1">
          {alerts.map(a => (
            <li key={a.id} className="flex items-center justify-between gap-2 bg-white/60 rounded px-2 py-1">
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="destructive" className="shrink-0">{describeAlert(a, productMap, modMap)}</Badge>
                <span className="text-xs text-red-800/80 truncate">
                  {a.branch_id ? `الفرع: ${branchMap.get(a.branch_id) || "—"} • ` : ""}
                  {a.raised_by_name ? `${a.raised_by_name} • ` : ""}
                  {new Date(a.raised_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                  {a.note ? ` • ${a.note}` : ""}
                </span>
              </div>
              <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => resolve(a.id)}>
                <X className="w-3 h-3 ml-1" /> رفع التنبيه
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}