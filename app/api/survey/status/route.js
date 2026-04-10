import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { verifyToken } from '@/lib/token';
import { getClientIP } from '@/lib/ip';
import { checkRateLimitDistributed } from '@/lib/rateLimit';
import {
  getSurveySessionToken,
  buildSurveySessionClearCookie,
} from '@/lib/surveySession';

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
    const { data, error } = await supabase
      .from('survey_responses')
      .select('verified')
      .eq('id', result.surveyResponseId)
      .single();

    if (error || !data) {
      const res = NextResponse.json({ ok: false, verified: false, pendingVerification: false }, { status: 200 });
      res.headers.append('Set-Cookie', buildSurveySessionClearCookie());
      return res;
    }

    const verified = data.verified === true;
    const res = NextResponse.json(
      {
        ok: true,
        verified,
        pendingVerification: !verified,
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
