import { useState, useEffect } from "react";
import { ArrowRight, Camera, User, Mail, Building2, MapPin, Globe, Briefcase, Save, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    display_name: "",
    company_name: "",
    country: "",
    address: "",
    work_field: "",
  });

  const email = user?.email || "";
  const displayName = profile.display_name || user?.user_metadata?.full_name || "";
  const initials = (profile.company_name || displayName || email)
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0])
    .join("");

  // Load profile from DB
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setProfile({
          display_name: data.display_name || "",
          company_name: data.company_name || "",
          country: data.country || "",
          address: data.address || "",
          work_field: data.work_field || "",
        });
      } else {
        // Fallback to user_metadata
        const meta = user.user_metadata || {};
        setProfile({
          display_name: meta.full_name || "",
          company_name: meta.company_name || "",
          country: meta.country || "",
          address: meta.address || "",
          work_field: meta.work_field || "",
        });
      }
    };
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").upsert(
        {
          user_id: user.id,
          display_name: profile.display_name || null,
          company_name: profile.company_name || null,
          country: profile.country || null,
          address: profile.address || null,
          work_field: profile.work_field || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      toast({ title: "✅ تم حفظ البيانات بنجاح" });
    } catch (err: any) {
      toast({ title: "خطأ في الحفظ", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: "display_name", label: "الاسم الكامل", icon: User, placeholder: "أدخل اسمك" },
    { key: "company_name", label: "اسم النشاط / الشركة", icon: Building2, placeholder: "مثال: شركة النور للتجارة" },
    { key: "work_field", label: "مجال العمل", icon: Briefcase, placeholder: "مثال: تجارة عامة" },
    { key: "country", label: "الدولة", icon: Globe, placeholder: "مثال: فلسطين" },
    { key: "address", label: "العنوان", icon: MapPin, placeholder: "مثال: رام الله" },
  ] as const;

  return (
    <div className="px-4 pt-6 pb-28 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.history.length > 1 ? navigate(-1) : navigate("/")}
          className="p-2 rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowRight className="h-5 w-5 text-foreground" />
        </button>
        <h1 className="text-xl font-bold text-foreground">إعدادات الحساب</h1>
      </div>

      {/* Avatar Section */}
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="relative">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-md border-2 border-primary/10">
            <span className="text-3xl font-bold text-primary">{initials || "؟"}</span>
          </div>
          <div className="absolute -bottom-1 -left-1 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-md">
            <Camera className="h-4 w-4 text-primary-foreground" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-foreground">{profile.company_name || displayName || "مستخدم جديد"}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 justify-center">
            <Mail className="h-3 w-3" />
            {email}
          </p>
        </div>
      </div>

      {/* Form Fields */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-4">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <field.icon className="h-3.5 w-3.5 text-muted-foreground" />
                {field.label}
              </label>
              <Input
                value={profile[field.key]}
                onChange={(e) => setProfile((p) => ({ ...p, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="h-11 rounded-xl bg-secondary/50 border-0 text-sm focus:ring-2 focus:ring-primary/20"
                dir="rtl"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-12 rounded-2xl text-base font-bold gap-2"
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
        حفظ التعديلات
      </Button>
    </div>
  );
};

export default ProfilePage;
