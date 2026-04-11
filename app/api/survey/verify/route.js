import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimitDistributed } from '@/lib/rateLimit';
import { getClientIP } from '@/lib/ip';
import { verifyToken } from '@/lib/survey/token';
import { checkVerificationCode } from '@/lib/survey/prelude';
import {
  getSurveySessionToken,
  buildSurveySessionClearCookie,
} from '@/lib/survey/survey-session';

export const runtime = 'nodejs';

export async function POST(request) {
  const ip = getClientIP(request);

  const rateResult = await checkRateLimitDistributed(supabase, ip, 'survey_verify');
  if (rateResult.limited) {
    return NextResponse.json(
      { error: `Too many attempts. Please wait ${Math.ceil(rateResult.retryAfterSec / 60)} minutes.` },
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

  const token = getSurveySessionToken(request);
  const code = body.code;

  if (!token || token.length > 512) {
    return NextResponse.json({ error: 'No active verification session.' }, { status: 401 });
  }
  if (typeof code !== 'string') {
    return NextResponse.json({ error: 'Enter the verification code.' }, { status: 422 });
  }

  const trimmedCode = code.replace(/\s/g, '');
  if (!/^\d{4,8}$/.test(trimmedCode)) {
    return NextResponse.json({ error: 'Enter a valid verification code.' }, { status: 422 });
  }

  const parsed = verifyToken(token);
  if (!parsed.valid) {
    const res = NextResponse.json({ error: 'Invalid or expired session. Please start again.' }, { status: 401 });
    res.headers.append('Set-Cookie', buildSurveySessionClearCookie());
    return res;
  }

  try {
    const { data: row, error: fetchError } = await supabase
      .from('survey_responses')
      .select('id, phone, verified')
      .eq('id', parsed.surveyResponseId)
      .single();

    if (fetchError || !row) {
      const res = NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
      res.headers.append('Set-Cookie', buildSurveySessionClearCookie());
      return res;
    }

    if (row.verified === true) {
      const res = NextResponse.json({ success: true, verified: true }, { status: 200 });
      res.headers.append('Set-Cookie', buildSurveySessionClearCookie());
      return res;
    }

    const e164 = row.phone;
    if (!e164 || typeof e164 !== 'string' || !e164.startsWith('+')) {
      console.error('[survey/verify] row missing E.164 phone', row.id);
      return NextResponse.json({ error: 'Something went wrong. Please contact support.' }, { status: 500 });
    }

    let ok;
    try {
      ok = await checkVerificationCode(e164, trimmedCode);
    } catch (e) {
      console.error('[survey/verify Prelude check]', e?.message ?? e);
      return NextResponse.json(
        { error: 'Verification is temporarily unavailable. Please try again shortly.' },
        { status: 503 }
      );
    }

    if (!ok) {
      return NextResponse.json({ error: 'Invalid or expired code. Please try again.' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('survey_responses')
      .update({ verified: true })
      .eq('id', row.id)
      .eq('verified', false);

    if (updateError) {
      if (updateError.code === '23505') {
        const res = NextResponse.json(
          { error: 'This email or phone number has already been verified. Thank you!' },
          { status: 409 }
        );
        res.headers.append('Set-Cookie', buildSurveySessionClearCookie());
        return res;
      }
      console.error('[survey/verify update]', updateError.message ?? updateError);
      return NextResponse.json({ error: 'Could not save verification. Please try again.' }, { status: 500 });
    }

    const res = NextResponse.json({ success: true, verified: true }, { status: 200 });
    res.headers.append('Set-Cookie', buildSurveySessionClearCookie());
    return res;
  } catch (err) {
    console.error('[survey/verify]', err?.message ?? err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
