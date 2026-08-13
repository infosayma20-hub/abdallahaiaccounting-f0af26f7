/**
 * google-wallet-pass — يُصدر رابط "الحفظ في محفظة Google" لبطاقة ولاء الزبون.
 * GET/POST { code } -> { saveUrl }
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GOOGLE_WALLET_API = "https://walletobjects.googleapis.com/walletobjects/v1";

type SA = { client_email: string; private_key: string };

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
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
  const json = await res.json();
  if (!res.ok) throw new Error(`token: ${JSON.stringify(json)}`);
  return json.access_token as string;
}

const hex = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, "_");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const issuerId = Deno.env.get("GOOGLE_WALLET_ISSUER_ID");
    const saRaw = Deno.env.get("GOOGLE_WALLET_SERVICE_ACCOUNT");
    if (!saRaw) return json({ error: "wallet_not_configured" }, 503);
    if (!issuerId) return json({ error: "missing_issuer_id" }, 503);
    const sa = JSON.parse(saRaw) as SA;

    const url = new URL(req.url);
    let code = url.searchParams.get("code") ?? "";
    if (!code && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      code = String(body?.code ?? "");
    }
    if (!/^[A-Za-z0-9-]{4,64}$/.test(code)) return json({ error: "invalid_code" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await admin.rpc("loyalty_card_public", { _code: code });
    if (error || !data) return json({ error: "card_not_found" }, 404);
    const card = data as any;
    const prog = card.program ?? {};

    const classSuffix = `unify_${hex(prog.slug || prog.name || "loyalty")}`;
    const classId = `${issuerId}.${classSuffix}`;
    const objectId = `${issuerId}.${hex(code)}`;
    const brand = prog.brand_color || "#0D1B2E";

    const token = await accessToken(sa);
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    const loyaltyClass = {
      id: classId,
      issuerName: prog.name || "Unify ERP",
      programName: prog.name || "برنامج الولاء",
      reviewStatus: "UNDER_REVIEW",
      hexBackgroundColor: brand,
      ...(prog.logo_url
        ? { programLogo: { sourceUri: { uri: prog.logo_url }, contentDescription: { defaultValue: { language: "ar", value: prog.name || "logo" } } } }
        : {}),
    };

    const clsGet = await fetch(`${GOOGLE_WALLET_API}/loyaltyClass/${classId}`, { headers: auth });
    if (clsGet.status === 404) {
      const created = await fetch(`${GOOGLE_WALLET_API}/loyaltyClass`, { method: "POST", headers: auth, body: JSON.stringify(loyaltyClass) });
      if (!created.ok) return json({ error: "class_failed", detail: await created.text() }, 502);
    } else if (clsGet.ok) {
      await fetch(`${GOOGLE_WALLET_API}/loyaltyClass/${classId}`, { method: "PUT", headers: auth, body: JSON.stringify(loyaltyClass) });
    }

    const fullName = [card.first_name, card.last_name].filter(Boolean).join(" ");
    const loyaltyObject = {
      id: objectId,
      classId,
      state: "ACTIVE",
      accountId: code,
      accountName: fullName,
      hexBackgroundColor: brand,
      barcode: { type: "QR_CODE", value: code, alternateText: code },
      loyaltyPoints: { label: "النقاط", balance: { int: Math.round(Number(card.points || 0)) } },
      secondaryLoyaltyPoints: {
        label: "رصيد المحفظة",
        balance: { double: Number(card.wallet_balance || 0) },
      },
      textModulesData: [
        { header: "عضو منذ", body: new Date(card.joined_at).toLocaleDateString("en-GB"), id: "since" },
      ],
    };

    const objGet = await fetch(`${GOOGLE_WALLET_API}/loyaltyObject/${objectId}`, { headers: auth });
    if (objGet.status === 404) {
      const created = await fetch(`${GOOGLE_WALLET_API}/loyaltyObject`, { method: "POST", headers: auth, body: JSON.stringify(loyaltyObject) });
      if (!created.ok) return json({ error: "object_failed", detail: await created.text() }, 502);
    } else if (objGet.ok) {
      await fetch(`${GOOGLE_WALLET_API}/loyaltyObject/${objectId}`, { method: "PUT", headers: auth, body: JSON.stringify(loyaltyObject) });
    }

    const now = Math.floor(Date.now() / 1000);
    const saveJwt = await signJwt(sa, {
      iss: sa.client_email,
      aud: "google",
      typ: "savetowallet",
      iat: now,
      payload: { loyaltyObjects: [{ id: objectId, classId }] },
    });

    return json({ saveUrl: `https://pay.google.com/gp/v/save/${saveJwt}` });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
