
# Customer Success Center — توسعة CRM الحالي

نبني على وحدة `/crm` الموجودة (CrmLayout + crm_leads/opportunities/activities + Customer360Page) بدلاً من إنشاء وحدة موازية. كل العملاء يبقون في جدول `contacts` الموحّد.

## 1) قاعدة البيانات — جداول جديدة (Migration واحد)

كل الجداول تربط بـ `contacts.id` وتحتوي `company_id` للعزل عبر RLS الحالي.

- **`cs_notes`** — title, body (rich), note_type (general/sales/support/management), tags[], contact_id, created_by
- **`cs_calls`** — direction (in/out), duration_sec, purpose, summary, outcome (interested/follow_up/not_interested/support/meeting_scheduled/contract_sent), contact_id, called_at, created_by
- **`cs_meetings`** — date, location, attendees[], purpose, summary, next_action, status (scheduled/completed/cancelled), contact_id, created_by
- **`cs_support_tickets`** — ticket_number (SUP-YYYY-XXXXX عبر sequence), category (accounting/pos/inventory/hr/reports/printing/mobile/subscription/other), priority (low/med/high/critical), status (new/in_progress/waiting_customer/waiting_dev/resolved/closed), description, assigned_to, contact_id, resolution
- **`cs_ticket_comments`** — ticket_id, body, is_internal, created_by
- **`cs_feature_requests`** — fr_number (FR-YYYY-XXXXX), title, business_justification, votes, status (new/under_review/planned/in_dev/released/rejected), contact_id, requested_by
- **`cs_contracts`** — contract_number, plan, users_count, branches_count, price, start_date, end_date, status, pdf_url, contact_id (نتكامل لاحقاً مع `project_contracts` و ACT)
- **`cs_subscriptions`** — contact_id, plan, monthly_value, annual_value, renewal_date, payment_status, status
- **`cs_kb_articles`** — title, category, problem, symptoms, cause, solution, video_url, tags[], published, views_count
- **`cs_kb_article_views`** (اختياري الآن — للإحصاء)

كل جدول:
- `GRANT` لـ `authenticated` و `service_role`
- `ENABLE RLS` + سياسات مبنية على `company_id`/`has_role`
- Trigger لتوليد الرقم التسلسلي (SUP/FR) لكل سنة
- Trigger `updated_at`

**Timeline موحّد:** View `cs_customer_timeline_view` يدمج (notes + calls + meetings + tickets + feature_requests + contracts + crm_activities + invoices) في صفوف موحّدة (event_type, event_date, title, summary, ref_id) مفلترة بـ contact_id.

**Customer Health Score:** عمود محسوب `contacts.health_score` (دالة `calculate_health_score(contact_id)` تأخذ: open_tickets, days_since_last_contact, overdue_amount, NPS لاحقاً). placeholder الآن.

**حقول AI placeholder:** `ai_summary`, `last_sentiment`, `suggested_next_action` على cs_support_tickets و cs_meetings و contacts (بدون تنفيذ AI).

**تنبيهات التجديد:** دالة مجدولة `notify_renewals()` تفحص cs_subscriptions يومياً (30/14/7/1 يوم) وتنشئ صفوف في `notifications` الحالي.

## 2) الواجهة — توسعة CrmLayout

نضيف تبويبات جديدة إلى `src/pages/crm/CrmLayout.tsx`:

```text
Dashboard | Customers | Leads | Pipeline | Activities | Calls | Meetings | Tickets | Feature Requests | Contracts | Knowledge Base | Renewals
```

صفحات جديدة تحت `src/pages/crm/`:

- `CallsPage.tsx` + `CallFormDialog.tsx`
- `MeetingsPage.tsx` + `MeetingFormDialog.tsx`
- `SupportTicketsPage.tsx` + `TicketFormDialog.tsx` + `TicketDetailPage.tsx` (route: `/crm/ticket/:id`)
- `FeatureRequestsPage.tsx` + `FeatureRequestFormDialog.tsx`
- `ContractsPage.tsx` + `ContractFormDialog.tsx` (مع رفع PDF لـ Supabase Storage bucket `cs-contracts`)
- `KnowledgeBasePage.tsx` + `KbArticlePage.tsx` + `KbArticleForm.tsx`
- `RenewalCenterPage.tsx` — قائمة الاشتراكات المرتبة حسب أقرب تجديد + KPIs

