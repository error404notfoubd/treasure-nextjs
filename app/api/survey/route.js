import { NextResponse } from 'next/server';
import { supabase }     from '@/lib/supabase';
import { validateSurvey, VALID_FREQUENCIES } from '@/lib/survey/validation';
import { checkRateLimitDistributed } from '@/lib/rateLimit';
import { getClientIP }   from '@/lib/ip';
import { createVerificationToken } from '@/lib/survey/token';
import { toE164 } from '@/lib/phoneE164';
import { sendVerificationSms, isPreludeConfigured, userMessageForPreludeSendFailure } from '@/lib/survey/prelude';
import { buildSurveySessionSetCookie } from '@/lib/survey/survey-session';
import {
  smsSendRateLimitOptions,
  otpResendCooldownSec,
  otpPerPhoneRateLimitOptions,
} from '@/lib/survey/rate-limits';
import { isMissingOtpLastSentAtColumn } from '@/lib/survey/otp-column';
import { getAppSettings } from '@/lib/settings/app-settings';
import { phoneHash, emailHash } from '@/lib/survey/contact-storage';
import { checkOtpPhoneSendLimit } from '@/lib/survey/otp-phone-limit';
import {
  FUNNEL_USERS_TABLE,
  persistUserPhone,
  persistUserEmail,
} from '@/lib/funnel-users';
import { SURVEY_LAST_COMPLETED_STEP } from '@/lib/survey/last-completed-step';

