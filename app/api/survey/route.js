import { NextResponse } from 'next/server';
import { supabase }     from '@/lib/supabase';
import { validateSurvey, VALID_FREQUENCIES } from '@/lib/validation';
import { checkRateLimitDistributed } from '@/lib/rateLimit';
import { getClientIP }   from '@/lib/ip';
import { createVerificationToken } from '@/lib/token';
import { toE164 } from '@/lib/phoneE164';
import { sendVerificationSms, isPreludeConfigured } from '@/lib/preludeVerify';
import { buildSurveySessionSetCookie } from '@/lib/surveySession';
import { smsSendRateLimitOptions, otpResendCooldownSec } from '@/lib/surveyRateLimits';
import { isMissingOtpLastSentAtColumn } from '@/lib/otpColumn';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ status: 'ok' }, { status: 200 });
}

export async function POST(request) {
  const ip = getClientIP(request);

  const rateResult = await checkRateLimitDistributed(supabase, ip, 'survey_post');
  if (rateResult.limited) {
    return NextResponse.json(
      { error: `Too many submissions. Please wait ${Math.ceil(rateResult.retryAfterSec / 60)} minutes.` },
      {
        status: 429,
        headers: { 'Retry-After': String(rateResult.retryAfterSec) },
      }
    );
  }

  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const raw = JSON.stringify(body);
  if (raw.length > 8192) {
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
  }

  const { name, email, phone, frequency, consent } = body;
  const strFields = { name, email, phone, frequency };
  for (const [key, val] of Object.entries(strFields)) {
    if (val !== undefined && val !== null && typeof val !== 'string') {
      return NextResponse.json({ error: `Field "${key}" must be a string.` }, { status: 422 });
    }
  }
  if (consent !== undefined && typeof consent !== 'boolean' && typeof consent !== 'string') {
    return NextResponse.json({ error: 'Field "consent" must be a boolean or string.' }, { status: 422 });
  }

  const errors = validateSurvey({
    name:      name?.trim(),
    email:     email?.trim() || '',
    phone:     phone?.trim(),
    frequency: frequency?.trim(),
    consent:   consent === true || consent === 'true',
  });

  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 422 });
  }

  if (frequency && !VALID_FREQUENCIES.includes(frequency.trim())) {
    return NextResponse.json({ errors: ['Invalid frequency value.'] }, { status: 422 });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName  = name.trim();
  const cleanPhone = phone.trim();
  const cleanFreq  = frequency.trim();
  /** DB allows NULL or valid email only — never '' (fails email_format CHECK). */
  const emailForDb = cleanEmail.length > 0 ? cleanEmail : null;
  const userAgent  = (request.headers.get('user-agent') || '').slice(0, 300);
  const e164       = toE164(cleanPhone);

  if (!e164) {
    return NextResponse.json(
      { errors: ['Please enter a valid phone number with country code (e.g. +1 555 000 0000).'] },
      { status: 422 }
    );
  }

  try {
    if (process.env.NODE_ENV === 'production') {
      const windowMins = Math.round((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000) / 60000);
      const { data: dbCount } = await supabase
        .rpc('fn_ip_submission_count', { p_ip: ip, p_mins: windowMins });

      const maxSubmissions = parseInt(process.env.RATE_LIMIT_MAX) || 5;
      if ((dbCount ?? 0) >= maxSubmissions) {
        return NextResponse.json(
          { error: `Too many submissions from this device. Please try again later.` },
          { status: 429 }
        );
      }
    }

    if (cleanEmail) {
      const { data: emailExists } = await supabase
        .rpc('fn_email_exists', { p_email: cleanEmail });

      if (emailExists) {
        return NextResponse.json(
          { error: 'This email has already been submitted. Thank you!' },
          { status: 409 }
        );
      }
    }

    const { data: phoneExists } = await supabase
      .rpc('fn_phone_exists', { p_phone: e164 });

    if (phoneExists) {
      return NextResponse.json(
        { error: 'This phone number is already registered. If this is you, thank you for participating!' },
        { status: 409 }
      );
    }

    if (!isPreludeConfigured()) {
      console.error('[survey POST] PRELUDE_API_TOKEN is not set');
      return NextResponse.json(
        { error: 'Phone verification is not available. Please try again later.' },
        { status: 503 }
      );
    }

    const smsOpts = smsSendRateLimitOptions();
    const smsRate = await checkRateLimitDistributed(supabase, ip, 'survey_sms_send', smsOpts);
    if (smsRate.limited) {
      return NextResponse.json(
        {
          error: 'Too many verification texts from this network. Please try again later.',
          retryAfterSec: smsRate.retryAfterSec,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(smsRate.retryAfterSec) },
        }
      );
    }

    // Save row first, then SMS — if DB failed after SMS (old order), users got a code but no session.
    // If Prelude fails after insert, we delete the row so "no user without working flow" still holds.
    const sentAt = new Date().toISOString();
    const { data: inserted, error: insertError } = await supabase
      .from('survey_responses')
      .insert({
        name:       cleanName,
        email:      emailForDb,
        phone:      e164,
        frequency:  cleanFreq || null,
        ip_address: ip,
        user_agent: userAgent,
        verified:   false,
      })
      .select('id')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json(
          {
            error:
              'This submission could not be saved. You may have already registered with this email or phone number.',
          },
          { status: 409 }
        );
      }
      if (insertError.code === '23514') {
        console.error('[survey POST constraint]', insertError.message, insertError.details);
        return NextResponse.json(
          {
            errors: [
              'Please check your details (e.g. use a valid email or leave email empty).',
            ],
          },
          { status: 422 }
        );
      }
      throw insertError;
    }

    const rowId = inserted.id;

    let preludeResult;
    try {
      preludeResult = await sendVerificationSms(e164);
    } catch (e) {
      const errMsg = String(e?.message ?? e);
      console.error('[survey POST Prelude create]', errMsg);
      const { error: delErr } = await supabase.from('survey_responses').delete().eq('id', rowId);
      if (delErr) {
        console.error('[survey POST rollback delete after Prelude failure]', delErr.message ?? delErr);
      }
      const rateLimited =
        errMsg.includes('429') ||
        /maximum number of retries|verification window|too many requests/i.test(errMsg);
      return NextResponse.json(
        {
          error: rateLimited
            ? 'Too many verification texts for this number. Please wait a few minutes and try again.'
            : 'We could not send a verification code to this number. Please check the number and try again.',
        },
        { status: rateLimited ? 429 : 503 }
      );
    }

    if (!preludeResult.ok) {
      const { error: delErr } = await supabase.from('survey_responses').delete().eq('id', rowId);
      if (delErr) {
        console.error('[survey POST rollback delete after Prelude blocked]', delErr.message ?? delErr);
      }
      const reason = preludeResult.reason;
      const msg =
        reason === 'invalid_phone_number' || reason === 'invalid_phone_line'
          ? 'This phone number cannot receive SMS codes. Please use a mobile number.'
          : reason === 'in_block_list'
            ? 'This number cannot be verified. Please use a different phone number.'
            : 'We could not send a verification code. Please try again later.';
      return NextResponse.json({ error: msg }, { status: 422 });
    }

    const { error: otpColError } = await supabase
      .from('survey_responses')
      .update({ otp_last_sent_at: sentAt })
      .eq('id', rowId);

    if (otpColError) {
      if (isMissingOtpLastSentAtColumn(otpColError)) {
        console.warn(
          '[survey POST] Run migration: ALTER TABLE public.survey_responses ADD COLUMN IF NOT EXISTS otp_last_sent_at timestamptz;'
        );
      } else {
        console.error('[survey POST otp_last_sent_at]', otpColError.message ?? otpColError);
      }
    }

    await supabase
      .from('rate_limit_log')
      .insert({ ip_address: ip, success: true });

    const token = createVerificationToken(rowId);

    const res = NextResponse.json(
      {
        success: true,
        needsVerification: true,
        otpCooldownSec: otpResendCooldownSec(),
        message: 'Enter the code we sent to your phone to finish and claim your bonus.',
      },
      { status: 201 }
    );
    res.headers.append('Set-Cookie', buildSurveySessionSetCookie(token));
    return res;
  } catch (err) {
    console.error('[survey POST error]', err?.message ?? err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
