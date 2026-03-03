import { useState, useEffect, useRef } from "react";
import { ArrowRight, Camera, User, Mail, Building2, MapPin, Globe, Briefcase, Save, Loader2, LogOut, Users, ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        const meta = user.user_metadata || {};
        setProfile({
          display_name: meta.full_name || "",
          company_name: meta.company_name || "",
          country: meta.country || "",
          address: meta.address || "",
          work_field: meta.work_field || "",
        });
      }
      // Load avatar
      const { data: files } = await supabase.storage.from("avatars").list(user.id, { limit: 1, sortBy: { column: "created_at", order: "desc" } });
      if (files && files.length > 0) {
        const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(`${user.id}/${files[0].name}`);
        setAvatarUrl(urlData.publicUrl);
      }
    };
    load();
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "الحجم كبير", description: "الحد الأقصى 5 ميغابايت", variant: "destructive" });
      return;
    }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(urlData.publicUrl + "?t=" + Date.now());
      toast({ title: "✅ تم تحديث الصورة" });
    } catch (err: any) {
      toast({ title: "خطأ في رفع الصورة", description: err.message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

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
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-md border-2 border-primary/10 overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-primary">{initials || "؟"}</span>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute -bottom-1 -left-1 w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-md hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
          >
            {uploadingAvatar ? (
              <Loader2 className="h-4 w-4 text-primary-foreground animate-spin" />
            ) : (
              <Camera className="h-4 w-4 text-primary-foreground" />
            )}
          </button>
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

      {/* Team Management Link */}
      <Card
        className="border-0 shadow-sm cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => navigate("/team")}
      >
        <CardContent className="p-4 flex items-center justify-between">
          <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-3">
            <div>
              <p className="text-sm font-bold text-foreground">إدارة الفريق والصلاحيات</p>
              <p className="text-[11px] text-muted-foreground">إضافة مستخدمين وتعيين الأدوار</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-primary" />
            </div>
          </div>
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

      {/* Logout Button */}
      <Button
        onClick={signOut}
        variant="outline"
        className="w-full h-12 rounded-2xl text-base font-bold gap-2 text-destructive border-destructive/30 hover:bg-destructive/10"
      >
        <LogOut className="h-5 w-5" />
        تسجيل الخروج
      </Button>
    </div>
  );
};

export default ProfilePage;
