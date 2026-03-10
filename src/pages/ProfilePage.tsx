import { useState, useEffect, useRef } from "react";
import { ArrowRight, Camera, User, Mail, Building2, MapPin, Globe, Briefcase, Save, Loader2, LogOut, Trash2, Check } from "lucide-react";
import BrandIdentitySettings from "@/components/settings/BrandIdentitySettings";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/hooks/useCompanyContext";

const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB
const ACCEPTED_FORMATS = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"];

const compressImage = (file: File, maxDim: number = 400): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    if (file.type === "image/svg+xml") {
      resolve(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Compression failed")), "image/png", 0.9);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image load failed")); };
    img.src = url;
  });
};

const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { company, updateCompanyLogo, refreshCompany } = useCompany();
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoSuccess, setLogoSuccess] = useState(false);
  const [hovering, setHovering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
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
        // Load avatar from profiles.avatar_url
        if ((data as any).avatar_url) {
          setAvatarUrl((data as any).avatar_url);
        }
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
      const compressed = await compressImage(file, 300);
      const path = `${user.id}/avatar.png`;
      const { error } = await supabase.storage.from("user-avatars").upload(path, compressed, { upsert: true, contentType: "image/png" });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("user-avatars").getPublicUrl(path);
      const publicUrl = urlData.publicUrl + "?t=" + Date.now();
      
      // Save to profiles table (NOT companies)
      await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl } as any)
        .eq("user_id", user.id);
      
      setAvatarUrl(publicUrl);
      toast({ title: "✅ تم تحديث الصورة الشخصية" });
    } catch (err: any) {
      toast({ title: "خطأ في رفع الصورة", description: err.message, variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!ACCEPTED_FORMATS.includes(file.type)) {
      toast({ title: "صيغة غير مدعومة", description: "يُقبل PNG، JPG، SVG، WEBP فقط", variant: "destructive" });
      return;
    }
    if (file.size > MAX_LOGO_SIZE) {
      toast({ title: "الحجم كبير جداً", description: "الحجم الأقصى 2MB", variant: "destructive" });
      return;
    }

    setUploadingLogo(true);
    try {
      const compressed = await compressImage(file);
      const ext = file.type === "image/svg+xml" ? "svg" : "png";
      const path = `${user.id}/logo.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from("company-logos")
        .upload(path, compressed, { upsert: true, contentType: file.type === "image/svg+xml" ? "image/svg+xml" : "image/png" });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("company-logos").getPublicUrl(path);
      const publicUrl = urlData.publicUrl + "?t=" + Date.now();

      // Update companies table
      await supabase
        .from("companies")
        .update({ logo_url: publicUrl, updated_at: new Date().toISOString() } as any)
        .eq("owner_id", user.id);

      // Also update company_settings if exists
      await supabase
        .from("company_settings" as any)
        .update({ logo_url: publicUrl } as any)
        .eq("user_id", user.id);

      updateCompanyLogo(publicUrl);
      setLogoSuccess(true);
      setTimeout(() => setLogoSuccess(false), 2000);
      toast({ title: "✅ تم تحديث شعار الشركة" });
    } catch (err: any) {
      toast({ title: "فشل الرفع", description: err.message || "حاول مرة أخرى", variant: "destructive" });
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const handleDeleteLogo = async () => {
    if (!user) return;
    try {
      // Remove from storage
      await supabase.storage.from("company-logos").remove([`${user.id}/logo.png`, `${user.id}/logo.svg`]);
      
      // Update DB
      await supabase
        .from("companies")
        .update({ logo_url: null, updated_at: new Date().toISOString() } as any)
        .eq("owner_id", user.id);

      await supabase
        .from("company_settings" as any)
        .update({ logo_url: null } as any)
        .eq("user_id", user.id);

      updateCompanyLogo(null);
      toast({ title: "تم إزالة الشعار" });
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
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

      // Also sync company name to companies table
      if (profile.company_name) {
        await supabase
          .from("companies")
          .update({ name: profile.company_name, updated_at: new Date().toISOString() } as any)
          .eq("owner_id", user.id);
      }

      await refreshCompany();
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

      {/* Company Logo Section */}
      <div className="flex flex-col items-center gap-3 py-4">
        <div
          className="relative"
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <div className="w-[100px] h-[100px] rounded-2xl bg-white flex items-center justify-center overflow-hidden"
            style={{ boxShadow: "var(--z-shadow-md, 0 4px 16px rgba(10,35,66,0.14))", border: "1px solid var(--z-border, #E2E8F0)" }}>
            {company.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="w-full h-full object-contain p-1" />
            ) : (
              <div className="flex flex-col items-center justify-center gap-1">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #00B4D8, #006D8F)" }}>
                  <span className="text-white font-bold text-xl" style={{ fontFamily: "Tajawal, sans-serif" }}>
                    {(company.name || profile.company_name || "Z").charAt(0)}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">{company.name || profile.company_name || "شعار الشركة"}</span>
              </div>
            )}
          </div>
          <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoUpload} />
          <button
            onClick={() => logoInputRef.current?.click()}
            disabled={uploadingLogo}
            title="تغيير الشعار"
            className="absolute -bottom-1 -left-1 w-8 h-8 rounded-full flex items-center justify-center shadow-md transition-all cursor-pointer disabled:opacity-50"
            style={{ 
              background: logoSuccess ? "#16A34A" : "var(--z-navy, #0A2342)",
              transform: hovering && !uploadingLogo ? "scale(1.1)" : "scale(1)",
            }}
          >
            {uploadingLogo ? (
              <Loader2 className="h-4 w-4 text-white animate-spin" />
            ) : logoSuccess ? (
              <Check className="h-4 w-4 text-white" />
            ) : (
              <Camera className="h-4 w-4 text-white" />
            )}
          </button>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-foreground">{company.name || profile.company_name || displayName || "مستخدم جديد"}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 justify-center">
            <Mail className="h-3 w-3" />
            {email}
          </p>
        </div>
        {company.logo_url && hovering && (
          <button
            onClick={handleDeleteLogo}
            className="text-[12px] flex items-center gap-1 transition-colors"
            style={{ color: "var(--z-danger, #DC2626)" }}
          >
            <Trash2 className="h-3 w-3" />
            إزالة الشعار
          </button>
        )}
      </div>

      {/* Avatar Section (Personal Photo) */}
      <div className="flex flex-col items-center gap-2 py-2">
        <p className="text-xs font-semibold text-muted-foreground">الصورة الشخصية</p>
        <div className="relative">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm border border-primary/10 overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-lg font-bold text-primary">{initials || "؟"}</span>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute -bottom-1 -left-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-md hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
          >
            {uploadingAvatar ? (
              <Loader2 className="h-3 w-3 text-primary-foreground animate-spin" />
            ) : (
              <Camera className="h-3 w-3 text-primary-foreground" />
            )}
          </button>
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
      <Button onClick={handleSave} disabled={saving} className="w-full h-12 rounded-2xl text-base font-bold gap-2">
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
        حفظ التعديلات
      </Button>

      {/* Logout Button */}
      <Button onClick={signOut} variant="outline" className="w-full h-12 rounded-2xl text-base font-bold gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
        <LogOut className="h-5 w-5" />
        تسجيل الخروج
      </Button>
    </div>
  );
};

export default ProfilePage;
