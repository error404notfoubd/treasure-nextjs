import GAME_CONFIG from '@/lib/controls';

export async function GET() {
  const base = GAME_CONFIG.SITE.URL;
  const now  = new Date().toISOString().split('T')[0];

  const pages = [
    { url: '/',        priority: '1.0', changefreq: 'weekly'  },
    { url: '/privacy', priority: '0.5', changefreq: 'monthly' },
    { url: '/terms',   priority: '0.5', changefreq: 'monthly' },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url>
    <loc>${base}${p.url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=86400', // cache 24h
    },
  });
}