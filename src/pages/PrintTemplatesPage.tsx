import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Printer, Plus, Eye, Trash2, FileText, Handshake, Tag, Receipt, MinusCircle, PlusCircle, UserCheck, Clock, Truck, BadgeCheck, LucideIcon, Sparkles, Palette } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import PrintTemplateModal from "@/components/print-templates/PrintTemplateModal";
import PrintTemplatePreview from "@/components/print-templates/PrintTemplatePreview";
import SectorTemplateLibrary from "@/components/print-templates/SectorTemplateLibrary";
import type { SectorPreset } from "@/components/print-templates/sectorTemplates";
import { isDoulia } from "@/lib/print-themes";
import { useCompanyLogo } from "@/hooks/useCompanyLogo";
import { usePermission } from "@/hooks/usePermission";
import { Handshake as HandshakeIcon } from "lucide-react";

const TEMPLATE_CATEGORIES = [
  { key: "all", label: "الكل" },
  { key: "financial", label: "مالية" },
  { key: "contracts", label: "عقود" },
  { key: "correspondence", label: "مراسلات" },
  { key: "notices", label: "إشعارات" },
];

export interface TemplateConfig {
  id: string;
  type: string;
  prefix: string;
  icon: string;
  title: string;
  description: string;
  category: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
  quo: Tag,
  con: Handshake,
  dem: FileText,
  dn: PlusCircle,
  cn: MinusCircle,
  rcp: Receipt,
  sup: Truck,
  od: Clock,
  poa: UserCheck,
  clr: BadgeCheck,
};

const ICON_COLOR_MAP: Record<string, string> = {
  dn: "text-[#DC2626]",
  cn: "text-[#059669]",
  od: "text-[#D97706]",
};

const ICON_BG_MAP: Record<string, string> = {
  dn: "bg-[#FEF2F2]",
  cn: "bg-[#ECFDF5]",
  od: "bg-[#FFFBEB]",
};

const CATEGORY_BADGE: Record<string, { label: string; classes: string }> = {
  financial: { label: "مالية", classes: "bg-[#DBEAFE] text-[#1E40AF]" },
  contracts: { label: "عقود", classes: "bg-[#EDE9FE] text-[#5B21B6]" },
  notices: { label: "إشعارات", classes: "bg-[#FEF3C7] text-[#92400E]" },
  correspondence: { label: "مراسلات", classes: "bg-[#F3F4F6] text-[#374151]" },
};

const TEMPLATES: TemplateConfig[] = [
  { id: "quo", type: "QUO", prefix: "QUO", icon: "", title: "عرض سعر", description: "عروض أسعار احترافية للعملاء", category: "financial" },
  { id: "con", type: "CON", prefix: "CON", icon: "", title: "عقد بيع", description: "عقود وتعاقدات مع العملاء", category: "contracts" },
  { id: "dem", type: "DEM", prefix: "DEM", icon: "", title: "مطالبة مالية", description: "مطالبة بالرصيد المستحق", category: "financial" },
  { id: "dn", type: "DN", prefix: "DN", icon: "", title: "إشعار دين", description: "إضافة مبلغ على حساب العميل", category: "notices" },
  { id: "cn", type: "CN", prefix: "CN", icon: "", title: "إشعار دائن", description: "خصم مبلغ من حساب العميل", category: "notices" },
  { id: "rcp", type: "RCP", prefix: "RCP", icon: "", title: "وصل استلام", description: "إثبات استلام بضاعة أو مبلغ", category: "financial" },
  { id: "sup", type: "SUP", prefix: "SUP", icon: "", title: "عقد توريد", description: "عقود مع الموردين", category: "contracts" },
  { id: "od", type: "OD", prefix: "OD", icon: "", title: "إشعار تأخر سداد", description: "تذكير رسمي بالسداد", category: "notices" },
  { id: "poa", type: "POA", prefix: "POA", icon: "", title: "تفويض رسمي", description: "تفويض موظف لإجراء معاملة", category: "correspondence" },
  { id: "clr", type: "CLR", prefix: "CLR", icon: "", title: "خطاب إخلاء طرف", description: "إغلاق تعامل رسمي مع جهة", category: "correspondence" },
];

const PrintTemplatesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [recentDocs, setRecentDocs] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateConfig | null>(null);
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [presetData, setPresetData] = useState<Record<string, any> | undefined>(undefined);

  const fetchRecent = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("print_documents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) setRecentDocs(data);
  };

  useEffect(() => { fetchRecent(); }, [user]);

  const filtered = TEMPLATES.filter(t => {
    if (activeCategory !== "all" && t.category !== activeCategory) return false;
    if (searchQuery && !t.title.includes(searchQuery) && !t.description.includes(searchQuery)) return false;
    return true;
  });

  const handleCreate = (template: TemplateConfig) => {
    setPresetData(undefined);
    setSelectedTemplate(template);
    setModalOpen(true);
  };

  /** When a sector preset is picked, find the matching template config and open
   *  the create modal with its data prefilled. */
  const handlePickPreset = (preset: SectorPreset) => {
    const tpl = TEMPLATES.find((t) => t.type === preset.templateType);
    if (!tpl) {
      toast({ title: "النموذج غير متوفر", variant: "destructive" });
      return;
    }
    setPresetData(preset.data);
    setSelectedTemplate(tpl);
    setModalOpen(true);
  };

  const handlePreviewTemplate = (template: TemplateConfig) => {
    // Open preview with empty/sample data
    setPreviewDoc({ template_type: template.type, data: {}, document_number: `${template.prefix}-0000`, document_date: new Date().toISOString().split("T")[0], contact_name: "—" });
    setPreviewOpen(true);
  };

  const handlePreviewDoc = (doc: any) => {
    setPreviewDoc(doc);
    setPreviewOpen(true);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("print_documents").delete().eq("id", id);
    toast({ title: "تم حذف المستند بنجاح" });
    fetchRecent();
  };

  const getTemplateTitle = (type: string) => TEMPLATES.find(t => t.type === type)?.title || type;

  const statusLabels: Record<string, string> = {
    draft: "مسودة",
    sent: "مُرسل",
    accepted: "مقبول",
    rejected: "مرفوض",
    closed: "مغلق",
  };

  const { logoBase64, companyName: brandName } = useCompanyLogo();
  const showBrandBanner = isDoulia(user?.email);
  const { isSuperAdmin } = usePermission("any");
  const showAmwaliActivation =
    isSuperAdmin || user?.email?.toLowerCase() === "info.sayma20@gmail.com";

  return (
    <div className="space-y-6">
      {/* Branded Banner for Doulia Kitchen */}
      {showBrandBanner && (
        <div
          className="flex items-center gap-3 rounded-xl px-5 py-3"
          style={{ background: "linear-gradient(135deg, #1B2B4B, #2A3F6B)", color: "white" }}
        >
          {logoBase64 ? (
            <img src={logoBase64} alt="logo" className="h-8 w-8 object-contain rounded" />
          ) : (
            <div className="w-8 h-8 rounded bg-white/20 flex items-center justify-center text-sm font-bold">DK</div>
          )}
          <div className="flex-1">
            <div className="text-sm font-bold">{brandName || "الشركة الدولية للمطابخ"}</div>
            <div className="text-[11px] opacity-80 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              قوالبك مخصصة بهوية شركتك ✨
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Printer className="w-6 h-6" />
          نماذج للطباعة
        </h1>
        <p className="text-muted-foreground text-sm mt-1">أنشئ وطبع نماذج احترافية مرتبطة ببيانات شركتك</p>
      </div>

      {/* Search + Library */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="ابحث عن نموذج..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pr-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setLibraryOpen(true)}
          className="gap-2 border-primary/40 text-primary hover:bg-primary/5"
        >
          <Sparkles className="w-4 h-4" />
          مكتبة القوالب الجاهزة
        </Button>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TEMPLATE_CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setActiveCategory(cat.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeCategory === cat.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {showAmwaliActivation && (
          <div
            onClick={() => navigate("/contracts/amwali-activation")}
            className="group bg-gradient-to-br from-[#0D1B2E] to-[#1B3A5C] text-white border border-[#0D1B2E] rounded-xl p-4 flex flex-col items-center text-center cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
          >
            <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center mb-3">
              <HandshakeIcon className="w-16 h-16 text-white" strokeWidth={1.5} />
            </div>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full mb-2 bg-white/20 text-white">
              أموالي · حصري
            </span>
            <h3 className="text-[13px] font-semibold">اتفاقية تفعيل خدمة أموالي</h3>
            <p className="text-[11px] text-white/70 mt-0.5 mb-3">
              نموذج عقد جاهز قابل للتعديل والطباعة
            </p>
          </div>
        )}
        {filtered.map(template => {
          const IconComp = ICON_MAP[template.id] || FileText;
          const iconColor = ICON_COLOR_MAP[template.id] || "text-[#0D1B2E]";
          const iconBg = ICON_BG_MAP[template.id] || "bg-[#EEF2FF]";
          const badge = CATEGORY_BADGE[template.category];
          return (
            <div
              key={template.id}
              className="group bg-white dark:bg-card border border-[#E5E7EB] dark:border-border rounded-xl p-4 flex flex-col items-center text-center cursor-pointer transition-all duration-200 hover:border-[#0D1B2E] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:-translate-y-0.5"
              onClick={() => handleCreate(template)}
            >
              <div className={`w-20 h-20 rounded-2xl ${iconBg} dark:bg-muted flex items-center justify-center mb-3 transition-colors group-hover:brightness-95`}>
                <IconComp className={`w-16 h-16 ${iconColor}`} strokeWidth={1.5} />
              </div>
              {badge && (
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full mb-2 ${badge.classes}`}>
                  {badge.label}
                </span>
              )}
              <h3 className="text-[13px] font-semibold text-[#0D1B2E] dark:text-foreground">{template.title}</h3>
              <p className="text-[11px] text-[#6B7280] mt-0.5 mb-3">{template.description}</p>
              <div className="flex items-center gap-1.5">
                <button
                  className="w-8 h-8 rounded-full bg-[#0D1B2E] text-white flex items-center justify-center text-lg transition-transform hover:scale-110"
                  title="إنشاء نموذج جديد"
                  onClick={e => { e.stopPropagation(); handleCreate(template); }}
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center transition-transform hover:scale-110 hover:bg-primary/10 hover:text-primary"
                  title="تخصيص التصميم"
                  onClick={e => { e.stopPropagation(); navigate(`/print-templates/designer/${template.type}`); }}
                >
                  <Palette className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Documents */}
      {recentDocs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-foreground mb-3">آخر النماذج المنشأة</h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-right p-3 font-medium">رقم المستند</th>
                  <th className="text-right p-3 font-medium">النوع</th>
                  <th className="text-right p-3 font-medium">المستلم</th>
                  <th className="text-right p-3 font-medium">التاريخ</th>
                  <th className="text-right p-3 font-medium">الحالة</th>
                  <th className="text-right p-3 font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {recentDocs.map(doc => (
                  <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-mono text-xs">{doc.document_number}</td>
                    <td className="p-3">{getTemplateTitle(doc.template_type)}</td>
                    <td className="p-3">{doc.contact_name || "—"}</td>
                    <td className="p-3">{doc.document_date}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-secondary">
                        {statusLabels[doc.status] || doc.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handlePreviewDoc(doc)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setPreviewDoc(doc); setPreviewOpen(true); }}>
                          <Printer className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(doc.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {selectedTemplate && (
        <PrintTemplateModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          template={selectedTemplate}
          initialData={presetData}
          onSaved={() => { fetchRecent(); setModalOpen(false); setPresetData(undefined); }}
        />
      )}

      {previewDoc && (
        <PrintTemplatePreview
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          document={previewDoc}
        />
      )}

      <SectorTemplateLibrary
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onPick={handlePickPreset}
      />
    </div>
  );
};

export default PrintTemplatesPage;
