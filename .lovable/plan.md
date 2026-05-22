# خطة تعريف جهاز زبون جديد على نقطة بيع أموالي (Onboarding مبسّط)

الهدف: لما تروح عند زبون جديد (أو تفتح AnyDesk عن بُعد)، تقدر بأقل من 10 دقائق تعرّف:
1. حساب الزبون الإداري (Admin) على أموالي.
2. جهاز الكاشير (نقطة البيع) على هذا الحساب.
3. الطابعات (USB أو شبكة) وتربطها بالأقسام.

الخطة مبنية على أدوات موجودة فعلاً في النظام (`DeviceSetupPage`, `print-bridge`, `pos_terminals`, `pos_printers`, `device.json`). ما رح نبني أشياء جديدة — رح ننظّم العملية ونضيف شاشة "Onboarding موحّدة" تسهّل الخطوات.

---

## الفكرة الأساسية بثلاث طبقات

```text
 ┌──────────────────────────────┐
 │ 1. الحساب (سحابي)            │  ← أموالي.app  (مرة واحدة لكل زبون)
 │    company + admin user      │
 ├──────────────────────────────┤
 │ 2. الجهاز (محلي على كل PC)   │  ← Print Bridge + device.json
 │    branch + terminal + label │
 ├──────────────────────────────┤
 │ 3. الطابعات (محلية بالشبكة)  │  ← pos_printers + اختبار IP/USB
 │    receipt / kitchen / …     │
 └──────────────────────────────┘
```

كل طبقة عندها شاشة واحدة فقط. ما تخلط بينهم.

---

## الخطوة 1 — تجهيز حساب الزبون (مرة وحدة، من أي مكان)

تعملها من لابتوبك قبل ما تروح عند الزبون، أو من عند الزبون من المتصفح.

1. افتح `https://amwali.app` → **Super Admin Panel**.
2. أنشئ **شركة جديدة** (اسم + إيميل + باسوورد مؤقت للأدمن).
3. فعّل اشتراك (Trial أو مدفوع) من Super Admin → Subscription Agreements.
4. ابعت الإيميل/الباسوورد للزبون أو احفظهم لحالك.

✅ بعد هاي الخطوة: في حساب شغّال، عنده Admin user، وجاهز.

---

## الخطوة 2 — تجهيز الجهاز (على كل PC كاشير، مرّة واحدة)

هاي الخطوة بتعملها فيزيكال على جهاز الزبون أو عن بُعد بـ AnyDesk.

### 2.أ — تثبيت Print Bridge (5 دقائق)

1. حمّل ملف `print-bridge.zip` (موجود معك جاهز) وفُكّه في `C:\print-bridge`.
2. شغّل **مرة وحدة** ملف `install-bridge.bat` (يُثبّت Node إذا ناقص + يضيف الـ bridge كخدمة Windows تعمل تلقائياً).
3. تأكد من الشغل: افتح المتصفح على `http://127.0.0.1:3001/health` → لازم يرجع `{ ok: true }`.

> ⚠️ بعد التثبيت: انسخ مجلد `C:\print-bridge` على USB كباك-أب. إذا فُرمت الجهاز، ترجع تنسخه بدل ما تعيد كل الإعداد.

### 2.ب — تعريف الجهاز على حساب الزبون

1. على نفس الـ PC، افتح `https://amwali.app` وسجّل دخول بحساب الأدمن.
2. روح على `/device-setup` (أو اضغط زر "إعداد الجهاز" لما يطلع).
3. الويزرد بيمشي معك خطوة خطوة:
   - **اسم الجهاز** (مثلاً: "كاشير 1 - الواجهة")
   - **الفرع** (إذا ما في، اضغط "إنشاء فرع جديد" من نفس الشاشة)
   - **محطة POS** (نفس الشي — "إنشاء محطة جديدة")
   - **Print Bridge URL** → اتركه `http://127.0.0.1:3001` (الافتراضي)
   - **اختبر الاتصال** → ✅ أخضر
   - **حفظ**

✅ بعد هاي الخطوة:
- ينحفظ الإعداد في المتصفح (`localStorage`).
- يُنسخ أوتوماتيكياً في `C:\print-bridge\device.json` عبر الـ bridge.
- لو الزبون مسح بيانات المتصفح، بيرجع الإعداد لحاله بعد ثانيتين.

---

## الخطوة 3 — تعريف الطابعات (USB أو شبكة)

تعملها من شاشة واحدة: `/pos-settings/printers` (أو من زر "إعدادات الطابعات" داخل `/device-setup`).

