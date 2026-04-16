import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Shield, ArrowRight, Plus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

interface Card {
  id: string;
  card_number: string;
  product_id: string;
  contact_name: string | null;
  serial_number: string | null;
  start_date: string;
  end_date: string;
  status: string;
  invoice_id: string | null;
  product?: { name_ar: string };
}

const STATUS_BADGE: Record<string, { label: string; variant: any }> = {
  active: { label: "نشطة", variant: "default" },
  expired: { label: "منتهية", variant: "secondary" },
  claimed: { label: "تمت المطالبة", variant: "destructive" },
  void: { label: "ملغاة", variant: "outline" },
};

export default function WarrantyCardsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cards, setCards] = useState<Card[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const load = async () => {
    if (!user) return;
    let q = supabase
      .from("warranty_cards")
      .select("*, product:products(name_ar)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    const { data } = await q;
    setCards((data as any) || []);
  };

  useEffect(() => { load(); }, [user, statusFilter]);

  const filtered = cards.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      c.card_number?.toLowerCase().includes(s) ||
      c.serial_number?.toLowerCase().includes(s) ||
      c.contact_name?.toLowerCase().includes(s) ||
      c.product?.name_ar?.toLowerCase().includes(s)
    );
  });

  const today = new Date();
  const isExpiringSoon = (end: string) => {
    const d = new Date(end);
    const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 30;
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" dir="rtl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/warranty")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <Shield className="h-6 w-6 text-emerald-600" />
          <div>
            <h1 className="text-2xl font-bold">بطاقات الكفالة</h1>
            <p className="text-sm text-muted-foreground">جميع البطاقات الصادرة للعملاء</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate("/invoices")}>
          <Plus className="h-4 w-4 ml-2" /> من فاتورة
        </Button>
      </div>

      <Card className="p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-10" placeholder="رقم البطاقة، السيريال، العميل، أو الصنف..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="active">نشطة</SelectItem>
            <SelectItem value="expired">منتهية</SelectItem>
            <SelectItem value="claimed">تمت المطالبة</SelectItem>
            <SelectItem value="void">ملغاة</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>رقم البطاقة</TableHead>
              <TableHead>الصنف</TableHead>
              <TableHead>السيريال</TableHead>
              <TableHead>العميل</TableHead>
              <TableHead>تاريخ البيع</TableHead>
              <TableHead>تاريخ الانتهاء</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-left">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  لا توجد بطاقات
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => {
                const expiring = c.status === "active" && isExpiringSoon(c.end_date);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-sm">{c.card_number}</TableCell>
                    <TableCell>{c.product?.name_ar || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{c.serial_number || "—"}</TableCell>
                    <TableCell>{c.contact_name || "—"}</TableCell>
                    <TableCell>{format(new Date(c.start_date), "yyyy-MM-dd")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {format(new Date(c.end_date), "yyyy-MM-dd")}
                        {expiring && <AlertCircle className="h-4 w-4 text-orange-500" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[c.status]?.variant}>
                        {STATUS_BADGE[c.status]?.label || c.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/warranty/claims?card=${c.id}`)}
                        disabled={c.status !== "active"}
                      >
                        فتح مطالبة
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
