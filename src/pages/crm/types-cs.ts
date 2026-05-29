// Customer Success Center — Shared types & meta

export type CsNoteType = "general" | "sales" | "support" | "management";
export type CsCallDirection = "inbound" | "outbound";
export type CsCallOutcome =
  | "interested" | "follow_up" | "not_interested"
  | "support_issue" | "meeting_scheduled" | "contract_sent"
  | "no_answer" | "other";
export type CsMeetingStatus = "scheduled" | "completed" | "cancelled";
export type CsTicketStatus =
  | "new" | "in_progress" | "waiting_customer" | "waiting_dev" | "resolved" | "closed";
export type CsTicketPriority = "low" | "medium" | "high" | "critical";
export type CsTicketCategory =
  | "accounting" | "pos" | "inventory" | "hr" | "reports"
  | "printing" | "mobile_app" | "subscription" | "other";
export type CsFeatureRequestStatus =
  | "new" | "under_review" | "planned" | "in_development" | "released" | "rejected";
export type CsContractStatus = "draft" | "active" | "expired" | "cancelled" | "renewed";
export type CsSubscriptionStatus = "active" | "grace" | "suspended" | "cancelled" | "trial";
export type CsPaymentStatus = "paid" | "due" | "overdue" | "pending";

export interface CsNote {
  id: string; user_id: string; contact_id: string;
  title: string; body: string | null;
  note_type: CsNoteType; tags: string[];
  created_by: string | null; created_at: string; updated_at: string;
}

export interface CsCall {
  id: string; user_id: string; contact_id: string | null;
  direction: CsCallDirection; called_at: string;
  duration_sec: number; purpose: string | null; summary: string | null;
  outcome: CsCallOutcome; recording_url: string | null;
  created_at: string;
}

export interface CsMeeting {
  id: string; user_id: string; contact_id: string;
  meeting_date: string; location: string | null;
  attendees: string[]; purpose: string | null; summary: string | null;
  next_action: string | null; status: CsMeetingStatus;
  created_at: string;
}

export interface CsSupportTicket {
  id: string; user_id: string; ticket_number: string;
  contact_id: string | null; title: string; description: string | null;
  category: CsTicketCategory; priority: CsTicketPriority; status: CsTicketStatus;
  assigned_to: string | null; resolution: string | null;
  resolved_at: string | null; closed_at: string | null;
  created_at: string; updated_at: string;
}

export interface CsTicketComment {
  id: string; ticket_id: string; body: string; is_internal: boolean;
  created_by: string | null; created_at: string;
}

export interface CsFeatureRequest {
  id: string; user_id: string; fr_number: string;
  contact_id: string | null; title: string; business_justification: string | null;
  votes: number; status: CsFeatureRequestStatus; category: string | null;
  created_at: string;
}

export interface CsContract {
  id: string; user_id: string; contact_id: string;
  contract_number: string; plan: string | null;
  users_count: number; branches_count: number;
  price: number; currency: string;
  start_date: string; end_date: string | null;
  status: CsContractStatus; pdf_url: string | null; notes: string | null;
  created_at: string;
}

export interface CsSubscription {
  id: string; user_id: string; contact_id: string;
  plan: string; monthly_value: number; annual_value: number; currency: string;
  start_date: string; renewal_date: string;
  status: CsSubscriptionStatus; payment_status: CsPaymentStatus;
  contract_id: string | null; notes: string | null;
  created_at: string;
}

export interface CsKbArticle {
  id: string; user_id: string; title: string; category: string;
  problem: string | null; symptoms: string | null;
  cause: string | null; solution: string | null;
  video_url: string | null; tags: string[]; published: boolean;
  views_count: number; created_at: string;
}

export interface CsTimelineEvent {
  event_type: "note" | "call" | "meeting" | "ticket" | "feature_request" | "contract" | "subscription";
  ref_id: string;
  contact_id: string | null;
  user_id: string;
  event_date: string;
  title: string;
  summary: string | null;
  sub_type: string | null;
  status: string | null;
}

// ===== META labels (Arabic) =====

export const NOTE_TYPE_META: Record<CsNoteType, { label: string; color: string; bg: string }> = {
  general:    { label: "عامة",   color: "#475569", bg: "#F1F5F9" },
  sales:      { label: "مبيعات", color: "#0369A1", bg: "#E0F2FE" },
  support:    { label: "دعم",    color: "#C2410C", bg: "#FFEDD5" },
  management: { label: "إدارة",  color: "#7C3AED", bg: "#EDE9FE" },
};

export const CALL_DIRECTION_META: Record<CsCallDirection, { label: string; color: string; bg: string }> = {
  inbound:  { label: "واردة",  color: "#15803D", bg: "#DCFCE7" },
  outbound: { label: "صادرة",  color: "#0369A1", bg: "#E0F2FE" },
};

export const CALL_OUTCOME_META: Record<CsCallOutcome, string> = {
  interested: "مهتم", follow_up: "متابعة", not_interested: "غير مهتم",
  support_issue: "مشكلة دعم", meeting_scheduled: "حُجز اجتماع",
  contract_sent: "أُرسل عقد", no_answer: "لم يرد", other: "أخرى",
};

