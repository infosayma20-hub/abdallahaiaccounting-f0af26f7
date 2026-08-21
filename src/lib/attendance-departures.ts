/**
 * المغادرات (الوقت بين الجلسات) — مصدر واحد موحّد للحساب.
 *
 * القانون الفلسطيني: مجموع المغادرات المسموح بها خلال اليوم = 30 دقيقة
 * (صلاة / أكل / تدخين ... إلخ). هذا الملف هو المرجع الوحيد لحساب المجموع
 * حتى لا يختلف الرقم بين شاشة الموارد البشرية، مدير الفرع، الموظف، والإدارة.
 *
 * دوال خالصة (Pure) — بدون أي وصول لقاعدة البيانات.
 */

/** أقل فجوة (دقائق) بين خروج ودخول تُعتبر "مغادرة" حقيقية (أقل من هيك = ضجيج بصمات). */
export const MIN_DERIVED_GAP_MIN = 2;
/** أكبر فجوة تُعتبر مغادرة مؤقتة؛ الأطول منها = فاصل بين وردیتين وليس مغادرة. */
export const MAX_DERIVED_GAP_MIN = 300; // 5 ساعات
/** السقف القانوني اليومي لمجموع المغادرات بالدقائق. */
export const DEPARTURE_CAP_MIN = 30;
/**
 * مضاد التحايل: إذا اختار الموظف "إنهاء دوام" ثم عاد خلال هذه المدة، تُحتسب
 * الفجوة مغادرة رغم اختياره (لأنه عملياً لم ينهِ دوامه).
 */
export const END_OF_DAY_RETURN_GRACE_MIN = 60;

/** نية الموظف عند بصمة الخروج. NULL = بصمات قديمة قبل تفعيل الخيار. */
export type CheckoutKind = "temporary" | "end_of_day" | null | undefined;

export type RawPunch = {
  event_type: string;
  event_time: string;
  status?: string | null;
  checkout_kind?: CheckoutKind;
};
export type StoredBreak = { break_out: string | null; break_in: string | null };
export type GapDismissal = { attendance_day_id: string; gap_out: string; gap_in: string };
export type DerivedGap = { out: string; in: string; minutes: number; kind?: CheckoutKind };

/**
 * هل تُحتسب الفجوة مغادرة؟ القرار مبني على نية الموظف المصرّح بها وقت الخروج:
 *  • temporary  → مغادرة دائماً (ضمن حدود الدقائق).
 *  • end_of_day → ليست مغادرة، إلا إذا عاد خلال مهلة قصيرة (مضاد تحايل).
 *  • NULL (قديم) → السلوك السابق: كل فجوة ضمن الحدّين تُعتبر مغادرة.
 */
export function gapCountsAsDeparture(minutes: number, kind: CheckoutKind, maxGap: number): boolean {
  if (minutes < MIN_DERIVED_GAP_MIN) return false;
  if (kind === "end_of_day") return minutes <= END_OF_DAY_RETURN_GRACE_MIN;
  if (kind === "temporary") return minutes <= maxGap;
  return minutes <= maxGap;
}

/**
 * استخراج المغادرات (خروج → الدخول التالي) من البصمات الخام، مقيّدة بنافذة
 * دوام اليوم الفعلية حتى لا تُربط بصمة وردية ليلية بوردية اليوم التالي.
 * البصمة المفتوحة (دخول بدون خروج) لا تُنتج مغادرة إطلاقاً.
 */
