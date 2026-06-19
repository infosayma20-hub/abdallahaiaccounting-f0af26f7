import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, FileText, AlertCircle, Building2, BarChart3, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

interface Stats {
  activeCards: number;
  expiringSoon: number;
  openClaims: number;
  pendingSupplierClaims: number;
}

export default function WarrantyHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats>({
    activeCards: 0,
    expiringSoon: 0,
    openClaims: 0,
    pendingSupplierClaims: 0,
  });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const in30 = new Date();
      in30.setDate(in30.getDate() + 30);
      const in30Str = in30.toISOString().slice(0, 10);

      const [active, expiring, claims, sup] = await Promise.all([
        supabase.from("warranty_cards").select("id", { count: "exact", head: true })
          .eq("user_id", dataOwnerId!).eq("status", "active"),
        supabase.from("warranty_cards").select("id", { count: "exact", head: true })
          .eq("user_id", dataOwnerId!).eq("status", "active")
          .gte("end_date", today).lte("end_date", in30Str),
        supabase.from("warranty_claims").select("id", { count: "exact", head: true })
          .eq("user_id", dataOwnerId!).in("status", ["open", "in_progress"]),
        supabase.from("warranty_supplier_claims").select("id", { count: "exact", head: true })
          .eq("user_id", dataOwnerId!).eq("status", "pending"),
      ]);

      setStats({
        activeCards: active.count || 0,
        expiringSoon: expiring.count || 0,
        openClaims: claims.count || 0,
        pendingSupplierClaims: sup.count || 0,
      });
    })();
  }, [user]);

  const tiles = [
    { id: "policies", label: "سياسات الكفالة", desc: "إدارة كفالات الأصناف", icon: Shield, color: "text-primary", bg: "bg-primary/10", path: "/warranty/policies" },
    { id: "cards", label: "بطاقات الكفالة", desc: "بطاقات العملاء النشطة", icon: FileText, color: "text-emerald-600", bg: "bg-emerald-500/10", path: "/warranty/cards", badge: stats.activeCards },
    { id: "claims", label: "مطالبات العملاء", desc: "تسجيل ومتابعة الأعطال", icon: AlertCircle, color: "text-amber-600", bg: "bg-amber-500/10", path: "/warranty/claims", badge: stats.openClaims },
    { id: "supplier", label: "مطالبات الشركة الأم", desc: "تعويضات الموردين", icon: Building2, color: "text-violet-600", bg: "bg-violet-500/10", path: "/warranty/supplier-claims", badge: stats.pendingSupplierClaims },
    { id: "reports", label: "التقارير", desc: "تحليلات وتنبيهات", icon: BarChart3, color: "text-sky-600", bg: "bg-sky-500/10", path: "/warranty/reports" },
  ];

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl" dir="rtl">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">الكفالات والضمانات</h1>
          <p className="text-sm text-muted-foreground">إدارة كاملة لكفالات الأصناف، البطاقات، والمطالبات</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-emerald-600" />
            <div>
              <p className="text-xs text-muted-foreground">بطاقات نشطة</p>
              <p className="text-2xl font-bold">{stats.activeCards}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Clock className="h-8 w-8 text-orange-500" />
            <div>
              <p className="text-xs text-muted-foreground">تنتهي خلال 30 يوم</p>
              <p className="text-2xl font-bold">{stats.expiringSoon}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-8 w-8 text-amber-600" />
            <div>
              <p className="text-xs text-muted-foreground">مطالبات مفتوحة</p>
              <p className="text-2xl font-bold">{stats.openClaims}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-8 w-8 text-violet-600" />
            <div>
              <p className="text-xs text-muted-foreground">مطالبات مع المورد</p>
              <p className="text-2xl font-bold">{stats.pendingSupplierClaims}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiles.map((t) => (
          <Card
            key={t.id}
            onClick={() => navigate(t.path)}
            className="p-5 cursor-pointer hover:shadow-md transition-all hover:border-primary/40"
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl ${t.bg} flex items-center justify-center`}>
                <t.icon className={`h-6 w-6 ${t.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold">{t.label}</p>
                  {t.badge !== undefined && t.badge > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{t.badge}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
