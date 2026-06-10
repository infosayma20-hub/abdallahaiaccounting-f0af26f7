import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle, LogOut, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { resolveUserAccessContext } from "@/lib/accessContext";

type BlockKey =
  | "unlinked"
  | "company-not-ready"
  | "no-setup-permission"
  | "unknown-state";

const COPY: Record<BlockKey, { title: string; body: string }> = {
  unlinked: {
    title: "حسابك غير مرتبط بشركة",
    body: "هذا الحساب لم يتم ربطه بأي شركة بعد. يرجى التواصل مع مسؤول الشركة لإضافتك.",
  },
  "company-not-ready": {
    title: "حساب الشركة قيد التجهيز",
    body: "بيانات الشركة لم تكتمل بعد من قِبل المالك. يرجى التواصل مع الإدارة للاستفسار.",
  },
  "no-setup-permission": {
    title: "لا تملك صلاحية الإعداد",
    body: "حسابك من نوع حساب فرعي ولا يمكنه الوصول إلى شاشة إعداد الشركة. يرجى التواصل مع مالك الشركة.",
  },
  "unknown-state": {
    title: "تعذّر تحديد نوع الحساب",
    body: "لم نتمكن من التعرف على نوع حسابك بشكل واضح. يرجى تسجيل الخروج وإعادة المحاولة، أو التواصل مع المسؤول.",
  },
};

export default function BlockedAccessPage() {
  const { reason } = useParams<{ reason: BlockKey }>();
  const navigate = useNavigate();
  const { signOut, user, loading: authLoading } = useAuth();
  const key = (reason && (reason in COPY) ? reason : "unlinked") as BlockKey;
  const { title, body } = COPY[key];

  // Self-healing: if the user is actually allowed somewhere now (e.g.
  // employee record was linked after they bookmarked /blocked/unlinked,
  // or the PWA shortcut is stuck on an old blocked URL), re-resolve
  // their access context and bounce them to the correct destination.
  const [resolving, setResolving] = useState(true);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { setResolving(false); return; }
    let cancelled = false;
    resolveUserAccessContext(user.id, { force: true })
      .then((ctx) => {
        if (cancelled) return;
        if (ctx.defaultRoute && !ctx.defaultRoute.startsWith("/blocked")) {
          setRedirectTo(ctx.defaultRoute);
        }
      })
      .catch(() => { /* fall through to showing the blocked page */ })
      .finally(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [user, authLoading]);

  if (authLoading || resolving) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" dir="rtl">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6" dir="rtl">
      <div className="max-w-md w-full rounded-xl border bg-card p-8 text-center space-y-4 shadow-sm">
        <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-destructive" />
        </div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground leading-relaxed">{body}</p>
        <div className="flex gap-2 justify-center pt-2">
          <Button variant="outline" onClick={() => navigate("/auth")}>
            عودة لتسجيل الدخول
          </Button>
          <Button
            variant="destructive"
            onClick={async () => {
              await signOut();
              navigate("/auth", { replace: true });
            }}
          >
            <LogOut className="w-4 h-4 ml-2" /> تسجيل خروج
          </Button>
        </div>
      </div>
    </div>
  );
}