export function deriveGapsFromPunches(
  events: RawPunch[],
  window?: { start?: string | null; end?: string | null; maxGap?: number },
): DerivedGap[] {
  const maxGap = window?.maxGap && window.maxGap > 0 ? window.maxGap : MAX_DERIVED_GAP_MIN;
  const ws = window?.start ? new Date(window.start).getTime() : null;
  const we = window?.end ? new Date(window.end).getTime() : null;
  const sorted = [...events]
    .filter((e) => !e.status || e.status === "valid" || e.status === "manual")
    .filter((e) => {
      const t = new Date(e.event_time).getTime();
      if (!isFinite(t)) return false;
      if (ws !== null && t < ws) return false;
      if (we !== null && t > we) return false;
      return true;
    })
    .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime());

  const gaps: DerivedGap[] = [];
  let lastOut: string | null = null;
  let lastOutKind: CheckoutKind = null;
  for (const e of sorted) {
    if (e.event_type === "check_out") {
      lastOut = e.event_time;
      lastOutKind = e.checkout_kind ?? null;
    } else if (e.event_type === "check_in" && lastOut) {
      const min = Math.floor(
        (new Date(e.event_time).getTime() - new Date(lastOut).getTime()) / 60000,
      );
      if (gapCountsAsDeparture(min, lastOutKind, maxGap)) {
        gaps.push({ out: lastOut, in: e.event_time, minutes: min, kind: lastOutKind });
      }
      lastOut = null;
      lastOutKind = null;
    }
  }
  return gaps;
}

/** استخراج المغادرات من جلسات جاهزة (in→out) — الجلسة المفتوحة تُتجاهل. */
export function deriveGapsFromSessions(
  sessions: { checkIn: string; checkOut: string | null; checkoutKind?: CheckoutKind }[],
  maxGap?: number,
): DerivedGap[] {
  const cap = maxGap && maxGap > 0 ? maxGap : MAX_DERIVED_GAP_MIN;
  const gaps: DerivedGap[] = [];
  for (let i = 0; i < sessions.length - 1; i++) {
    const out = sessions[i].checkOut;
    const nextIn = sessions[i + 1]?.checkIn;
    if (!out || !nextIn) continue;
    const min = Math.floor((new Date(nextIn).getTime() - new Date(out).getTime()) / 60000);
    const kind = sessions[i].checkoutKind ?? null;
    if (gapCountsAsDeparture(min, kind, cap)) {
      gaps.push({ out, in: nextIn, minutes: min, kind });
    }
  }
  return gaps;
}

/** true إذا كانت المغادرة المستنتجة تتقاطع مع استراحة مسجّلة (لمنع الاحتساب المزدوج). */
export function gapOverlapsStored(
  gap: { out: string; in: string },
  stored: StoredBreak[],
): boolean {
  const gs = new Date(gap.out).getTime();
  const ge = new Date(gap.in).getTime();
  return stored.some((b) => {
    if (!b.break_out) return false;
    const bs = new Date(b.break_out).getTime();
    const be = b.break_in ? new Date(b.break_in).getTime() : bs;
    return bs < ge && be > gs;
  });
}

/** true إذا كانت الموارد البشرية قد استبعدت هذه المغادرة يدوياً (سماحية ±90 ثانية). */
export function gapIsDismissed(
  gap: { out: string; in: string },
  dayId: string,
  dismissals: GapDismissal[],
): boolean {
  const gs = new Date(gap.out).getTime();
  const ge = new Date(gap.in).getTime();
  return dismissals.some(
    (d) =>
      d.attendance_day_id === dayId &&
      Math.abs(new Date(d.gap_out).getTime() - gs) <= 90000 &&
      Math.abs(new Date(d.gap_in).getTime() - ge) <= 90000,
  );
}

/** حالات اليوم التي لا يُحتسب فيها سقف المغادرات (إجازة / عطلة / غياب / بدون سجل). */
export function isDepartureExemptStatus(status?: string | null): boolean {
  const s = String(status || "").toLowerCase();
  return s === "leave" || s === "holiday" || s === "weekend" || s === "off" ||
         s === "absent" || s === "no_record" || s === "no_data";
}

export type DepartureSummary = {
  /** مجموع دقائق المغادرات (المستنتجة + الاستراحات المسجّلة). */
  minutes: number;
  /** عدد المغادرات. */
  count: number;
  /** السقف القانوني. */
  cap: number;
  /** المتبقي من السقف (لا يقل عن صفر). */
  remaining: number;
  /** الدقائق المتجاوزة للسقف (صفر إذا ضمن السقف). */
  over: number;
  /** true عند تجاوز السقف. */
  exceeded: boolean;
  /** false عندما يكون اليوم إجازة/عطلة/غياب فلا يُحتسب سقف. */
  applicable: boolean;
};

