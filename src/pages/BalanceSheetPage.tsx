import { useState, useEffect, useMemo } from "react";
import { Loader2, Landmark } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ReportHeader, ReportSummary, exportToExcel, exportToPDF } from "@/components/ReportComponents";

interface AccountRecord {
  id: string;
  fields: {
    "Account Name"?: string;
    "Account Code"?: string;
    "Account Type"?: string;
    "Balance"?: number;
  };
}

interface CategoryGroup {
  title: string;
  accounts: { name: string; code: string; balance: number }[];
  total: number;
}

const getSubcategory = (code: string, type: string): string => {
  const num = parseInt(code);
  if (type === "Asset") {
    if (num >= 1100 && num < 1200) return "أصول متداولة";
    return "أصول غير متداولة";
  }
  if (type === "Liability") {
    if (num >= 2100 && num < 2200) return "التزامات متداولة";
    return "التزامات غير متداولة";
  }
  return "حقوق الملكية";
};

const BalanceSheetPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("company_name").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data?.company_name) setCompanyName(data.company_name); });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-accounts?clientId=${user.id}`,
          { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
        );
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setAccounts(data?.records || []);
      } catch { /* silent */ }
      setLoading(false);
    };
    load();
  }, [user]);

  const { assetGroups, liabilityGroups, equityGroups, totalAssets, totalLiabilities, totalEquity } = useMemo(() => {
    const assets: Record<string, CategoryGroup> = {};
    const liabilities: Record<string, CategoryGroup> = {};
    const equity: Record<string, CategoryGroup> = {};
    let tAssets = 0, tLiab = 0, tEquity = 0;

    accounts.forEach(acc => {
      const f = acc.fields;
      const name = f["Account Name"] || "";
      const code = f["Account Code"] || "0";
      const type = f["Account Type"] || "";
      const balance = f["Balance"] || 0;
      if (balance === 0) return;

      const sub = getSubcategory(code, type);
      const entry = { name, code, balance: Math.abs(balance) };

      if (type === "Asset") {
        if (!assets[sub]) assets[sub] = { title: sub, accounts: [], total: 0 };
        assets[sub].accounts.push(entry);
        assets[sub].total += Math.abs(balance);
        tAssets += Math.abs(balance);
      } else if (type === "Liability") {
        if (!liabilities[sub]) liabilities[sub] = { title: sub, accounts: [], total: 0 };
        liabilities[sub].accounts.push(entry);
        liabilities[sub].total += Math.abs(balance);
        tLiab += Math.abs(balance);
      } else if (type === "Equity") {
        if (!equity[sub]) equity[sub] = { title: sub, accounts: [], total: 0 };
        equity[sub].accounts.push(entry);
        equity[sub].total += Math.abs(balance);
        tEquity += Math.abs(balance);
      }
    });

    // Sort accounts by code within groups
    const sortGroup = (g: Record<string, CategoryGroup>) =>
      Object.values(g).map(grp => ({ ...grp, accounts: grp.accounts.sort((a, b) => a.code.localeCompare(b.code)) }));

    return {
      assetGroups: sortGroup(assets),
      liabilityGroups: sortGroup(liabilities),
      equityGroups: sortGroup(equity),
      totalAssets: tAssets,
      totalLiabilities: tLiab,
      totalEquity: tEquity,
    };
  }, [accounts]);

  const periodLabel = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1;

  const handleExportExcel = () => {
    const rows: Record<string, any>[] = [];
    const addSection = (title: string, groups: CategoryGroup[]) => {
      rows.push({ "البيان": `═══ ${title} ═══`, "الكود": "", "الرصيد": "" });
      groups.forEach(g => {
        rows.push({ "البيان": `── ${g.title}`, "الكود": "", "الرصيد": "" });
        g.accounts.forEach(a => rows.push({ "البيان": a.name, "الكود": a.code, "الرصيد": a.balance }));
        rows.push({ "البيان": `إجمالي ${g.title}`, "الكود": "", "الرصيد": g.total });
      });
    };
    addSection("الأصول", assetGroups);
    addSection("الالتزامات", liabilityGroups);
    addSection("حقوق الملكية", equityGroups);
    rows.push({ "البيان": "", "الكود": "", "الرصيد": "" });
    rows.push({ "البيان": "إجمالي الأصول", "الكود": "", "الرصيد": totalAssets });
    rows.push({ "البيان": "إجمالي الالتزامات + حقوق الملكية", "الكود": "", "الرصيد": totalLiabilities + totalEquity });

    exportToExcel(rows, {
      "التقرير": "قائمة المركز المالي",
      "التاريخ": periodLabel,
      "إجمالي الأصول": totalAssets,
      "إجمالي الالتزامات": totalLiabilities,
      "حقوق الملكية": totalEquity,
      "متوازن": isBalanced ? "نعم" : "لا",
    }, `المركز-المالي-${Date.now()}`);
  };

  const handleExportPDF = () => {
    const rows: Record<string, any>[] = [];
    const addSection = (groups: CategoryGroup[]) => {
      groups.forEach(g => {
        g.accounts.forEach(a => rows.push({ "البيان": a.name, "الكود": a.code, "الرصيد": `₪${a.balance.toLocaleString()}` }));
      });
    };
    addSection(assetGroups);
    addSection(liabilityGroups);
    addSection(equityGroups);

    exportToPDF("قائمة المركز المالي", companyName, periodLabel, {
      "إجمالي الأصول": `₪${totalAssets.toLocaleString()}`,
      "إجمالي الالتزامات": `₪${totalLiabilities.toLocaleString()}`,
      "حقوق الملكية": `₪${totalEquity.toLocaleString()}`,
      "التوازن": isBalanced ? "✅ متوازن" : "⚠️ غير متوازن",
    }, rows);
  };

  const renderSection = (title: string, groups: CategoryGroup[], total: number, color: string) => (
    <div className="space-y-3">
      <h2 className={`text-sm font-bold ${color} px-1`}>{title}</h2>
      {groups.map(group => (
        <div key={group.title} className="rounded-xl border border-border/50 overflow-hidden">
          <div className="bg-muted/40 px-4 py-2 text-[11px] font-bold text-muted-foreground">{group.title}</div>
          {group.accounts.map(acc => (
            <div key={acc.code} className="flex items-center justify-between px-4 py-2.5 border-t border-border/30 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] text-muted-foreground font-mono w-10">{acc.code}</span>
                <span className="text-foreground font-medium truncate">{acc.name}</span>
              </div>
              <span className="font-bold tabular-nums text-foreground whitespace-nowrap">₪{acc.balance.toLocaleString()}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/20 text-xs font-bold">
            <span className="text-muted-foreground">إجمالي {group.title}</span>
            <span className={color}>₪{group.total.toLocaleString()}</span>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-muted/50 border border-border/50 text-sm font-bold">
        <span className="text-foreground">إجمالي {title}</span>
        <span className={color}>₪{total.toLocaleString()}</span>
      </div>
    </div>
  );

  return (
    <div className="px-4 pt-6 space-y-5 pb-8" dir="rtl">
      <ReportHeader
        reportName="قائمة المركز المالي"
        companyName={companyName}
        period={`كما في ${periodLabel}`}
        onBack={() => navigate(-1)}
        onExportPDF={!loading ? handleExportPDF : undefined}
        onExportExcel={!loading ? handleExportExcel : undefined}
        icon={<Landmark className="h-5 w-5 text-primary" />}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <ReportSummary items={[
            { label: "إجمالي الأصول", value: totalAssets, color: "primary" },
            { label: "إجمالي الالتزامات", value: totalLiabilities, color: "destructive" },
            { label: "حقوق الملكية", value: totalEquity, color: "warning" },
          ]} />

          {/* Balance check */}
          <div className={`text-center text-xs py-2 rounded-lg ${isBalanced ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
            {isBalanced ? "✅ الميزانية متوازنة (الأصول = الالتزامات + حقوق الملكية)" : `⚠️ الميزانية غير متوازنة — فرق: ₪${Math.abs(totalAssets - totalLiabilities - totalEquity).toLocaleString()}`}
          </div>

          {/* Sections */}
          {renderSection("الأصول", assetGroups, totalAssets, "text-primary")}
          {renderSection("الالتزامات", liabilityGroups, totalLiabilities, "text-destructive")}
          {renderSection("حقوق الملكية", equityGroups, totalEquity, "text-warning")}

          {/* Final equation */}
          <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 text-center space-y-1">
            <p className="text-[10px] text-muted-foreground font-medium">المعادلة المحاسبية</p>
            <p className="text-sm font-bold text-foreground">
              الأصول <span className="text-primary">₪{totalAssets.toLocaleString()}</span>
              {" = "}
              الالتزامات <span className="text-destructive">₪{totalLiabilities.toLocaleString()}</span>
              {" + "}
              حقوق الملكية <span className="text-warning">₪{totalEquity.toLocaleString()}</span>
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default BalanceSheetPage;
