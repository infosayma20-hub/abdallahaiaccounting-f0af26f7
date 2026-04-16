import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 5 نقاط تواصل خلال فترة التجربة (14 يوم)
// اليوم 1 = ترحيب، 7 = منتصف، 10 = تحذير، 13 = ما قبل النهاية، 14 = انتهاء
const TRIAL_TOUCH_POINTS = [1, 7, 10, 13, 14];

const TRIAL_MESSAGES: Record<number, { title: string; body: string }> = {
  1:  { title: "🎉 مرحباً! تجربتك المجانية بدأت", body: "عندك 14 يوم لتجرب كل ميزات أموالي المتقدمة. ابدأ الآن!" },
  7:  { title: "⏳ مضى أسبوع — 7 أيام متبقية", body: "نص الرحلة! اكتشف باقي الميزات قبل انتهاء التجربة" },
  10: { title: "⚠️ 4 أيام متبقية فقط!", body: "اشترك الآن لتحافظ على بياناتك واستمراريتك" },
  13: { title: "🔔 غداً آخر يوم في تجربتك", body: "آخر فرصة للاشتراك بدون انقطاع" },
  14: { title: "⛔ انتهت تجربتك — اشترك للاستمرار", body: "بياناتك محفوظة. اختر باقتك لاستعادة الوصول الكامل" },
};

// تذكيرات للاشتراكات المدفوعة (قبل تجديد الفوترة)
const PAID_REMINDER_DAYS = [7, 3, 1];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date();
    let stats = { trial_notifications: 0, paid_reminders: 0, expired: 0 };

    // ============================================
    // 1) معالجة اشتراكات Trial — 5 نقاط تواصل
    // ============================================
    const { data: trialSubs } = await supabase
      .from("subscriptions")
      .select("id, user_id, status, trial_ends_at, created_at, notified_days, plans(name_ar)")
      .in("status", ["trial", "trialing"])
      .not("trial_ends_at", "is", null);

    if (trialSubs?.length) {
      for (const sub of trialSubs) {
        const trialStart = new Date(sub.created_at);
        const trialEnd = new Date(sub.trial_ends_at!);
        const daysUsed = Math.floor((today.getTime() - trialStart.getTime()) / (1000 * 60 * 60 * 24));
        const daysLeft = Math.ceil((trialEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        const notifiedDays: number[] = (sub.notified_days as number[]) || [];

        for (const dayMark of TRIAL_TOUCH_POINTS) {
          if (daysUsed >= dayMark && !notifiedDays.includes(dayMark)) {
            const msg = TRIAL_MESSAGES[dayMark];

            // إشعار داخلي
            await supabase.from("notification_log").insert({
              user_id: sub.user_id,
              type: `trial_day_${dayMark}`,
              channel: "in_app",
              title: msg.title,
              body: msg.body,
              path: "/pricing",
            });

            // تحديث notified_days لتجنب التكرار
            await supabase
              .from("subscriptions")
              .update({ notified_days: [...notifiedDays, dayMark] } as any)
              .eq("id", sub.id);

            notifiedDays.push(dayMark);
            stats.trial_notifications++;
          }
        }
      }
    }

    // ============================================
    // 2) تذكيرات للمشتركين المدفوعين قبل التجديد
    // ============================================
    for (const daysAhead of PAID_REMINDER_DAYS) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysAhead);

      const { data: expiring } = await supabase
        .from("subscriptions")
        .select("id, user_id, current_period_end, plans(name_ar)")
        .eq("status", "active")
        .gte("current_period_end", new Date(targetDate.setHours(0,0,0,0)).toISOString())
        .lt("current_period_end", new Date(targetDate.setHours(23,59,59,999)).toISOString());

      if (!expiring?.length) continue;

      for (const sub of expiring) {
        const notifType = `renewal_${daysAhead}d`;
        const todayStr = today.toISOString().split("T")[0];

        const { data: existing } = await supabase
          .from("notification_log")
          .select("id")
          .eq("user_id", sub.user_id)
          .eq("type", notifType)
          .gte("sent_at", `${todayStr}T00:00:00`)
          .limit(1);

        if (existing?.length) continue;

        const planName = (sub.plans as any)?.name_ar || "اشتراكك";
        const titles: Record<number, string> = {
          7: `⏰ ${planName} يجدد خلال 7 أيام`,
          3: `⚠️ ${planName} يجدد خلال 3 أيام`,
          1: `🚨 ${planName} يجدد غداً`,
        };

        await supabase.from("notification_log").insert({
          user_id: sub.user_id,
          type: notifType,
          channel: "in_app",
          title: titles[daysAhead],
          body: `سيتم تجديد اشتراكك تلقائياً. تأكد من تحديث وسيلة الدفع`,
          path: "/billing",
        });

        stats.paid_reminders++;
      }
    }

    // ============================================
    // 3) إنهاء الاشتراكات المنتهية (Trial + Paid)
    // ============================================
    const { data: expireResult } = await supabase.rpc("expire_trials");
    stats.expired = (expireResult as any)?.expired_count || 0;

    // الاشتراكات المدفوعة المنتهية
    const { data: expiredPaid } = await supabase
      .from("subscriptions")
      .select("id, user_id")
      .eq("status", "active")
      .lt("current_period_end", today.toISOString());

    if (expiredPaid?.length) {
      for (const sub of expiredPaid) {
        await supabase
          .from("subscriptions")
          .update({ status: "expired" } as any)
          .eq("id", sub.id);

        await supabase.from("notification_log").insert({
          user_id: sub.user_id,
          type: "expired",
          channel: "in_app",
          title: "❌ انتهى اشتراكك",
          body: "بياناتك محفوظة بأمان — جدد للوصول الكامل",
          path: "/billing",
        });
        stats.expired++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, checked_at: today.toISOString(), stats }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
