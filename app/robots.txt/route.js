import siteConfig from '@/lib/config/site';

export async function GET() {
  const body = `# robots.txt — ${siteConfig.NAME}

User-agent: *

Allow: /
Allow: /privacy
Allow: /terms

Disallow: /api/
Disallow: /_next/
Disallow: /admin/
Disallow: /dashboard/
Disallow: /login
Disallow: /signup

Sitemap: ${siteConfig.URL}/sitemap.xml
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
