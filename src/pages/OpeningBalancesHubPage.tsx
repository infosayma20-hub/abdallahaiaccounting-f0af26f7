import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import {
  Users, Building2, Landmark, Wallet, Package, FileSpreadsheet,
  ArrowLeft, Scale, CheckCircle2, AlertCircle,
} from "lucide-react";

type Stat = { label: string; value: number; icon: any; href: string; description: string; color: string };

const OpeningBalancesHubPage = () => {
  const navigate = useNavigate();
  const ownerId = useDataOwnerId();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    customers: 0, suppliers: 0, cashBoxes: 0, banks: 0, totalDebit: 0, totalCredit: 0,
  });

  useEffect(() => {
    if (!ownerId) return;
    (async () => {
      try {
        // Count contacts that have an opening balance transaction attached
        const [obTx, cashBoxesRes, banksRes] = await Promise.all([
          supabase
            .from("transactions")
            .select("id, contact_id, amount, direction, type", { count: "exact" })
            .eq("data_owner_id", ownerId)
            .eq("is_opening_balance", true)
            .eq("is_deleted", false),
          supabase
            .from("cash_boxes")
            .select("id, opening_balance", { count: "exact" })
            .eq("data_owner_id", ownerId)
            .eq("is_deleted", false),
          supabase
            .from("bank_accounts")
            .select("id, opening_balance", { count: "exact" })
            .eq("data_owner_id", ownerId),
        ]);

        const rows = obTx.data || [];
        const debit = rows.filter((r: any) => r.direction === "debit")
          .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
        const credit = rows.filter((r: any) => r.direction === "credit")
          .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

        // Approximate customers vs suppliers by fetching related contact types
        const contactIds = Array.from(new Set(rows.map((r: any) => r.contact_id).filter(Boolean)));
        let customers = 0, suppliers = 0;
        if (contactIds.length > 0) {
          const { data: cs } = await supabase
            .from("contacts")
            .select("id, type")
            .in("id", contactIds);
          (cs || []).forEach((c: any) => {
            if (c.type === "مورد") suppliers++;
            else customers++;
          });
        }

        setStats({
          customers,
          suppliers,
          cashBoxes: (cashBoxesRes.data || []).filter((c: any) => Number(c.opening_balance || 0) !== 0).length,
          banks: (banksRes.data || []).filter((b: any) => Number(b.opening_balance || 0) !== 0).length,
          totalDebit: debit,
          totalCredit: credit,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [ownerId]);

  const cards: Stat[] = [
    { label: "أرصدة العملاء", value: stats.customers, icon: Users, href: "/contacts", color: "text-blue-600", description: "افتح بطاقة العميل وأضف الرصيد الافتتاحي" },
    { label: "أرصدة الموردين", value: stats.suppliers, icon: Building2, href: "/contacts", color: "text-orange-600", description: "افتح بطاقة المورد وأضف الرصيد الافتتاحي" },
    { label: "الصناديق النقدية", value: stats.cashBoxes, icon: Wallet, href: "/cash-boxes", color: "text-emerald-600", description: "من قائمة الصناديق ← رصيد افتتاحي عملة" },
    { label: "الحسابات البنكية", value: stats.banks, icon: Landmark, href: "/bank-accounts", color: "text-indigo-600", description: "من قائمة البنوك ← تعديل الرصيد الافتتاحي" },
  ];

  const isBalanced = Math.abs(stats.totalDebit - stats.totalCredit) < 0.01;

  return (
    <div className="p-4 space-y-4 max-w-7xl mx-auto" dir="rtl">
      <PageHeader title="مركز الأرصدة الافتتاحية" />

      <Card className="border-2 border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Scale className="h-6 w-6 text-primary shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground">توازن الأرصدة الافتتاحية</h3>
              <p className="text-xs text-muted-foreground mt-1">
                يجب أن يتساوى مجموع المدين مع مجموع الدائن قبل ترحيل أي حركة جديدة.
              </p>
              <div className="grid grid-cols-3 gap-3 mt-3 text-xs">
                <div className="p-2 bg-white dark:bg-card rounded border">
                  <div className="text-muted-foreground">مجموع مدين</div>
                  <div className="font-bold text-emerald-700 font-mono">
                    {stats.totalDebit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="p-2 bg-white dark:bg-card rounded border">
                  <div className="text-muted-foreground">مجموع دائن</div>
                  <div className="font-bold text-rose-700 font-mono">
                    {stats.totalCredit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className={`p-2 rounded border ${isBalanced ? "bg-emerald-50 border-emerald-300" : "bg-amber-50 border-amber-300"}`}>
                  <div className="text-muted-foreground flex items-center gap-1">
                    {isBalanced ? <CheckCircle2 className="h-3 w-3 text-emerald-600" /> : <AlertCircle className="h-3 w-3 text-amber-600" />}
                    الفرق
                  </div>
                  <div className={`font-bold font-mono ${isBalanced ? "text-emerald-700" : "text-amber-700"}`}>
                    {(stats.totalDebit - stats.totalCredit).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <Card
              key={c.label}
              className="border-2 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
              onClick={() => navigate(c.href)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`h-6 w-6 ${c.color}`} />
                  <span className="text-2xl font-bold text-foreground">{loading ? "…" : c.value}</span>
                </div>
                <div className="text-sm font-bold text-foreground">{c.label}</div>
                <div className="text-[11px] text-muted-foreground mt-1">{c.description}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            استيراد أرصدة من Excel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            استخدم شاشة الاستيراد لتحميل ملفات Excel جاهزة (عملاء، موردين، بنوك، شيكات، مخزون، أصول ثابتة، صناديق، قروض، حقوق ملكية).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate("/opening-balances-import")} className="gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              فتح شاشة الاستيراد
            </Button>
            <Button variant="outline" onClick={() => navigate("/general-ledger")} className="gap-2">
              <Package className="h-4 w-4" />
              دفتر الأستاذ العام
            </Button>
            <Button variant="outline" onClick={() => navigate(-1)} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              رجوع
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OpeningBalancesHubPage;