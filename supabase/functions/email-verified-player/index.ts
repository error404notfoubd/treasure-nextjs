/**
 * Supabase Edge Function: email-verified-player
 *
 * Trigger: Database Webhook on public.users (INSERT/UPDATE) when the row becomes
 * fully verified (`registration_step` is `verified` and `verified_at` is set), including
 * returning to verified after it was cleared, or UPDATE without `old_record`.
 *
 * Sends a welcome email TO THE PLAYER only when a decryptable email exists **and**
 * a valid **https** Facebook page URL is configured (app_settings.facebook_page_url and/or
 * FACEBOOK_PAGE_URL secret). There is **no** hardcoded default URL; if none is configured,
 * the function exits successfully without sending.
 * Uses a separate Resend "from" address (not staff lead alerts).
 *
 * Configure a second webhook (or chain from your automation) POSTing to this URL with:
 *   x-webhook-secret: <same value as VERIFIED_PLAYER_WEBHOOK_SECRET>
 *
 * Secrets (Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (often provided by Supabase)
 *   FIELD_ENCRYPTION_SECRET                   (same value as Next.js SUPABASE_SECRET_KEY in lib/crypto.js — Supabase
 *                                              blocks custom secret names starting with SUPABASE_)
 *   VERIFIED_PLAYER_WEBHOOK_SECRET            (shared with this webhook’s custom header)
 *   RESEND_API_KEY                            (https://resend.com)
 *   RESEND_VERIFIED_PLAYER_FROM               (e.g. "Treasure <rewards@yourdomain.com>") — must differ from staff RESEND_FROM
 * Optional:
 *   SITE_NAME                                 Brand name in copy (default Treasure Hunt)
 *   FACEBOOK_PAGE_URL                         Optional https URL if not stored in app_settings
 *
 * Facebook link for players: Dashboard → System → Public links (`app_settings.facebook_page_url`),
 * or set FACEBOOK_PAGE_URL on the function. If neither yields a valid https URL, no email is sent.
 */
import { Buffer } from "node:buffer";
import { createDecipheriv, createHash } from "node:crypto";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const WEBHOOK_SECRET_HEADER = "x-webhook-secret";

const DEFAULT_SITE_NAME = "Treasure Hunt";

function buildPlayerVerifiedEmailSubject(siteName: string): string {
  const s = siteName.trim() || DEFAULT_SITE_NAME;
  return `Thanks — your ${s} number is verified. Claim your redeemable freeplay.`;
}

type WebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: Record<string, unknown>;
  old_record?: Record<string, unknown> | null;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isFullyVerifiedRecord(record: Record<string, unknown>): boolean {
  const verifiedAt = record.verified_at;
  if (verifiedAt == null || verifiedAt === "") return false;
  const step = String(record.registration_step ?? "").toLowerCase();
  return step === "verified";
}

/** Fire when the user is fully verified in `record` and this webhook reflects a transition into (or back into) that state. */
function shouldSendOnVerifiedTransition(
  type: string | undefined,
  record: Record<string, unknown>,
  oldRecord: Record<string, unknown> | null | undefined,
): boolean {
  if (!isFullyVerifiedRecord(record)) return false;

  const t = type?.toUpperCase();
  if (t === "INSERT") return true;

  if (t === "UPDATE") {
    if (oldRecord == null || typeof oldRecord !== "object") return true;
    const prevVerifiedAt = oldRecord.verified_at;
    const prevStep = String(oldRecord.registration_step ?? "").toLowerCase();
    const hadFullVerification =
      prevStep === "verified" && prevVerifiedAt != null && String(prevVerifiedAt).trim() !== "";
    if (!hadFullVerification) return true;
    if (prevStep !== "verified") return true;
    if (String(prevVerifiedAt ?? "") !== String(record.verified_at ?? "")) return true;
    return false;
  }

  if (!t) return true;
  return false;
}

