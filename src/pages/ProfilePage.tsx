import { useState, useEffect, useRef } from "react";
import BrandIdentitySettings from "@/components/settings/BrandIdentitySettings";
import FastEntryToggle from "@/components/settings/FastEntryToggle";
import { useCompanyTheme } from "@/hooks/useCompanyTheme";
import { extractColorsFromLogo, assignColorRoles, ensureAccessibility } from "@/lib/color-utils";
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
    <div className="max-w-3xl mx-auto space-y-8 pb-12" dir="rtl">
      {/* Page Header Banner */}
      <div
        className="w-full flex items-center"
        style={{ backgroundColor: "#1B3A5C", borderRadius: 12, borderTop: "3px solid #5B9BD5", padding: "10px 20px", height: 44 }}
      >
        <h1 className="text-right text-white" style={{ fontFamily: "Tajawal, sans-serif", fontSize: 18, fontWeight: 500 }}>
          تعديل الملف الشخصي
        </h1>
      </div>

      {/* Company Logo & Avatar */}
      <div className="flex items-start gap-8 px-2">
        {/* Company Logo */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="relative"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            <div className="w-24 h-24 rounded-2xl bg-white flex items-center justify-center overflow-hidden border border-border/50 shadow-sm">
              {company.logo_url ? (
                <img src={company.logo_url} alt={company.name} className="w-full h-full object-contain p-1" />
              ) : (
                <div className="flex flex-col items-center justify-center gap-1">
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #00B4D8, #006D8F)" }}>
                    <span className="text-white font-bold text-xl" style={{ fontFamily: "Tajawal, sans-serif" }}>
                      {(company.name || profile.company_name || "Z").charAt(0)}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp" className="hidden" onChange={handleLogoUpload} />
            <button
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              className="absolute -bottom-1 -left-1 w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-all cursor-pointer disabled:opacity-50 bg-primary"
            >
              {uploadingLogo ? <Loader2 className="h-3.5 w-3.5 text-white animate-spin" /> : logoSuccess ? <Check className="h-3.5 w-3.5 text-white" /> : <Camera className="h-3.5 w-3.5 text-white" />}
            </button>
          </div>
          <span className="text-[11px] text-muted-foreground">شعار الشركة</span>
          {company.logo_url && (
            <button onClick={handleDeleteLogo} className="text-[11px] flex items-center gap-1 text-destructive hover:underline">
              <Trash2 className="h-3 w-3" /> إزالة
            </button>
          )}
        </div>


        {/* Name & Email */}
        <div className="flex-1 pt-3">
          <p className="text-lg font-bold text-foreground">{company.name || profile.company_name || displayName || "مستخدم جديد"}</p>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
            <Mail className="h-3.5 w-3.5" />
            {email}
          </p>
        </div>
      </div>

      {/* Form Fields — clean Qoyod style */}
      <div className="space-y-5 px-2">
        {fields.map((field) => (
          <div key={field.key} className="flex items-center gap-4">
            <label className="text-sm font-semibold text-foreground w-44 shrink-0 text-left flex items-center gap-2 justify-end">
              {field.label}
            </label>
            <Input
              value={profile[field.key]}
              onChange={(e) => setProfile((p) => ({ ...p, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              className="flex-1 h-11 rounded-lg border border-border bg-white text-sm"
              dir="rtl"
            />
          </div>
        ))}
      </div>

      {/* Brand Identity Settings */}
      <BrandIdentitySettings />

      {/* Password Management — single smart section based on account type */}
      <PasswordManagementSection />

      <hr className="border-border/30" />

      {/* Fast entry preference — affects voucher & journal save UX */}
      <FastEntryToggle />

      <hr className="border-border/30" />

      {/* Action Buttons */}
      <div className="flex items-center gap-3 justify-center px-2">
        <Button onClick={handleSave} disabled={saving} className="px-8 h-11 rounded-lg text-sm font-medium gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ
        </Button>
        <Button variant="outline" onClick={() => navigate(-1)} className="px-8 h-11 rounded-lg text-sm font-medium">
          إلغاء
        </Button>
      </div>

      <hr className="border-border/30" />

      {/* Notifications Settings */}
      <div className="space-y-4 px-2">
        <h2 className="text-lg font-medium text-primary" style={{ fontFamily: "Tajawal, sans-serif" }}>إعدادات الإشعارات</h2>
        <div className="space-y-3">
          {[
            { label: "إشعارات البريد الإلكتروني", desc: "تلقي تحديثات عبر البريد" },
            { label: "إشعارات الفواتير", desc: "تنبيه عند إنشاء أو استحقاق فاتورة" },
            { label: "إشعارات المدفوعات", desc: "تنبيه عند استلام دفعة" },
            { label: "تقارير أسبوعية", desc: "ملخص مالي أسبوعي عبر البريد" },
          ].map((item) => (
            <label key={item.label} className="flex items-start gap-3 p-3 rounded-xl border border-border/30 bg-card hover:bg-muted/20 cursor-pointer transition-colors">
              <input type="checkbox" defaultChecked className="mt-1 h-4 w-4 rounded border-border text-primary accent-primary" />
              <div>
                <p className="text-sm font-medium text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <hr className="border-border/30" />

      {/* 2FA Section */}
      <div className="space-y-3 px-2">
        <h2 className="text-lg font-medium text-primary" style={{ fontFamily: "Tajawal, sans-serif" }}>التحقق الثنائي (2FA)</h2>
        <div className="rounded-2xl border border-border/30 bg-card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-success" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">التحقق الثنائي غير مفعّل</p>
              <p className="text-xs text-muted-foreground">أضف طبقة حماية إضافية لحسابك باستخدام Google Authenticator أو رسالة SMS</p>
            </div>
          </div>
          <Button variant="default" className="w-full h-11 rounded-xl text-sm font-medium gap-2">
            <ShieldCheck className="h-4 w-4" />
            تفعيل التحقق الثنائي
          </Button>
        </div>
      </div>

      {/* Logout */}
      <div className="px-2 pt-4">
        <Button onClick={signOut} variant="outline" className="w-full h-12 rounded-xl text-sm font-medium gap-2 text-destructive border-destructive/30 hover:bg-destructive/5">
          <LogOut className="h-4 w-4" />
          تسجيل الخروج
        </Button>
      </div>
    </div>
  );
};

export default ProfilePage;
