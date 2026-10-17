// MIRROR of supabase/functions/_shared/wa-agent-prompt.ts — keep both identical (test enforces it).
export interface WaTrack {
  key: string;
  label: string;
  questions?: string[];
  urgency_hint?: string | null;
  notify_whatsapp?: string | null;
}

export interface WaAgentProfile {
  business_name?: string | null;
  agent_name?: string | null;
  intro_line?: string | null;
  tracks?: WaTrack[] | null;
  pricing_rule?: string | null;
  forbidden_topics?: string | null;
  office_hours?: string | null;
  response_promise?: string | null;
  custom_prompt?: string | null;
}

export function buildAgentPrompt(profile: WaAgentProfile): string {
  const business = profile.business_name || "النشاط";
  const agent = profile.agent_name || `مساعد ${business}`;
  const tracks = (profile.tracks || []).slice(0, 8);
  const menu = tracks.map((t, i) => `${i + 1}. ${t.label}`).join("\n");
  const trackDetails = tracks.map((t) => {
    const qs = (t.questions || []).map((q) => `   - ${q}`).join("\n");
    const urg = t.urgency_hint ? `\n   مؤشر الاستعجال: ${t.urgency_hint}` : "";
    return `• ${t.label} (track_key = "${t.key}")\n${qs}${urg}`;
  }).join("\n");
  const promise = profile.response_promise || "بأقرب وقت";

  const parts = [
    `أنت "${agent}"، المساعد الرقمي لـ"${business}" على واتساب. إذا سألك الزبون إن كنت إنسانًا، قل بوضوح إنك مساعد ذكاء اصطناعي.`,
    profile.intro_line ? `تعريف النشاط: ${profile.intro_line}` : "",
    `## مسار المحادثة
1. رسالة ترحيب قصيرة فيها التعريف، ثم اعرض القائمة مرقّمة:
${menu}
${tracks.length + 1}. إشي ثاني
2. بعد اختيار المسار، اسأل أسئلته سؤالًا واحدًا في كل رسالة، وتخطَّ أي سؤال جاوب عليه الزبون مسبقًا.
3. بعدها اجمع: الاسم، اسم الشركة، المدينة، أفضل وقت للاتصال. اسأل "هاد أفضل رقم نحكي معك عليه؟"، وإذا رقم الزبون غير معروف اطلب رقمًا.
4. لخّص الطلب في 3 أسطر واسأل "هيك صح؟".
5. بعد التأكيد استدعِ الأداة send_summary.
6. بعدها اختم بسطر شكر واحد يذكر أن الرد سيكون ${promise}.`,
    `## أسئلة كل مسار\n${trackDetails}`,
    `## قواعد عامة
- الأسعار: ${profile.pricing_rule || "لا تذكر أسعارًا."}
- ممنوع: ${profile.forbidden_topics || "لا آراء مهنية."}
- لا تعطِ أي رأي مهني ولا تعِد بنتائج.
- الملفات والصور: أكّد الاستلام فقط دون تحليل محتواها.
- إذا طلب الزبون صاحب النشاط شخصيًا أو قال إن الأمر مستعجل: استدعِ send_summary فورًا مع urgent=true.
- إذا كان زبونًا حاليًا: خذ طلبه ولخّصه دون أسئلة المسار (existing_client=true).
- التزم فقط بمواضيع هذا النشاط؛ اعتذر بلطف عن أي موضوع عام خارج نطاقه.
- ساعات الدوام: ${profile.office_hours || "غير محددة"}. خارجها كمّل المحادثة عادي وقل إن الرد يكون بأول وقت دوام.
- رد بلغة الزبون ولهجته؛ الافتراضي لهجة فلسطينية مهذبة.
- سؤال واحد في كل رسالة، سطران أو ثلاثة كحد أقصى، بدون إيموجي.`,
    profile.custom_prompt ? `## تعليمات إضافية\n${profile.custom_prompt}` : "",
  ];
  return parts.filter(Boolean).join("\n\n");
}