/** Matches lib/crypto.js + lib/survey/contact-storage resolveEmailFromDb */
function decryptEmailField(ciphertextB64: string, secret: string): string {
  const key = createHash("sha256").update(secret + ":field-encryption-key").digest();
  const buf = Buffer.from(ciphertextB64, "base64");
  if (buf.length < 12 + 16) throw new Error("Invalid ciphertext");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function resolvePlayerEmail(stored: unknown, secret: string): string | null {
  if (typeof stored !== "string" || !stored.trim()) return null;
  try {
    const plain = decryptEmailField(stored, secret).trim();
    return plain.includes("@") ? plain : null;
  } catch {
    const s = stored.trim();
    if (
      s.length < 300 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
    ) {
      return s.toLowerCase();
    }
    return null;
  }
}

async function resolveFacebookPageUrl(
  supabase: ReturnType<typeof createClient> | null,
): Promise<string | null> {
  if (supabase) {
    const { data, error } = await supabase.from("app_settings").select("facebook_page_url").eq("id", 1).maybeSingle();
    if (error) console.error("app_settings facebook_page_url", error.message);
    const raw = data?.facebook_page_url;
    if (typeof raw === "string" && raw.trim()) {
      try {
        const u = new URL(raw.trim());
        if (u.protocol === "https:") return u.toString().slice(0, 512);
      } catch {
        /* fall through */
      }
    }
  }
  const envRaw = (Deno.env.get("FACEBOOK_PAGE_URL") ?? "").trim();
  if (envRaw) {
    try {
      const u = new URL(envRaw);
      if (u.protocol === "https:") return u.toString().slice(0, 512);
    } catch {
      /* fall through */
    }
  }
  return null;
}

function firstNameFromFullName(fullName: unknown): string {
  if (typeof fullName !== "string" || !fullName.trim()) return "there";
  const part = fullName.trim().split(/\s+/)[0];
  return part || "there";
}

function normalizeGameLabel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Lead’s favorite first, then up to two other active catalog names (no duplicates). */
async function buildGameNamesForEmail(
  record: Record<string, unknown>,
  supabase: ReturnType<typeof createClient> | null,
): Promise<{ names: string[]; favoriteTitle: string | null }> {
  let favorite = normalizeGameLabel(record.favorite_game);
  if (!favorite && supabase) {
    const rawId = record.favorite_game_id;
    const id = typeof rawId === "string" ? rawId.trim() : rawId != null ? String(rawId).trim() : "";
    if (id) {
      const { data, error } = await supabase.from("favorite_games").select("name").eq("id", id).maybeSingle();
      if (error) console.error("favorite_games lookup by id", error.message);
      favorite = normalizeGameLabel(data?.name);
    }
  }

  const favoriteTitle = favorite;

  if (!supabase) {
    return { names: favorite ? [favorite] : [], favoriteTitle };
  }

  const { data: gameRows, error: gErr } = await supabase
    .from("favorite_games")
    .select("name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(80);

  if (gErr) {
    console.error("favorite_games query", gErr.message);
    return { names: favorite ? [favorite] : [], favoriteTitle };
  }

  const catalog = (gameRows ?? [])
    .map((r) => normalizeGameLabel((r as { name?: unknown }).name))
    .filter((n): n is string => Boolean(n));

  const sameLabel = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const extras: string[] = [];
  for (const n of catalog) {
    if (favorite && sameLabel(n, favorite)) continue;
    extras.push(n);
    if (extras.length >= 2) break;
  }

  if (favorite) return { names: [favorite, ...extras], favoriteTitle };
  return { names: catalog.slice(0, 3), favoriteTitle };
}

function buildPlayerVerifiedEmailHtml(args: {
  greetingName: string;
  siteName: string;
  facebookUrl: string;
  gameNames: string[];
  emailSubject: string;
  favoriteTitle: string | null;
}): string {
  const { greetingName, siteName, facebookUrl, gameNames, emailSubject, favoriteTitle } = args;
  const name = escapeHtml(greetingName);
  const site = escapeHtml(siteName);
  const fb = escapeHtml(facebookUrl);
  const subj = escapeHtml(emailSubject);
  const favoriteGameHtml =
    typeof favoriteTitle === "string" && favoriteTitle.trim()
      ? escapeHtml(favoriteTitle.trim())
      : escapeHtml("a featured game in our catalog");

  const gameRows = gameNames.map(
    (g) =>
      `<tr><td style="padding:10px 16px;border-bottom:1px solid #243041;color:#e2e8f0;font-size:14px;">${escapeHtml(g)}</td></tr>`,
  ).join("");
  const listBlock =
    gameNames.length === 0
      ? ""
      : `<p style="margin:20px 0 8px;font-size:12px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;">Games in our catalog (sample)</p>` +
        `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #2a3544;border-radius:10px;overflow:hidden;margin-top:4px;">` +
        gameRows +
        `<tr><td style="padding:12px 16px;font-size:12px;color:#94a3b8;border-top:1px solid #334155;background:#0f1419;">We add new titles over time — this is not the full list.</td></tr></table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subj}</title>
</head>
<body style="margin:0;padding:0;background:#0c0f14;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0c0f14;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#1a2332;border-radius:10px;overflow:hidden;border:1px solid #2d3a4d;">
          <tr>
            <td style="padding:20px 24px;background:#111827;border-bottom:1px solid #374151;">
              <p style="margin:0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#9ca3af;">${site} · Welcome</p>
              <h1 style="margin:8px 0 0;font-size:20px;font-weight:600;color:#f9fafb;line-height:1.3;">Thanks — your account is verified</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 24px 26px;color:#e5e7eb;font-size:15px;line-height:1.65;">
              <p style="margin:0 0 8px;color:#d1d5db;">Hi ${name},</p>
              <p style="margin:0 0 16px;color:#e5e7eb;">Thanks — your <strong style="color:#f9fafb;">${site}</strong> account is verified. As a special gift for registering, we are giving you freeplay on <strong style="color:#f9fafb;">${favoriteGameHtml}</strong>. Contact us on Facebook to claim it.</p>
              <p style="margin:0 0 18px;color:#e5e7eb;">We also provide redeemable games and many more bonuses.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 12px;">
                <tr>
                  <td style="border-radius:8px;background:#1877f2;">
                    <a href="${fb}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Open Facebook</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 22px;font-size:12px;color:#9ca3af;line-height:1.5;">If the button does not work, copy this URL into your browser:<br /><a href="${fb}" style="color:#93c5fd;word-break:break-all;">${fb}</a></p>
              ${listBlock}
              <p style="margin:22px 0 0;font-size:11px;color:#6b7280;line-height:1.5;">This message was sent because your phone verification succeeded for ${site}. This inbox is not monitored for replies.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const expectedSecret = Deno.env.get("VERIFIED_PLAYER_WEBHOOK_SECRET");
  if (!expectedSecret) {
    console.error("VERIFIED_PLAYER_WEBHOOK_SECRET is not set");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const provided =
    req.headers.get(WEBHOOK_SECRET_HEADER) ??
    req.headers.get("X-Webhook-Secret") ??
    (() => {
      const a = req.headers.get("Authorization");
      if (a?.startsWith("Bearer ")) return a.slice(7);
      return null;
    })();

  if (!provided || provided !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: WebhookPayload;
  try {
    body = (await req.json()) as WebhookPayload;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const table = body.table;
  const schema = body.schema ?? "public";
  if (schema !== "public" || (table != null && table !== "users")) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: "not public.users" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const record = body.record;
  if (!record || typeof record !== "object") {
    return new Response(JSON.stringify({ error: "Missing record" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const type = body.type?.toUpperCase();
  const oldRecord = body.old_record ?? undefined;

  if (!shouldSendOnVerifiedTransition(type, record, oldRecord)) {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "not_verified_transition" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  let supabase: ReturnType<typeof createClient> | null = null;
  if (supabaseUrl && serviceKey) {
    supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const facebookUrl = await resolveFacebookPageUrl(supabase);
  if (facebookUrl == null || facebookUrl.trim() === "") {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "no_facebook_url" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const cryptoSecret = Deno.env.get("FIELD_ENCRYPTION_SECRET");
  if (!cryptoSecret) {
    console.error("FIELD_ENCRYPTION_SECRET is not set (use the same value as SUPABASE_SECRET_KEY in Next.js; required to decrypt email_encrypted)");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const toEmail = resolvePlayerEmail(record.email_encrypted, cryptoSecret);
  if (!toEmail) {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "no_email" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("RESEND_VERIFIED_PLAYER_FROM");
  if (!resendKey || !resendFrom) {
    console.error("RESEND_API_KEY or RESEND_VERIFIED_PLAYER_FROM missing");
    return new Response(JSON.stringify({ error: "Email not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { names: gameNames, favoriteTitle } = await buildGameNamesForEmail(record, supabase);

  const siteName = (Deno.env.get("SITE_NAME") ?? DEFAULT_SITE_NAME).trim() || DEFAULT_SITE_NAME;

  const greetingName = firstNameFromFullName(record.full_name);
  const emailSubject = buildPlayerVerifiedEmailSubject(siteName);
  const html = buildPlayerVerifiedEmailHtml({
    greetingName,
    siteName,
    facebookUrl,
    gameNames,
    emailSubject,
    favoriteTitle,
  });

  let sendOk = false;
  let sendDetail = "";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resendFrom,
        to: [toEmail],
        subject: emailSubject,
        html,
      }),
    });
    const t = await res.text();
    sendDetail = t.slice(0, 400);
    sendOk = res.ok;
    if (!res.ok) {
      console.error("Resend player email", res.status, sendDetail);
    }
  } catch (e) {
    sendDetail = e instanceof Error ? e.message : String(e);
    console.error("Resend player email fetch", sendDetail);
  }

  let auditErrMsg: string | null = null;

  if (supabase) {
    const rowId = record.user_id != null ? String(record.user_id) : null;
    const leadLabel = String(record.full_name ?? "Lead").trim() || "Lead";
    const changeSummary =
      `${leadLabel} — email-verified-player: ${sendOk ? "sent" : "failed"} to player` +
      (sendOk ? "" : ` (${sendDetail.slice(0, 120)})`);

    const { error: auditErr } = await supabase.from("audit_log").insert({
      table_name: "users",
      operation: "UPDATE",
      row_id: rowId,
      old_data: null,
      new_data: {
        kind: "player_welcome_email",
        resend_ok: sendOk,
      },
      change_summary: changeSummary,
      performed_by: "edge_function:email-verified-player",
    });
    if (auditErr) {
      auditErrMsg = auditErr.message;
      console.error("audit_log insert", auditErrMsg);
    }
  }

  if (!sendOk) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "send_failed",
        detail: sendDetail,
        audit_ok: !auditErrMsg,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      lead_user_id: record.user_id != null ? String(record.user_id) : null,
      sent: true,
      audit_ok: !auditErrMsg,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
