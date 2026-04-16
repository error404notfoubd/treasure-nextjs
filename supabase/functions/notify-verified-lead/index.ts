/**
 * Supabase Edge Function: notify-verified-lead
 *
 * Trigger: Database Webhook on public.users (INSERT/UPDATE) when a funnel row
 * becomes verified for the first time (verified_at newly set).
 * Emails dashboard profiles where receive_verified_lead_notifications is true and email is set.
 * Configure the webhook to POST to this function URL with header:
 *   x-webhook-secret: <same value as LEAD_VERIFY_WEBHOOK_SECRET>
 *
 * Secrets (Dashboard → Edge Functions → Secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (often provided by Supabase)
 *   LEAD_VERIFY_WEBHOOK_SECRET               (shared with webhook custom header)
 *   RESEND_API_KEY                           (https://resend.com)
 *   RESEND_FROM                              (e.g. "Treasure <leads@yourdomain.com>")
 *   DASHBOARD_BASE_URL                       (e.g. "https://dashboard.yourdomain.com")
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const WEBHOOK_SECRET_HEADER = "x-webhook-secret";

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

function isNewlyVerified(
  type: string | undefined,
  record: Record<string, unknown>,
  oldRecord: Record<string, unknown> | null | undefined,
): boolean {
  const verifiedAt = record.verified_at;
  if (verifiedAt == null || verifiedAt === "") return false;

  const step = String(record.registration_step ?? "").toLowerCase();
  if (step !== "verified") return false;

  if (type === "INSERT") return true;

  if (type === "UPDATE") {
    const prevVerifiedAt = oldRecord?.verified_at;
    const prevStep = String(oldRecord?.registration_step ?? "").toLowerCase();
    const wasVerifiedBefore =
      (prevVerifiedAt != null && prevVerifiedAt !== "") || prevStep === "verified";
    if (!wasVerifiedBefore) return true;
    return false;
  }

  // INSERT without explicit type (defensive)
  if (!type) return true;

  return false;
}

function buildLeadEmailHtml(args: {
  lead: Record<string, unknown>;
  dashboardUrl: string;
}): string {
  const { lead, dashboardUrl } = args;
  const name = escapeHtml(String(lead.full_name ?? "—"));
  const game = escapeHtml(String(lead.favorite_game ?? "—"));
  const heard = escapeHtml(String(lead.heard_from ?? "—"));

  const ctaHref = escapeHtml(`${dashboardUrl.replace(/\/$/, "")}/dashboard`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>New verified lead</title>
</head>
<body style="margin:0;padding:0;background:#0f1419;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f1419;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#1a2332;border-radius:12px;overflow:hidden;border:1px solid #2d3a4d;">
          <tr>
            <td style="padding:20px 24px;background:linear-gradient(135deg,#1e3a5f 0%,#152238 100%);border-bottom:1px solid #2d4a6f;">
              <p style="margin:0;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8ba4c7;">Treasure · Leads</p>
              <h1 style="margin:8px 0 0;font-size:20px;font-weight:600;color:#f0f4fc;">New verified lead</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;color:#e8edf5;font-size:14px;line-height:1.55;">
              <p style="margin:0 0 16px;color:#b8c5d9;">A customer completed phone verification.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                <tr><td style="padding:10px 0;border-bottom:1px solid #2d3a4d;color:#8ba4c7;width:38%;vertical-align:top;">Name</td><td style="padding:10px 0;border-bottom:1px solid #2d3a4d;font-weight:500;">${name}</td></tr>
                <tr><td style="padding:10px 0;border-bottom:1px solid #2d3a4d;color:#8ba4c7;vertical-align:top;">Favorite game</td><td style="padding:10px 0;border-bottom:1px solid #2d3a4d;">${game}</td></tr>
                <tr><td style="padding:10px 0;border-bottom:1px solid #2d3a4d;color:#8ba4c7;vertical-align:top;">Heard from</td><td style="padding:10px 0;border-bottom:1px solid #2d3a4d;">${heard}</td></tr>
              </table>
              <p style="margin:18px 0 0;color:#c5d0e0;font-size:14px;line-height:1.55;">The user has verified their phone number.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:28px;">
                <tr>
                  <td style="border-radius:8px;background:#3b82f6;">
                    <a href="${ctaHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">View in Dashboard →</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;color:#6b7c93;">You received this because your email is on file in the team directory. Reply is not monitored.</p>
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

  const expectedSecret = Deno.env.get("LEAD_VERIFY_WEBHOOK_SECRET");
  if (!expectedSecret) {
    console.error("LEAD_VERIFY_WEBHOOK_SECRET is not set");
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

  if (!isNewlyVerified(type, record, oldRecord)) {
    return new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "not a new verification" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const resendFrom = Deno.env.get("RESEND_FROM");
  const dashboardBase = Deno.env.get("DASHBOARD_BASE_URL");
  if (!resendKey || !resendFrom || !dashboardBase) {
    console.error("RESEND_API_KEY, RESEND_FROM, or DASHBOARD_BASE_URL missing");
    return new Response(JSON.stringify({ error: "Email or dashboard URL not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, email, full_name, receive_verified_lead_notifications")
    .not("email", "is", null);

  if (profErr) {
    console.error("profiles query", profErr.message);
    return new Response(JSON.stringify({ error: "Failed to load profiles" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const recipients = (profiles ?? []).filter(
    (p: {
      email?: string | null;
      receive_verified_lead_notifications?: boolean | null;
    }) =>
      p.receive_verified_lead_notifications === true &&
      typeof p.email === "string" &&
      p.email.includes("@"),
  ) as { id: string; email: string; full_name: string | null }[];

  const leadName = String(record.full_name ?? "Lead");
  const subject = `New verified lead: ${leadName}`;

  const html = buildLeadEmailHtml({
    lead: record,
    dashboardUrl: dashboardBase,
  });

  const sendErrors: string[] = [];
  let sent = 0;

  for (const p of recipients) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: resendFrom,
          to: [p.email],
          subject,
          html,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        sendErrors.push(`HTTP ${res.status} ${t.slice(0, 300)}`);
      } else {
        sent++;
      }
    } catch (e) {
      sendErrors.push(e instanceof Error ? e.message : String(e));
    }
  }

  const rowId = record.user_id != null ? String(record.user_id) : null;
  const changeSummary =
    `notify-verified-lead: staff notifications ${sent}/${recipients.length} delivered` +
    (sendErrors.length ? `; ${sendErrors.length} send error(s)` : "; ok");

  const auditPayload = {
    lead_user_id: rowId,
    notifications_targeted: recipients.length,
    notifications_sent: sent,
    notification_errors: sendErrors.length ? sendErrors : null,
    webhook_type: type ?? null,
  };

  const { error: auditErr } = await supabase.from("audit_log").insert({
    table_name: "users",
    operation: "UPDATE",
    row_id: rowId,
    old_data: null,
    new_data: {
      ...auditPayload,
      lead_snapshot: {
        full_name: record.full_name,
        favorite_game: record.favorite_game,
        heard_from: record.heard_from,
        phone_verified: true,
      },
    },
    change_summary: changeSummary,
    performed_by: "edge_function:notify-verified-lead",
  });

  if (auditErr) {
    console.error("audit_log insert", auditErr.message);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      lead_user_id: rowId,
      recipients: recipients.length,
      sent,
      audit_ok: !auditErr,
      errors: sendErrors.length ? sendErrors : undefined,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
