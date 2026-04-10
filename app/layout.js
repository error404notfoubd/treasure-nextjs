import './globals.css';

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

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>
        <link rel="preconnect" href="https://fonts.googleapis.com"/>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/>
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}