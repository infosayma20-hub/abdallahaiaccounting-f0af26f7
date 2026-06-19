import { useState, useEffect, useRef } from "react";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Trash2, Truck, CreditCard, Search, X, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DeliveryApp {
  id: string;
  name: string;
  icon: string;
  is_active: boolean;
  display_order: number;
  visa_gl_account_code: string | null;
}

interface AccountOption {
  account_code: string;
  account_name: string;
  account_type: string;
}

interface Props {
  userId: string;
}

const EMOJI_OPTIONS = ["🛵", "🍔", "⏰", "📞", "🚗", "🍕", "📱", "🏍️", "🚲", "🛒", "💳", "🤖"];

const AccountSearchPicker = ({
  value,
  onChange,
  accounts,
}: {
  value: string | null;
  onChange: (code: string) => void;
  accounts: AccountOption[];
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedAccount = accounts.find(a => a.account_code === value);

  const searchTerms = search.toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = search
    ? accounts.filter(a => {
        const text = `${a.account_code} ${a.account_name} ${a.account_type}`.toLowerCase();
        return searchTerms.every(t => text.includes(t));
      })
    : accounts;

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-7 text-xs max-w-[220px] w-full flex items-center gap-1 px-2 rounded-md border border-input bg-background hover:bg-muted/50 transition text-right"
          dir="rtl"
        >
          {selectedAccount ? (
            <span className="truncate flex-1">
              {selectedAccount.account_code} - {selectedAccount.account_name}
            </span>
          ) : (
            <span className="text-muted-foreground truncate flex-1">بحث عن حساب...</span>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" dir="rtl">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالرقم أو الاسم..."
              className="h-8 text-xs pr-7 pl-7"
              dir="rtl"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2">
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد نتائج</p>
          ) : (
            filtered.map(a => (
              <button
                key={a.account_code}
                onClick={() => { onChange(a.account_code); setOpen(false); setSearch(""); }}
                className={`w-full text-right px-3 py-2 text-xs hover:bg-accent/50 flex items-center gap-2 transition ${
                  value === a.account_code ? "bg-accent/30 font-medium" : ""
                }`}
              >
                <span className="font-mono text-[10px] text-muted-foreground w-10 text-left flex-shrink-0">{a.account_code}</span>
                <span className="truncate flex-1">{a.account_name}</span>
              </button>
            ))
          )}
        </div>
        {value && (
          <div className="p-1.5 border-t border-border">
            <button
              onClick={() => { onChange(""); setOpen(false); }}
              className="w-full text-xs text-destructive hover:bg-destructive/10 rounded px-2 py-1 transition"
            >
              مسح الحساب المحدد
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

const DeliveryAppsManager = ({ userId }: Props) => {
  const [apps, setApps] = useState<DeliveryApp[]>([]);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("📱");
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);

  const loadApps = async () => {
    const { data } = await supabase
      .from("delivery_apps" as any)
      .select("*")
      .eq("user_id", dataOwnerId!)
      .order("display_order");
    setApps((data as any) || []);
    setLoading(false);
  };

  const loadAccounts = async () => {
    const { data } = await supabase
      .from("accounts")
      .select("account_code, account_name, account_type")
      .eq("user_id", dataOwnerId!)
      .eq("is_active", true)
      .order("account_code");
    setAccounts(data || []);
  };

  useEffect(() => {
    if (userId) {
      loadApps();
      loadAccounts();
    }
  }, [userId]);

  const addApp = async () => {
    if (!newName.trim()) return;
    await supabase.from("delivery_apps" as any).insert({
      user_id: dataOwnerId!,
      name: newName.trim(),
      icon: newIcon,
      display_order: apps.length + 1,
    } as any);
    setNewName("");
    toast.success("تمت الإضافة");
    loadApps();
  };

  const toggleApp = async (id: string, isActive: boolean) => {
    await supabase.from("delivery_apps" as any).update({ is_active: isActive } as any).eq("id", id);
    loadApps();
  };

  const updateVisaAccount = async (id: string, code: string) => {
    await supabase.from("delivery_apps" as any).update({ visa_gl_account_code: code || null } as any).eq("id", id);
    setApps(prev => prev.map(a => a.id === id ? { ...a, visa_gl_account_code: code || null } : a));
  };

  const deleteApp = async (id: string) => {
    await supabase.from("delivery_apps" as any).delete().eq("id", id);
    toast.success("تم الحذف");
    loadApps();
  };

  if (loading) return null;

  return (
    <div>
      <h3 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
        <span className="w-1 h-5 bg-primary rounded-full" />
        <Truck className="h-4 w-4" />
        تطبيقات التوصيل (كول سنتر)
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        إدارة قائمة تطبيقات التوصيل. يمكنك تعيين حساب ذمة (GL) لفيزا كل شركة ليظهر كطريقة دفع مستقلة في الكول سنتر.
      </p>

      <div className="space-y-3 mb-4">
        {apps.length === 0 && (
          <div className="border border-dashed border-border rounded-lg p-6 text-center">
            <Truck className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-[13px] font-medium text-foreground">لا توجد تطبيقات توصيل بعد</p>
            <p className="text-[11.5px] text-muted-foreground mt-1">
              أضف تطبيقاً من الأسفل ليظهر كطريقة دفع في الكول سنتر.
            </p>
          </div>
        )}
        {apps.map((app) => (
          <div key={app.id} className="p-3 bg-muted/40 rounded-lg border border-border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">{app.icon}</span>
                <span className="text-sm font-medium">{app.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={app.is_active} onCheckedChange={(v) => toggleApp(app.id, v)} />
                <button
                  onClick={() => deleteApp(app.id)}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {/* Visa GL Account */}
            <div className="flex items-center gap-2 pr-8">
              <CreditCard className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <Label className="text-[11px] text-muted-foreground whitespace-nowrap">حساب ذمة الفيزا:</Label>
              <AccountSearchPicker
                value={app.visa_gl_account_code}
                onChange={(code) => updateVisaAccount(app.id, code)}
                accounts={accounts}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={newIcon}
          onChange={(e) => setNewIcon(e.target.value)}
          className="h-10 w-16 rounded-lg border border-input bg-background text-center text-lg"
        >
          {EMOJI_OPTIONS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="اسم التطبيق الجديد..."
          className="h-10 flex-1"
          onKeyDown={(e) => e.key === "Enter" && addApp()}
        />
        <Button onClick={addApp} size="sm" disabled={!newName.trim()} className="gap-1">
          <Plus className="h-4 w-4" /> إضافة
        </Button>
      </div>
    </div>
  );
};

export default DeliveryAppsManager;
