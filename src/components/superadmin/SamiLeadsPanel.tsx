import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Users, Phone, Briefcase, RefreshCw, Search, Eye, MessageCircle,
  Bell, CheckCircle, Clock, Trash2, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Lead {
  id: string;
  name: string;
  phone: string;
  business_type: string | null;
  status: string;
  notes: string | null;
  conversation_log: any[];
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: any }> = {
  new: { label: "جديد", color: "#22C55E", icon: Bell },
  contacted: { label: "تم التواصل", color: "#3B82F6", icon: Phone },
  interested: { label: "مهتم", color: "#F59E0B", icon: CheckCircle },
  converted: { label: "تحوّل لعميل", color: "#8B5CF6", icon: Users },
  not_interested: { label: "غير مهتم", color: "#6B7280", icon: Clock },
};

export default function SamiLeadsPanel() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sami_leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const leadsData = (data || []) as Lead[];
      setLeads(leadsData);
      setUnreadCount(leadsData.filter(l => !l.is_read).length);
    } catch (e: any) {
      toast.error("خطأ في تحميل البيانات: " + e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // Realtime subscription for new leads
  useEffect(() => {
    const channel = supabase
      .channel("topic-super-admin-sami-leads")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sami_leads" }, (payload) => {
        const newLead = payload.new as Lead;
        setLeads(prev => [newLead, ...prev]);
        setUnreadCount(prev => prev + 1);
        toast.info(`🔔 زبون جديد: ${newLead.name}`, { description: newLead.phone });
        // Play notification sound
        try { new Audio("/notification.mp3").play(); } catch {}
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const markAsRead = async (lead: Lead) => {
    if (lead.is_read) return;
    await supabase.from("sami_leads").update({ is_read: true } as any).eq("id", lead.id);
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, is_read: true } : l));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const updateStatus = async (leadId: string, status: string) => {
    const { error } = await supabase.from("sami_leads").update({ status, updated_at: new Date().toISOString() } as any).eq("id", leadId);
    if (error) { toast.error(error.message); return; }
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l));
    toast.success("تم تحديث الحالة");
  };

  const updateNotes = async (leadId: string, notes: string) => {
    await supabase.from("sami_leads").update({ notes } as any).eq("id", leadId);
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, notes } : l));
  };

  const deleteLead = async (leadId: string) => {
    if (!confirm("هل أنت متأكد من الحذف؟")) return;
    await supabase.from("sami_leads").delete().eq("id", leadId);
    setLeads(prev => prev.filter(l => l.id !== leadId));
    toast.success("تم الحذف");
  };

  const filtered = leads.filter(l =>
    !search || l.name.includes(search) || l.phone.includes(search) || (l.business_type || "").includes(search)
  );

  const stats = {
    total: leads.length,
    new: leads.filter(l => l.status === "new").length,
    contacted: leads.filter(l => l.status === "contacted").length,
    converted: leads.filter(l => l.status === "converted").length,
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "إجمالي المحادثات", value: stats.total, icon: MessageCircle, color: "#0D1B2E" },
          { label: "زبائن جدد", value: stats.new, icon: Bell, color: "#22C55E" },
          { label: "تم التواصل", value: stats.contacted, icon: Phone, color: "#3B82F6" },
          { label: "تحولوا لعملاء", value: stats.converted, icon: CheckCircle, color: "#8B5CF6" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 sm:p-4" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="h-4 w-4" style={{ color: s.color }} />
              <span className="text-xs" style={{ color: "var(--sa-text-muted)" }}>{s.label}</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: "var(--sa-text-primary)" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold" style={{ color: "var(--sa-text-primary)" }}>زبائن مهتمون</h2>
          {unreadCount > 0 && (
            <Badge className="bg-red-500 text-white text-xs animate-pulse">{unreadCount} جديد</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--sa-text-muted)" }} />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث..."
              className="pr-8 h-8 text-xs w-40" style={{ background: "var(--sa-surface)", borderColor: "var(--sa-card-border)", color: "var(--sa-text-primary)" }} />
          </div>
          <Button variant="ghost" size="sm" onClick={loadLeads} disabled={loading} style={{ color: "var(--sa-text-muted)" }}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Leads List */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 rounded-xl" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
            <MessageCircle className="h-10 w-10 mx-auto mb-3" style={{ color: "var(--sa-text-faint)" }} />
            <p className="text-sm" style={{ color: "var(--sa-text-muted)" }}>لا يوجد زبائن بعد</p>
          </div>
        ) : filtered.map(lead => {
          const statusInfo = STATUS_MAP[lead.status] || STATUS_MAP.new;
          const isExpanded = expandedId === lead.id;
          return (
            <div key={lead.id}
              className="rounded-xl overflow-hidden transition-all"
              style={{
                background: "var(--sa-card-bg)",
                border: `1px solid ${!lead.is_read ? "#22C55E" : "var(--sa-card-border)"}`,
                boxShadow: !lead.is_read ? "0 0 12px rgba(34,197,94,0.15)" : undefined,
              }}
              onClick={() => markAsRead(lead)}
            >
              <div className="p-3 sm:p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : lead.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {!lead.is_read && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />}
                      <span className="font-semibold text-sm" style={{ color: "var(--sa-text-primary)" }}>{lead.name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0" style={{ color: statusInfo.color, borderColor: statusInfo.color + "40" }}>
                        {statusInfo.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs" style={{ color: "var(--sa-text-muted)" }}>
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span>
                      {lead.business_type && <span className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{lead.business_type}</span>}
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: "var(--sa-text-faint)" }}>
                      {format(new Date(lead.created_at), "dd MMM yyyy - HH:mm", { locale: ar })}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); setSelectedLead(lead); }}>
                      <Eye className="h-3.5 w-3.5" style={{ color: "var(--sa-text-muted)" }} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); window.open(`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`, "_blank"); }}>
                      <MessageCircle className="h-3.5 w-3.5 text-green-500" />
                    </Button>
                    {isExpanded ? <ChevronUp className="h-4 w-4" style={{ color: "var(--sa-text-muted)" }} /> : <ChevronDown className="h-4 w-4" style={{ color: "var(--sa-text-muted)" }} />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="px-3 sm:px-4 pb-3 space-y-3 border-t" style={{ borderColor: "var(--sa-card-border)" }}>
                  {/* Status change */}
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {Object.entries(STATUS_MAP).map(([key, info]) => (
                      <button key={key}
                        onClick={() => updateStatus(lead.id, key)}
                        className="text-[10px] px-2 py-1 rounded-full border transition-all"
                        style={{
                          background: lead.status === key ? info.color + "20" : "transparent",
                          borderColor: lead.status === key ? info.color : "var(--sa-card-border)",
                          color: lead.status === key ? info.color : "var(--sa-text-muted)",
                          fontWeight: lead.status === key ? 600 : 400,
                        }}
                      >
                        {info.label}
                      </button>
                    ))}
                  </div>

                  {/* Notes */}
                  <div>
                    <textarea
                      value={lead.notes || ""}
                      onChange={e => setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, notes: e.target.value } : l))}
                      onBlur={e => updateNotes(lead.id, e.target.value)}
                      placeholder="أضف ملاحظات..."
                      className="w-full text-xs rounded-lg p-2 resize-none h-16"
                      style={{ background: "var(--sa-surface)", border: "1px solid var(--sa-card-border)", color: "var(--sa-text-primary)" }}
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between">
                    <Button variant="ghost" size="sm" className="text-red-400 text-xs h-7" onClick={() => deleteLead(lead.id)}>
                      <Trash2 className="h-3 w-3 ml-1" /> حذف
                    </Button>
                    <a href={`tel:${lead.phone}`} className="text-xs flex items-center gap-1 text-blue-500">
                      <Phone className="h-3 w-3" /> اتصل مباشرة
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Conversation Dialog */}
      <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" dir="rtl" style={{ background: "var(--sa-card-bg)", borderColor: "var(--sa-card-border)" }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
              <MessageCircle className="h-5 w-5" /> محادثة {selectedLead?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedLead && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs p-3 rounded-lg" style={{ background: "var(--sa-surface)" }}>
                <div><strong>الاسم:</strong> {selectedLead.name}</div>
                <div><strong>الجوال:</strong> {selectedLead.phone}</div>
                <div><strong>نوع العمل:</strong> {selectedLead.business_type || "—"}</div>
                <div><strong>التاريخ:</strong> {format(new Date(selectedLead.created_at), "dd/MM/yyyy HH:mm")}</div>
              </div>

              <div className="text-xs font-semibold" style={{ color: "var(--sa-text-muted)" }}>سجل المحادثة:</div>
              <div className="space-y-2 max-h-60 overflow-y-auto p-2 rounded-lg" style={{ background: "#F5F7FA" }}>
                {(selectedLead.conversation_log || []).length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: "var(--sa-text-faint)" }}>لا يوجد محادثة مسجلة</p>
                ) : (selectedLead.conversation_log || []).map((msg: any, i: number) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`text-xs rounded-lg px-3 py-2 max-w-[80%] ${
                      msg.role === "user" ? "bg-[#0D1B2E] text-white" : "bg-white border"
                    }`} style={{ whiteSpace: "pre-wrap" }}>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
