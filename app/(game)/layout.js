import MetaPixelGate from '@/components/game/MetaPixelGate';
import '../globals.css';

export const metadata = {
  title:       'Treasure Hunt Slots — Free Play',
  description: 'Spin for free in the ancient treasure hunt slot game.',
  robots:      'noindex, nofollow',
  appleWebApp: {
    capable:           'yes',
    statusBarStyle:    'black-translucent',
    title:             'Treasure Hunt',
  },
};

export const viewport = {
  themeColor:    '#060402',
  width:         'device-width',
  initialScale:  1,
  maximumScale:  1,
  userScalable:  false,
  viewportFit:   'cover',
};

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '';

export default function GameLayout({ children }) {
  return (
    <>
      {children}
      <MetaPixelGate pixelId={PIXEL_ID} />
      {PIXEL_ID && (
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
      )}
    </>
  );
}
