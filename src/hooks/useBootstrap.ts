import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * حزمة بدء التشغيل الموحّدة — طلب واحد عند فتح البرنامج يجلب كل ما تحتاجه
 * الشاشات الأولى: الأدوار، علامات الحساب (موظف/كاشير/بوابة)، مالك البيانات،
 * الشركة والملف التعريفي، الاشتراك، صلاحيات الميزات، وتجاوزات التطبيقات.
 *
 * قبل هذا الخطاف كان كل مستهلك ينفّذ جولاته الخاصة (useRoleRedirect 5 جولات
 * متتالية، CompanyProvider 4 طلبات، useSubscription طلبان، وكل usePermission
 * طلبان + قناتا بث). الآن كلهم يقرأون من نفس ذاكرة React Query بمفتاح
 * ["bootstrap", uid] مع نسخة sessionStorage تظهر فوراً عند التحديث.
 *
 * قناة بث واحدة لكل مستخدم (على مستوى الوحدة، لا لكل خطاف) تبطل الذاكرة عند
 * أي تغيير صلاحيات أو أدوار، وتُزال عند تسجيل الخروج.
 */

export interface BootstrapProfile {
  role: string | null;
  invited_by: string | null;
  company_id: string | null;
  company_name: string | null;
  work_field: string | null;
  setup_completed: boolean | null;
}

export interface BootstrapEmployee {
  id: string;
  user_id: string;
  is_active: boolean;
  is_terminated: boolean;
  is_manager: boolean;
  is_hr_manager: boolean;
  can_view_team: boolean;
  can_manage_schedule: boolean;
  can_manage_attendance: boolean;
  is_receiver: boolean;
  can_direct_receive: boolean;
  can_stock_count: boolean;
}

export interface BootstrapPosUser {
  id: string;
  user_id: string;
  is_active: boolean;
  is_call_center: boolean;
  hide_employee_workspace: boolean;
}

export interface BootstrapCompany {
  id: string;
  name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  tax_number: string | null;
}

export interface BootstrapSubscription {
  id: string;
  status: string;
  billing_cycle: string;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  plan_key: string;
  plan_name: string;
  plan_name_ar: string;
  monthly_price: number;
  tier: string;
  enabled_modules: string[];
  max_users: number;
  max_invoices_per_month: number;
}

export interface BootstrapFeaturePermission {
  app_key: string;
  feature_key: string;
  permission_key: string;
  access_state: "allow" | "deny";
}

export interface BootstrapAppOverride {
  app_key: string;
  access_state: "allow" | "deny";
}

export interface BootstrapData {
  roles: string[];
  profile: BootstrapProfile | null;
  employee: BootstrapEmployee | null;
  pos_user: BootstrapPosUser | null;
  portal_user: { id: string; user_id: string; is_active: boolean } | null;
  owner_id: string;
  has_accounts: boolean;
  company: BootstrapCompany | null;
  company_settings: {
    company_name: string | null;
    logo_url: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    tax_number: string | null;
  } | null;
  subscription: BootstrapSubscription | null;
  feature_permissions: BootstrapFeaturePermission[];
  app_overrides: BootstrapAppOverride[];
}

const CACHE_PREFIX = "amwali:bootstrap:";
const CACHE_VERSION = 1;
const CACHE_TTL_MS = 30 * 60 * 1000;

function readCachedBootstrap(uid: string): BootstrapData | undefined {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + uid);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { v?: number; ts?: number; data?: BootstrapData };
    if (parsed.v !== CACHE_VERSION || !parsed.ts || Date.now() - parsed.ts > CACHE_TTL_MS) return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}

function writeCachedBootstrap(uid: string, data: BootstrapData) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + uid, JSON.stringify({ v: CACHE_VERSION, ts: Date.now(), data }));
  } catch { /* ignore */ }
}

/** يُستدعى عند تسجيل الخروج أو تبديل الحساب. */
export function clearBootstrapCache(uid?: string) {
  try {
    if (uid) sessionStorage.removeItem(CACHE_PREFIX + uid);
    else Object.keys(sessionStorage).forEach((k) => { if (k.startsWith(CACHE_PREFIX)) sessionStorage.removeItem(k); });
  } catch { /* ignore */ }
}

// قناة بث واحدة لكل مستخدم على مستوى الوحدة — لا قناة لكل خطاف.
const subscribedUsers = new Set<string>();

export function useBootstrap() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const uid = user?.id ?? null;

  const query = useQuery({
    queryKey: ["bootstrap", uid],
    enabled: !!uid,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    initialData: uid ? () => readCachedBootstrap(uid) : undefined,
    queryFn: async (): Promise<BootstrapData> => {
      const { data, error } = await supabase.rpc("get_my_bootstrap" as any);
      if (error) throw error;
      const boot = data as unknown as BootstrapData;
      if (uid) writeCachedBootstrap(uid, boot);
      return boot;
    },
  });

  useEffect(() => {
    if (!uid || subscribedUsers.has(uid)) return;
    subscribedUsers.add(uid);
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["bootstrap", uid] });
    const ch = supabase
      .channel(`bootstrap-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_feature_permissions", filter: `target_user_id=eq.${uid}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_app_access_overrides", filter: `target_user_id=eq.${uid}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${uid}` }, invalidate)
      .subscribe();
    // القناة تعيش طوال الجلسة؛ تُزال عند تسجيل الخروج.
    const onSignOut = () => {
      subscribedUsers.delete(uid);
      supabase.removeChannel(ch);
      window.removeEventListener("amwali:signed-out", onSignOut);
    };
    window.addEventListener("amwali:signed-out", onSignOut);
  }, [uid, queryClient]);

  return query;
}
