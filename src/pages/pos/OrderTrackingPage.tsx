/** شاشة تتبع الطلبيات — النسخة الداخلية (مع اختيار الفرع وروابط الفروع وإعدادات الأهداف). */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompanyContext";
import { useOrderTracking } from "@/hooks/pos/useOrderTracking";
import TrackingBoard from "@/components/pos-tracking/TrackingBoard";
import PrepSlaSettingsDialog from "@/components/pos-tracking/PrepSlaSettingsDialog";
import { toast } from "sonner";
import { Link2, Settings2 } from "lucide-react";

interface Branch { id: string; name: string; public_slug: string | null }

export default function OrderTrackingPage() {
  const { company } = useCompany();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { orders, loading, refresh, deliverOrder, deliverItem } = useOrderTracking(branchId);

  useEffect(() => {
    supabase.from("branches").select("id, name, public_slug").eq("is_active", true).order("name")
      .then(({ data }) => {
        const list = ((data as any) || []) as Branch[];
        setBranches(list);
        setBranchId(prev => prev || list[0]?.id || null);
      });
  }, []);

  const current = branches.find(b => b.id === branchId);

  const copyLink = () => {
    if (!current?.public_slug) { toast.error("لا يوجد رابط لهذا الفرع"); return; }
    const url = `${window.location.origin}/track/${current.public_slug}`;
    navigator.clipboard.writeText(url);
    toast.success("تم نسخ رابط الفرع");
  };

  return (
    <>
      <TrackingBoard
        orders={orders}
        loading={loading}
        onRefresh={refresh}
        onDeliverOrder={deliverOrder}
        onDeliverItem={(lineId) => deliverItem(lineId)}
        branchName={current?.name || "كل الفروع"}
        companyName={company.name}
        logoUrl={company.logo_url}
        headerExtra={
          <div className="flex items-center gap-2">
            <select
              value={branchId || ""}
              onChange={(e) => setBranchId(e.target.value || null)}
              className="bg-white/10 text-white text-xs rounded-lg px-2 py-1.5 outline-none"
            >
              {branches.map(b => <option key={b.id} value={b.id} className="text-black">{b.name}</option>)}
            </select>
            <button onClick={copyLink} disabled={!branchId}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40" title="نسخ رابط الفرع">
              <Link2 className="w-4 h-4" />
            </button>
            <button onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20" title="أهداف زمن التحضير">
              <Settings2 className="w-4 h-4" />
            </button>
          </div>
        }
      />
      <PrepSlaSettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
}
