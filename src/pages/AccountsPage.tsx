import { useState, useEffect } from "react";
import { ArrowRight, Loader2, RefreshCw, Plus, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  { value: "Owner's Equity", label: "حقوق الملكية" },
  { value: "Revenue", label: "إيرادات" },
  { value: "Purchases", label: "مشتريات" },
  { value: "Expenses", label: "مصروفات" },
];

const AccountsPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountType, setNewAccountType] = useState("");
  const [adding, setAdding] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const fetchAccounts = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/airtable-accounts?clientId=${user.id}`,
        { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` } }
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

  // Initialize all sections as open
  useEffect(() => {
    if (accounts.length > 0) {
      const types = [...new Set(accounts.map(a => a.fields["Account Type"]).filter(Boolean))] as string[];
      const initial: Record<string, boolean> = {};
      types.forEach(t => { initial[t] = true; });
      setOpenSections(initial);
    }
  }, [accounts]);

  const handleAddAccount = async () => {
    if (!newAccountName.trim() || !newAccountType) return;
    setAdding(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("airtable-create-account", {
        body: { accountName: newAccountName.trim(), accountType: newAccountType, clientId: user?.id },
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

  const typeOrder = ["Asset", "Liability", "Owner's Equity", "Equity", "Revenue", "Purchases", "Expenses"];
  const accountTypes = [...new Set(accounts.map(a => a.fields["Account Type"]).filter(Boolean))]
    .sort((a, b) => (typeOrder.indexOf(a!) === -1 ? 99 : typeOrder.indexOf(a!)) - (typeOrder.indexOf(b!) === -1 ? 99 : typeOrder.indexOf(b!)));

  // Group accounts by type
  const groupedAccounts = accountTypes.reduce((acc, type) => {
    acc[type!] = accounts.filter(a => a.fields["Account Type"] === type);
    return acc;
  }, {} as Record<string, Account[]>);

  return (
    <div className="px-4 pt-6 space-y-4 pb-8" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/menu")} className="p-2 rounded-xl hover:bg-muted transition-colors">
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
        <div className="space-y-3">
          {accountTypes.map((type) => {
            const typeAccounts = groupedAccounts[type!] || [];
            const isOpen = openSections[type!] ?? true;

            return (
              <Collapsible
                key={type}
                open={isOpen}
                onOpenChange={(open) => setOpenSections(prev => ({ ...prev, [type!]: open }))}
              >
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={`text-[10px] ${typeColors[type!] || ""}`}>
                        {typeLabels[type!] || type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">({typeAccounts.length})</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
                  <div className="space-y-1.5 mt-1.5">
                    {typeAccounts.map((acc) => (
                      <Card key={acc.id} className="border-0 shadow-sm hover:shadow-md transition-all duration-200">
                        <CardContent className="p-3.5 flex items-center justify-between">
                          <p className="text-sm font-semibold text-foreground">{acc.fields["Account Name"]}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Add Account Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة حساب جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input placeholder="اسم الحساب" value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} dir="rtl" />
            <Select value={newAccountType} onValueChange={setNewAccountType} dir="rtl">
              <SelectTrigger><SelectValue placeholder="نوع الحساب" /></SelectTrigger>
              <SelectContent className="bg-background z-50">
                {accountTypeOptions.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button onClick={handleAddAccount} className="w-full gap-2 rounded-xl" disabled={adding || !newAccountName.trim() || !newAccountType}>
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
