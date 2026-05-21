import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getAppPermissions } from "@/config/appPermissions";

export type FeatureState = "inherit" | "allow" | "deny";

const LBL: Record<FeatureState, string> = { inherit: "حسب الدور", allow: "مسموح", deny: "ممنوع" };
const CLS: Record<FeatureState, string> = {
  inherit: "bg-muted text-muted-foreground hover:bg-muted/80",
  allow: "bg-emerald-600 text-white hover:bg-emerald-700",
  deny: "bg-red-600 text-white hover:bg-red-700",
};

interface Props {
  targetUserId: string;
  appKey: string;
  /** Hide accordion if the app itself is denied. */
  disabled?: boolean;
}

export default function FeaturePermissionsAccordion({ targetUserId, appKey, disabled }: Props) {
  const def = getAppPermissions(appKey);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<Record<string, FeatureState>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !def) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.functions.invoke("manage-user-app-access", {
        body: { action: "list_features", target_user_id: targetUserId, app_key: appKey },
      });
      if (cancelled) return;
      if (error || (data as any)?.error) {
        toast.error((data as any)?.error || error?.message || "تعذر تحميل الصلاحيات الداخلية");
        setLoading(false);
        return;
      }
      const map: Record<string, FeatureState> = {};
      for (const f of def.features) for (const p of f.permissions) {
        map[`${f.key}.${p.key}`] = "inherit";
      }
      for (const r of ((data as any).overrides || []) as Array<{ feature_key: string; permission_key: string; access_state: FeatureState }>) {
        map[`${r.feature_key}.${r.permission_key}`] = r.access_state;
      }
      setState(map);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, def, targetUserId, appKey]);

  if (!def || def.features.length === 0) return null;

  const setOne = async (feature: string, perm: string, next: FeatureState) => {
    const key = `${feature}.${perm}`;
    setBusy(key);
    const prev = state[key] || "inherit";
    setState(s => ({ ...s, [key]: next }));
    const { data, error } = await supabase.functions.invoke("manage-user-app-access", {
      body: {
        action: "upsert_feature",
        target_user_id: targetUserId,
        app_key: appKey,
        feature_key: feature,
        permission_key: perm,
        access_state: next,
      },
    });
    setBusy(null);
    if (error || (data as any)?.error) {
      setState(s => ({ ...s, [key]: prev }));
      toast.error((data as any)?.error || error?.message || "فشل الحفظ");
    }
  };

  return (
    <div className="mt-2 border-t pt-2">
      <button
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <span>صلاحيات داخل التطبيق</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : (
            def.features.map(f => (
              <div key={f.key} className="rounded border bg-background p-2">
                <div className="text-xs font-semibold mb-1">{f.label}</div>
                <div className="space-y-1">
                  {f.permissions.map(p => {
                    const key = `${f.key}.${p.key}`;
                    const current = state[key] || "inherit";
                    return (
                      <div key={p.key} className="flex items-center justify-between gap-2">
                        <span className="text-xs">{p.label}</span>
                        <div className="inline-flex gap-1">
                          {(["inherit", "allow", "deny"] as FeatureState[]).map(s => (
                            <button
                              key={s}
                              type="button"
                              disabled={busy === key}
                              onClick={() => setOne(f.key, p.key, s)}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                                current === s ? CLS[s] : "bg-background border text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              {LBL[s]}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}