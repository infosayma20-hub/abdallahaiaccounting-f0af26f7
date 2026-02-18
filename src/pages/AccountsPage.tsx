import { useState, useEffect } from "react";
import { ArrowRight, Loader2, RefreshCw, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

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
  "Owner's Equity": "bg-muted text-muted-foreground",
  "Purchases": "bg-secondary text-secondary-foreground",
};

const typeLabels: Record<string, string> = {
  "Asset": "أصول",
  "Liability": "التزامات",
  "Revenue": "إيرادات",
  "Expenses": "مصروفات",
  "Equity": "حقوق الملكية",
  "Owner's Equity": "حقوق الملكية",
  "Purchases": "مشتريات",
};

const accountTypeOptions = [
  { value: "Asset", label: "أصول" },
  { value: "Liability", label: "التزامات" },
  { value: "Revenue", label: "إيرادات" },
  { value: "Expenses", label: "مصروفات" },
  { value: "Owner's Equity", label: "حقوق الملكية" },
  { value: "Purchases", label: "مشتريات" },
];

const AccountsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("");
  const [adding, setAdding] = useState(false);

  const fetchAccounts = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-accounts?clientId=${user.id}`,
        {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      if (!res.ok) throw new Error("Failed to fetch accounts");
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      setAccounts(data?.records || []);
    } catch (err: any) {
      setError(err.message || "خطأ في جلب البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, [user]);

  const handleAddAccount = async () => {
    if (!newAccountName.trim() || !newAccountType) return;
    setAdding(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("airtable-create-account", {
        body: {
          accountName: newAccountName.trim(),
          accountType: newAccountType,
          clientId: user?.id,
        },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      toast({ title: "تم إضافة الحساب بنجاح ✅" });
      setNewAccountName("");
      setNewAccountType("");
      setShowAddDialog(false);
      fetchAccounts();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const accountTypes = [...new Set(accounts.map(a => a.fields["Account Type"]).filter(Boolean))];
  const filtered = filterType ? accounts.filter(a => a.fields["Account Type"] === filterType) : accounts;

  return (
    <div className="px-4 pt-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-foreground">شجرة الحسابات</h1>
            <p className="text-xs text-muted-foreground">{accounts.length} حساب</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={fetchAccounts} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
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

      {/* Add Account Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة حساب جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="اسم الحساب"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              dir="rtl"
            />
            <Select value={newAccountType} onValueChange={setNewAccountType} dir="rtl">
              <SelectTrigger>
                <SelectValue placeholder="نوع الحساب" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {accountTypeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddAccount}
              className="w-full gap-2"
              disabled={adding || !newAccountName.trim() || !newAccountType}
            >
              {adding && <Loader2 className="h-4 w-4 animate-spin" />}
              إضافة
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountsPage;
