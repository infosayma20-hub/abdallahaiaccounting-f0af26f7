import { useState, useEffect } from "react";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

interface Account {
  id: string;
  fields: {
    "Account Name"?: string;
    "Account Type"?: string;
  };
}

const typeColors: Record<string, string> = {
  "Asset": "bg-primary/10 text-primary",
  "Liability": "bg-warning/10 text-warning",
  "Revenue": "bg-accent text-accent-foreground",
  "Expenses": "bg-destructive/10 text-destructive",
  "Equity": "bg-muted text-muted-foreground",
  "Purchases": "bg-secondary text-secondary-foreground",
};

const typeLabels: Record<string, string> = {
  "Asset": "أصول",
  "Liability": "التزامات",
  "Revenue": "إيرادات",
  "Expenses": "مصروفات",
  "Equity": "حقوق ملكية",
  "Purchases": "مشتريات",
};

const AccountsPage = () => {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);

  const fetchAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("airtable-accounts");
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setAccounts(data?.records || []);
    } catch (err: any) {
      setError(err.message || "خطأ في جلب البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, []);

  const accountTypes = [...new Set(accounts.map(a => a.fields["Account Type"]).filter(Boolean))];
  const filtered = filterType ? accounts.filter(a => a.fields["Account Type"] === filterType) : accounts;

  return (
    <div className="px-4 pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">شجرة الحسابات</h1>
            <p className="text-xs text-muted-foreground">{accounts.length} حساب</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchAccounts} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Filters */}
      {!loading && accountTypes.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterType(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              !filterType ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
            }`}
          >
            الكل
          </button>
          {accountTypes.map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type!)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filterType === type ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
              }`}
            >
              {typeLabels[type!] || type}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchAccounts}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {filtered.map((acc) => (
            <Card key={acc.id} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{acc.fields["Account Name"]}</p>
                {acc.fields["Account Type"] && (
                  <Badge variant="secondary" className={`text-[10px] ${typeColors[acc.fields["Account Type"]] || ""}`}>
                    {typeLabels[acc.fields["Account Type"]] || acc.fields["Account Type"]}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AccountsPage;