### 3.أ — طابعة شبكة (الأفضل دائماً)

1. خلّي فني الشبكات يعطي الطابعة **IP ثابت** (مثلاً 192.168.1.50).
2. في الشاشة اضغط "إضافة طابعة" واملأ:
   - **الاسم**: "Receipt" / "Kitchen" / "Grill" / "Pizza"
   - **النوع**: حدد القسم (إيصال زبون / مطبخ / مشاوي / بيتزا)
   - **IP**: 192.168.1.50
   - **Port**: 9100 (افتراضي لمعظم الطابعات الحرارية)
   - **الفرع**: نفس فرع الجهاز
3. اضغط **"اختبار الطباعة"** → يطلع ورقة test.
4. ✅ احفظ.

### 3.ب — طابعة USB مباشرة على نفس الـ PC

1. ركّب الطابعة على Windows وتأكد إنها تطبع Test Page من Windows.
2. في نفس الشاشة، اختار النوع **"USB / Windows Printer"** بدل IP.
3. اختار اسم الطابعة من القائمة (الـ bridge بيقرأها من Windows).
4. اختبار → ✅ احفظ.

### 3.ج — ربط الأقسام بالطابعات

- روح على **المنتجات** → افتح المنتج → اختار **"محطة الطباعة"** (مثلاً: مطبخ).
- المنتج الواحد ممكن يطبع على أكثر من طابعة (شواية + مطبخ).
- لو الزبون مطعم بسيط: استخدم **"Unified Kitchen"** = كل المنتجات تطبع على طابعة وحدة.

---

## الخطوة 4 — تجربة سريعة (Smoke Test) قبل ما تمشي

1. سجّل دخول كـ كاشير.
2. افتح وردية.
3. أضف منتج → ادفع كاش.
4. تأكد:
   - ✅ إيصال الزبون يطلع من Receipt printer.
   - ✅ التذكرة تطلع من المطبخ (لو مطعم).
   - ✅ الدرج يفتح.
5. أغلق الوردية → تأكد التقرير صحيح.

---

## ملف Cheat Sheet للجوال (تطبعه وتحطه بحقيبتك)

| الموقف | الخطوة |
|---|---|
| زبون جديد كلياً | Super Admin → أنشئ شركة → ابعت credentials |
| PC جديد بنفس الزبون | شغّل `install-bridge.bat` → افتح `/device-setup` → ويزرد |
| فُرمت الجهاز | انسخ `device.json` من الـ USB إلى `C:\print-bridge` → خلص |
| طابعة جديدة | `/pos-settings/printers` → إضافة → IP + Port 9100 → اختبار |
| الإيصال ما يطلع | افتح `http://127.0.0.1:3001/health` → لو offline أعد تشغيل الـ bridge |
| AnyDesk عن بُعد | نفس الخطوات بالضبط — كل شي عبر المتصفح |

---

## شو رح نضيفه/نحسّنه في الكود (مهام تنفيذية)

هاي اللي بدها شغل من جانبي عشان تصير العملية فعلاً سلسة:

1. **شاشة "Onboarding موحّدة" `/onboarding/new-device`** — شاشة واحدة تجمع: تثبيت bridge + إعداد device + إضافة طابعات + smoke test، مع progress bar وضّاح ("3 من 4").
2. **`install-bridge.bat`** — سكربت Windows جاهز يثبّت Node ويسجّل الـ bridge كخدمة (NSSM) عشان يشتغل مع إقلاع الجهاز بدون CMD مفتوح.
3. **زر "تصدير device.json كنسخة احتياطية"** داخل `/device-setup` — ينزّل الملف ليتم حفظه على USB.
4. **زر "استيراد device.json"** — لو الجهاز فُرمت، ترفع الملف وتنتهي.
5. **Discovery تلقائي للطابعات الشبكية** — زر "ابحث عن طابعات في الشبكة" يعمل scan على 192.168.x.1-254 port 9100 ويعرض اللي رد.
6. **QR من حسابي إلى جهاز الزبون** — من حسابك تولّد QR فيه (companyId + adminEmail)، الزبون يمسحه من جهازه فيدخل مباشرة على `/device-setup` بدون باسوورد يدوي.

---

## التسلسل الزمني للتنفيذ المقترح

- **Sprint 1 (نفس الجلسة لو وافقت):** بنود 1 + 3 + 4 (شاشة Onboarding موحّدة + Export/Import للـ device.json).
- **Sprint 2:** بند 2 (install-bridge.bat + NSSM service).
- **Sprint 3:** بند 5 (Network printer discovery).
- **Sprint 4:** بند 6 (QR onboarding).

