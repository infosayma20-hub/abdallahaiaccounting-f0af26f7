/**
 * google-wallet-pass — يُصدر رابط "الحفظ في محفظة Google" لبطاقة العضوية/الولاء.
 * POST/GET { code } -> { success: true, saveUrl }
 * يستخدم Generic Class واحدة موجودة مسبقاً، ومعرّف كائن ثابت لكل عضو (idempotent).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const API = "https://walletobjects.googleapis.com/walletobjects/v1";

type SA = { client_email: string; private_key: string };

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importKey(pem: string): Promise<CryptoKey> {
  // يدعم المفاتيح المخزّنة بأسطر مهرّبة \n
  const normalized = pem.replace(/\\n/g, "\n");
  const body = normalized.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey("pkcs8", der.buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function signJwt(sa: SA, payload: Record<string, unknown>): Promise<string> {
  const key = await importKey(sa.private_key);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

async function accessToken(sa: SA): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await signJwt(sa, {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`oauth_failed: ${JSON.stringify(json)}`);
  return json.access_token as string;
}

/** أحرف مسموحة في معرّف كائن محفظة Google */
const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 64);

function loadCredentials(): SA {
  const email = Deno.env.get("GOOGLE_WALLET_CLIENT_EMAIL");
  const key = Deno.env.get("GOOGLE_WALLET_PRIVATE_KEY");
  if (email && key) return { client_email: email, private_key: key.replace(/\\n/g, "\n") };
  const raw = Deno.env.get("GOOGLE_WALLET_SERVICE_ACCOUNT");
  if (!raw) throw new Error("missing_wallet_credentials");
  const sa = JSON.parse(raw) as SA;
  if (!sa?.client_email || !sa?.private_key) throw new Error("invalid_service_account");
  return { client_email: sa.client_email, private_key: sa.private_key.replace(/\\n/g, "\n") };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const issuerId = Deno.env.get("GOOGLE_WALLET_ISSUER_ID") ?? "3388000000023188097";
    const classId = Deno.env.get("GOOGLE_WALLET_CLASS_ID") ?? `${issuerId}.unify_membership`;

    let sa: SA;
    try {
      sa = loadCredentials();
    } catch (e) {
      console.error("credentials", (e as Error).message);
      return json({ success: false, error: "wallet_not_configured" }, 503);
    }

    const url = new URL(req.url);
    let code = url.searchParams.get("code") ?? "";
    if (!code && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      code = String(body?.code ?? "");
    }
    if (!/^[A-Za-z0-9-]{4,64}$/.test(code)) return json({ success: false, error: "invalid_code" }, 400);

    // جلب بيانات البطاقة من الخادم فقط — لا نقبل أي حقول حساسة من المتصفح
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await admin.rpc("loyalty_card_public", { _code: code });
    if (error || !data) {
      console.error("card_lookup", error?.message);
      return json({ success: false, error: "card_not_found" }, 404);
    }
    const card = data as any;
    const prog = card.program ?? {};
    const brand: string = prog.brand_color || "#0D1B2E";
    const orgName: string = prog.name || "Unify ERP";
    const fullName = [card.first_name, card.last_name].filter(Boolean).join(" ") || "عضو";

    const objectId = `${issuerId}.member_${safeId(code)}`;

    const token = await accessToken(sa);
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // التأكد من وجود صنف البطاقة (Generic Class) وإنشاؤه تلقائياً عند غيابه
    const classRes = await fetch(`${API}/genericClass/${classId}`, { headers: auth });
    if (classRes.status === 404) {
      const createdClass = await fetch(`${API}/genericClass`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          id: classId,
          issuerName: orgName,
          reviewStatus: "UNDER_REVIEW",
          multipleDevicesAndHoldersAllowedStatus: "MULTIPLE_HOLDERS",
        }),
      });
      if (!createdClass.ok) {
        const detail = await createdClass.text();
        // 409 يعني أنه أُنشئ بالتوازي — نتجاهله
        if (createdClass.status !== 409) {
          console.error("class_create_failed", detail);
          return json({ success: false, error: "wallet_class_error" }, 502);
        }
      }
    } else if (!classRes.ok) {
      console.error("class_lookup_failed", classRes.status, await classRes.text());
      return json({ success: false, error: "wallet_class_error" }, 502);
    }

    const genericObject: Record<string, unknown> = {
      id: objectId,
      classId,
      state: "ACTIVE",
      hexBackgroundColor: brand,
      cardTitle: { defaultValue: { language: "ar", value: orgName } },
      subheader: { defaultValue: { language: "ar", value: "بطاقة عضوية" } },
      header: { defaultValue: { language: "ar", value: fullName } },
      barcode: { type: "QR_CODE", value: code, alternateText: code },
      ...(prog.logo_url
        ? {
            logo: {
              sourceUri: { uri: prog.logo_url },
              contentDescription: { defaultValue: { language: "ar", value: orgName } },
            },
          }
        : {}),
      textModulesData: [
        { id: "card_id", header: "رقم البطاقة", body: code },
        { id: "points", header: "النقاط", body: String(Math.round(Number(card.points || 0))) },
        { id: "wallet", header: "رصيد المحفظة", body: Number(card.wallet_balance || 0).toFixed(2) },
        { id: "status", header: "الحالة", body: card.is_active === false ? "موقوفة" : "فعّالة" },
        ...(card.joined_at
          ? [{ id: "since", header: "عضو منذ", body: new Date(card.joined_at).toLocaleDateString("en-GB") }]
          : []),
      ],
    };

    // Idempotent: تحديث الكائن إن وُجد وإلا إنشاؤه
    const existing = await fetch(`${API}/genericObject/${objectId}`, { headers: auth });
    if (existing.status === 404) {
      const created = await fetch(`${API}/genericObject`, { method: "POST", headers: auth, body: JSON.stringify(genericObject) });
      if (!created.ok) {
        const detail = await created.text();
        console.error("object_create_failed", detail);
        return json({ success: false, error: "wallet_api_error" }, 502);
      }
    } else if (existing.ok) {
      const updated = await fetch(`${API}/genericObject/${objectId}`, { method: "PUT", headers: auth, body: JSON.stringify(genericObject) });
      if (!updated.ok) console.error("object_update_failed", await updated.text());
    } else {
      console.error("object_lookup_failed", existing.status, await existing.text());
      return json({ success: false, error: "wallet_api_error" }, 502);
    }

    const now = Math.floor(Date.now() / 1000);
    const origin = req.headers.get("origin");
    const saveJwt = await signJwt(sa, {
      iss: sa.client_email,
      aud: "google",
      typ: "savetowallet",
      iat: now,
      ...(origin ? { origins: [origin] } : {}),
      payload: { genericObjects: [{ id: objectId, classId }] },
    });

    return json({ success: true, saveUrl: `https://pay.google.com/gp/v/save/${saveJwt}` });
  } catch (e) {
    console.error("google-wallet-pass", (e as Error).message);
    return json({ success: false, error: "internal_error" }, 500);
  }
});