export function emptyDepartureSummary(applicable = false): DepartureSummary {
  return { minutes: 0, count: 0, cap: DEPARTURE_CAP_MIN, remaining: DEPARTURE_CAP_MIN, over: 0, exceeded: false, applicable };
}

/** بناء ملخّص المغادرات من دقائق مُجمّعة مسبقاً. */
export function summarizeDepartures(
  minutes: number,
  count: number,
  opts?: { applicable?: boolean; cap?: number },
): DepartureSummary {
  const cap = opts?.cap ?? DEPARTURE_CAP_MIN;
  const applicable = opts?.applicable ?? true;
  const m = Math.max(0, Math.round(minutes || 0));
  return {
    minutes: m,
    count,
    cap,
    remaining: Math.max(0, cap - m),
    over: Math.max(0, m - cap),
    exceeded: applicable && m > cap,
    applicable,
  };
}

/**
 * الحساب الكامل ليوم واحد: يدمج المغادرات المستنتجة من البصمات مع الاستراحات
 * المسجّلة يدوياً، بدون احتساب مزدوج، ومع استبعاد ما استبعدته الموارد البشرية.
 *
 * ملاحظات مهمة:
 *  • اليوم بلا نافذة مكتملة (بصمة مفتوحة بدون خروج) → لا نستنتج فجوات من الخام،
 *    ونعتمد فقط الاستراحات المسجّلة، حتى لا تُظلم أرقام الموظف.
 *  • أيام الإجازة/العطلة/الغياب لا يُطبَّق عليها السقف إطلاقاً.
 */
export function computeDayDepartures(input: {
  dayId?: string | null;
  status?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  punches?: RawPunch[];
  storedBreaks?: (StoredBreak & {
    duration_minutes?: number | null;
    break_type?: string | null;
    /** المهمات الخارجية لا تُحتسب ضمن سقف المغادرات (مدفوعة كوقت عمل). */
    counts_toward_cap?: boolean | null;
  })[];
  dismissals?: GapDismissal[];
  /** السقف اليومي القابل للإعداد (افتراضي 30 دقيقة). */
  cap?: number;
  /** أقصى فجوة تُحتسب مغادرة (افتراضي 300 دقيقة). */
  maxGap?: number;
}): DepartureSummary & { gaps: DerivedGap[] } {
  const applicable = !isDepartureExemptStatus(input.status);
  const stored = input.storedBreaks || [];
  // المهمة الخارجية = وقت عمل مدفوع، لا تُخصم ولا تدخل ضمن سقف المغادرات.
  const countable = stored.filter((b) => {
    if (b.counts_toward_cap === false) return false;
    if (b.break_type === "external_task") return false;
    return true;
  });

  const storedMinutes = countable.reduce((s, b) => {
    if (b.duration_minutes != null) return s + Math.max(0, Number(b.duration_minutes) || 0);
    if (!b.break_out || !b.break_in) return s;
    return s + Math.max(0, Math.floor((new Date(b.break_in).getTime() - new Date(b.break_out).getTime()) / 60000));
  }, 0);

  let gaps: DerivedGap[] = [];
  if (input.windowStart && input.windowEnd) {
    gaps = deriveGapsFromPunches(input.punches || [], { start: input.windowStart, end: input.windowEnd, maxGap: input.maxGap })
      .filter((g) => !gapOverlapsStored(g, stored))
      .filter((g) => !input.dayId || !gapIsDismissed(g, input.dayId, input.dismissals || []));
  }

  const gapMinutes = gaps.reduce((s, g) => s + g.minutes, 0);
  const summary = summarizeDepartures(storedMinutes + gapMinutes, stored.length + gaps.length, {
    applicable,
    cap: input.cap,
  });
  return { ...summary, gaps };
}

/** تنسيق مختصر: "35د" أو "1س 05د". */
export function formatDepartureMinutes(min: number): string {
  const m = Math.max(0, Math.round(min || 0));
  if (m < 60) return `${m}د`;
  return `${Math.floor(m / 60)}س ${String(m % 60).padStart(2, "0")}د`;
}
