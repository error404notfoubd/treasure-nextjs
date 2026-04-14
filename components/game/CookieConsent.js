'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const CONSENT_KEY = 'cookie_consent';
const CONSENT_ACCEPTED_EVENT = 'cookie-consent-accepted';

export function getConsentValue() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CONSENT_KEY);
}

/** Programmatically accept cookie consent (overrides a previous decline). */
export function forceAcceptConsent() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONSENT_KEY, 'accepted');
  window.dispatchEvent(new Event(CONSENT_ACCEPTED_EVENT));
}

export default function CookieConsent({ onAccept }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = getConsentValue();
    if (stored === 'accepted') {
      onAccept?.();
    } else {
      setVisible(true);
    }

    const onForceAccept = () => {
      setVisible(false);
      onAccept?.();
    };
    window.addEventListener(CONSENT_ACCEPTED_EVENT, onForceAccept);
    return () => window.removeEventListener(CONSENT_ACCEPTED_EVENT, onForceAccept);
  }, [onAccept]);

  const dismiss = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setVisible(false);
    onAccept?.();
  }, [onAccept]);

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      style={{
        position: 'fixed',
        zIndex: 9999,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(180deg, rgba(6,4,2,0.92) 0%, rgba(6,4,2,0.98) 100%)',
        borderTop: '1px solid rgba(245,200,66,0.25)',
        backdropFilter: 'blur(12px)',
        padding: '12px 16px 14px',
        fontFamily: "'Cinzel', serif",
      }}
    >
      <div
        style={{
          maxWidth: 900,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
        }}
      >
        <p
          style={{
            flex: 1,
            color: '#e8dcc8',
            fontSize: 13,
            lineHeight: 1.55,
            margin: 0,
            minWidth: 0,
          }}
        >
          We use cookies to run the site and, where applicable, advertising cookies (Meta Pixel) to
          measure ad performance. See our{' '}
          <Link href="/privacy" style={{ color: '#f5c842', textDecoration: 'underline' }}>
            Privacy Policy
          </Link>{' '}
          for details.
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close cookie notice"
          style={{
            flexShrink: 0,
            width: 36,
            height: 36,
            marginTop: -4,
            marginRight: -4,
            border: '1px solid rgba(245,200,66,0.35)',
            borderRadius: 6,
            background: 'transparent',
            color: '#e8dcc8',
            fontSize: 22,
            lineHeight: 1,
            fontFamily: 'system-ui, sans-serif',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
