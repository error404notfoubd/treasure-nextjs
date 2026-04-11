'use client';

import { useState, useEffect, useCallback } from 'react';
import Script from 'next/script';
import CookieConsent from './CookieConsent';

export default function MetaPixelGate({ pixelId, cookieFullscreenDelaySec }) {
  const [consented, setConsented] = useState(false);

  const handleAccept = useCallback(() => {
    setConsented(true);
  }, []);

  useEffect(() => {
    const onForceAccept = () => setConsented(true);
    window.addEventListener('cookie-consent-accepted', onForceAccept);
    return () => window.removeEventListener('cookie-consent-accepted', onForceAccept);
  }, []);

  if (!pixelId) return null;

  return (
    <>
      <CookieConsent onAccept={handleAccept} fullscreenDelaySec={cookieFullscreenDelaySec} />
      {consented && (
        <Script id="meta-pixel" strategy="afterInteractive">{`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window,document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init','${pixelId}');
          fbq('track','PageView');
        `}</Script>
      )}
    </>
  );
}
