# الواجهة الجديدة لنقطة البيع (تجريبية) — تغيير بالشكل فقط

## الهدف
شاشة نقطة بيع جديدة على رابط منفصل `/pos-v2`، بنفس المنطق بالضبط: السلة، والدفع، والطباعة، والاختصارات، والصلاحيات. الشاشة الحالية `/pos` بتضل زي ما هي بدون أي تغيير بالسلوك.

## كيف بنوصلها
- بقائمة «المزيد» بالشاشة الحالية بنضيف: «تجربة الواجهة الجديدة».
- بقائمة «المزيد» بالواجهة الجديدة: «العودة للواجهة الحالية».
- الاختيار بينحفظ للجلسة الحالية بس، بدون ما نكتب إشي بذاكرة المتصفح وبدون أي تعديل على قاعدة البيانات.

## شو بيتغير بالشكل (حسب الملف المرفق)
- **الشريط العلوي (68px):** على اليمين الشعار واسم الكاشير وسطر الصندوق والوردية. بالنص بحث واحد كبير بيبحث بالاسم وبيقرأ الباركود، وزر «/» بيفتحه. على اليسار شارة «الطابعة غير متصلة» (بتظهر بس وقت الانقطاع)، وخمس أزرار: المعلّقة، المطبخ، التنبيهات، الفواتير، المزيد. كل الباقي بينتقل لقائمة «المزيد»، ومعه «إغلاق نقطة البيع» مع رسالة تأكيد.
- **الأصناف:** التصنيفات بسطر واحد بيتمرر بالعرض، و«الكل» أولها. كل تصنيف إله نقطة لون وعدد الأصناف. زر S/M/L بيغيّر عدد الأعمدة (6/5/4). زر «تعديل» فيه إضافة تصنيف وإضافة منتج والترتيب، وما بيظهر إلا لصاحب الصلاحية. البطاقة فيها شريط ملون فوق، وصورة، واسم من سطرين، وسعر عريض. الصنف بلا صورة بيظهر مكانها أول حرف من التصنيف. الصنف بسعر صفر بيظهر عليه «سعر مفتوح». وفي شارة كمية إذا الصنف بالسلة.
- **السلة (400px):** تبويبات الطلبات وزر سلة المهملات، سفري/توصيل/طاولة، زر «إضافة زبون»، أسطر الأصناف مع زر الكمية، أزرار خصم وملاحظة وتعليق، المجاميع، زر دفع كبير (60px) عليه علامة F2، وتحته حفظ وطباعة.
- **الثيمين:** الغامق هو الأساسي (فحمي مع برتقالي)، والفاتح (أبيض مع أزرق ودفع أخضر)، بنفس الألوان المكتوبة بالملف حرفيًا.
- **الشاشات الصغيرة:** تحت عرض 1180 السلة بتصير 360px. تحت 900 بتصير لوحة من تحت مع شريط ثابت فيه عدد الأصناف والمجموع وزر الدفع.

## شو ما بيتغير
لا جداول ولا أعمدة جديدة، ولا صلاحيات قاعدة بيانات، ولا أي تغيير بمنطق البيع أو الترحيل أو الطباعة.

## سؤال واحد
التلوين التجريبي اللي عملناه قبل شوي لحساب العرض: الواجهة الجديدة بتغني عنه، فبقترح نشيله ونخلي الواجهة الجديدة هي اللي نعرضها للزباين.

## Technical details
- `POSPage` keeps a single source of state/handlers. Add a `variant: "v1" | "v2"` prop (default `"v1"`). `/pos-v2` mounts the same guarded `POSPage` with `variant="v2"`.
- Only the three JSX zones (top bar, products, cart) branch on the variant. v2 zones live in new components under `src/components/pos/v2/` (`POSv2TopBar`, `POSv2Products`, `POSv2Cart`, `posV2Theme.ts`), receiving existing state and handlers as props (`addToCart`, quantity updaters, `openPaymentModal`, hold/save/print, order tabs, order type, customer dialog, discount, notes, bridge status, permissions). No duplicate queries.
- Dialogs, modals, and the keyboard handler stay shared. Add `/` to focus search and `Esc` to clear it, but only when `variant==="v2"`.
- In v2, theme and S/M/L live in React state only. v1 keeps its current storage behavior unchanged.
- Category colors come from a deterministic hash of the category id over the 8-color palette. All custom colors use inline styles from token objects.
- Verify with the type check plus a Playwright run on `/pos` (unchanged) and `/pos-v2`, on the demo account.
