// Edge function: notifications-worker
// Drains public.notification_queue in batches and sends via FCM HTTP v1.
// Triggered by cron every minute. Service role only.
// Phase 1 of the queue-based notification system.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

type QueueRow = {
  id: string;
  owner_id: string;
  recipient_user_id: string;
  event_type: string;
  sensitivity: "low" | "high";
  title: string;
  body: string;
  data: Record<string, unknown>;
  path: string | null;
  attempts: number;
  source_created_at: string;
};

// ---- FCM OAuth token cache (~55min reuse) ----
let cachedToken: { token: string; exp: number } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function b64url(buf: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof buf === "string") bytes = new TextEncoder().encode(buf);
  else if (buf instanceof Uint8Array) bytes = buf;
  else bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claim))}`;
  const keyData = pemToArrayBuffer(sa.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${b64url(sig)}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`OAuth token failed: ${JSON.stringify(json)}`);
  }
  cachedToken = { token: json.access_token, exp: now + (json.expires_in ?? 3600) };
  return json.access_token;
}

// concurrency-limited Promise.allSettled
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (it: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (e) {
        results[i] = { status: "rejected", reason: e };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Allow cron via service role OR a manual ping via service role.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const presented = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!serviceRoleKey || presented !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const saRaw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
  if (!saRaw) {
    return new Response(
      JSON.stringify({ error: "FIREBASE_SERVICE_ACCOUNT not set" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const sa: ServiceAccount = JSON.parse(saRaw);
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");

  let totalClaimed = 0;
  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  // Process up to 3 batches per invocation (600 rows). Stop early when empty.
  const startedAt = Date.now();
  const MAX_BATCHES = 3;
  const BATCH_SIZE = 200;
  const CONCURRENCY = 25;
  const MAX_INVOCATION_MS = 120_000; // safety margin under 150s

  let accessToken = "";
  try {
    accessToken = await getAccessToken(sa);
  } catch (e) {
    return new Response(JSON.stringify({ error: `oauth_failed: ${String(e)}` }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  for (let b = 0; b < MAX_BATCHES; b++) {
    if (Date.now() - startedAt > MAX_INVOCATION_MS) break;

    const { data: batch, error: claimErr } = await supabase.rpc(
      "claim_notification_batch",
      { _limit: BATCH_SIZE },
    );
    if (claimErr) {
      console.error("claim_notification_batch error:", claimErr);
      break;
    }
    const rows = (batch ?? []) as QueueRow[];
    if (rows.length === 0) break;
    totalClaimed += rows.length;

    // M1: Skip notifications whose source event is too old (>72h).
    // Late delivery of stale events (e.g. POS) is noise — mark skipped.
    const STALE_HOURS = 72;
    const staleCutoffMs = Date.now() - STALE_HOURS * 3600 * 1000;
    const NEVER_STALE = new Set(["legacy_push", "manager_digest"]);
    const staleRows: QueueRow[] = [];
    const freshRows: QueueRow[] = [];
    for (const r of rows) {
      const src = r.source_created_at ? Date.parse(r.source_created_at) : NaN;
      if (
        !NEVER_STALE.has(r.event_type) &&
        Number.isFinite(src) &&
        src < staleCutoffMs
      ) {
        staleRows.push(r);
      } else {
        freshRows.push(r);
      }
    }
    if (staleRows.length > 0) {
      await supabase
        .from("notification_queue")
        .update({
          status: "skipped",
          last_error: "stale_source",
          sent_at: new Date().toISOString(),
        })
        .in("id", staleRows.map((r) => r.id));
      totalSkipped += staleRows.length;
    }
    if (freshRows.length === 0) continue;

    // Phase 3 digest: collapse multiple rows for the same recipient in this
    // batch into a single summary notification. Keeps one row as the "carrier"
    // and marks the rest as sent (digested) so we don't fire N pushes.
    const rowsByRecipient = new Map<string, QueueRow[]>();
    for (const r of freshRows) {
      const arr = rowsByRecipient.get(r.recipient_user_id) ?? [];
      arr.push(r);
      rowsByRecipient.set(r.recipient_user_id, arr);
    }
    const digestedExtras: QueueRow[] = [];
    const rowsToSend: QueueRow[] = [];
    for (const [, recRows] of rowsByRecipient) {
      if (recRows.length === 1) {
        rowsToSend.push(recRows[0]);
        continue;
      }
      // Use the highest-priority (lowest number) row as carrier.
      recRows.sort((a, b) => (a as any).priority - (b as any).priority);
      const carrier = { ...recRows[0] };
      carrier.title = `لديك ${recRows.length} إشعارات جديدة`;
      carrier.body = "افتح التطبيق لعرض التفاصيل";
      carrier.sensitivity = "high";
      carrier.data = { ...(carrier.data ?? {}), digest_count: recRows.length };
      rowsToSend.push(carrier);
      for (let i = 1; i < recRows.length; i++) digestedExtras.push(recRows[i]);
    }
    if (digestedExtras.length > 0) {
      await supabase
        .from("notification_queue")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_error: "digested",
        })
        .in("id", digestedExtras.map((r) => r.id));
    }

    // Defensive: load tokens grouped by recipient in one query.
    const recipientIds = Array.from(new Set(rowsToSend.map((r) => r.recipient_user_id)));
    const { data: allTokens } = await supabase
      .from("device_tokens")
      .select("id, user_id, token")
      .in("user_id", recipientIds)
      .eq("is_active", true);
    const tokensByUser = new Map<string, Array<{ id: string; token: string }>>();
    for (const t of allTokens ?? []) {
      const arr = tokensByUser.get(t.user_id) ?? [];
      arr.push({ id: t.id, token: t.token });
      tokensByUser.set(t.user_id, arr);
    }

    // Send for each row, concurrency limited.
    const settled = await runWithConcurrency(rowsToSend, CONCURRENCY, async (row) => {
      const tokens = tokensByUser.get(row.recipient_user_id) ?? [];
      if (tokens.length === 0) {
        await supabase
          .from("notification_queue")
          .update({
            status: "skipped",
            last_error: "no_active_tokens",
            sent_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        return { id: row.id, skipped: true };
      }

      // Privacy: high-sensitivity notifications never expose body content.
      const displayTitle = row.title;
      const displayBody =
        row.sensitivity === "high"
          ? "افتح التطبيق لعرض التفاصيل"
          : row.body;

      const messageData: Record<string, string> = {
        title: displayTitle,
        body: displayBody,
        event_type: row.event_type,
      };
      if (row.path) messageData.path = row.path;
      // Pass through the structured data payload (rendered only after auth).
      for (const [k, v] of Object.entries(row.data ?? {})) {
        if (v === null || v === undefined) continue;
        messageData[`d_${k}`] = typeof v === "string" ? v : JSON.stringify(v);
      }

      let okCount = 0;
      let lastErr = "";
      for (const t of tokens) {
        const payload = {
          message: {
            token: t.token,
            data: messageData,
            webpush: {
              headers: { Urgency: "high" },
              ...(row.path ? { fcm_options: { link: row.path } } : {}),
            },
          },
        };
        const res = await fetch(fcmUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          okCount++;
          // Stamp validation so cleanup knows this device is alive.
          await supabase
            .from("device_tokens")
            .update({
              last_validated_at: new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
              fail_count: 0,
            })
            .eq("id", t.id);
        } else {
          const errBody = await res.json().catch(() => ({}));
          const errCode =
            errBody?.error?.details?.[0]?.errorCode ||
            errBody?.error?.status ||
            String(res.status);
          lastErr = String(errCode);
          if (
            errCode === "UNREGISTERED" ||
            errCode === "NOT_FOUND" ||
            errCode === "INVALID_ARGUMENT" ||
            res.status === 404
          ) {
            await supabase
              .from("device_tokens")
              .update({ is_active: false })
              .eq("id", t.id);
          } else {
            // Transient failure → bump counter; cleanup may deactivate later.
            await supabase.rpc("increment_device_token_failures", { _id: t.id }).then(
              () => {},
              () => {},
            );
          }
        }
      }

      if (okCount > 0) {
        await supabase
          .from("notification_queue")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            last_error: lastErr || null,
          })
          .eq("id", row.id);
        return { id: row.id, sent: okCount };
      } else {
        // Mark failed; will retry next run (attempts < 5).
        await supabase
          .from("notification_queue")
          .update({
            status: row.attempts >= 5 ? "failed" : "pending",
            last_error: lastErr || "all_tokens_failed",
          })
          .eq("id", row.id);
        return { id: row.id, failed: true };
      }
    });

    for (const s of settled) {
      if (s.status === "fulfilled") {
        const v = s.value as { sent?: number; failed?: boolean; skipped?: boolean };
        if (v.skipped) totalSkipped++;
        else if (v.failed) totalFailed++;
        else if (v.sent) totalSent += v.sent;
      } else {
        totalFailed++;
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      claimed: totalClaimed,
      sent: totalSent,
      failed: totalFailed,
      skipped: totalSkipped,
      elapsed_ms: Date.now() - startedAt,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});