## 3) Customer 360 — إعادة هيكلة بتبويبات

تحديث `src/pages/crm/Customer360Page.tsx` ليصبح بتبويبات (shadcn `Tabs`):

```text
Overview | Notes | Calls | Meetings | Tickets | Feature Requests | Contracts | Invoices | Devices | Subscription | Timeline
```

- **Overview:** بيانات الشركة + KPIs (Open Tickets, Closed, Calls, Meetings, Contracts, MRR, Health Score)
- **Timeline:** يقرأ من `cs_customer_timeline_view` بترتيب زمني، أيقونة لكل نوع حدث
- باقي التبويبات: قوائم مفلترة + زر إضافة سريع

مكوّن جديد `CustomerUnifiedTimeline.tsx` يستبدل `CustomerActivityTimeline` الحالي.

## 4) Dashboard CRM — تحديث

`CrmDashboard.tsx` يضيف KPIs:
- تذاكر مفتوحة حسب الأولوية
- متوسط زمن حل التذكرة
- تجديدات قادمة (30 يوم)
- أكثر طلبات الميزات تصويتاً
- Health Score منخفض (top 10)

## 5) Hooks & Types

`src/pages/crm/hooks/`:
- `useCsNotes.ts`, `useCsCalls.ts`, `useCsMeetings.ts`, `useCsTickets.ts`, `useCsFeatureRequests.ts`, `useCsContracts.ts`, `useCsSubscriptions.ts`, `useCsKbArticles.ts`, `useCustomerTimeline.ts`

`src/pages/crm/types.ts` — يُضاف لها أنواع وثوابت التسميات العربية.

## 6) الصلاحيات

نستخدم RBAC الحالي عبر `has_role`:
- `sales_*` → Customers/Leads/Calls/Meetings/Pipeline/Contracts/Subscriptions (قراءة كاملة، كتابة)
- `support_*` (جديد، أو ضمن `cashier`/`accountant_junior` مؤقتاً) → Tickets/Knowledge Base
- `admin`, `accountant_senior`, owners → كل شيء

سياسات RLS مبنية على `company_id` فقط (لا فلترة بـ user_id من الواجهة — حسب memory).

## 7) ملاحظات تقنية

- لا نُنشئ جدول عملاء جديد — كل شيء يربط بـ `contacts`
- نُبقي `support_tickets` القديم كما هو (أداة داخلية لـ Amwali) ونضيف `cs_support_tickets` للعملاء
- لاحقاً: ربط `sami_leads` و ACT contracts و `project_contracts` بـ `cs_contracts`
- Mobile-first RTL، نفس نمط `CrmLayout` (gradient header + tab pills)
- لا AI الآن — فقط حقول placeholder وخطافات جاهزة

## 8) ترتيب التنفيذ

1. Migration الجداول كلها + RLS + sequences + view + storage bucket
2. Types + Hooks
3. صفحات: Tickets, Calls, Meetings (الأولوية للدعم/المبيعات اليومية)
4. Knowledge Base + Renewal Center
5. Feature Requests + Contracts
6. Customer360 إعادة هيكلة بالتبويبات + Unified Timeline
7. Dashboard KPIs محدّثة
8. تحديث CrmLayout بالتبويبات الجديدة

---

**ملاحظة:** بناءً على نصيحتك (SOP + Knowledge Base قبل AI)، الـ Knowledge Base + Tickets + Playbooks ستُبنى أولاً، وحقول AI ستبقى placeholder حتى تكتمل قاعدة المعرفة بـ 80+ مقالة، ثم نربط سامي بها كمساعد لا بديل.

هل أبدأ بالـ Migration؟
