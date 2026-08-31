/**
 * apple-wallet-pass — يُصدر ملف .pkpass لبطاقة الولاء/العضوية في Apple Wallet.
 * GET/POST { code } -> application/vnd.apple.pkpass (البطاقة الموقّعة جاهزة للإضافة)
 *
 * أسرار المشروع المطلوبة:
 *   APPLE_WALLET_PASS_P12            — شهادة البطاقة PKCS#12 (base64) من بوابة Apple Developer
 *   APPLE_WALLET_PASS_P12_PASSWORD   — كلمة مرور ملف p12
 *   APPLE_WALLET_TEAM_ID             — (اختياري) تجاوز رقم الفريق المستخرج تلقائياً من الشهادة
 *
 * passTypeIdentifier (CN) و teamIdentifier (OU) يُستخرجان تلقائياً من الشهادة نفسها.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import forge from "npm:node-forge@1.3.1";
import { zipSync, zlibSync, strToU8 } from "npm:fflate@0.8.2";

// شهادات Apple الوسيطة (World Wide Developer Relations) — G4 و G5 — بصيغة DER/base64
// تُضمَّن داخل التوقيع حتى تتحقق أجهزة آبل من سلسلة الثقة.
const WWDR_G4_B64 = "MIIEVTCCAz2gAwIBAgIUE9x3lVJx5T3GMujM/+Uh88zFztIwDQYJKoZIhvcNAQELBQAwYjELMAkGA1UEBhMCVVMxEzARBgNVBAoTCkFwcGxlIEluYy4xJjAkBgNVBAsTHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRYwFAYDVQQDEw1BcHBsZSBSb290IENBMB4XDTIwMTIxNjE5MzYwNFoXDTMwMTIxMDAwMDAwMFowdTFEMEIGA1UEAww7QXBwbGUgV29ybGR3aWRlIERldmVsb3BlciBSZWxhdGlvbnMgQ2VydGlmaWNhdGlvbiBBdXRob3JpdHkxCzAJBgNVBAsMAkc0MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANAfeKp6JzKwRl/nF3bYoJ0OKY6tPTKlxGs3yeRBkWq3eXFdDDQEYHX3rkOPR8SGHgjov9Y5Ui8eZ/xx8YJtPH4GUnadLLzVQ+mxtLxAOnhRXVGhJeG+bJGdayFZGEHVD41tQSo5SiHgkJ9OE0/QjJoyuNdqkh4laqQyziIZhQVg3AJK8lrrd3kCfcCXVGySjnYB5kaP5eYq+6KwrRitbTOFOCOL6oqW7Z+uZk+jDEAnbZXQYojZQykn/e2kv1MukBVlPNkuYmQzHWxq3Y4hqqRfFcYw7V/mjDaSlLfcOQIA+2SM1AyB8j/VNJeHdSbCb64DYyEMe9QbsWLFApy9/a8CAwEAAaOB7zCB7DASBgNVHRMBAf8ECDAGAQH/AgEAMB8GA1UdIwQYMBaAFCvQaUeUdgn+9GuNLkCm90dNfwheMEQGCCsGAQUFBwEBBDgwNjA0BggrBgEFBQcwAYYoaHR0cDovL29jc3AuYXBwbGUuY29tL29jc3AwMy1hcHBsZXJvb3RjYTAuBgNVHR8EJzAlMCOgIaAfhh1odHRwOi8vY3JsLmFwcGxlLmNvbS9yb290LmNybDAdBgNVHQ4EFgQUW9n6HeeaGgujmXYiUIY+kchbd6gwDgYDVR0PAQH/BAQDAgEGMBAGCiqGSIb3Y2QGAgEEAgUAMA0GCSqGSIb3DQEBCwUAA4IBAQA/Vj2e5bbDeeZFIGi9v3OLLBKeAuOugCKMBB7DUshwgKj7zqew1UJEggOCTwb8O0kU+9h0UoWvp50h5wESA5/NQFjQAde/MoMrU1goPO6cn1R2PWQnxn6NHThNLa6B5rmluJyJlPefx4elUWY0GzlxOSTjh2fvpbFoe4zuPfeutnvi0v/fYcZqdUmVIkSoBPyUuAsuORFJEtHlgepZAE9bPFo22noicwkJac3AfOriJP6YRLj477JxPxpd1F1+M02cHSS+APCQA1iZQT0xWmJArzmoUUOSqwSonMJNsUvSq3xKX+udO7xPiEAGE/+QF4oIRynoYpgppU8RBWk6z/Kf";
const WWDR_G5_B64 = "MIIEVTCCAz2gAwIBAgIUO36ACu7TAqHm7NuX2cqsKJzxaZQwDQYJKoZIhvcNAQELBQAwYjELMAkGA1UEBhMCVVMxEzARBgNVBAoTCkFwcGxlIEluYy4xJjAkBgNVBAsTHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRYwFAYDVQQDEw1BcHBsZSBSb290IENBMB4XDTIwMTIxNjE5Mzg1NloXDTMwMTIxMDAwMDAwMFowdTFEMEIGA1UEAww7QXBwbGUgV29ybGR3aWRlIERldmVsb3BlciBSZWxhdGlvbnMgQ2VydGlmaWNhdGlvbiBBdXRob3JpdHkxCzAJBgNVBAsMAkc1MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAJ9d2h/7+rzQSyI8x9Ym+hf39J8ePmQRZprvXr6rNL2qLCFu1h6UIYUsdMEOEGGqPGNKfkrjyHXWz8KcCEh7arkpsclm/ciKFtGyBDyCuoBs4v8Kcuus/jtvSL6eixFNlX2ye5AvAhxO/Em+12+1T754xtress3J2WYRO1rpCUVziVDUTuJoBX7adZxLAa7a489tdE3eU9DVGjiCOtCd410pe7GB6iknC/tgfIYS+/BiTwbnTNEf2W2e7XPaeCENnXDZRleQX2eEwXN3CqhiYraucIa7dSOJrXn25qTU/YMmMgo7JJJbIKGc0S+AGJvdPAvntf3sgFcPF54/K4cnu/cCAwEAAaOB7zCB7DASBgNVHRMBAf8ECDAGAQH/AgEAMB8GA1UdIwQYMBaAFCvQaUeUdgn+9GuNLkCm90dNfwheMEQGCCsGAQUFBwEBBDgwNjA0BggrBgEFBQcwAYYoaHR0cDovL29jc3AuYXBwbGUuY29tL29jc3AwMy1hcHBsZXJvb3RjYTAuBgNVHR8EJzAlMCOgIaAfhh1odHRwOi8vY3JsLmFwcGxlLmNvbS9yb290LmNybDAdBgNVHQ4EFgQUGYuXjUpbYXhX9KVcNRKKOQjjsHUwDgYDVR0PAQH/BAQDAgEGMBAGCiqGSIb3Y2QGAgEEAgUAMA0GCSqGSIb3DQEBCwUAA4IBAQBaxDWi2eYKnlKiAIIid81yL5D5Iq8UJcyqCkJgksK9dR3rTMoV5X5rQBBe+1tFdA3wen2Ikc7eY4tCidIY30GzWJ4GCIdI3UCvI9Xt6yxg5eukfxzpnIPWlF9MYjmKTq4TjX1DuNxerL4YQPLmDyxdE5Pxe2WowmhI3v+0lpsM+zI2np4NlV84CouW0hJst4sLjtc+7G8Bqs5NRWDbhHFmYuUZZTDNiv9FU/tu+4h3Q8NIY/n3UbNyXnniVs+8u4S5OFp4rhFIUrsNNYuU3sx0mmj1SWCUrPKosxWGkNDMMEOG0+VwAlG0gcCol9Tq6rCMCUDvOJOyzSID62dDZchF";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---------- أدوات ----------
// CRC32 قياسي (IEEE) — fflate لا يصدّر crc32 في هذا البناء
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(data: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** مولّد PNG بسيط (نقطة ملونة موحّدة) — يُستخدم أيقونة احتياطية عند غياب شعار البرنامج */
function pngSolid(width: number, height: number, [r, g, b]: [number, number, number]): Uint8Array {
  const raw = new Uint8Array(height * (1 + width * 3));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) { raw[o++] = r; raw[o++] = g; raw[o++] = b; }
  }
  const idat = zlibSync(raw, { level: 9 });
  const chunk = (type: string, data: Uint8Array) => {
    const t = strToU8(type);
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, data.length);
    const typeAndData = new Uint8Array(4 + data.length);
    typeAndData.set(t, 0); typeAndData.set(data, 4);
    const crc = new Uint8Array(4);
    new DataView(crc.buffer).setUint32(0, crc32(typeAndData));
    const out = new Uint8Array(4 + 4 + data.length + 4);
    out.set(len, 0); out.set(typeAndData, 4); out.set(crc, 4 + 4 + data.length);
    return out;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 2;
  const sig = strToU8("\x89PNG\r\n\x1a\n");
  const out = new Uint8Array(sig.length + 25 + idat.length + 12);
  out.set(sig, 0);
  out.set(chunk("IHDR", ihdr), sig.length);
  out.set(chunk("IDAT", idat), sig.length + 25);
  out.set(chunk("IEND", new Uint8Array(0)), sig.length + 25 + idat.length);
  return out;
}

