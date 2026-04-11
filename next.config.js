/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  reactStrictMode: true,

  // Security headers on every response
  async headers() {
    const apiSecurity = [
      { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
      {
        key: 'Cache-Control',
        value: 'private, no-store, max-age=0, must-revalidate',
      },
    ];
    const base = [
      { key: 'X-Content-Type-Options',    value: 'nosniff' },
      { key: 'X-Frame-Options',           value: 'DENY' },
      { key: 'X-XSS-Protection',          value: '1; mode=block' },
      { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
      {
        key: 'Content-Security-Policy',
        value: [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://connect.facebook.net",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.prelude.dev https://www.facebook.com https://connect.facebook.net",
          "img-src 'self' data: https://www.facebook.com https://www.google-analytics.com",
          "frame-ancestors 'none'",
        ].join('; '),
      },
    ];
    if (isProd) {
      base.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      });
    }
    return [
      { source: '/api/:path*', headers: apiSecurity },
      { source: '/(.*)', headers: base },
    ];
  },
};

module.exports = nextConfig;
