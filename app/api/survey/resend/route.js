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
import {
  smsSendRateLimitOptions,
  resendRouteRateLimitOptions,
  otpResendCooldownSec,
  otpPerPhoneRateLimitOptions,
} from '@/lib/survey/rate-limits';
import { isMissingOtpLastSentAtColumn } from '@/lib/survey/otp-column';
import { resolvePhoneFromDb, phoneHash } from '@/lib/survey/contact-storage';
import { FUNNEL_USERS_TABLE } from '@/lib/funnel-users';
import { checkOtpPhoneSendLimit } from '@/lib/survey/otp-phone-limit';
import { getAppSettings } from '@/lib/settings/app-settings';

function isSurveyControlPhone(e164, controlPhoneE164) {
  const c = controlPhoneE164;
  return typeof c === 'string' && c.length >= 8 && e164 === c.trim();
}

export const runtime = 'nodejs';

export async function POST(request) {
  const ip = getClientIP(request);
  const appSettings = await getAppSettings();

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
      .from(FUNNEL_USERS_TABLE)
      .select('user_id, phone_encrypted, verified_at, otp_last_sent_at, created_at')
      .eq('user_id', result.surveyResponseId)
      .single();

    if (fetchError || !row) {
      const res = NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
      res.headers.append('Set-Cookie', buildSurveySessionClearCookie());
      return res;
    }

    if (row.verified_at != null) {
      return NextResponse.json({ error: 'This number is already verified.' }, { status: 400 });
    }

    const lastSentRaw = row.otp_last_sent_at || row.created_at;
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

    const e164Resolved = resolvePhoneFromDb(row.phone_encrypted);
    if (!e164Resolved || typeof e164Resolved !== 'string' || !e164Resolved.startsWith('+')) {
      return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
    }
    const phHash = phoneHash(e164Resolved);
    if (!isSurveyControlPhone(e164Resolved, appSettings.surveyControlPhoneE164)) {
      const otpPhoneOpts = await otpPerPhoneRateLimitOptions();
      const otpPhoneRate = await checkOtpPhoneSendLimit(supabase, phHash, otpPhoneOpts);
      if (otpPhoneRate.limited) {
        return NextResponse.json(
          {
            error:
              'Too many verification texts to this number in the last hour. Please try again later.',
            retryAfterSec: otpPhoneRate.retryAfterSec,
          },
          {
            status: 429,
            headers: { 'Retry-After': String(otpPhoneRate.retryAfterSec) },
          }
        );
      }
    }

    let preludeResult;
    try {
      preludeResult = await sendVerificationSms(e164Resolved);
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
      .from(FUNNEL_USERS_TABLE)
      .update({ otp_last_sent_at: sentAt })
      .eq('user_id', row.user_id)
      .is('verified_at', null);

    if (updateError) {
      if (isMissingOtpLastSentAtColumn(updateError)) {
        console.warn(
          '[survey/resend] SMS sent but otp_last_sent_at column missing on public.users.'
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