const sha1Hex = (data: Uint8Array): string => {
  const hash = forge.md.sha1.create();
  // قراءة مجزأة — spread كامل قد ينفجر مع الملفات الكبيرة (حد وسائط V8)
  const CHUNK = 0x8000;
  for (let i = 0; i < data.length; i += CHUNK) {
    hash.update(String.fromCharCode.apply(null, data.subarray(i, i + CHUNK) as unknown as number[]));
  }
  return hash.digest().toHex();
};

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return [13, 27, 46];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// ---------- تحميل الشهادة من الأسرار ----------
function loadSigningMaterial() {
  const rawB64 = Deno.env.get("APPLE_WALLET_PASS_P12")?.replace(/\s+/g, "") ?? "";
  const password = Deno.env.get("APPLE_WALLET_PASS_P12_PASSWORD") ?? "";
  if (!rawB64) return null;
  const der = Uint8Array.from(atob(rawB64), (c) => c.charCodeAt(0));
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der));
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);

  let key: forge.pki.rsa.PrivateKey | null = null;
  for (const bagType of [forge.pki.oids.pkcs8ShroudedKeyBag, forge.pki.oids.keyBag]) {
    const list = p12.getBags({ bagType })[bagType];
    if (list?.length) { key = list[0].key as forge.pki.rsa.PrivateKey; break; }
  }
  let cert: forge.pki.Certificate | null = null;
  const certList = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
  if (certList?.length) cert = certList[0].cert as forge.pki.Certificate;

  if (!key || !cert) throw new Error("p12_missing_key_or_cert");

  const cn = cert.subject.getField("CN")?.value ?? "";
  const ou = cert.subject.getField("OU")?.value ?? "";
  const passTypeId = cn.trim();
  const teamId = (Deno.env.get("APPLE_WALLET_TEAM_ID") ?? ou).trim();
  if (!passTypeId.startsWith("pass.")) throw new Error(`invalid_pass_type_id: ${passTypeId}`);
  if (!teamId) throw new Error("missing_team_id");

  return { key, cert, passTypeId, teamId };
}

