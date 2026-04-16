'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { validateSurvey, VALID_FREQUENCIES } from '@/lib/survey/validation';
import { toE164 } from '@/lib/phoneE164';
import { formatNanpNationalDisplay, composeSurveyPhoneE164 } from '@/lib/survey/phone-national';

/** Sentinel select value — not a real game name from the API. */
const SURVEY_FAVORITE_GAME_OTHER = '__survey_other__';

/** Post–OTP “heard about us”: preset labels sent as-is in `{ name }`; sentinel → use text box only. */
const SURVEY_HEARD_FROM_OTHER = '__survey_heard_other__';
const SURVEY_HEARD_FROM_PRESETS = [
  'Facebook (Groups)',
  'Facebook (Ads)',
  'Friends and Family',
];
const SURVEY_HEARD_FROM_OTHER_LABEL = 'Others - Please Specify';

function isHttpUrlForSurvey(s) {
  if (typeof s !== 'string' || !s.trim()) return false;
  try {
    const u = new URL(s.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function applySurveyBonusToLocalCredits(startCredits, bonusCredits) {
  if (typeof window === 'undefined') return;
  const raw = localStorage.getItem('th_credits');
  const cur = raw !== null ? parseInt(raw, 10) : NaN;
  const base = Number.isFinite(cur) ? cur : startCredits;
  localStorage.setItem('th_credits', String(base + bonusCredits));
}

/**
 * Survey + OTP flow. Use inside the game modal (`variant="modal"`) or on `/survey` (`variant="page"`).
 */
export default function SurveyFlowClient({
  variant,
  surveyCountryCode,
  bonusCredits,
  startCredits,
  entryStep = 'form',
  siteName = 'Treasure Hunt',
  facebookPageUrl = '',
  onVerifiedSuccess,
  onDismissSuccess,
}) {
  const [surveyModalStep, setSurveyModalStep] = useState(() =>
    entryStep === 'success' ? 'success' : 'form'
  );

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhoneNationalDigits, setFormPhoneNationalDigits] = useState('');
  const [formFreq, setFormFreq] = useState('');
  const [formFavoriteGame, setFormFavoriteGame] = useState('');
  const [formFavoriteGameOther, setFormFavoriteGameOther] = useState('');
  const [favoriteGames, setFavoriteGames] = useState([]);
  const [gamesLoadError, setGamesLoadError] = useState('');
  const [formConsent, setFormConsent] = useState(true);
  const [formErrors, setFormErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [formOtp, setFormOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldownSec, setResendCooldownSec] = useState(0);
  const [heardFromChoice, setHeardFromChoice] = useState('');
  const [heardFromOther, setHeardFromOther] = useState('');
  const [heardFromSubmitting, setHeardFromSubmitting] = useState(false);
  /** User used the in-app “Follow us on Facebook” control (opens your Page). Not cryptographic proof of follow — that requires Meta APIs. */
  const [facebookPageOpened, setFacebookPageOpened] = useState(false);
  const [facebookFollowAcknowledged, setFacebookFollowAcknowledged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/survey/favorite-games')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then((data) => {
        if (cancelled) return;
        const raw = Array.isArray(data.games) ? data.games : [];
        const list = raw.map((g) =>
          typeof g === 'string' ? { name: g } : { name: g?.name ?? '' }
        ).filter((g) => g.name);
        setFavoriteGames(list);
        if (data.error && list.length === 0) setGamesLoadError(String(data.error));
      })
      .catch(() => {
        if (!cancelled) setGamesLoadError('Could not load the game list. Please refresh the page.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!gamesLoadError) return;
    setFormFavoriteGame((cur) => (cur ? cur : SURVEY_FAVORITE_GAME_OTHER));
  }, [gamesLoadError]);

  useEffect(() => {
    if (resendCooldownSec <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldownSec((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldownSec]);

  const handleSubmit = async () => {
    const fullPhone = composeSurveyPhoneE164(surveyCountryCode, formPhoneNationalDigits);
    const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
    let favoriteToSend;
    if (formFavoriteGame === SURVEY_FAVORITE_GAME_OTHER) {
      const typed = formFavoriteGameOther.replace(/\s+/g, ' ').trim();
      const found = favoriteGames.find((g) => g.name && norm(g.name) === norm(typed));
      favoriteToSend = found ? found.name : typed;
    } else {
      favoriteToSend = formFavoriteGame.replace(/\s+/g, ' ').trim();
    }
    const errors = validateSurvey({
      name: formName,
      email: formEmail,
      phone: fullPhone,
      frequency: formFreq,
      favorite_game: favoriteToSend,
      consent: formConsent,
    });
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }
    if (!toE164(fullPhone)) {
      setFormErrors(['Please enter a valid mobile number (10 digits after the country code).']);
      return;
    }
    setFormErrors([]);
    setSubmitting(true);
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          phone: fullPhone,
          frequency: formFreq,
          favorite_game: favoriteToSend,
          consent: String(formConsent),
        }),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.status === 422) {
        setFormErrors(Array.isArray(data.errors) ? data.errors : [data.error || 'Please check your input.']);
        return;
      }
      if (res.status === 409) {
        setFormErrors([data.error]);
        return;
      }
      if (res.status === 429) {
        setFormErrors([data.error]);
        return;
      }
      if (!res.ok) {
        setFormErrors([data.error || 'Something went wrong. Please try again.']);
        return;
      }

      if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
        window.fbq('track', 'Lead');
      }
      setFormOtp('');
      setResendCooldownSec(typeof data.otpCooldownSec === 'number' ? data.otpCooldownSec : 60);
      setSurveyModalStep('otp');
    } catch {
      setFormErrors(['Connection error. Please check your internet and try again.']);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = formOtp.trim().replace(/\s/g, '');
    if (!/^\d{4,8}$/.test(code)) {
      setFormErrors(['Enter the verification code from your SMS (4–8 digits).']);
      return;
    }
    setFormErrors([]);
    setVerifying(true);
    try {
      const res = await fetch('/api/survey/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.status === 401) {
        setFormErrors([data.error || 'Session expired. Please submit the survey again.']);
        setSurveyModalStep('form');
        return;
      }
      if (res.status === 429) {
        setFormErrors([data.error]);
        return;
      }
      if (!res.ok) {
        setFormErrors([data.error || 'Verification failed.']);
        return;
      }

      setHeardFromChoice('');
      setHeardFromOther('');
      setFacebookPageOpened(false);
      setFacebookFollowAcknowledged(false);
      setSurveyModalStep(isHttpUrlForSurvey(facebookPageUrl) ? 'facebook_follow' : 'heard_from');
    } catch {
      setFormErrors(['Connection error. Please try again.']);
    } finally {
      setVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldownSec > 0 || resending || verifying) return;
    setFormErrors([]);
    setResending(true);
    try {
      const res = await fetch('/api/survey/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.status === 429 && data.retryAfterSec != null) {
        setResendCooldownSec(Number(data.retryAfterSec));
        setFormErrors([data.error || 'Please wait before resending.']);
        return;
      }
      if (!res.ok) {
        if (res.status === 401) {
          setFormErrors([data.error || 'Session expired. Please register again.']);
          setSurveyModalStep('form');
          return;
        }
        setFormErrors([data.error || 'Could not resend code.']);
        return;
      }
      if (typeof data.cooldownSec === 'number') setResendCooldownSec(data.cooldownSec);
    } catch {
      setFormErrors(['Connection error. Please try again.']);
    } finally {
      setResending(false);
    }
  };

  const handleHeardFromSubmit = async () => {
    if (!heardFromChoice) {
      setFormErrors(['Please choose how you heard about us.']);
      return;
    }
    const raw =
      heardFromChoice === SURVEY_HEARD_FROM_OTHER
        ? heardFromOther.replace(/\s+/g, ' ').trim()
        : heardFromChoice.trim();
    if (heardFromChoice === SURVEY_HEARD_FROM_OTHER && !raw) {
      setFormErrors(['Please fill in how you heard about us.']);
      return;
    }
    setFormErrors([]);
    setHeardFromSubmitting(true);
    try {
      const res = await fetch('/api/survey/heard-from', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: raw }),
        credentials: 'include',
      });
      const data = await res.json();
      if (res.status === 401) {
        setFormErrors([data.error || 'Session expired. Please submit the survey again.']);
        setSurveyModalStep('form');
        return;
      }
      if (res.status === 422) {
        setFormErrors([data.error || 'Please check your answer.']);
        return;
      }
      if (!res.ok) {
        setFormErrors([data.error || 'Could not save. Please try again.']);
        return;
      }

      if (variant === 'page') {
        applySurveyBonusToLocalCredits(startCredits, bonusCredits);
      }
      if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
        window.fbq('track', 'CompleteRegistration');
      }
      setSurveyModalStep('success');
      onVerifiedSuccess?.();
    } catch {
      setFormErrors(['Connection error. Please try again.']);
    } finally {
      setHeardFromSubmitting(false);
    }
  };

  const inner = (
    <>
      {surveyModalStep === 'success' ? (
        <div className="success-state show">
          <div className="success-title">Thank You!</div>
          <div className="modal-divider">Verified</div>
          <div className="success-sub">
            Thank you for your response. You can now return tothe game to play with your bonus coins.
          </div>
          <div className="success-sub" style={{ marginTop: '12px' }}>
            {variant === 'modal' ? 'Coins added to your chest:' : 'Bonus coins for the treasure hunt:'}
          </div>
          <div className="bonus-pill">+{bonusCredits} coins</div>
          <div className="success-sub" style={{ fontSize: '10px', color: '#6a5020' }}>
            Coin credits have no cash value and are for game use only.
            {variant === 'page' && (
              <>
                <br />
                Open the game to play with your updated balance.
              </>
            )}
          </div>
          {variant === 'modal' ? (
            <button
              type="button"
              className="submit-btn"
              style={{ marginTop: '16px' }}
              onClick={() => onDismissSuccess?.()}
            >
              Continue Quest
            </button>
          ) : (
            <Link href="/" className="survey-back-text-inline" style={{ marginTop: '16px' }}>
              Back to game
            </Link>
          )}
        </div>
      ) : surveyModalStep === 'heard_from' ? (
        <div className="form-state" id="heard-from-state">
          <div className="modal-title">Final Step to Claim Your Coins</div>
          <div className="modal-divider">Where did you hear about us?</div>
          <div className="modal-sub">
            <strong>This is the final step.</strong> Tell us where you heard about us.
          </div>
          {formErrors.length > 0 && (
            <div className="error-box">
              {formErrors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          <div className="field">
            <label htmlFor="survey-heard-from-select">
              Where did you hear about us? <span aria-hidden="true">*</span>
            </label>
            <select
              id="survey-heard-from-select"
              aria-required="true"
              value={heardFromChoice}
              onChange={(e) => {
                const v = e.target.value;
                setHeardFromChoice(v);
                if (v !== SURVEY_HEARD_FROM_OTHER) setHeardFromOther('');
              }}
            >
              <option value="" disabled>
                — Select —
              </option>
              {SURVEY_HEARD_FROM_PRESETS.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
              <option value={SURVEY_HEARD_FROM_OTHER}>{SURVEY_HEARD_FROM_OTHER_LABEL}</option>
            </select>
            {heardFromChoice === SURVEY_HEARD_FROM_OTHER ? (
              <div className="field" style={{ marginTop: '12px', marginBottom: 0 }}>
                <label htmlFor="survey-heard-from-other">Please specify</label>
                <input
                  id="survey-heard-from-other"
                  type="text"
                  autoComplete="off"
                  placeholder="Type here"
                  value={heardFromOther}
                  onChange={(e) => setHeardFromOther(e.target.value)}
                  aria-describedby="survey-heard-from-other-hint"
                />
                <p id="survey-heard-from-other-hint" className="modal-sub" style={{ marginTop: '8px', marginBottom: 0 }}>
                  Required when you choose “Others”.
                </p>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="submit-btn"
            disabled={heardFromSubmitting}
            onClick={handleHeardFromSubmit}
            style={{ marginTop: '16px' }}
          >
            {heardFromSubmitting ? 'Saving…' : 'Continue'}
          </button>
        </div>
      ) : surveyModalStep === 'facebook_follow' ? (
        <div className="form-state" id="facebook-follow-state">
          <div className="modal-title">Almost there</div>
          <div className="modal-divider">Follow us on Facebook</div>
          <p className="modal-sub" style={{ marginBottom: '14px' }}>
            You&apos;re almost there for the <strong>{bonusCredits} bonus coins</strong>. Use the button below to open
            our Facebook page, follow and send us a text, then come back here to continue. This action will be automatically confirmed.
          </p>
          {formErrors.length > 0 && (
            <div className="error-box">
              {formErrors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          <p
            className="survey-facebook-highlight"
            style={{
              margin: '0 0 12px',
              padding: '12px 14px',
              borderRadius: '10px',
              fontSize: '14px',
              lineHeight: 1.45,
              fontWeight: 600,
              textAlign: 'center',
              color: '#1a2332',
              background: 'linear-gradient(135deg, #fde68a 0%, #fcd34d 100%)',
              border: '1px solid #d97706',
              boxShadow: '0 1px 0 rgba(0,0,0,0.06)',
            }}
          >
            {`Follow us on Facebook and leave us a message saying "TREASURE2020".`}
          </p>
          <a
            href={facebookPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="submit-btn"
            style={{
              display: 'block',
              textAlign: 'center',
              textDecoration: 'none',
              marginBottom: '12px',
            }}
            onClick={() => setFacebookPageOpened(true)}
            onAuxClick={(e) => {
              if (e.button === 1) setFacebookPageOpened(true);
            }}
          >
            Go to facebook page
          </a>
          {!facebookPageOpened ? (
            <p className="modal-sub" style={{ marginBottom: '12px', fontSize: '12px' }}>
              {`Please follow our facebook page and send us a text with the code "TREASURE2020" to claim your coins. You can confirm below after following and texting the page.`}
            </p>
          ) : null}
          <div className="consent-row" style={{ marginBottom: '14px', opacity: facebookPageOpened ? 1 : 0.55 }}>
            <input
              type="checkbox"
              id="survey-facebook-follow-ack"
              disabled={!facebookPageOpened}
              checked={facebookFollowAcknowledged}
              onChange={(e) => setFacebookFollowAcknowledged(e.target.checked)}
            />
            <label htmlFor="survey-facebook-follow-ack" style={{ cursor: facebookPageOpened ? 'pointer' : 'not-allowed' }}>
              I have followed and texted {siteName} on Facebook
            </label>
          </div>
          <button
            type="button"
            className="submit-btn"
            disabled={!facebookPageOpened || !facebookFollowAcknowledged}
            onClick={() => {
              setFormErrors([]);
              setSurveyModalStep('heard_from');
            }}
            style={{ marginTop: '4px' }}
          >
            Claim your coins
          </button>
        </div>
      ) : surveyModalStep === 'otp' ? (
        <div className="form-state" id="otp-state">
          <div className="modal-title">Check your phone</div>
          <div className="modal-divider">Enter verification code</div>
          <div className="modal-sub">
            We sent a code to the number you provided.
            <br />
            {isHttpUrlForSurvey(facebookPageUrl) ? (
              <>
                Enter it below to verify your number. Next you&apos;ll open our Facebook page, then one last question
                for your bonus coins.
              </>
            ) : (
              <>Enter it below to verify your number. You will unlock bonus coins on the next step.</>
            )}
          </div>
          {formErrors.length > 0 && (
            <div className="error-box">
              {formErrors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
          <div className="field">
            <label htmlFor="survey-otp-input">Verification code</label>
            <input
              id="survey-otp-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={formOtp}
              onChange={(e) => setFormOtp(e.target.value.replace(/[^\d\s]/g, ''))}
            />
          </div>
          <button type="button" className="submit-btn" disabled={verifying} onClick={handleVerifyOtp}>
            {verifying ? 'Verifying...' : 'Verify phone'}
          </button>
          <button
            type="button"
            className="submit-btn"
            style={{ marginTop: '10px', opacity: 0.85 }}
            disabled={verifying || resending || resendCooldownSec > 0}
            onClick={handleResendCode}
          >
            {resending ? 'Sending...' : resendCooldownSec > 0 ? `Resend code (${resendCooldownSec}s)` : 'Resend code'}
          </button>
          {variant === 'modal' ? (
            <button
              type="button"
              className="submit-btn"
              style={{ marginTop: '10px', opacity: 0.85 }}
              disabled={verifying || resending}
              onClick={() => {
                setSurveyModalStep('form');
                setFormOtp('');
                setFormErrors([]);
                setFacebookPageOpened(false);
                setFacebookFollowAcknowledged(false);
              }}
            >
              Back
            </button>
          ) : null}
        </div>
      ) : (
        <div className="form-state" id="form-state">
          <div className="modal-title">
            {variant === 'modal' ? 'Unlock bonus coins' : `Redeem your ${bonusCredits} Coins`}
          </div>
          {variant === 'modal' ? <div className="modal-divider">Gaming Survey</div> : null}
          <div className="modal-sub">
            {variant === 'modal' ? (
              <>
                Complete this survey and we will add
                <br />
                <strong>{bonusCredits} bonus coins</strong> to your chest
              </>
            ) : (
              <>
                Tell us a bit about how you play. <br />After you completethe survey {' '}
                <strong>{bonusCredits} bonus coins</strong> will be added to your balance.
              </>
            )}
          </div>

          {gamesLoadError ? (
            <div className="error-box">{gamesLoadError}</div>
          ) : null}

          {formErrors.length > 0 && (
            <div className="error-box">
              {formErrors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}

          <div className="field">
            <label htmlFor="survey-full-name">
              Full name <span aria-hidden="true">*</span>
            </label>
            <input
              id="survey-full-name"
              type="text"
              placeholder="Your full name"
              autoComplete="name"
              aria-required="true"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="survey-phone-national">
              Phone number <span aria-hidden="true">*</span>
            </label>
            <div className="phone-input-wrap" role="group" aria-label="Phone number (required)">
              <span className="phone-cc">{surveyCountryCode}</span>
              <input
                id="survey-phone-national"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                aria-required="true"
                placeholder="555 000 0000"
                aria-describedby="survey-phone-hint"
                value={formatNanpNationalDisplay(formPhoneNationalDigits)}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setFormPhoneNationalDigits(d);
                }}
              />
            </div>
            <p
              id="survey-phone-hint"
              className="modal-sub"
              style={{ marginTop: '8px', marginBottom: 0, textAlign: 'left' }}
            >
              We only use your phone number to send you verification codes. This helps us verify that you are a human.
            </p>
          </div>
          <div className="field">
            <label htmlFor="survey-favorite-game">
              Favorite game to play <span aria-hidden="true">*</span>
            </label>
            <select
              id="survey-favorite-game"
              aria-required="true"
              value={formFavoriteGame}
              onChange={(e) => {
                const v = e.target.value;
                setFormFavoriteGame(v);
                if (v !== SURVEY_FAVORITE_GAME_OTHER) setFormFavoriteGameOther('');
              }}
              disabled={favoriteGames.length === 0 && !gamesLoadError}
              aria-describedby={
                formFavoriteGame === SURVEY_FAVORITE_GAME_OTHER ? 'survey-favorite-other-hint' : undefined
              }
            >
              {favoriteGames.length === 0 && !gamesLoadError ? (
                <option value="">Loading games…</option>
              ) : (
                <>
                  <option value="" disabled>
                    Choose your favorite game to play
                  </option>
                  {favoriteGames.map((g) => (
                    <option key={g.name} value={g.name}>
                      {g.name}
                    </option>
                  ))}
                  <option value={SURVEY_FAVORITE_GAME_OTHER}>Other</option>
                </>
              )}
            </select>
            {formFavoriteGame === SURVEY_FAVORITE_GAME_OTHER ? (
              <div className="field" style={{ marginTop: '12px', marginBottom: 0 }}>
                <label htmlFor="survey-favorite-game-other">Name of your game</label>
                <input
                  id="survey-favorite-game-other"
                  type="text"
                  autoComplete="off"
                  placeholder="Enter the game name"
                  value={formFavoriteGameOther}
                  onChange={(e) => setFormFavoriteGameOther(e.target.value)}
                  aria-describedby="survey-favorite-other-hint"
                />
                <p id="survey-favorite-other-hint" className="modal-sub" style={{ marginTop: '8px', marginBottom: 0 }}>
                  If your game is not in the list, type it here. 
                  name.
                </p>
              </div>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="survey-email">Email address (optional)</label>
            <input
              id="survey-email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="survey-frequency">How often do you play online games? (optional)</label>
            <select id="survey-frequency" value={formFreq} onChange={(e) => setFormFreq(e.target.value)}>
              <option value="">— select —</option>
              {VALID_FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="consent-row">
            <input type="checkbox" id="survey-consent" checked={formConsent} onChange={(e) => setFormConsent(e.target.checked)} />
            <label htmlFor="survey-consent">
              By submitting this form I agree to the <Link href="/privacy">Privacy Policy</Link> and{' '}
              <Link href="/terms">Terms and Conditions</Link>.
            </label>
          </div>
          <button
            type="button"
            className="submit-btn"
            disabled={(() => {
              if (submitting) return true;
              if (favoriteGames.length === 0 && !gamesLoadError) return true;
              const isOther = formFavoriteGame === SURVEY_FAVORITE_GAME_OTHER;
              if (isOther) return !formFavoriteGameOther.trim();
              return !formFavoriteGame.trim() || !favoriteGames.some((g) => g.name === formFavoriteGame);
            })()}
            onClick={handleSubmit}
          >
            {submitting ? 'Submitting...' : 'Submit survey'}
          </button>
        </div>
      )}
    </>
  );

  const goBackToSurveyForm = () => {
    setSurveyModalStep('form');
    setFormOtp('');
    setFormErrors([]);
    setFacebookPageOpened(false);
    setFacebookFollowAcknowledged(false);
  };

  if (variant === 'page') {
    return (
      <main className="survey-standalone">
        {surveyModalStep === 'form' ? (
          <Link href="/" className="survey-back-text">
            ← Back to game
          </Link>
        ) : surveyModalStep === 'otp' ? (
          <button type="button" className="survey-back-text" onClick={goBackToSurveyForm}>
            ← Back to survey
          </button>
        ) : surveyModalStep === 'facebook_follow' ? null : surveyModalStep === 'heard_from' ? (
          <p className="survey-back-text" style={{ cursor: 'default', opacity: 0.75 }}>
            Phone verified — final question below
          </p>
        ) : null}
        <div className="modal survey-standalone-card">{inner}</div>
      </main>
    );
  }

  return inner;
}
