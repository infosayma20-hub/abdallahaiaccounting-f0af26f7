import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, MailX } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

type State = "loading" | "valid" | "invalid" | "already" | "success" | "error";

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${token}`,
          { headers: { apikey: SUPABASE_ANON_KEY } }
        );
        const data = await res.json();
        if (data.valid) setState("valid");
        else if (data.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      } catch {
        setState("error");
      }
    })();
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify({ token }),
        }
      );
      const data = await res.json();
      if (data.success) setState("success");
      else if (data.reason === "already_unsubscribed") setState("already");
      else setState("error");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background" dir="rtl">
      <Card className="w-full max-w-md p-8 text-center space-y-6">
        {state === "loading" && (
          <>
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">جاري التحقق...</p>
          </>
        )}
        {state === "valid" && (
          <>
            <MailX className="h-14 w-14 mx-auto text-orange-500" />
            <div>
              <h1 className="text-xl font-bold mb-2">إلغاء الاشتراك</h1>
              <p className="text-sm text-muted-foreground">
                هل تريد إلغاء الاشتراك من الإيميلات؟ لن تتلقى أي رسائل بعد ذلك.
              </p>
            </div>
            <Button onClick={confirm} disabled={busy} className="w-full" variant="destructive">
              {busy ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              تأكيد إلغاء الاشتراك
            </Button>
          </>
        )}
        {state === "success" && (
          <>
            <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-500" />
            <div>
              <h1 className="text-xl font-bold mb-2">تم إلغاء الاشتراك</h1>
              <p className="text-sm text-muted-foreground">لن تتلقى أي إيميلات بعد الآن.</p>
            </div>
          </>
        )}
        {state === "already" && (
          <>
            <CheckCircle2 className="h-14 w-14 mx-auto text-blue-500" />
            <div>
              <h1 className="text-xl font-bold mb-2">تم إلغاء الاشتراك مسبقاً</h1>
              <p className="text-sm text-muted-foreground">إيميلك ملغي الاشتراك بالفعل.</p>
            </div>
          </>
        )}
        {(state === "invalid" || state === "error") && (
          <>
            <XCircle className="h-14 w-14 mx-auto text-red-500" />
            <div>
              <h1 className="text-xl font-bold mb-2">رابط غير صالح</h1>
              <p className="text-sm text-muted-foreground">
                الرابط منتهي الصلاحية أو غير صحيح.
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