// ---------- صور البطاقة ----------
async function loadImages(logoUrl: string | null, brandColor: string) {
  const rgb = hexToRgb(brandColor);
  const solid = pngSolid(174, 174, rgb);
  const fallback = {
    "icon.png": solid,
    "icon@2x.png": solid,
  };
  if (!logoUrl) return fallback;
  try {
    const res = await fetch(logoUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return fallback;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length < 32 || bytes.length > 1_500_000) return fallback;
    // نوع PNG أو JPEG مقبول
    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const isJpeg = bytes[0] === 0xFF && bytes[1] === 0xD8;
    if (!isPng && !isJpeg) return fallback;
    return {
      "icon.png": bytes,
      "icon@2x.png": bytes,
      "logo.png": bytes,
      "logo@2x.png": bytes,
    };
  } catch {
    return fallback;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let code = url.searchParams.get("code") ?? "";
    if (!code && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      code = String((body as { code?: unknown })?.code ?? "");
    }
    if (!/^[A-Za-z0-9-]{4,64}$/.test(code)) return json({ error: "invalid_code" }, 400);

    const signing = loadSigningMaterial();
    if (!signing) return json({ error: "wallet_not_configured" }, 503);

    // جلب بيانات البطاقة من الخادم فقط
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await admin.rpc("loyalty_card_public", { _code: code });
    if (error || !data) {
      console.error("card_lookup", error?.message);
      return json({ error: "card_not_found" }, 404);
    }
    const card = data as Record<string, any>;
    const prog = (card.program ?? {}) as Record<string, any>;
    const orgName: string = prog.name || "Unify ERP";
    const brand: string = prog.brand_color || "#0D1B2E";
    const fullName = [card.first_name, card.last_name].filter(Boolean).join(" ") || "عضو";
    const points = Math.round(Number(card.points || 0));
    const balance = Number(card.wallet_balance || 0);
    const currency = card.currency ?? prog.currency_code ?? "";
    const active = card.is_active !== false;

    const images = await loadImages(prog.logo_url ?? null, brand);

    const passJson: Record<string, unknown> = {
      formatVersion: 1,
      passTypeIdentifier: signing.passTypeId,
      serialNumber: code,
      teamIdentifier: signing.teamId,
      organizationName: orgName,
      description: `بطاقة عضوية ${orgName}`,
      logoText: orgName,
      foregroundColor: "rgb(255,255,255)",
      backgroundColor: `rgb(${hexToRgb(brand).join(",")})`,
      labelColor: "rgb(255,255,255)",
      barcode: {
        format: "PKBarcodeFormatQR",
        message: code,
        messageEncoding: "iso-8859-1",
        altText: code,
      },
      storeCard: {
        primaryFields: [{ key: "member", label: "العضو", value: fullName }],
        secondaryFields: [
          { key: "points", label: "النقاط", value: String(points) },
          { key: "wallet", label: "رصيد المحفظة", value: currency ? `${balance.toFixed(2)} ${currency}` : balance.toFixed(2) },
        ],
        auxiliaryFields: [
          { key: "card", label: "رقم البطاقة", value: code },
          { key: "status", label: "الحالة", value: active ? "فعّالة" : "موقوفة" },
        ],
        backFields: [
          ...(card.joined_at
            ? [{ key: "since", label: "عضو منذ", value: new Date(card.joined_at as string).toLocaleDateString("en-GB") }]
            : []),
          ...(prog.tagline ? [{ key: "program", label: "البرنامج", value: String(prog.tagline) }] : []),
        ],
      },
      userInfo: { code },
    };
    const passJsonBytes = strToU8(JSON.stringify(passJson));

    // manifest.json — SHA1 لكل ملفات البطاقة عدا manifest و signature
    const manifest: Record<string, string> = {};
    for (const [name, bytes] of Object.entries(images)) manifest[name] = sha1Hex(bytes);
    manifest["pass.json"] = sha1Hex(passJsonBytes);
    const manifestBytes = strToU8(JSON.stringify(manifest));

    // التوقيع PKCS#7 detached فوق manifest.json
    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(manifestBytes);
    p7.addCertificate(signing.cert);
    for (const wwdrB64 of [WWDR_G4_B64, WWDR_G5_B64]) {
      if (!wwdrB64) continue;
      try {
        const der = Uint8Array.from(atob(wwdrB64), (c) => c.charCodeAt(0));
        const wwdrCert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.createBuffer(der)));
        p7.addCertificate(wwdrCert);
      } catch (e) {
        console.error("wwdr_parse_failed", (e as Error).message);
      }
    }
    p7.addSigner({
      key: signing.key,
      certificate: signing.cert,
      digestAlgorithm: forge.pki.oids.sha1,
    });
    p7.sign({ detached: true });
    const signature = new Uint8Array(forge.asn1.toDer(p7.toAsn1()).getBytes().split("").map((c) => c.charCodeAt(0)));

    // حزم البطاقة (zip)
    const pkpass = zipSync({ ...images, "pass.json": passJsonBytes, "manifest.json": manifestBytes, signature });

    return new Response(pkpass, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${code}.pkpass"`,
        "Content-Length": String(pkpass.length),
      },
    });
  } catch (e) {
    console.error("apple-wallet-pass", (e as Error).message);
    return json({ error: "pass_error", details: String((e as Error).message ?? e) }, 500);
  }
});
