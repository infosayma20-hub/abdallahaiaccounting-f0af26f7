import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table as UITable, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link2, Trash2, RefreshCw, Search } from "lucide-react";
import { SettingsSection } from "./shell/SettingsSection";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

type EntityType = "product" | "branch";

interface MappingRow {
  id: string;
  entity_type: string;
  external_id: string;
  internal_id: string | null;
  label: string | null;
  is_active: boolean;
}

interface Target { id: string; name: string; extra?: string | null }

/**
 * Links the external mobile app's numeric IDs (products / branches) to real
 * Unify records, so incoming API orders resolve to the correct inventory item
 * and branch instead of matching by name.
 */
const ExternalAppMappingSection = () => {
  const { dataOwnerId } = useDataOwnerId();
  const [tab, setTab] = useState<EntityType>("product");
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [products, setProducts] = useState<Target[]>([]);
  const [branches, setBranches] = useState<Target[]>([]);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!dataOwnerId) return;
    setLoading(true);
    try {
      const [m, p, b] = await Promise.all([
        supabase.from("external_app_mappings")
          .select("id, entity_type, external_id, internal_id, label, is_active")
          .eq("user_id", dataOwnerId),
        supabase.from("products")
          .select("id, name, barcode")
          .eq("user_id", dataOwnerId)
          .order("name")
          .limit(2000),
        supabase.from("branches")
          .select("id, name, branch_code")
          .eq("user_id", dataOwnerId)
          .eq("is_active", true)
          .order("name"),
      ]);
      setMappings((m.data as MappingRow[]) || []);
      setProducts(((p.data as any[]) || []).map((x) => ({ id: x.id, name: x.name, extra: x.barcode })));
      setBranches(((b.data as any[]) || []).map((x) => ({ id: x.id, name: x.name, extra: x.branch_code })));
    } catch {
      toast.error("تعذر تحميل بيانات الربط");
    } finally {
      setLoading(false);
    }
  }, [dataOwnerId]);

  useEffect(() => { void load(); }, [load]);

  const byInternal = useMemo(() => {
    const map: Record<string, MappingRow> = {};
    for (const row of mappings) if (row.internal_id) map[`${row.entity_type}:${row.internal_id}`] = row;
    return map;
  }, [mappings]);

  const targets = tab === "product" ? products : branches;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return targets.slice(0, 200);
    return targets.filter((t) =>
      t.name.toLowerCase().includes(q) || (t.extra || "").toLowerCase().includes(q),
    ).slice(0, 200);
  }, [targets, search]);

  const saveMapping = async (target: Target) => {
    if (!dataOwnerId) return;
    const key = `${tab}:${target.id}`;
    const existing = byInternal[key];
    const value = (drafts[key] ?? existing?.external_id ?? "").trim();
    if (!value) { toast.error("أدخل الرقم الخارجي أولاً"); return; }
    setSavingId(target.id);
    try {
      const payload = {
        user_id: dataOwnerId,
        source: "malaky_app",
        entity_type: tab,
        external_id: value,
        internal_id: target.id,
        label: target.name,
        is_active: true,
      };
      const { error } = existing
        ? await supabase.from("external_app_mappings").update(payload).eq("id", existing.id)
        : await supabase.from("external_app_mappings").insert(payload as any);
      if (error) throw error;
      toast.success("تم حفظ الربط");
      setDrafts((d) => { const n = { ...d }; delete n[key]; return n; });
      await load();
    } catch (e: any) {
      toast.error(e?.code === "23505" ? "هذا الرقم الخارجي مستخدم لعنصر آخر" : "تعذر حفظ الربط");
    } finally {
      setSavingId(null);
    }
  };

  const removeMapping = async (id: string) => {
    const { error } = await supabase.from("external_app_mappings").delete().eq("id", id);
    if (error) { toast.error("تعذر حذف الربط"); return; }
    toast.success("تم حذف الربط");
    await load();
  };

  const mappedCount = mappings.filter((m) => m.entity_type === tab && m.internal_id).length;

  return (
    <SettingsSection
      title="ربط تطبيق الجوال (Mapping)"
      description="اربط أرقام المنتجات والفروع في تطبيق الزبون مع سجلات النظام، ليتم ترحيل الطلبيات على المنتج والفرع الصحيح."
      collapsible
      defaultOpen={false}
      action={
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as EntityType)}>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <TabsList>
            <TabsTrigger value="product">المنتجات</TabsTrigger>
            <TabsTrigger value="branch">الفروع</TabsTrigger>
          </TabsList>
          <Badge variant="secondary" className="gap-1">
            <Link2 className="h-3 w-3" /> مربوط: {mappedCount}
          </Badge>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الكود..."
              className="pr-8"
            />
          </div>
        </div>

        <TabsContent value={tab} className="mt-0">
          <div className="rounded-md border overflow-x-auto">
            <UITable>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم في النظام</TableHead>
                  <TableHead>الكود</TableHead>
                  <TableHead className="w-[180px]">الرقم في التطبيق</TableHead>
                  <TableHead className="w-[130px]">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => {
                  const key = `${tab}:${t.id}`;
                  const existing = byInternal[key];
                  const value = drafts[key] ?? existing?.external_id ?? "";
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{t.extra || "—"}</TableCell>
                      <TableCell>
                        <Input
                          value={value}
                          onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                          placeholder="مثال: 17"
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={savingId === t.id}
                            onClick={() => void saveMapping(t)}
                          >
                            حفظ
                          </Button>
                          {existing && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void removeMapping(existing.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!filtered.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                      {loading ? "جارِ التحميل..." : "لا توجد نتائج"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </UITable>
          </div>
        </TabsContent>
      </Tabs>
    </SettingsSection>
  );
};

export default ExternalAppMappingSection;
