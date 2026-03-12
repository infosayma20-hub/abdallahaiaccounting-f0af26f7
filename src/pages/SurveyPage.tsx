import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Star, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const SurveyPage = () => {
  const { token } = useParams<{ token: string }>();
  const [survey, setSurvey] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [overallRating, setOverallRating] = useState(0);
  const [serviceRating, setServiceRating] = useState(0);
  const [productRating, setProductRating] = useState(0);
  const [recommend, setRecommend] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [gender, setGender] = useState("");
  const [ageGroup, setAgeGroup] = useState("");

  useEffect(() => {
    if (!token) return;
    loadSurvey();
  }, [token]);

  const loadSurvey = async () => {
    try {
      const { data, error: sErr } = await supabase
        .from("customer_surveys")
        .select("*")
        .eq("survey_token", token)
        .single();
      if (sErr || !data) { setError("الاستبيان غير موجود أو منتهي الصلاحية"); setLoading(false); return; }
      if ((data as any).status === "completed") { setSubmitted(true); setLoading(false); return; }
      if (new Date((data as any).expires_at) < new Date()) { setError("انتهت صلاحية الاستبيان"); setLoading(false); return; }
      setSurvey(data);

      // Mark as opened
      await supabase.from("customer_surveys").update({ status: "opened", opened_at: new Date().toISOString() } as any).eq("survey_token", token);

      // Get company name
      if ((data as any).order_id) {
        const { data: orderData } = await supabase.from("pos_orders").select("company_id").eq("id", (data as any).order_id).single();
        if (orderData) {
          const { data: compData } = await supabase.from("companies").select("name, logo_url").eq("id", (orderData as any).company_id).single();
          setCompany(compData);
        }
      }
    } catch { setError("خطأ في تحميل الاستبيان"); }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (overallRating === 0) return;
    setSubmitting(true);
    try {
      await supabase.from("customer_surveys").update({
        overall_rating: overallRating,
        service_rating: serviceRating || null,
        product_rating: productRating || null,
        recommend,
        comment: comment || null,
        survey_gender: gender || null,
        survey_age_group: ageGroup || null,
        status: "completed",
        completed_at: new Date().toISOString(),
      } as any).eq("survey_token", token);

      // Update customer demographics if available
      if (survey?.customer_id && (gender || ageGroup)) {
        await supabase.from("pos_customers").update({
          ...(gender ? { gender: gender === "ذكر" ? "male" : "female" } : {}),
          ...(ageGroup ? { age_group: ageGroup } : {}),
        } as any).eq("id", survey.customer_id);
      }

      setSubmitted(true);
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  const StarRating = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <div className="flex gap-1 justify-center" dir="ltr">
        {[1, 2, 3, 4, 5].map((star) => (
          <button key={star} onClick={() => onChange(star)} className="p-1 transition-transform hover:scale-110">
            <Star className={`h-8 w-8 transition-colors ${star <= value ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
          </button>
        ))}
      </div>
    </div>
  );

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-green-50 to-white p-4" dir="rtl">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle className="h-10 w-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">شكراً لك! 💚</h2>
        <p className="text-gray-500">نقدّر رأيك ونعمل دائماً على تحسين خدماتنا</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4" dir="rtl">
      <div className="text-center">
        <p className="text-4xl mb-3">📋</p>
        <p className="text-gray-600">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {/* Header */}
      <div className="bg-gradient-to-l from-blue-600 to-indigo-700 text-white text-center py-8 px-4">
        {company?.logo_url ? (
          <img src={company.logo_url} alt="" className="h-10 mx-auto mb-3 object-contain" />
        ) : (
          <h1 className="text-xl font-bold mb-1">{company?.name || "استبيان رضا الزبائن"}</h1>
        )}
        <p className="text-sm text-white/80">نودّ معرفة رأيك في تجربتك معنا</p>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-8">
        {/* Q1: Overall */}
        <div className="text-center">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl font-light text-blue-400">01</span>
            <h3 className="text-base font-semibold">كيف تقيّم تجربتك العامة؟ *</h3>
          </div>
          <StarRating value={overallRating} onChange={setOverallRating} label="" />
        </div>
        <hr className="border-gray-100" />

        {/* Q2: Service */}
        <div className="text-center">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-2xl font-light text-blue-400">02</span>
            <h3 className="text-base font-semibold">كيف كانت خدمة الموظف؟</h3>
          </div>
          <StarRating value={serviceRating} onChange={setServiceRating} label="" />
        </div>
        <hr className="border-gray-100" />

        {/* Q3: Comment */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl font-light text-blue-400">03</span>
            <h3 className="text-base font-semibold">هل لديك تعليق أو اقتراح؟</h3>
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="شاركنا رأيك..."
            className="min-h-[80px] resize-none"
          />
        </div>
        <hr className="border-gray-100" />

        {/* Q4: Gender */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl font-light text-blue-400">04</span>
            <h3 className="text-base font-semibold">الجنس</h3>
          </div>
          <div className="flex gap-3">
            {["ذكر", "أنثى"].map((g) => (
              <button
                key={g}
                onClick={() => setGender(g)}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  gender === g ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <hr className="border-gray-100" />

        {/* Q5: Age */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl font-light text-blue-400">05</span>
            <h3 className="text-base font-semibold">الفئة العمرية</h3>
          </div>
          <div className="space-y-2">
            {["أقل من 16", "16 - 24", "25 - 34", "35 - 44", "45 - 54", "55+"].map((a) => (
              <button
                key={a}
                onClick={() => setAgeGroup(a)}
                className={`w-full text-right py-3 px-4 rounded-xl border-2 text-sm transition-all ${
                  ageGroup === a ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <hr className="border-gray-100" />

        {/* Q6: Recommend */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl font-light text-blue-400">06</span>
            <h3 className="text-base font-semibold">هل توصي بنا لأصدقائك؟</h3>
          </div>
          <div className="flex gap-3">
            {[
              { val: true, label: "نعم 👍" },
              { val: false, label: "لا 👎" },
            ].map((opt) => (
              <button
                key={String(opt.val)}
                onClick={() => setRecommend(opt.val)}
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  recommend === opt.val
                    ? opt.val ? "border-green-500 bg-green-50 text-green-700" : "border-red-500 bg-red-50 text-red-700"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Privacy notice */}
        <p className="text-[10px] text-gray-400 text-center leading-relaxed">
          *خصوصيتك مهمة لنا. نعامل بياناتك بسرية تامة ونستخدمها فقط لتحسين خدماتنا.
        </p>

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={overallRating === 0 || submitting}
          className="w-full h-12 rounded-xl text-base font-bold"
          style={{ backgroundColor: "#3B82F6" }}
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "إرسال التقييم"}
        </Button>
      </div>
    </div>
  );
};

export default SurveyPage;
