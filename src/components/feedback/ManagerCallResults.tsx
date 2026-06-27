import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Search,
  Phone,
  MessageCircle,
  User,
  Star,
  FileText,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  MapPin,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

interface CustomerData {
  id: string;
  full_name: string | null;
  display_phone: string | null;
  normalized_phone: string;
  last_known_branch_id: string | null;
}

interface CallRow {
  id: string;
  created_at: string;
  called_at: string;
  called_by_name: string | null;
  outcome: string;
  sentiment: string | null;
  rating: number | null;
  driver_rating: number | null;
  driver_name: string | null;
  note: string | null;
  followup_note: string | null;
  followup_status: string | null;
  needs_followup: boolean;
  related_order_id: string | null;
  feedback_customers: CustomerData | null;
}

interface ManagerCallResultsProps {
  branches: { id: string; name: string }[];
}

export default function ManagerCallResults({ branches }: ManagerCallResultsProps) {
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sentiment, setSentiment] = useState<string>("__all");
  const [rating, setRating] = useState<string>("__all");
  const [datePreset, setDatePreset] = useState<string>("today");
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

  // Statistics
  const [stats, setStats] = useState({
    total: 0,
    satisfied: 0,
    unsatisfied: 0,
    complaint: 0,
    avgRating: 0,
  });

  const fetchCalls = async () => {
    setLoading(true);
    try {
      // Calculate date filters
      let fromDate = new Date();
      fromDate.setHours(0, 0, 0, 0);

      if (datePreset === "yesterday") {
        fromDate.setDate(fromDate.getDate() - 1);
        const toDate = new Date(fromDate);
        toDate.setHours(23, 59, 59, 999);
      } else if (datePreset === "last7") {
        fromDate.setDate(fromDate.getDate() - 7);
      } else if (datePreset === "last30") {
        fromDate.setDate(fromDate.getDate() - 30);
      }

      let queryBuilder = supabase
        .from("feedback_calls")
        .select(`
          *,
          feedback_customers (
            id,
            full_name,
            display_phone,
            normalized_phone,
            last_known_branch_id
          )
        `)
        .order("created_at", { ascending: false });

      // Apply date filter
      if (datePreset === "today") {
        queryBuilder = queryBuilder.gte("created_at", fromDate.toISOString());
      } else if (datePreset === "yesterday") {
        const yesterdayStart = new Date();
        yesterdayStart.setDate(yesterdayStart.getDate() - 1);
        yesterdayStart.setHours(0, 0, 0, 0);
        const yesterdayEnd = new Date();
        yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
        yesterdayEnd.setHours(23, 59, 59, 999);

        queryBuilder = queryBuilder
          .gte("created_at", yesterdayStart.toISOString())
          .lte("created_at", yesterdayEnd.toISOString());
      } else if (datePreset !== "all") {
        queryBuilder = queryBuilder.gte("created_at", fromDate.toISOString());
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;

      const rawCalls = (data || []) as any[];

      // Filter on client side for finer controls or matches
      const processedCalls = rawCalls.filter((call) => {
        const customer = call.feedback_customers;
        const nameMatch = customer?.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
        const phoneMatch = customer?.display_phone?.includes(searchQuery) || customer?.normalized_phone?.includes(searchQuery);
        const noteMatch = call.note?.toLowerCase().includes(searchQuery.toLowerCase());
        const searchMatch = !searchQuery || nameMatch || phoneMatch || noteMatch;

        const sentimentMatch = sentiment === "__all" || call.sentiment === sentiment;
        const ratingMatch = rating === "__all" || String(call.rating) === rating;

        return searchMatch && sentimentMatch && ratingMatch;
      });

      setCalls(processedCalls);

      // Compute statistics
      let totalRatingSum = 0;
      let ratedCallsCount = 0;
      let satisfiedCount = 0;
      let unsatisfiedCount = 0;
      let complaintCount = 0;

      processedCalls.forEach((c) => {
        if (c.rating) {
          totalRatingSum += c.rating;
          ratedCallsCount++;
        }
        if (c.sentiment === "satisfied") satisfiedCount++;
        if (c.sentiment === "unsatisfied") unsatisfiedCount++;
        if (c.sentiment === "complaint") complaintCount++;
      });

      setStats({
        total: processedCalls.length,
        satisfied: satisfiedCount,
        unsatisfied: unsatisfiedCount,
        complaint: complaintCount,
        avgRating: ratedCallsCount > 0 ? Number((totalRatingSum / ratedCallsCount).toFixed(1)) : 0,
      });

    } catch (err: any) {
      toast.error("خطأ في جلب بيانات المكالمات: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, [searchQuery, sentiment, rating, datePreset]);

  const getSentimentBadge = (s: string | null) => {
    switch (s) {
      case "satisfied":
        return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">راضٍ</Badge>;
      case "neutral":
        return <Badge className="bg-blue-100 text-blue-800 border-blue-200">محايد</Badge>;
      case "unsatisfied":
        return <Badge className="bg-amber-100 text-amber-800 border-amber-200">غير راضٍ</Badge>;
      case "complaint":
        return <Badge className="bg-rose-100 text-rose-800 border-rose-200">شكوى</Badge>;
      case "suggestion":
        return <Badge className="bg-purple-100 text-purple-800 border-purple-200">اقتراح</Badge>;
      default:
        return <Badge variant="outline">غير محدد</Badge>;
    }
  };

  const getOutcomeBadge = (outcome: string) => {
    const outcomeMap: Record<string, string> = {
      answered: "تم الرد",
      no_answer: "لم يرد",
      busy: "مشغول",
      wrong_number: "رقم خاطئ",
      callback_requested: "طلب معاودة الاتصال",
      refused: "رفض المكالمة",
      voicemail: "تم ترك رسالة صوتية",
      disconnected: "انقطع الاتصال",
      invalid: "رقم غير صالح",
      unavailable: "غير متاح",
      blocked: "محظور",
      dnd: "عدم الإزعاج",
      scheduled: "مجدول للمتابعة",
      transferred: "تم تحويل المكالمة",
    };
    const label = outcomeMap[outcome] || "نتيجة أخرى";
    switch (outcome) {
      case "answered":
      case "transferred":
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200" variant="outline">{label}</Badge>;
      case "no_answer":
      case "busy":
      case "callback_requested":
      case "scheduled":
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200" variant="outline">{label}</Badge>;
      case "wrong_number":
      case "invalid":
      case "blocked":
      case "refused":
      case "dnd":
        return <Badge className="bg-rose-50 text-rose-700 border-rose-200" variant="outline">{label}</Badge>;
      default:
        return <Badge variant="outline">{label}</Badge>;
    }
  };

  const getBranchName = (id: string | null) => {
    if (!id) return null;
    return branches.find((b) => b.id === id)?.name || id;
  };

  const formatArabicDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat("ar-SA", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Jerusalem",
        numberingSystem: "arab",
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const whatsappHref = (phone: string | null) => {
    if (!phone) return null;
    const digits = phone.replace(/[^\d]/g, "");
    let intl = digits;
    if (digits.startsWith("00")) intl = digits.slice(2);
    else if (digits.startsWith("0")) intl = "972" + digits.slice(1);
    return `https://wa.me/${intl}`;
  };

  return (
    <div className="space-y-4 w-full" dir="rtl">
      {/* Search and Filters Header */}
      <div className="bg-card border rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> لوحة مدير المتابعة (تم الاتصال)
          </h2>
          <Button
            size="sm"
            variant="outline"
            className="text-xs h-8"
            onClick={fetchCalls}
          >
            تحديث
          </Button>
        </div>

        {/* Quick KPI Stats Row */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="bg-slate-50 p-2.5 rounded-lg text-center border border-slate-100">
            <div className="text-[10px] text-slate-500 font-semibold mb-0.5">إجمالي المكالمات</div>
            <div className="text-base font-bold text-slate-800">{stats.total}</div>
          </div>
          <div className="bg-emerald-50/50 p-2.5 rounded-lg text-center border border-emerald-100">
            <div className="text-[10px] text-emerald-600 font-semibold mb-0.5">الراضين 😊</div>
            <div className="text-base font-bold text-emerald-700">{stats.satisfied}</div>
          </div>
          <div className="bg-amber-50/50 p-2.5 rounded-lg text-center border border-amber-100">
            <div className="text-[10px] text-amber-600 font-semibold mb-0.5">معدل التقييم</div>
            <div className="text-base font-bold text-amber-700 flex items-center justify-center gap-0.5">
              {stats.avgRating} <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
            </div>
          </div>
        </div>

        {/* Filters bar */}
        <div className="space-y-2.5">
          <div className="relative">
            <Search className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ابحث باسم الزبون، رقم جواله، أو تفاصيل الملاحظة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 text-sm pr-9 pl-3 bg-white"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Select value={datePreset} onValueChange={setDatePreset}>
                <SelectTrigger className="h-9 text-xs bg-white">
                  <SelectValue placeholder="التاريخ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">اليوم</SelectItem>
                  <SelectItem value="yesterday">أمس</SelectItem>
                  <SelectItem value="last7">آخر 7 أيام</SelectItem>
                  <SelectItem value="last30">آخر 30 يوم</SelectItem>
                  <SelectItem value="all">كل الأوقات</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={sentiment} onValueChange={setSentiment}>
                <SelectTrigger className="h-9 text-xs bg-white">
                  <SelectValue placeholder="حالة الزبون" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">كل الحالات</SelectItem>
                  <SelectItem value="satisfied">راضٍ</SelectItem>
                  <SelectItem value="neutral">محايد</SelectItem>
                  <SelectItem value="unsatisfied">غير راضٍ</SelectItem>
                  <SelectItem value="complaint">شكوى</SelectItem>
                  <SelectItem value="suggestion">اقتراح</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Select value={rating} onValueChange={setRating}>
                <SelectTrigger className="h-9 text-xs bg-white">
                  <SelectValue placeholder="التقييم" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">كل التقييمات</SelectItem>
                  <SelectItem value="5">5 نجوم</SelectItem>
                  <SelectItem value="4">4 نجوم</SelectItem>
                  <SelectItem value="3">3 نجوم</SelectItem>
                  <SelectItem value="2">نجمتان</SelectItem>
                  <SelectItem value="1">نجمة واحدة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Call Logs Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : calls.length === 0 ? (
        <Card className="border-dashed py-12 text-center text-muted-foreground text-sm">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          لا توجد نتائج مطابقة لمكالمات تم الاتصال بها
        </Card>
      ) : (
        <div className="space-y-3">
          {calls.map((call) => {
            const customer = call.feedback_customers;
            const isExpanded = expandedCallId === call.id;
            const wa = customer?.display_phone ? whatsappHref(customer.display_phone) : null;
            const branch = customer ? getBranchName(customer.last_known_branch_id) : null;

            return (
              <Card
                key={call.id}
                className={`border-slate-100 overflow-hidden transition-all duration-200 hover:shadow-md ${
                  isExpanded ? "ring-1 ring-primary/20" : ""
                }`}
              >
                <CardContent className="p-3.5 space-y-2.5">
                  {/* Top Line: Name and Sentiment */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-sm text-slate-900 truncate">
                        {customer?.full_name || "زبون بدون اسم"}
                      </h3>
                      <div dir="ltr" className="text-xs text-slate-500 font-mono text-right mt-0.5">
                        {customer?.display_phone || customer?.normalized_phone || "بدون رقم هاتف"}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {getSentimentBadge(call.sentiment)}
                      {getOutcomeBadge(call.outcome)}
                    </div>
                  </div>

                  {/* Mid Line: Call metadata and Rating */}
                  <div className="flex items-center justify-between text-xs text-slate-500 flex-wrap gap-2 pt-1 border-t border-slate-50">
                    <span className="inline-flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-md text-slate-700">
                      <Clock className="h-3 w-3" /> {new Date(call.created_at).toLocaleString("ar-EG", {
                        month: "short",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <div className="flex items-center gap-0.5">
                      {call.rating ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-3.5 w-3.5 ${
                              i < (call.rating || 0)
                                ? "fill-amber-400 text-amber-400"
                                : "text-slate-200"
                            }`}
                          />
                        ))
                      ) : (
                        <span className="text-slate-400">بدون تقييم</span>
                      )}
                    </div>
                  </div>

                  {/* Note block (highly visible) */}
                  {call.note && (
                    <div className="bg-slate-50/80 p-2.5 rounded-lg border border-slate-100 text-xs text-slate-800 leading-relaxed font-medium">
                      <span className="text-slate-500 block font-bold mb-1">تفاصيل وملاحظات الاتصال:</span>
                      {call.note}
                    </div>
                  )}

                  {/* Who logged the call */}
                  {call.called_by_name && (
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <User className="h-3 w-3" />
                      بواسطة الموظف: <span className="font-semibold text-slate-800">{call.called_by_name}</span>
                    </div>
                  )}

                  {/* Expand button */}
                  <button
                    type="button"
                    onClick={() => setExpandedCallId(isExpanded ? null : call.id)}
                    className="w-full pt-1.5 flex items-center justify-center gap-1 text-[11px] text-primary font-bold border-t border-slate-100"
                  >
                    {isExpanded ? (
                      <>
                        إخفاء التفاصيل الإضافية <ChevronUp className="h-3.5 w-3.5" />
                      </>
                    ) : (
                      <>
                        عرض تفاصيل الطلب والتوصيل <ChevronDown className="h-3.5 w-3.5" />
                      </>
                    )}
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="pt-2 space-y-2 border-t border-dashed border-slate-100 text-xs text-slate-600 animate-in fade-in-50 duration-200">
                      {branch && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>الفرع الأخير: <span className="font-semibold text-slate-800">{branch}</span></span>
                        </div>
                      )}

                      {call.driver_name && (
                        <div className="bg-slate-50/50 p-2 rounded border border-slate-100">
                          <div>السائق: <span className="font-semibold text-slate-800">{call.driver_name}</span></div>
                          {call.driver_rating && (
                            <div className="mt-1 flex items-center gap-1">
                              <span>تقييم السائق:</span>
                              <span className="font-bold text-slate-800">{call.driver_rating}/5</span>
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                            </div>
                          )}
                        </div>
                      )}

                      {call.followup_note && (
                        <div className="bg-amber-50/30 p-2 rounded border border-amber-100/50 text-amber-900">
                          <div className="font-bold">ملاحظة المتابعة اللاحقة:</div>
                          <div className="mt-0.5">{call.followup_note}</div>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        {customer?.display_phone && (
                          <a
                            href={`tel:${customer.display_phone}`}
                            className="flex-1 inline-flex items-center justify-center gap-1 h-9 rounded-md border bg-slate-50 text-slate-800 font-semibold"
                          >
                            <Phone className="h-3.5 w-3.5" /> اتصال هاتفي
                          </a>
                        )}
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 inline-flex items-center justify-center gap-1 h-9 rounded-md border bg-slate-50 text-slate-800 font-semibold"
                          >
                            <MessageCircle className="h-3.5 w-3.5" /> واتساب سريع
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
