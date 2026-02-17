import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { User } from "@supabase/supabase-js";

interface CompleteProfileDialogProps {
  open: boolean;
  onClose: () => void;
  user: User;
}

const CompleteProfileDialog = ({ open, onClose, user }: CompleteProfileDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("");
  const [workField, setWorkField] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Update user metadata
      await supabase.auth.updateUser({
        data: { phone, company_name: companyName, address, country, work_field: workField },
      });

      // Sync to Airtable with full data
      await supabase.functions.invoke("airtable-create-client", {
        body: {
          clientName: user.id,
          contactEmail: user.email || "",
          phoneNumber: phone,
          companyName,
          address,
          country,
          workField,
        },
      });

      localStorage.setItem(`airtable_synced_${user.id}`, "true");
      localStorage.setItem(`profile_completed_${user.id}`, "true");
      toast({ title: "تم حفظ البيانات بنجاح ✅" });
      onClose();
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle>أكمل بياناتك</DialogTitle>
          <DialogDescription>أدخل المعلومات المتبقية لإكمال ملفك الشخصي</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input placeholder="رقم الهاتف" value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" type="tel" />
          <Input placeholder="اسم الشركة" value={companyName} onChange={(e) => setCompanyName(e.target.value)} dir="rtl" />
          <Input placeholder="العنوان" value={address} onChange={(e) => setAddress(e.target.value)} dir="rtl" />
          <Select value={country} onValueChange={setCountry} dir="rtl">
            <SelectTrigger><SelectValue placeholder="اختر الدولة" /></SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="PS">🇵🇸 فلسطين</SelectItem>
              <SelectItem value="JO">🇯🇴 الأردن</SelectItem>
              <SelectItem value="SA">🇸🇦 السعودية</SelectItem>
              <SelectItem value="AE">🇦🇪 الإمارات</SelectItem>
              <SelectItem value="EG">🇪🇬 مصر</SelectItem>
              <SelectItem value="LB">🇱🇧 لبنان</SelectItem>
              <SelectItem value="SY">🇸🇾 سوريا</SelectItem>
              <SelectItem value="IQ">🇮🇶 العراق</SelectItem>
              <SelectItem value="KW">🇰🇼 الكويت</SelectItem>
              <SelectItem value="BH">🇧🇭 البحرين</SelectItem>
              <SelectItem value="QA">🇶🇦 قطر</SelectItem>
              <SelectItem value="OM">🇴🇲 عُمان</SelectItem>
              <SelectItem value="YE">🇾🇪 اليمن</SelectItem>
              <SelectItem value="MA">🇲🇦 المغرب</SelectItem>
              <SelectItem value="TN">🇹🇳 تونس</SelectItem>
              <SelectItem value="DZ">🇩🇿 الجزائر</SelectItem>
              <SelectItem value="LY">🇱🇾 ليبيا</SelectItem>
              <SelectItem value="SD">🇸🇩 السودان</SelectItem>
              <SelectItem value="TR">🇹🇷 تركيا</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="مجال العمل" value={workField} onChange={(e) => setWorkField(e.target.value)} dir="rtl" />
          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CompleteProfileDialog;
