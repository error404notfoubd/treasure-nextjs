'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const CONSENT_KEY = 'cookie_consent';

export function getConsentValue() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CONSENT_KEY);
}

export default function CookieConsent({ onAccept }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = getConsentValue();
    if (stored === 'accepted') {
      onAccept?.();
    } else if (!stored) {
      setVisible(true);
    }
  }, [onAccept]);

  const accept = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    setVisible(false);
    onAccept?.();
  }, [onAccept]);

  const decline = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, 'declined');
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
      background: 'linear-gradient(180deg, rgba(6,4,2,0.92) 0%, rgba(6,4,2,0.98) 100%)',
      borderTop: '1px solid rgba(245,200,66,0.25)',
      backdropFilter: 'blur(12px)',
      padding: '16px 20px',
      fontFamily: "'Cinzel', serif",
    }}>
      <div style={{
        maxWidth: 720, margin: '0 auto',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <p style={{ color: '#e8dcc8', fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          We use essential cookies to run the site and, with your consent, advertising cookies
          (Meta Pixel) to measure ad performance.
          See our <Link href="/privacy" style={{ color: '#f5c842', textDecoration: 'underline' }}>Privacy Policy</Link> for
          details.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={accept} style={{
            background: 'linear-gradient(180deg, #f5c842 0%, #c8920a 100%)',
            color: '#1a1408', border: 'none', borderRadius: 6,
            padding: '8px 22px', fontSize: 13, fontWeight: 700,
            fontFamily: "'Cinzel', serif", cursor: 'pointer',
            letterSpacing: '0.02em',
          }}>
            Accept All
          </button>
          <button onClick={decline} style={{
            background: 'transparent',
            color: '#a89878', border: '1px solid rgba(245,200,66,0.3)', borderRadius: 6,
            padding: '8px 22px', fontSize: 13, fontWeight: 600,
            fontFamily: "'Cinzel', serif", cursor: 'pointer',
          }}>
            Essential Only
          </button>
        </div>
      </div>
    </div>
  );
}
