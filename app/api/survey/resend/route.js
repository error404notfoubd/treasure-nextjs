import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimitDistributed } from '@/lib/rateLimit';
import { getClientIP } from '@/lib/ip';
import { verifyToken } from '@/lib/survey/token';
import { sendVerificationSms, isPreludeConfigured, userMessageForPreludeSendFailure } from '@/lib/survey/prelude';
import {
  getSurveySessionToken,
  buildSurveySessionClearCookie,
} from '@/lib/survey/survey-session';
import { smsSendRateLimitOptions, resendRouteRateLimitOptions, otpResendCooldownSec } from '@/lib/survey/rate-limits';
import { isMissingOtpLastSentAtColumn } from '@/lib/survey/otp-column';

export const runtime = 'nodejs';

export async function POST(request) {
  const ip = getClientIP(request);

  const resendOpts = resendRouteRateLimitOptions();
  const resendRate = await checkRateLimitDistributed(supabase, ip, 'survey_resend', resendOpts);
  if (resendRate.limited) {
    return NextResponse.json(
      {
        error: `Too many resend attempts. Please wait ${Math.ceil(resendRate.retryAfterSec / 60)} minutes.`,
        retryAfterSec: resendRate.retryAfterSec,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(resendRate.retryAfterSec) },
      }
    );
  }

  const smsOpts = smsSendRateLimitOptions();
  const smsRate = await checkRateLimitDistributed(supabase, ip, 'survey_sms_send', smsOpts);
  if (smsRate.limited) {
    return NextResponse.json(
      {
        error: `SMS limit reached. Please try again later.`,
        retryAfterSec: smsRate.retryAfterSec,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(smsRate.retryAfterSec) },
      }
    );
  }

  const token = getSurveySessionToken(request);
  if (!token || token.length > 512) {
    return NextResponse.json({ error: 'No active verification session.' }, { status: 401 });
  }

  const result = verifyToken(token);
  if (!result.valid) {
    const res = NextResponse.json({ error: 'Session expired. Please register again.' }, { status: 401 });
    res.headers.append('Set-Cookie', buildSurveySessionClearCookie());
    return res;
  }

  if (!isPreludeConfigured()) {
    return NextResponse.json({ error: 'Phone verification is not available.' }, { status: 503 });
  }

  const cooldownSec = otpResendCooldownSec();

  try {
    const { data: row, error: fetchError } = await supabase
      .from('survey_responses')
      .select('id, phone, verified, otp_last_sent_at, submitted_at')
      .eq('id', result.surveyResponseId)
      .single();

    if (fetchError || !row) {
      const res = NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
      res.headers.append('Set-Cookie', buildSurveySessionClearCookie());
      return res;
    }

    if (row.verified === true) {
      return NextResponse.json({ error: 'This number is already verified.' }, { status: 400 });
    }

    const e164 = row.phone;
    if (!e164 || typeof e164 !== 'string' || !e164.startsWith('+')) {
      return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
    }

    const lastSentRaw = row.otp_last_sent_at || row.submitted_at;
    if (lastSentRaw) {
      const lastMs = new Date(lastSentRaw).getTime();
      if (Number.isFinite(lastMs)) {
        const elapsedSec = Math.floor((Date.now() - lastMs) / 1000);
        const wait = cooldownSec - elapsedSec;
        if (wait > 0) {
          return NextResponse.json(
            {
              error: `Please wait ${wait} seconds before requesting a new code.`,
              retryAfterSec: wait,
            },
            {
              status: 429,
              headers: { 'Retry-After': String(wait) },
            }
          );
        }
      }
    }

    let preludeResult;
    try {
      preludeResult = await sendVerificationSms(e164);
    } catch (e) {
      console.error('[survey/resend Prelude]', e?.message ?? e);
      return NextResponse.json(
        { error: 'We could not send a code. Please try again shortly.' },
        { status: 503 }
      );
    }

    if (!preludeResult.ok) {
      const httpStatus = preludeResult.preludeStatus === 'blocked' ? 403 : 422;
      return NextResponse.json(
        {
          error: userMessageForPreludeSendFailure(preludeResult),
          verificationStatus: preludeResult.preludeStatus || 'unknown',
        },
        { status: httpStatus }
      );
    }

    const sentAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('survey_responses')
      .update({ otp_last_sent_at: sentAt })
      .eq('id', row.id)
      .eq('verified', false);

    if (updateError) {
      if (isMissingOtpLastSentAtColumn(updateError)) {
        console.warn(
          '[survey/resend] SMS sent but otp_last_sent_at column missing — run supabase-sms-verification.sql migration.'
        );
      } else {
        console.error('[survey/resend update]', updateError.message ?? updateError);
        return NextResponse.json({ error: 'Could not update session.' }, { status: 500 });
      }
    }

    const verificationStatus = preludeResult.status;
    const message =
      verificationStatus === 'retry'
        ? 'The same code was resent. Check your messages.'
        : 'A new code was sent.';

    return NextResponse.json(
      {
        success: true,
        cooldownSec,
        verificationStatus,
        message,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[survey/resend]', err?.message ?? err);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
