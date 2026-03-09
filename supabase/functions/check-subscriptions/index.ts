import { createClient } from "https://esm.sh/@supabase/supabase-js@2.96.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Find subscriptions expiring in 7, 3, or 1 day
    const checkDays = [7, 3, 1];
    
    for (const daysAhead of checkDays) {
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysAhead);
      const targetStr = targetDate.toISOString().split("T")[0];

      // Get active subscriptions expiring on target date
      const { data: expiring } = await supabase
        .from("subscriptions")
        .select("id, user_id, status, billing_cycle, current_period_end, trial_ends_at, last_notified_at, plans(name_ar)")
        .in("status", ["active", "trial"])
        .or(`current_period_end.gte.${targetStr}T00:00:00,trial_ends_at.gte.${targetStr}T00:00:00`)
        .or(`current_period_end.lt.${targetStr}T23:59:59,trial_ends_at.lt.${targetStr}T23:59:59`);

      if (!expiring?.length) continue;

      for (const sub of expiring) {
        const expiresAt = sub.status === "trial" && sub.trial_ends_at
          ? new Date(sub.trial_ends_at)
          : new Date(sub.current_period_end);
        
        const actualDaysLeft = Math.ceil((expiresAt.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (actualDaysLeft !== daysAhead) continue;

        // Check if already notified today
        const notifType = `expiry_${daysAhead}days`;
        const { data: existing } = await supabase
          .from("notification_log")
          .select("id")
          .eq("user_id", sub.user_id)
          .eq("type", notifType)
          .gte("sent_at", `${todayStr}T00:00:00`)
          .limit(1);

        if (existing && existing.length > 0) continue;

        const plan = (sub.plans as any);
        const planName = plan?.name_ar || "الاشتراك";
        const titles: Record<number, string> = {
          7: `⏰ ${planName} ينتهي خلال 7 أيام`,
          3: `⚠️ ${planName} ينتهي خلال 3 أيام`,
          1: `🚨 ${planName} ينتهي غداً!`,
        };
        const bodies: Record<number, string> = {
          7: `جدد اشتراكك قبل ${expiresAt.toLocaleDateString("ar-EG")} لتجنب انقطاع الخدمة`,
          3: `اشتراكك ينتهي قريباً جداً — جدد الآن`,
          1: `ينتهي اشتراكك غداً! جدد فوراً لضمان استمرارية عملك`,
        };

        // Insert in-app notification
        await supabase.from("notification_log").insert({
          user_id: sub.user_id,
          type: notifType,
          channel: "in_app",
          title: titles[daysAhead],
          body: bodies[daysAhead],
          path: "/billing",
        });

        // Update last_notified_at
        await supabase
          .from("subscriptions")
          .update({ last_notified_at: new Date().toISOString() } as any)
          .eq("id", sub.id);
      }
    }

    // Handle expired subscriptions
    const { data: expired } = await supabase
      .from("subscriptions")
      .select("id, user_id, plans(name_ar)")
      .eq("status", "active")
      .lt("current_period_end", today.toISOString());

    if (expired?.length) {
      for (const sub of expired) {
        await supabase
          .from("subscriptions")
          .update({ status: "expired" } as any)
          .eq("id", sub.id);

        // Check if already notified
        const { data: existing } = await supabase
          .from("notification_log")
          .select("id")
          .eq("user_id", sub.user_id)
          .eq("type", "expired")
          .gte("sent_at", `${todayStr}T00:00:00`)
          .limit(1);

        if (!existing?.length) {
          await supabase.from("notification_log").insert({
            user_id: sub.user_id,
            type: "expired",
            channel: "in_app",
            title: "❌ انتهى اشتراكك",
            body: "بياناتك محفوظة بأمان لمدة 30 يوماً — جدد للوصول الكامل",
            path: "/billing",
          });
        }
      }
    }

    // Also handle trial expirations
    const { data: expiredTrials } = await supabase
      .from("subscriptions")
      .select("id, user_id")
      .eq("status", "trial")
      .not("trial_ends_at", "is", null)
      .lt("trial_ends_at", today.toISOString());

    if (expiredTrials?.length) {
      for (const sub of expiredTrials) {
        await supabase
          .from("subscriptions")
          .update({ status: "expired" } as any)
          .eq("id", sub.id);
      }
    }

    return new Response(
      JSON.stringify({ success: true, checked_at: today.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
