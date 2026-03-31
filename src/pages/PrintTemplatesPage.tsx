import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Printer, FileText, Plus, Eye, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import PrintTemplateModal from "@/components/print-templates/PrintTemplateModal";
import PrintTemplatePreview from "@/components/print-templates/PrintTemplatePreview";

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

const TEMPLATES: TemplateConfig[] = [
  { id: "quo", type: "QUO", prefix: "QUO", icon: "📄", title: "عرض سعر", description: "عروض أسعار احترافية للعملاء", category: "financial" },
  { id: "con", type: "CON", prefix: "CON", icon: "📋", title: "عقد بيع", description: "عقود وتعاقدات مع العملاء", category: "contracts" },
  { id: "dem", type: "DEM", prefix: "DEM", icon: "💰", title: "مطالبة مالية", description: "مطالبة بالرصيد المستحق", category: "financial" },
  { id: "dn", type: "DN", prefix: "DN", icon: "➕", title: "إشعار دين", description: "إضافة مبلغ على حساب العميل", category: "notices" },
  { id: "cn", type: "CN", prefix: "CN", icon: "➖", title: "إشعار دائن", description: "خصم مبلغ من حساب العميل", category: "notices" },
  { id: "rcp", type: "RCP", prefix: "RCP", icon: "📦", title: "وصل استلام", description: "إثبات استلام بضاعة أو مبلغ", category: "financial" },
  { id: "sup", type: "SUP", prefix: "SUP", icon: "🚚", title: "عقد توريد", description: "عقود مع الموردين", category: "contracts" },
  { id: "od", type: "OD", prefix: "OD", icon: "⚠️", title: "إشعار تأخر سداد", description: "تذكير رسمي بالسداد", category: "notices" },
  { id: "poa", type: "POA", prefix: "POA", icon: "📝", title: "تفويض رسمي", description: "تفويض موظف لإجراء معاملة", category: "correspondence" },
  { id: "clr", type: "CLR", prefix: "CLR", icon: "🤝", title: "خطاب إخلاء طرف", description: "إغلاق تعامل رسمي مع جهة", category: "correspondence" },
];

const PrintTemplatesPage = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [recentDocs, setRecentDocs] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateConfig | null>(null);
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

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
    setSelectedTemplate(template);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Printer className="w-6 h-6" />
          نماذج للطباعة
        </h1>
        <p className="text-muted-foreground text-sm mt-1">أنشئ وطبع نماذج احترافية مرتبطة ببيانات شركتك</p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="ابحث عن نموذج..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pr-10"
        />
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(template => (
          <div
            key={template.id}
            className="bg-card border border-border rounded-xl p-5 flex flex-col items-center text-center hover:shadow-md transition-shadow"
          >
            <div className="w-12 h-12 rounded-full bg-[#0D1B2E] flex items-center justify-center text-2xl mb-3">
              {template.icon}
            </div>
            <h3 className="text-[15px] font-semibold text-[#0D1B2E] dark:text-foreground">{template.title}</h3>
            <p className="text-xs text-muted-foreground mt-1 mb-4">{template.description}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => handleCreate(template)}>
                <Plus className="w-3.5 h-3.5 ml-1" />
                إنشاء
              </Button>
              <Button size="sm" variant="outline" onClick={() => handlePreviewTemplate(template)}>
                <Eye className="w-3.5 h-3.5 ml-1" />
                معاينة
              </Button>
            </div>
          </div>
        ))}
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
          onSaved={() => { fetchRecent(); setModalOpen(false); }}
        />
      )}

      {previewDoc && (
        <PrintTemplatePreview
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          document={previewDoc}
        />
      )}
    </div>
  );
};

export default PrintTemplatesPage;