قلّي على أي Sprint تحب نبدأ، وأنا بنفّذ.
## Phase 1 Smoke Apply — Feature Permissions

Goal: enforce `user_feature_permissions` on real sensitive UI + handlers, with minimum file surface area. Build infrastructure first, then wrap.

---

### A. Infrastructure (3 new files)

1. **`src/components/permissions/FeatureGuard.tsx`**
   Route wrapper. Props: `app`, `feature`, `perm`. Shows `LockedModulePage` (reuse existing) if denied. Uses `usePermission`. Loading-aware (no flicker). super_admin bypass via hook.

2. **`src/lib/permissions/assertPermission.ts`**
   `await assertPermission(app, feature, perm, { silent? })` — calls `checkFeaturePermission`. On deny: toast `"لا تملك صلاحية تنفيذ هذه العملية"` + throws. Used inside handlers.

3. **Extend `src/components/permissions/Can.tsx`** (already exists)
   Add `mode="disable"` variant with tooltip `"لا تملك صلاحية"` (default stays hidden).

---

### B. Wiring — Buttons + Route Guards

For each page below: import `usePermission` + `<Can>`, wrap actions; add `assertPermission` in the handler.

| Page | Wrapped buttons | Handler asserts |
|---|---|---|
| `src/pages/InvoicesPage.tsx` | New / Edit row / Delete / Cancel / Print / Export | delete, cancel, export |
| `src/pages/InvoiceCreatePage.tsx` | Save | save (create or update) |
| `src/pages/PurchasePointPage.tsx` (purchase invoices list) | New / Edit / Delete / Print / Export | delete, export |
| `src/pages/POSPage.tsx` + `src/components/pos/ReturnDialog.tsx` + relevant POS toolbar/cash-drawer/close-shift code | discount field, change-price, refund, open-drawer, close-shift, print-receipt | discount apply, refund submit, openDrawer, closeShift |
| `src/pages/FinanceVoucherPage.tsx` / `VoucherFormPage.tsx` | New / Edit / Delete / Print (receipts + payments) | delete, save |
| `src/pages/JournalEntriesPage.tsx` / `JournalNewPage.tsx` | New / Edit / Delete / Approve | delete, approve, save |
| `src/pages/SettingsPage.tsx` | Hide `user` tab if `settings.users.manage` deny; hide `company` save if `company.update` deny; hide POS settings save; hide app-permissions button |
| `src/components/settings/UsersSettingsSection.tsx` | "Manage Apps" + "Add user" + "Edit role" | gate `manage-team-user` invoke + UserAppAccessDialog open |

---

### C. Route Guards (`src/App.tsx`)

Wrap route elements:
- `/invoices/new` and `/invoices/:id/edit` → `<FeatureGuard app="sales" feature="invoices" perm="create"|"update">`
- `/procurement/invoices/new` → purchases.purchase_invoices.create
- `/finance/vouchers/new`, `/finance/journal/new` → respective create
- `/pos-users` → `pos.kds.manage` (closest match) — actually use `settings.users.manage` per spec
- `/settings` already protected at app level; sub-tabs gated inside SettingsPage

---

### D. Edge function hardening

`supabase/functions/manage-team-user/index.ts`: at top after auth, call `has_feature_permission(actor, 'settings', 'users', 'manage')`. If false (and not super_admin) → 403 + audit log.

`supabase/functions/manage-user-app-access/index.ts`: same with `settings.app_permissions.manage`.

---

### E. UX rules
- Destructive/hidden by default: create, delete, cancel, approve, refund, open_drawer, close_shift, manage users, manage app permissions, discount.
- Disabled+tooltip: print, export, edit (so user sees the row but can't act).

---

### F. Acceptance test pass (manual checklist documented in plan.md)

10 cases listed in user message, plus super_admin bypass + Realtime allow-flip.

---

### Files touched (estimate)
**New (3):** FeatureGuard.tsx, assertPermission.ts, (extend Can.tsx)
**Edited (~12):** InvoicesPage, InvoiceCreatePage, PurchasePointPage, POSPage, ReturnDialog, FinanceVoucherPage, VoucherFormPage, JournalEntriesPage, JournalNewPage, SettingsPage, UsersSettingsSection, App.tsx, manage-team-user/index.ts, manage-user-app-access/index.ts

### Out-of-scope (Phase 2)
- Per-row RLS for invoices/vouchers DELETE (server-side enforcement)
- Cheques, HR, inventory adjust, recurring invoices
- POS PIN-mode override workflows
- Migration of role defaults beyond admin/accountant_senior/cashier