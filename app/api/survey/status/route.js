import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyToken } from '@/lib/survey/token';
import { getClientIP } from '@/lib/ip';
import { checkRateLimitDistributed } from '@/lib/rateLimit';
import {
  getSurveySessionToken,
  buildSurveySessionClearCookie,
} from '@/lib/survey/survey-session';
import { isMissingOtpLastSentAtColumn } from '@/lib/survey/otp-column';

export const runtime = 'nodejs';

export async function POST(request) {
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415 });
  }

  const ip = getClientIP(request);
  const statusMax = parseInt(process.env.RATE_LIMIT_STATUS_MAX) || 120;
  const rateResult = await checkRateLimitDistributed(supabase, ip, 'survey_status', {
    max: statusMax,
  });
  if (rateResult.limited) {
    return NextResponse.json({ ok: false, verified: false, pendingVerification: false }, { status: 200 });
  }

  try {
    await request.json();
  } catch {
    return NextResponse.json({ ok: false, verified: false, pendingVerification: false }, { status: 200 });
  }

  const token = getSurveySessionToken(request);
  if (!token || token.length > 512) {
    return NextResponse.json({ ok: false, verified: false, pendingVerification: false }, { status: 200 });
  }

  const result = verifyToken(token);
  if (!result.valid) {
    const res = NextResponse.json({ ok: false, verified: false, pendingVerification: false }, { status: 200 });
    res.headers.append('Set-Cookie', buildSurveySessionClearCookie());
    return res;
  }

  try {
    let data;
    let otpSentKnown = true;

    const first = await supabase
      .from('survey_responses')
      .select('verified, otp_last_sent_at')
      .eq('id', result.surveyResponseId)
      .single();

    if (first.error && isMissingOtpLastSentAtColumn(first.error)) {
      const legacy = await supabase
        .from('survey_responses')
        .select('verified')
        .eq('id', result.surveyResponseId)
        .single();
      if (legacy.error || !legacy.data) {
        const res = NextResponse.json({ ok: false, verified: false, pendingVerification: false }, { status: 200 });
        res.headers.append('Set-Cookie', buildSurveySessionClearCookie());
        return res;
      }
      data = legacy.data;
      otpSentKnown = false;
    } else if (first.error || !first.data) {
      const res = NextResponse.json({ ok: false, verified: false, pendingVerification: false }, { status: 200 });
      res.headers.append('Set-Cookie', buildSurveySessionClearCookie());
      return res;
    } else {
      data = first.data;
    }

    const verified = data.verified === true;
    // Only treat session as "awaiting code entry" if an SMS send was recorded — avoids jumping
    // straight to the OTP UI when a cookie exists but no code was ever sent.
    const otpSent =
      otpSentKnown && data.otp_last_sent_at != null && String(data.otp_last_sent_at).length > 0;
    const pendingVerification = !verified && (otpSentKnown ? otpSent : true);

    const res = NextResponse.json(
      {
        ok: true,
        verified,
        pendingVerification,
      },
      { status: 200 }
    );
    if (verified) {
      res.headers.append('Set-Cookie', buildSurveySessionClearCookie());
    }
    return res;
  } catch {
    return NextResponse.json({ ok: false, verified: false, pendingVerification: false }, { status: 200 });
  }
}