function isSurveyControlPhone(e164, controlPhoneE164) {
  const c = controlPhoneE164;
  return typeof c === 'string' && c.length >= 8 && e164 === c.trim();
}

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

  const appSettings = await getAppSettings();
  const raw = JSON.stringify(body);
  if (raw.length > appSettings.surveyRequestBodyMaxChars) {
    return NextResponse.json({ error: 'Request too large.' }, { status: 413 });
  }

  const { name, email, phone, frequency, favorite_game, consent } = body;
  const strFields = {
    name,
    email,
    phone,
    frequency,
    favorite_game,
  };
  for (const [key, val] of Object.entries(strFields)) {
    if (val !== undefined && val !== null && typeof val !== 'string') {
      return NextResponse.json({ error: `Field "${key}" must be a string.` }, { status: 422 });
    }
  }
  if (consent !== undefined && typeof consent !== 'boolean' && typeof consent !== 'string') {
    return NextResponse.json({ error: 'Field "consent" must be a boolean or string.' }, { status: 422 });
  }

  const favoriteGameRaw =
    typeof favorite_game === 'string' ? favorite_game.replace(/\s+/g, ' ').trim() : '';

  const errors = validateSurvey({
    name: name?.trim(),
    email: email?.trim() || '',
    phone: phone?.trim(),
    frequency: frequency?.trim(),
    favorite_game: favoriteGameRaw,
    consent: consent === true || consent === 'true',
  });

  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 422 });
  }

  if (typeof frequency === 'string' && frequency.trim() && !VALID_FREQUENCIES.includes(frequency.trim())) {
    return NextResponse.json({ errors: ['Invalid frequency value.'] }, { status: 422 });
  }

  const { data: activeRows, error: fgError } = await supabase
    .from('favorite_games')
    .select('name')
    .eq('is_active', true);

  if (fgError) {
    if (fgError.code === '42P01') {
      return NextResponse.json(
        {
          errors: [
            'Survey is temporarily unavailable (game list). Please try again later or contact support.',
          ],
        },
        { status: 503 }
      );
    }
    console.error('[survey POST favorite_games]', fgError.message ?? fgError);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }

  const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
  const match = (activeRows ?? []).find((r) => r?.name && norm(r.name) === norm(favoriteGameRaw));
  let resolvedFavoriteGame;
  if (match?.name) {
    resolvedFavoriteGame = match.name.trim();
  } else {
    if (!favoriteGameRaw) {
      return NextResponse.json({ errors: ['Favorite game is required.'] }, { status: 422 });
    }
    resolvedFavoriteGame = favoriteGameRaw;
  }

  const cleanEmail = (typeof email === 'string' ? email : '').trim().toLowerCase();
  const cleanName = (typeof name === 'string' ? name : '').trim();
  const cleanPhone = (typeof phone === 'string' ? phone : '').trim();
  const cleanFreq = (typeof frequency === 'string' ? frequency : '').trim();
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

    const { data: phoneExists } = await supabase
      .rpc('fn_phone_exists', { p_phone_hash: phoneHash(e164) });

    if (phoneExists) {
      return NextResponse.json(
        { error: 'This phone number is already registered. If this is you, thank you for participating!' },
        { status: 409 }
      );
    }

    if (cleanEmail) {
      const { data: emailExists } = await supabase
        .rpc('fn_email_exists', { p_email_hash: emailHash(cleanEmail) });

      if (emailExists) {
        return NextResponse.json(
          { error: 'This email has already been submitted. Thank you!' },
          { status: 409 }
        );
      }
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

    const phHash = phoneHash(e164);
    if (!isSurveyControlPhone(e164, appSettings.surveyControlPhoneE164)) {
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

    const phoneFields = persistUserPhone(e164);
    const emailFields = persistUserEmail(emailForDb);

    // If an unverified row already exists for this phone, update it in place
    // instead of creating a duplicate. Otherwise insert a fresh row.
    const nowIso = new Date().toISOString();
    const rowPayload = {
      full_name:          cleanName,
      ...phoneFields,
      ...emailFields,
      frequency:          cleanFreq || null,
      favorite_game:      resolvedFavoriteGame,
      favorite_game_id:   null,
      ip_address:         ip,
      user_agent:         userAgent,
      consent_marketing:  consent === true || consent === 'true',
      registration_step:  'submitted',
      survey_last_completed_step: SURVEY_LAST_COMPLETED_STEP.PHONE_NUMBER,
      bonus_granted:      false,
      contacted:          false,
      has_replied:        false,
      updated_at:         nowIso,
    };

    const sentAt = new Date().toISOString();
    let userId;
    let isUpdate = false;

    const byHash = await supabase
      .from(FUNNEL_USERS_TABLE)
      .select('user_id')
      .eq('phone_hash', phHash)
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingRow = byHash.data;

    if (existingRow) {
      userId = existingRow.user_id;
      const { data: updated, error: updateError } = await supabase
        .from(FUNNEL_USERS_TABLE)
        .update({ ...rowPayload, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('verified_at', null)
        .select('user_id')
        .maybeSingle();

      if (updateError) {
        if (updateError.code === '23514') {
          console.error('[survey POST constraint]', updateError.message, updateError.details);
          return NextResponse.json(
            { errors: ['Please check your details (e.g. use a valid email or leave email empty).'] },
            { status: 422 }
          );
        }
        throw updateError;
      }

      if (updated) {
        isUpdate = true;
      } else {
        return NextResponse.json(
          { error: 'This phone number has just been verified. Thank you for participating!' },
          { status: 409 }
        );
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from(FUNNEL_USERS_TABLE)
        .insert(rowPayload)
        .select('user_id')
        .single();

      if (insertError) {
        if (insertError.code === '23505') {
          return NextResponse.json(
            { error: 'This submission could not be saved. You may have already registered with this email or phone number.' },
            { status: 409 }
          );
        }
        if (insertError.code === '23514') {
          console.error('[survey POST constraint]', insertError.message, insertError.details);
          return NextResponse.json(
            { errors: ['Please check your details (e.g. use a valid email or leave email empty).'] },
            { status: 422 }
          );
        }
        throw insertError;
      }
      userId = inserted.user_id;
    }

    let preludeResult;
    try {
      preludeResult = await sendVerificationSms(e164);
    } catch (e) {
      const errMsg = String(e?.message ?? e);
      console.error('[survey POST Prelude create]', errMsg);
      if (!isUpdate) {
        const { error: delErr } = await supabase.from(FUNNEL_USERS_TABLE).delete().eq('user_id', userId);
        if (delErr) {
          console.error('[survey POST rollback delete after Prelude failure]', delErr.message ?? delErr);
        }
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
      if (!isUpdate) {
        const { error: delErr } = await supabase.from(FUNNEL_USERS_TABLE).delete().eq('user_id', userId);
        if (delErr) {
          console.error('[survey POST rollback delete after Prelude blocked]', delErr.message ?? delErr);
        }
      }
      const msg = userMessageForPreludeSendFailure(preludeResult);
      return NextResponse.json({ error: msg }, { status: 422 });
    }

    const { error: otpColError } = await supabase
      .from(FUNNEL_USERS_TABLE)
      .update({ otp_last_sent_at: sentAt })
      .eq('user_id', userId);

    if (otpColError) {
      if (isMissingOtpLastSentAtColumn(otpColError)) {
        console.warn(
          '[survey POST] Run migration: ALTER TABLE public.users ADD COLUMN IF NOT EXISTS otp_last_sent_at timestamptz;'
        );
      } else {
        console.error('[survey POST otp_last_sent_at]', otpColError.message ?? otpColError);
      }
    }

    await supabase
      .from('rate_limit_log')
      .insert({ ip_address: ip, success: true });

    const token = createVerificationToken(userId);

    const res = NextResponse.json(
      {
        success: true,
        needsVerification: true,
        otpCooldownSec: otpResendCooldownSec(),
        verificationStatus: preludeResult.status,
        message: 'Enter the code we sent to your phone to finish verification and unlock bonus coins.',
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
