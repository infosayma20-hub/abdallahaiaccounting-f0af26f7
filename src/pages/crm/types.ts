// CRM Types — مشتركة بين كل صفحات CRM

export type CrmLeadStatus = "new" | "contacted" | "qualified" | "unqualified" | "converted" | "lost";
export type CrmStage = "new" | "contacted" | "qualified" | "proposal" | "negotiation" | "won" | "lost" | "on_hold";
export type CrmPriority = "low" | "medium" | "high" | "urgent";
export type CrmActivityType = "call" | "whatsapp" | "meeting" | "visit" | "email" | "quote_sent" | "collection_reminder" | "internal_review" | "note";
export type CrmActivityStatus = "pending" | "completed" | "cancelled" | "overdue";

export interface CrmLead {
  id: string;
  user_id: string;
  title: string;
  contact_name: string | null;
  company_name: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  region: string | null;
  industry: string | null;
  source: string | null;
  source_details: string | null;
  campaign: string | null;
  estimated_value: number;
  currency: string;
  probability: number;
  interested_products: string | null;
  assigned_to: string | null;
  sales_team: string | null;
  priority: CrmPriority;
  tags: string[];
  status: CrmLeadStatus;
  lost_reason: string | null;
  contact_id: string | null;
  converted_opportunity_id: string | null;
  converted_at: string | null;
  notes: string | null;
  next_activity_date: string | null;
  last_activity_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmOpportunity {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  lead_id: string | null;
  contact_id: string | null;
  customer_name: string | null;
  expected_value: number;
  currency: string;
  probability: number;
  weighted_value: number;
  stage: CrmStage;
  stage_order: number;
  expected_close_date: string | null;
  actual_close_date: string | null;
  assigned_to: string | null;
  sales_team: string | null;
  priority: CrmPriority;
  tags: string[];
  won_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  converted_invoice_id: string | null;
  converted_at: string | null;
  notes: string | null;
  next_activity_date: string | null;
  last_activity_date: string | null;
  stage_changed_at: string;
  created_at: string;
  updated_at: string;
}

export interface CrmActivity {
  id: string;
  user_id: string;
  activity_type: CrmActivityType;
  title: string;
  description: string | null;
  lead_id: string | null;
  opportunity_id: string | null;
  contact_id: string | null;
  scheduled_at: string | null;
  due_date: string | null;
  duration_minutes: number | null;
  assigned_to: string | null;
  status: CrmActivityStatus;
  completed_at: string | null;
  completion_notes: string | null;
  outcome: string | null;
  priority: CrmPriority;
  created_at: string;
  updated_at: string;
}

export const STAGE_META: Record<CrmStage, { label: string; color: string; bg: string; border: string }> = {
  new:         { label: "جديد",       color: "#475569", bg: "#F1F5F9", border: "#CBD5E1" },
  contacted:   { label: "تم التواصل", color: "#0369A1", bg: "#E0F2FE", border: "#7DD3FC" },
  qualified:   { label: "مؤهل",       color: "#7C3AED", bg: "#EDE9FE", border: "#C4B5FD" },
  proposal:    { label: "عرض سعر",    color: "#C2410C", bg: "#FFEDD5", border: "#FDBA74" },
  negotiation: { label: "تفاوض",      color: "#A16207", bg: "#FEF3C7", border: "#FCD34D" },
  won:         { label: "تم الفوز",   color: "#15803D", bg: "#DCFCE7", border: "#86EFAC" },
  lost:        { label: "خسارة",      color: "#B91C1C", bg: "#FEE2E2", border: "#FCA5A5" },
  on_hold:     { label: "معلّق",      color: "#525252", bg: "#F5F5F4", border: "#D6D3D1" },
};

export const STAGES_ORDER: CrmStage[] = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"];

export const LEAD_STATUS_META: Record<CrmLeadStatus, { label: string; color: string; bg: string }> = {
  new:         { label: "جديد",          color: "#0369A1", bg: "#E0F2FE" },
  contacted:   { label: "تم التواصل",    color: "#7C3AED", bg: "#EDE9FE" },
  qualified:   { label: "مؤهل",          color: "#15803D", bg: "#DCFCE7" },
  unqualified: { label: "غير مؤهل",      color: "#B91C1C", bg: "#FEE2E2" },
  converted:   { label: "تم التحويل",    color: "#0E7490", bg: "#CFFAFE" },
  lost:        { label: "خسارة",         color: "#525252", bg: "#F5F5F4" },
};

export const PRIORITY_META: Record<CrmPriority, { label: string; color: string; bg: string }> = {
  low:    { label: "منخفضة", color: "#525252", bg: "#F5F5F4" },
  medium: { label: "عادية",   color: "#0369A1", bg: "#E0F2FE" },
  high:   { label: "عالية",   color: "#C2410C", bg: "#FFEDD5" },
  urgent: { label: "عاجلة",   color: "#B91C1C", bg: "#FEE2E2" },
};

export const ACTIVITY_META: Record<CrmActivityType, { label: string; icon: string; color: string }> = {
  call:                 { label: "مكالمة",          icon: "📞", color: "#0369A1" },
  whatsapp:             { label: "واتساب",          icon: "💬", color: "#15803D" },
  meeting:              { label: "اجتماع",          icon: "👥", color: "#7C3AED" },
  visit:                { label: "زيارة",           icon: "🚗", color: "#C2410C" },
  email:                { label: "بريد إلكتروني",   icon: "✉️", color: "#0E7490" },
  quote_sent:           { label: "عرض سعر",         icon: "📄", color: "#A16207" },
  collection_reminder:  { label: "تذكير تحصيل",     icon: "💰", color: "#B91C1C" },
  internal_review:      { label: "مراجعة داخلية",   icon: "🔍", color: "#525252" },
  note:                 { label: "ملاحظة",           icon: "📝", color: "#475569" },
};

export const LEAD_SOURCES = [
  { value: "website",     label: "الموقع الإلكتروني" },
  { value: "whatsapp",    label: "واتساب" },
  { value: "facebook",    label: "فيسبوك / ميتا" },
  { value: "instagram",   label: "إنستغرام" },
  { value: "referral",    label: "ترشيح من عميل" },
  { value: "walk_in",     label: "زيارة مباشرة" },
  { value: "phone",       label: "مكالمة واردة" },
  { value: "campaign",    label: "حملة إعلانية" },
  { value: "event",       label: "فعالية / معرض" },
  { value: "manual",      label: "إدخال يدوي" },
];
