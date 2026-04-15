import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkRateLimitDistributed } from "@/lib/rateLimit";
import { getClientIP } from "@/lib/ip";
import { verifyToken } from "@/lib/survey/token";
import {
  getSurveySessionToken,
  buildSurveySessionClearCookie,
} from "@/lib/survey/survey-session";
import { FUNNEL_USERS_TABLE } from "@/lib/funnel-users";
import { normalizeHeardFromInput } from "@/lib/survey/heard-from";

export const runtime = "nodejs";

// POST /api/survey/heard-from — { name: string } (or heardFrom) → column heard_from; after verify, before success UI
export async function POST(request) {
  const ip = getClientIP(request);

  const rateResult = await checkRateLimitDistributed(supabase, ip, "survey_heard_from");
  if (rateResult.limited) {
    return NextResponse.json(
      { error: `Too many attempts. Please wait ${Math.ceil(rateResult.retryAfterSec / 60)} minutes.` },
      {
        status: 429,
        headers: { "Retry-After": String(rateResult.retryAfterSec) },
      }
    );
  }

  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return NextResponse.json({ error: "Content-Type must be application/json." }, { status: 415 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const token = getSurveySessionToken(request);
  if (!token || token.length > 512) {
    return NextResponse.json({ error: "No active survey session." }, { status: 401 });
  }

  const parsed = verifyToken(token);
  if (!parsed.valid) {
    const res = NextResponse.json({ error: "Invalid or expired session. Please start again." }, { status: 401 });
    res.headers.append("Set-Cookie", buildSurveySessionClearCookie());
    return res;
  }

  const rawSource = body.name ?? body.heardFrom;
  const normalized = normalizeHeardFromInput(rawSource);
  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 422 });
  }

  try {
    const { data: row, error: fetchError } = await supabase
      .from(FUNNEL_USERS_TABLE)
      .select("user_id, verified_at, heard_from")
      .eq("user_id", parsed.surveyResponseId)
      .single();

    if (fetchError || !row) {
      const res = NextResponse.json({ error: "Submission not found." }, { status: 404 });
      res.headers.append("Set-Cookie", buildSurveySessionClearCookie());
      return res;
    }

    if (row.verified_at == null) {
      return NextResponse.json(
        { error: "Please verify your phone number before continuing." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from(FUNNEL_USERS_TABLE)
      .update({
        heard_from: normalized.value,
        updated_at: now,
      })
      .eq("user_id", row.user_id);

    if (updateError) {
      if (updateError.message?.includes("heard_from") || updateError.code === "42703") {
        console.error(
          "[survey/heard-from] Missing column heard_from on public.users. Run sql/migrations/20260418_users_heard_from.sql"
        );
        return NextResponse.json(
          { error: "This site is being updated. Please try again in a few minutes." },
          { status: 503 }
        );
      }
      console.error("[survey/heard-from update]", updateError.message ?? updateError);
      return NextResponse.json({ error: "Could not save your answer. Please try again." }, { status: 500 });
    }

    const res = NextResponse.json({ success: true }, { status: 200 });
    res.headers.append("Set-Cookie", buildSurveySessionClearCookie());
    return res;
  } catch (err) {
    console.error("[survey/heard-from]", err?.message ?? err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