export const MEETING_STATUS_META: Record<CsMeetingStatus, { label: string; color: string; bg: string }> = {
  scheduled: { label: "مجدول", color: "#0369A1", bg: "#E0F2FE" },
  completed: { label: "مكتمل", color: "#15803D", bg: "#DCFCE7" },
  cancelled: { label: "ملغى",  color: "#525252", bg: "#F5F5F4" },
};

export const TICKET_STATUS_META: Record<CsTicketStatus, { label: string; color: string; bg: string }> = {
  new:               { label: "جديدة",          color: "#0369A1", bg: "#E0F2FE" },
  in_progress:       { label: "قيد المعالجة",   color: "#A16207", bg: "#FEF3C7" },
  waiting_customer:  { label: "بانتظار العميل", color: "#7C3AED", bg: "#EDE9FE" },
  waiting_dev:       { label: "بانتظار التطوير", color: "#C2410C", bg: "#FFEDD5" },
  resolved:          { label: "تم الحل",        color: "#15803D", bg: "#DCFCE7" },
  closed:            { label: "مغلقة",          color: "#525252", bg: "#F5F5F4" },
};

export const TICKET_PRIORITY_META: Record<CsTicketPriority, { label: string; color: string; bg: string }> = {
  low:      { label: "منخفضة", color: "#525252", bg: "#F5F5F4" },
  medium:   { label: "عادية",  color: "#0369A1", bg: "#E0F2FE" },
  high:     { label: "عالية",  color: "#C2410C", bg: "#FFEDD5" },
  critical: { label: "حرجة",   color: "#B91C1C", bg: "#FEE2E2" },
};

export const TICKET_CATEGORY_META: Record<CsTicketCategory, string> = {
  accounting: "المحاسبة", pos: "نقطة البيع", inventory: "المخزون",
  hr: "الموارد البشرية", reports: "التقارير", printing: "الطباعة",
  mobile_app: "تطبيق الجوال", subscription: "الاشتراك", other: "أخرى",
};

export const FEATURE_REQUEST_STATUS_META: Record<CsFeatureRequestStatus, { label: string; color: string; bg: string }> = {
  new:            { label: "جديد",            color: "#0369A1", bg: "#E0F2FE" },
  under_review:   { label: "قيد المراجعة",     color: "#A16207", bg: "#FEF3C7" },
  planned:        { label: "مخطط له",          color: "#7C3AED", bg: "#EDE9FE" },
  in_development: { label: "قيد التطوير",      color: "#C2410C", bg: "#FFEDD5" },
  released:       { label: "تم الإطلاق",       color: "#15803D", bg: "#DCFCE7" },
  rejected:       { label: "مرفوض",            color: "#B91C1C", bg: "#FEE2E2" },
};

export const CONTRACT_STATUS_META: Record<CsContractStatus, { label: string; color: string; bg: string }> = {
  draft:     { label: "مسودة",   color: "#525252", bg: "#F5F5F4" },
  active:    { label: "ساري",    color: "#15803D", bg: "#DCFCE7" },
  expired:   { label: "منتهي",   color: "#B91C1C", bg: "#FEE2E2" },
  cancelled: { label: "ملغى",    color: "#525252", bg: "#F5F5F4" },
  renewed:   { label: "مجدد",    color: "#0369A1", bg: "#E0F2FE" },
};

export const SUBSCRIPTION_STATUS_META: Record<CsSubscriptionStatus, { label: string; color: string; bg: string }> = {
  active:    { label: "نشط",       color: "#15803D", bg: "#DCFCE7" },
  grace:     { label: "فترة سماح", color: "#A16207", bg: "#FEF3C7" },
  suspended: { label: "موقوف",     color: "#C2410C", bg: "#FFEDD5" },
  cancelled: { label: "ملغى",      color: "#525252", bg: "#F5F5F4" },
  trial:     { label: "تجريبي",    color: "#7C3AED", bg: "#EDE9FE" },
};

export const PAYMENT_STATUS_META: Record<CsPaymentStatus, { label: string; color: string; bg: string }> = {
  paid:    { label: "مدفوع",       color: "#15803D", bg: "#DCFCE7" },
  due:     { label: "مستحق",       color: "#A16207", bg: "#FEF3C7" },
  overdue: { label: "متأخر",       color: "#B91C1C", bg: "#FEE2E2" },
  pending: { label: "بانتظار الدفع", color: "#0369A1", bg: "#E0F2FE" },
};

export const KB_CATEGORIES = [
  { value: "accounting", label: "المحاسبة" },
  { value: "pos", label: "نقطة البيع" },
  { value: "inventory", label: "المخزون" },
  { value: "hr", label: "الموارد البشرية" },
  { value: "printing", label: "الطباعة" },
  { value: "subscriptions", label: "الاشتراكات" },
  { value: "other", label: "أخرى" },
];