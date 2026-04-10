/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  reactStrictMode: true,

  // Security headers on every response
  async headers() {
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
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com",
          "connect-src 'self'",
          "img-src 'self' data:",
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
    return [{ source: '/(.*)', headers: base }];
  },
};

module.exports = nextConfig;
